(function (root) {
  "use strict";
  const labels = {
    dtd: "Yesterday · 27 Oct 2026",
    mtd: "MTD · 1–27 Oct 2026",
    ytd: "YTD · 1 Jan–27 Oct 2026",
  };
  const days = { dtd: 1, mtd: 27, ytd: 300 };
  function label(period) {
    if (!Object.hasOwn(labels, period)) throw new Error(`Unknown graph period: ${period}`);
    return labels[period];
  }
  function seed(text) {
    return Array.from(text).reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 1009, 17) / 1009;
  }
  function allocate(total, weights) {
    if (!Number.isFinite(total) || weights.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Invalid period allocation.");
    if (!weights.length) throw new Error("Period allocation needs a profile.");
    const sum = weights.reduce((a, b) => a + b, 0);
    let allocated = 0;
    return weights.map((weight, i) => {
      const cumulative = weights.slice(0, i + 1).reduce((a, b) => a + b, 0);
      const target = Math.round(total * 100 * (sum ? cumulative / sum : (i + 1) / weights.length));
      const amount = (target - allocated) / 100;
      allocated = target;
      return amount;
    });
  }
  const hourly = Array.from({ length: 24 }, (_, hour) =>
    hour < 8 ? 0.02 : hour < 11 ? 0.12 : hour < 16 ? 0.6 : hour < 19 ? 0.35 : hour < 23 ? 1 : 0.4);
  function trend(branches, period) {
    label(period);
    const axis = period === "dtd" ? hourly.map((_, hour) => `${String(hour).padStart(2, "0")}:00`)
      : period === "mtd" ? Array.from({ length: 27 }, (_, i) => `${i + 1} Oct`)
        : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
    const result = { labels: axis, cy: axis.map(() => 0), py: axis.map(() => 0), bud: axis.map(() => 0),
      dummy: period === "dtd", note: `${label(period)} · ${period === "dtd" ? "DUMMY hourly distribution; actual daily totals" : "source time profile reconciled to actual period totals; budget distributed where missing"}` };
    for (const branch of branches) {
      for (const key of ["cy", "py", "bud"]) {
        const weights = period === "dtd" ? hourly
          : period === "mtd" ? key === "bud" ? Array(27).fill(1) : branch.daily[key]
            : branch.month[key];
        const values = allocate(branch[period][key], weights);
        result[key] = result[key].map((value, i) => Math.round((value + values[i]) * 100) / 100);
      }
    }
    return result;
  }
  function traffic(branch, period) {
    label(period);
    const guests = branch.guests || branch.g;
    const checks = branch.checks || branch.chk;
    if (period !== "ytd") return { guests: [...guests[period]], checks: [...checks[period]], dummy: false };
    const estimate = (counts) => ["cy", "py"].map((key, i) => {
      const average = counts.mtd[i] > 0 && branch.mtd[key] > 0 ? branch.mtd[key] / counts.mtd[i] : 120;
      return Math.max(0, Math.round(branch.ytd[key] / average));
    });
    return { guests: estimate(guests), checks: estimate(checks), dummy: true };
  }
  function menu(source, period, branches) {
    label(period);
    const copy = structuredClone(source);
    const factor = branches.reduce((n, branch) => n + branch.ytd.cy, 0) /
      Math.max(1, branches.reduce((n, branch) => n + branch.mtd.cy, 0));
    const count = period === "dtd" ? source.checks.y : period === "mtd" ? source.checks.oct : Math.round(source.checks.oct * factor);
    copy.periodNote = `${label(period)} · ${period === "mtd" ? "original October sample; simulated recipe costs" : period === "dtd"
      ? "source yesterday checks and item frequencies; DUMMY item totals, attachment, pairs and check values"
      : "DUMMY menu sample projected from October by the source YTD/MTD revenue ratio; not actual POS totals"}`;
    if (period === "mtd") return copy;
    copy.checks.oct = count;
    copy.items = source.items.map((item) => {
      const mix = period === "dtd" ? 1 : 0.8 + seed(item.item + item.brand) * 0.4;
      const popularity = period === "dtd" ? item.per1k.y : item.per1k.oct * mix;
      const qty = Math.max(0, Math.round(popularity * count / 1000));
      const price = Math.round(item.price * (period === "dtd" ? 0.97 + seed(item.item) * 0.06 : 0.94 + seed(item.brand) * 0.08) * 100) / 100;
      return { ...item, price, qty,
        sales: Math.round(qty * price * 100) / 100,
        per1k: { ...item.per1k, oct: Math.round(popularity * 100) / 100 },
        sales1k: { ...item.sales1k, oct: Math.round(popularity * price * 100) / 100 } };
    });
    const total = copy.items.reduce((n, item) => n + item.sales, 0);
    copy.items.forEach((item) => { item.share = total > 0 ? item.sales / total : 0; });
    for (const [category, values] of Object.entries(copy.attach)) {
      values.oct = Math.round(Math.min(100, values.oct * (0.8 + seed(category + period) * 0.4)) * 100) / 100;
    }
    copy.pairs = copy.pairs.map((pair) => ({ ...pair,
      n: Math.min(count, Math.max(0, Math.round(pair.n * count / source.checks.oct * (0.8 + seed(pair.a + period) * 0.4)))),
      pct: Math.min(100, Math.round(pair.pct * (0.85 + seed(pair.b + period) * 0.3) * 100) / 100) }));
    for (const [key, values] of Object.entries(copy.checkValue)) if (key.startsWith("oct|")) {
      values.checks = Math.round(values.checks * count / source.checks.oct);
      values.avg = Math.round(values.avg * (0.9 + seed(key + period) * 0.2) * 100) / 100;
      values.items = Math.round(values.items * (0.9 + seed(key + period) * 0.2) * 100) / 100;
    }
    copy.storesOct = copy.storesOct.map(([name, checks]) => [name, Math.round(checks * count / source.checks.oct)]);
    return copy;
  }
  function delivery(source, period, branches) {
    label(period);
    const copy = structuredClone(source);
    const last = source.months.length - 1;
    const originalTotal = Object.values(source.vendors).reduce((n, values) => n + values[last], 0);
    const selectedTotal = period === "ytd" ? Object.values(source.vendors).flat().reduce((a, b) => a + b, 0)
      : period === "mtd" ? originalTotal : branches.reduce((n, branch) => n + branch.dtd.vcy, 0);
    const netTotal = period === "ytd" ? source.netSales.reduce((a, b) => a + b, 0)
      : period === "mtd" ? source.netSales[last] : branches.reduce((n, branch) => n + branch.dtd.cy, 0);
    if (period !== "ytd") {
      const profile = trend(branches, period);
      copy.months = profile.labels;
      const names = Object.keys(source.vendors);
      const vendorTotals = allocate(selectedTotal, names.map((name) => source.vendors[name][last]));
      const deliveryWeights = profile.cy.map((sales, i) => sales * (period === "dtd"
        ? 0.65 + 0.55 * Math.exp(-(((i - 20) / 4) ** 2))
        : 0.8 + 0.4 * seed(`delivery-day-${i + 1}`)));
      copy.vendors = Object.fromEntries(names.map((name, i) => [name, allocate(vendorTotals[i], deliveryWeights)]));
      copy.netSales = allocate(netTotal, profile.cy);
    }
    const factor = originalTotal > 0 ? selectedTotal / originalTotal : 0;
    if (period !== "mtd") copy.brandsMtd = source.brandsMtd.map((row) => ({
      ...row, cy: Math.round(row.cy * factor * 100) / 100,
      py: Math.round(row.py * factor * (0.9 + seed(row.brand + period) * 0.2) * 100) / 100,
    }));
    copy.selectedTotal = Math.round(selectedTotal * 100) / 100;
    copy.selectedNetSales = Math.round(netTotal * 100) / 100;
    copy.periodNote = `${label(period)} · ${period === "ytd" ? "source monthly vendor totals; DUMMY YTD brand split (including virtual brands)"
      : period === "mtd" ? "source October vendor/brand totals; DUMMY daily distribution and daily delivery share"
        : "actual daily branch delivery total; DUMMY vendor/brand split, hourly distribution and hourly delivery share"}. Company-wide; global brand/region/store filters do not allocate this source.`;
    return copy;
  }
  root.AlfaPeriodData = { label, days, allocate, trend, traffic, menu, delivery };
})(globalThis);
