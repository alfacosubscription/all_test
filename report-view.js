(function (root) {
  "use strict";
  const chartColors = { current: "#299bb0", prior: "#075577", budget: "#ff9228" };
  function alfredPeriodLabel(period) {
    const label = { dtd: "Yesterday · 27 Oct 2026", mtd: "MTD · 1–27 Oct 2026", ytd: "YTD · 1 Jan–27 Oct 2026" }[period];
    if (!label) throw new Error(`Invalid Alfred reporting period: ${period}`);
    return label;
  }
  function alfredReportData(source = root.AlfaOctoberDaily) {
    if (!source || !Array.isArray(source.branches) || !source.branches.length) {
      throw new Error("Alfred branch source is missing or empty.");
    }
    const periods = Object.fromEntries(["dtd", "mtd", "ytd"].map((period) => {
      const stores = source.branches.map((branch) => {
        const values = branch[period];
        for (const key of ["cy", "py", "dcy", "dpy", "vcy", "vpy", "bud"]) {
          if (!Number.isFinite(values?.[key])) throw new Error(`Invalid Alfred ${period} ${key}: ${branch.name}`);
        }
        return {
          id: branch.name, name: branch.name, brand: branch.brand, region: branch.region,
          sss: branch.sss && !branch.new, new: branch.new,
          cy: values.cy, ly: values.py, budget: values.bud,
          delivery: values.vcy, deliveryLy: values.vpy,
          nonDelivery: values.dcy, nonDeliveryLy: values.dpy,
          checks: period === "ytd" ? null : branch.checks[period][0],
          checksLy: period === "ytd" ? null : branch.checks[period][1],
        };
      });
      return [period, { stores }];
    }));
    return { source: "alfred", asOf: source.asOf, periods };
  }
  function alfredBriefMetrics(branches, period) {
    const metrics = alfredMetrics(branches, period);
    const sum = (rows, key) => rows.reduce((n, branch) => n + branch[period][key], 0);
    const same = branches.filter((branch) => branch.sss && !branch.new);
    const other = branches.filter((branch) => !branch.sss || branch.new);
    const newStores = other.filter((branch) => branch.new || branch[period].py === 0);
    const changed = other.filter((branch) => !branch.new && branch[period].py > 0);
    const sameCy = sum(same, "cy"), sameLy = sum(same, "py");
    const guestStores = period === "ytd" ? [] : same.filter((branch) => branch.guests[period][0] > 0 && branch.guests[period][1] > 0);
    const guests = guestStores.reduce((n, branch) => n + branch.guests[period][0], 0);
    const guestsLy = guestStores.reduce((n, branch) => n + branch.guests[period][1], 0);
    const guestCy = sum(guestStores, "cy"), guestLy = sum(guestStores, "py");
    const steps = [{ label: "Last year", value: metrics.ly, total: true }];
    if (guests > 0 && guestsLy > 0) {
      const traffic = (guests - guestsLy) * (guestLy / guestsLy);
      const spend = (guestCy / guests - guestLy / guestsLy) * guests;
      steps.push({ label: "Guests (source estimates)", value: traffic }, { label: "Spend / guest", value: spend }, { label: "Other same-store", value: sameCy - sameLy - traffic - spend });
    } else steps.push({ label: "Same-store", value: sameCy - sameLy });
    steps.push({ label: "New stores", value: sum(newStores, "cy") - sum(newStores, "py") }, { label: "Closed / changed", value: sum(changed, "cy") - sum(changed, "py") }, { label: "This year", value: metrics.cy, total: true });
    let running = 0;
    const bridge = steps.map((step) => {
      const range = step.total ? [0, step.value] : [running, running + step.value];
      running = range[1];
      return { ...step, range };
    });
    const threshold = { dtd: 4000, mtd: 100000, ytd: 1000000 }[period];
    const ranked = same.filter((branch) => branch[period].cy > 0 && branch[period].py > threshold)
      .map((branch) => ({ branch, growth: (branch[period].cy / branch[period].py - 1) * 100 }))
      .sort((a, b) => b.growth - a.growth);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name, weekday) => {
      const indexes = root.AlfaOctoberDaily.days.map((_, i) => i).filter((i) => new Date(Date.UTC(2026, 9, i + 1)).getUTCDay() === weekday);
      const cy = indexes.reduce((n, i) => n + metrics.daily.cy[i], 0) / indexes.length;
      const ly = indexes.reduce((n, i) => n + metrics.daily.py[i], 0) / indexes.length;
      return { name, cy, ly, growth: ly > 0 ? (cy / ly - 1) * 100 : null };
    });
    return { ...metrics, bridge, ranked, weekdays, threshold, guests, guestsLy,
      newCount: branches.filter((branch) => branch.new).length,
      newSales: sum(branches.filter((branch) => branch.new), "cy"),
      salesPerStoreDay: metrics.trading ? metrics.cy / metrics.trading / { dtd: 1, mtd: 27, ytd: 300 }[period] : null,
      zeroYesterday: branches.filter((branch) => branch.dtd.cy === 0 && branch.dtd.py > 0).length,
      dineGrowth: sum(branches, "dpy") > 0 ? (sum(branches, "dcy") / sum(branches, "dpy") - 1) * 100 : null,
      deliveryGrowth: sum(branches, "vpy") > 0 ? (sum(branches, "vcy") / sum(branches, "vpy") - 1) * 100 : null,
    };
  }
  function presentationGaps(branches, period) {
    const same = branches.filter((branch) => branch.sss && !branch.new);
    const guests = same.reduce((n, branch) =>
      n + (period === "ytd" ? illustrativeTraffic(branch.ytd.cy, branch.name).transactions : branch.guests[period][0]), 0);
    const guestsLy = same.reduce((n, branch) =>
      n + (period === "ytd" ? illustrativeTraffic(branch.ytd.py, branch.name).transactions : branch.guests[period][1]), 0);
    const sales = same.reduce((n, branch) => n + Math.max(0, branch[period].cy), 0);
    const salesLy = same.reduce((n, branch) => n + Math.max(0, branch[period].py), 0);
    const spend = guests > 0 ? sales / guests : null;
    const spendLy = guestsLy > 0 ? salesLy / guestsLy : null;
    const eidAdha = ["cy", "py"].map((key) => Math.round(branches.reduce((n, branch) => n + Math.max(0, branch.hol.eidFitr[key === "cy" ? 0 : 1]) * 0.9, 0) * 100) / 100);
    return { guests, guestsLy, spend, guestGrowth: guestsLy > 0 ? (guests / guestsLy - 1) * 100 : null, spendGrowth: spend !== null && spendLy > 0 ? (spend / spendLy - 1) * 100 : null, eidAdha };
  }
  const chartFill = (color) => Array.isArray(color) ? color.map(chartFill) : `${color}80`;
  function alfredMenuMetrics(source, { brand = "all", category = "all", query = "" } = {}) {
    if (!source || !Array.isArray(source.items) || !source.checkValue || !source.attach || !Array.isArray(source.pairs)) throw new Error("Alfred menu source is missing or invalid.");
    const scoped = source.items.filter((item) => brand === "all" || item.brand === brand);
    const categories = [...new Set(scoped.map((item) => item.cat))].sort();
    const items = scoped.filter((item) => (category === "all" || item.cat === category) && item.item.toLowerCase().includes(query.trim().toLowerCase()));
    const eligible = items.filter((item) => item.per1k.oct >= 1 && item.price > 0);
    const popularity = eligible.length ? eligible.reduce((n, item) => n + item.per1k.oct, 0) / eligible.length : null;
    const margin = eligible.length ? eligible.reduce((n, item) => n + item.price - item.cost, 0) / eligible.length : null;
    const change = (a, b) => typeof a === "number" && typeof b === "number" && b > 0 ? (a / b - 1) * 100 : null;
    const rows = items.map((item) => ({
      ...item, margin: item.price - item.cost,
      classification: item.per1k.oct >= 1 && item.price > 0
        ? item.per1k.oct >= popularity ? item.price - item.cost >= margin ? "Star" : "Plowhorse" : item.price - item.cost >= margin ? "Puzzle" : "Dog"
        : null,
      dod: change(item.per1k.y, item.per1k.lwd), wow: change(item.per1k.w, item.per1k.pw),
      mom: change(item.per1k.oct, item.per1k.sep), yoy: change(item.per1k.oct, item.per1k.ly),
    })).sort((a, b) => b.sales - a.sales);
    const september = [...items].sort((a, b) => (b.sales1k.sep || 0) - (a.sales1k.sep || 0));
    const movers = rows.filter((item) => item.per1k.oct >= 5 && item.per1k.sep >= 5).sort((a, b) => b.mom - a.mom);
    const types = ["Hybrid", "Steak House", "Piatto", "CFK"].filter((name) => (brand === "all" || name === brand) && source.checkValue[`oct|${name}`]);
    return {
      categories, rows, popularity, margin,
      top: rows.slice(0, 15).map((item, i) => ({ ...item, rankChange: september.findIndex((other) => other.item === item.item && other.brand === item.brand) - i })),
      engineering: rows.filter((item) => item.classification),
      rising: movers.filter((item) => item.mom > 0).slice(0, 8),
      falling: movers.filter((item) => item.mom < 0).reverse().slice(0, 8),
      pairs: source.pairs.filter((pair) => (brand === "all" || pair.brand === brand) && (
        category === "all" && !query.trim() || items.some((item) => item.brand === pair.brand && (item.item === pair.a || item.item === pair.b))
      )),
      spend: types.map((name) => ({ name, oct: source.checkValue[`oct|${name}`], sep: source.checkValue[`sep|${name}`] || null, ly: source.checkValue[`ly|${name}`] || null })),
      attachments: Object.entries(source.attach).filter(([name, value]) => name !== "Other" && value.oct >= 1).sort((a, b) => b[1].oct - a[1].oct).slice(0, 12),
    };
  }
  function alfredDeliveryMetrics(source) {
    const vendors = Object.entries(source.vendors).map(([name, sales]) => {
      const rate = source.commissionRates[name];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error(`Invalid or missing Alfred commission rate: ${name}`);
      if (sales.length !== source.months.length || sales.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Invalid Alfred vendor series: ${name}`);
      return { name, sales, rate, commission: sales.map((value) => value * rate) };
    });
    if (!source.months.length || source.netSales.length !== source.months.length || source.netSales.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new Error("Invalid Alfred delivery net-sales series.");
    const totals = source.months.map((_, i) => vendors.reduce((total, vendor) => total + vendor.sales[i], 0));
    const commissions = source.months.map((_, i) => vendors.reduce((total, vendor) => total + vendor.commission[i], 0));
    const last = source.months.length - 1;
    const ytd = totals.reduce((a, b) => a + b, 0);
    const netSalesYtd = source.netSales.reduce((a, b) => a + b, 0);
    const app = vendors.find((vendor) => vendor.name === "Sufra app (online)");
    const biggest = vendors.filter((vendor) => vendor.name !== "Sufra app (online)").toSorted((a, b) => b.sales[last] - a.sales[last])[0] || null;
    return {
      vendors, totals, commissions, last, mtd: totals[last], ytd, commissionMtd: commissions[last],
      commissionYtd: commissions.reduce((a, b) => a + b, 0),
      netMtd: totals[last] - commissions[last],
      shares: totals.map((total, i) => source.netSales[i] > 0 ? total / source.netSales[i] * 100 : null),
      ytdShare: netSalesYtd > 0 ? ytd / netSalesYtd * 100 : null,
      appShare: app && totals[last] > 0 ? app.sales[last] / totals[last] * 100 : null, biggest,
    };
  }
  function alfredStoreMetrics(branch, period) {
    const metrics = alfredMetrics([branch], period);
    const ratio = (cy, ly) => ly > 0 ? (cy / ly - 1) * 100 : null;
    const guestPeriod = period;
    const guests = period === "ytd" ? null : branch.guests[guestPeriod];
    const annualSales = branch.mtd.cy / 27 * 365;
    return {
      ...metrics,
      lastWeek: branch.daily.cy.slice(20, 27).reduce((total, value) => total + value, 0),
      watch: branch.mtd.cy >= 30000 && (
        branch.mtd.py > 0 && branch.mtd.cy < branch.mtd.py * 0.85 && branch.ytd.py > 0 && branch.ytd.cy < branch.ytd.py * 0.85 ||
        branch.mtd.bud > 0 && branch.mtd.cy < branch.mtd.bud * 0.85
      ),
      guestGrowth: guests ? ratio(guests[0], guests[1]) : null,
      spend: guests?.[0] > 0 ? branch[guestPeriod].cy / guests[0] : null,
      spendGrowth: guests?.[0] > 0 && guests[1] > 0 ? ratio(branch[guestPeriod].cy / guests[0], branch[guestPeriod].py / guests[1]) : null,
      trafficEligible: Boolean(branch.sss && !branch.new && guests?.[0] > 0 && guests[1] > 0 && branch[guestPeriod].py > 0),
      annualSales,
      occupancy: annualSales > 0 ? branch.sim.rentYear / annualSales * 100 : null,
      salesPerSqft: branch.sim.sqft > 0 ? annualSales / branch.sim.sqft : null,
      salesPerTable: branch.sim.tables > 0 ? branch.mtd.cy / 27 / branch.sim.tables : null,
      guestsPerSeat: branch.sim.seats > 0 ? branch.guests.mtd[0] / 27 / branch.sim.seats : null,
    };
  }
  function alfredMetrics(branches, period) {
    if (!["dtd", "mtd", "ytd"].includes(period)) throw new Error("Invalid Alfred reporting period.");
    const sum = (fn) => branches.reduce((total, branch) => total + fn(branch), 0);
    const ratio = (cy, ly) => ly > 0 ? (cy / ly - 1) * 100 : null;
    const same = branches.filter((branch) => branch.sss && !branch.new);
    const cy = sum((branch) => branch[period].cy);
    const ly = sum((branch) => branch[period].py);
    const budget = sum((branch) => branch[period].bud);
    const guestStores = period === "ytd" ? [] : same.filter((branch) => branch.guests[period][0] > 0 && branch.guests[period][1] > 0);
    const guests = guestStores.reduce((total, branch) => total + branch.guests[period][0], 0);
    const guestsLy = guestStores.reduce((total, branch) => total + branch.guests[period][1], 0);
    const guestSales = guestStores.reduce((total, branch) => total + branch[period].cy, 0);
    const guestSalesLy = guestStores.reduce((total, branch) => total + branch[period].py, 0);
    const daily = (start, end, key = "cy") => sum((branch) => branch.daily[key].slice(start, end).reduce((total, value) => total + value, 0));
    const monthly = (key) => root.AlfaOctoberDaily.months.map((_, i) => sum((branch) => branch.month[key][i]));
    return {
      cy, ly, budget, growth: ratio(cy, ly), attainment: budget > 0 ? cy / budget * 100 : null,
      trading: branches.filter((branch) => branch[period].cy > 0).length,
      sameGrowth: ratio(same.reduce((total, branch) => total + branch[period].cy, 0), same.reduce((total, branch) => total + branch[period].py, 0)),
      deliveryShare: cy > 0 ? sum((branch) => branch[period].vcy) / cy * 100 : null,
      guestGrowth: ratio(guests, guestsLy),
      spend: guests > 0 ? guestSales / guests : null,
      spendGrowth: guests > 0 && guestsLy > 0 ? ratio(guestSales / guests, guestSalesLy / guestsLy) : null,
      yesterday: daily(26, 27), yesterdayVsWeek: ratio(daily(26, 27), daily(19, 20)),
      yesterdayVsLy: ratio(daily(26, 27), daily(26, 27, "py")),
      wow: ratio(daily(20, 27), daily(13, 20)),
      mom: ratio(sum((branch) => branch.mtd.cy) / 27, sum((branch) => branch.month.cy[8]) / 30),
      mtdGrowth: ratio(sum((branch) => branch.mtd.cy), sum((branch) => branch.mtd.py)),
      ytdGrowth: ratio(sum((branch) => branch.ytd.cy), sum((branch) => branch.ytd.py)),
      mtdBudgetGrowth: ratio(sum((branch) => branch.mtd.cy), sum((branch) => branch.mtd.bud)),
      mtd: sum((branch) => branch.mtd.cy), mtdBudget: sum((branch) => branch.mtd.bud),
      monthly: { cy: monthly("cy"), py: monthly("py"), budget: monthly("bud") },
      daily: { cy: root.AlfaOctoberDaily.days.map((_, i) => daily(i, i + 1)), py: root.AlfaOctoberDaily.days.map((_, i) => daily(i, i + 1, "py")) },
      holidays: {
        ramadan: [sum((branch) => branch.hol.ramadan[0]), sum((branch) => branch.hol.ramadan[1])],
        eidFitr: [sum((branch) => branch.hol.eidFitr[0]), sum((branch) => branch.hol.eidFitr[1])],
      },
    };
  }
  function illustrativeBrandTrend(name, current, prior) {
    if (![current, prior].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("Illustrative brand trends require finite MTD totals.");
    }
    const seed = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
    const weights = Array.from({ length: 27 }, (_, index) => {
      const weekday = new Date(Date.UTC(2026, 9, index + 1)).getUTCDay();
      return (weekday === 5 || weekday === 6 ? 130 : 90) + (seed + index * 17) % 31;
    });
    const weightTotal = weights.reduce((total, value) => total + value, 0);
    const allocate = (total) => {
      const cents = Math.round(total * 100);
      let cumulativeWeight = 0;
      let allocated = 0;
      return weights.map((weight) => {
        cumulativeWeight += weight;
        const next = Math.round(cents * cumulativeWeight / weightTotal);
        const value = (next - allocated) / 100;
        allocated = next;
        return value;
      });
    };
    const cy = allocate(current);
    const ly = allocate(prior);
    return cy.map((value, index) => ({ label: `${index + 1} Oct`, current: value, prior: ly[index] }));
  }
  function illustrativeTraffic(sales, name) {
    if (typeof sales !== "number" || !Number.isFinite(sales)) throw new Error("Illustrative traffic requires finite sales.");
    const seed = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
    const transactions = sales > 0 ? Math.max(1, Math.round(sales / (65 + seed % 86))) : 0;
    return { transactions, check: transactions > 0 ? sales / transactions : null };
  }
  function illustrativeTrafficSummary(rows) {
    const transactions = rows.reduce((total, row) => total + illustrativeTraffic(row.cy, row.id).transactions, 0);
    const sales = rows.reduce((total, row) => total + Math.max(0, row.cy), 0);
    return { transactions, sales, check: transactions > 0 ? sales / transactions : null };
  }
  function illustrativeSeatHour(row, period) {
    const days = { dtd: 1, mtd: 27, ytd: 300 }[period];
    if (!days) throw new Error(`Unsupported seat-hour period: ${period}`);
    if (![row.nonDelivery, row.nonDeliveryLy].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("Illustrative seat-hour sales require finite non-delivery sales.");
    }
    const seats = 60;
    const hoursPerDay = 12;
    const seatHours = seats * hoursPerDay * days;
    const dineIn = Math.round(Math.max(0, row.nonDelivery) * 0.8 * 100) / 100;
    const dineInLy = Math.round(Math.max(0, row.nonDeliveryLy) * 0.8 * 100) / 100;
    return { seats, hoursPerDay, days, seatHours, dineIn, dineInLy, current: dineIn / seatHours, prior: dineInLy / seatHours };
  }
  function illustrativeAdjustments(row) {
    if (typeof row.cy !== "number" || !Number.isFinite(row.cy)) throw new Error("Illustrative adjustments require finite sales.");
    const seed = [...row.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    const discountRate = (200 + seed % 401) / 10000;
    const compRate = (25 + seed % 126) / 10000;
    const voidRate = (30 + seed % 171) / 10000;
    const net = Math.round(Math.max(0, row.cy) * 100);
    const gross = Math.round(net / (1 - discountRate - compRate));
    const discount = Math.round(gross * discountRate);
    const comps = gross - net - discount;
    const voids = Math.round(gross * voidRate);
    return { gross: gross / 100, discount: discount / 100, comps: comps / 100, voids: voids / 100 };
  }
  const menuTemplates = [
    { name: "Signature Main", category: "Mains", price: 38, unitCost: 24, weight: 25 },
    { name: "Classic Main", category: "Mains", price: 32, unitCost: 23, weight: 20 },
    { name: "Signature Meal", category: "Meals", price: 49, unitCost: 31, weight: 18 },
    { name: "Sharing Meal", category: "Meals", price: 89, unitCost: 72, weight: 12 },
    { name: "Signature Side", category: "Sides", price: 14, unitCost: 8, weight: 9 },
    { name: "Extra Side", category: "Sides", price: 10, unitCost: 6, weight: 5 },
    { name: "Cold Beverage", category: "Beverages", price: 9, unitCost: 3, weight: 7 },
    { name: "Signature Dessert", category: "Desserts", price: 18, unitCost: 11, weight: 4 },
  ];
  function illustrativeMenu(stores) {
    const items = [];
    for (const brand of [...new Set(stores.map((row) => row.brand))].sort()) {
      const matches = stores.filter((row) => row.brand === brand);
      if (!matches.some((row) => row.cy > 0 || row.ly > 0)) continue;
      const allocate = (key) => {
        const cents = Math.round(matches.reduce((total, row) => total + Math.max(0, row[key]), 0) * 100);
        let weight = 0;
        let allocated = 0;
        return menuTemplates.map((item) => {
          weight += item.weight;
          const next = Math.round(cents * weight / 100);
          const sales = (next - allocated) / 100;
          allocated = next;
          return sales;
        });
      };
      const cy = allocate("cy");
      const ly = allocate("ly");
      menuTemplates.forEach((item, index) => {
        const units = cy[index] > 0 ? Math.max(1, Math.round(cy[index] / item.price)) : 0;
        const cost = units * item.unitCost;
        items.push({ ...item, brand, cy: cy[index], ly: ly[index], units, cost, profit: cy[index] - cost });
      });
    }
    return items;
  }
  function create(data, state) {
    if (data?.source !== "alfred") throw new Error("The dashboard requires the Alfred source adapter.");
    const $ = (id) => document.getElementById(id);
    ["overview", "brands", "stores", "menu", "delivery"].forEach((id) => $(id).classList.add("report-page"));
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const money = (value) => value === null ? "N/A" : `SAR ${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const count = (value) => value === null ? "N/A" : value.toLocaleString("en-GB");
    const growth = (cy, ly) => ly > 0 ? (cy / ly - 1) * 100 : null;
    const percentage = (value) => value === null ? "N/A" : `${value.toFixed(1)}%`;
    const share = (value, total) => total > 0 ? percentage(value / total * 100) : "N/A";
    const sum = (rs, key) => rs.reduce((total, row) => total + row[key], 0);
    const totals = (rs) => Object.fromEntries(["cy", "ly", "delivery", "deliveryLy", "nonDelivery", "nonDeliveryLy", "budget"].map((key) =>
      [key, rs.some((row) => row[key] === null) ? null : sum(rs, key)]));
    const filtered = (period = state.period) => data.periods[period].stores.filter((row) =>
      (state.region === "all" || row.region === state.region) &&
      (state.brand === "all" || row.brand === state.brand) &&
      (state.basis === "all" || row.sss));
    const chartInstances = new Map();
    const originalFills = new WeakMap();
    const opaqueFill = color => {
      if (Array.isArray(color)) return color.map(opaqueFill);
      if (typeof color !== "string") return color;
      if (/^#[\da-f]{8}$/i.test(color)) return color.slice(0, 7);
      return color.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, "rgb($1,$2,$3)");
    };
    Chart.register({
      id: "report-fill-style",
      beforeUpdate(chart) {
        if (!chart.canvas.closest(".report-page")) return;
        for (const dataset of chart.data.datasets) {
          if (!originalFills.has(dataset)) originalFills.set(dataset, dataset.backgroundColor);
          const fill = originalFills.get(dataset);
          dataset.backgroundColor = $("report-solid-charts").checked ? opaqueFill(fill) : fill;
        }
      },
    });
    $("report-solid-charts").onchange = () => {
      document.body.classList.toggle("report-solid-style", $("report-solid-charts").checked);
      for (const chart of chartInstances.values()) chart.update("none");
    };
    let mapMetric = "revenue";
    let mapView = "ksa";
    let mapProvider = "google";
    let googleMaps = null;
    let googleMap = null;
    let googleMapLoading = false;
    let googleMapError = "";
    let googleMapAttempted = false;
    const googleBrandMaps = new Map();
    let drawSalesMap = () => {};
    const mapObserver = new ResizeObserver(() => drawSalesMap());
    let brandFocus = "all";
    const brandMapState = { stores: { metric: "revenue", view: "ksa" }, cities: { metric: "revenue", view: "ksa" } };
    let drawBrandMaps = () => {};
    const brandMapObserver = new ResizeObserver(() => drawBrandMaps());
    const card = (title, id, note = "", classes = "") =>
      `<article class="card ceo-full-card ${classes}"><div class="card-head"><h2>${escape(title)}</h2></div><div id="${id}"></div>${note ? `<p class="ceo-chart-note">${escape(note)}</p>` : ""}</article>`;
    const table = (id, headers, records, sorting = null) => {
      $(id).classList.add("ceo-table-view");
      const alignment = headers.map((header) =>
        /^(Brand \/ store|Reporting unit|Brand|Region|Basis|Channel|Order type|October day|Branch|Illustrative region placement|Illustrative item|Item|Bought with|Class|Store type|Category|Store|Opened|City|Month|Holiday|Metric|Status|Reason|Vendor)$/.test(header)
          ? "report-text" : "report-number");
      $(id).innerHTML = records.length
        ? `<div class="table-wrap"><table class="ceo-data-table"><thead><tr>${headers.map((h, index) => sorting
          ? `<th class="${alignment[index]}" scope="col" aria-sort="${sorting.column === index ? sorting.ascending ? "ascending" : "descending" : "none"}"><button type="button" data-sort-column="${index}" aria-label="Sort by ${escape(h)}">${escape(h)}</button></th>`
          : `<th class="${alignment[index]}" scope="col">${escape(h)}</th>`).join("")}</tr></thead><tbody>${records.map((row) => `<tr>${row.map((v, index) => `<td class="${alignment[index]}">${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
        : '<div class="empty">No records match the selected filters.</div>';
      if (sorting) $(id).querySelectorAll("[data-sort-column]").forEach((button) => {
        button.onclick = () => sorting.onSort(Number(button.dataset.sortColumn));
      });
    };
    const unavailable = (id, message) => { $(id).innerHTML = `<div class="empty">N/A — ${escape(message)}</div>`; };
    const kpis = (id, cards) => {
      $(id).innerHTML = cards.map(([label, value, detail]) =>
        `<article class="kpi${String(value).startsWith("SAR ") ? " report-kpi-wide" : ""}"><div class="kpi-top">${escape(label)}</div><div class="kpi-value">${escape(value)}</div><div class="kpi-bottom">${escape(detail)}</div></article>`).join("");
    };
    function compactNotices() {
      const scopes = [
        [["report-sales-budget", "report-brief-bridge", "report-brief-ranking", "report-brief-story", "report-finance",
          "report-brand-manager", "report-alfred-brand-sales", "report-alfred-brand-budget", "report-brand-gap",
          "report-brand-contribution", "report-brand-store-map", "report-brand-city-map", "report-map",
          "report-store-scope", "report-store-traffic", "report-brand-penetration", "report-store-penetration"], alfredPeriodLabel(state.period)],
        [["report-october-daily", "report-brief-weekdays", "report-overview-brand-daily"], "Fixed October daily series · 1–27 Oct 2026"],
        [["report-alfred-brand-daily", "report-source-store-daily",
          "report-brand-month", "report-source-store-month"], `${alfredPeriodLabel(state.period)} · ${state.period === "dtd" ? "DUMMY hourly distribution; actual totals" : "source time profile reconciled to actual totals"}`],
        [["report-alfred-delivery-vendors", "report-alfred-delivery-share",
          "report-alfred-delivery-commission", "report-alfred-delivery-brands"], `${alfredPeriodLabel(state.period)} · includes DUMMY breakdowns; see source note`],
        [["report-brief-comparisons"], "Fixed source comparisons · Yesterday / MTD / YTD"],
        [["report-brand-comparisons", "report-source-store-comparisons"], `${alfredPeriodLabel(state.period)} heatmap; table retains labeled historical comparisons`],
        [["report-brand-new", "report-source-store-peers", "report-source-store-detail",
          "report-source-store-watch"], alfredPeriodLabel(state.period)],
        [["report-source-store-economics"], "Fixed October MTD annualization · simulated inputs"],
        [["report-menu-top", "report-menu-engineering", "report-menu-movers", "report-menu-attachment",
          "report-menu-pairs", "report-menu-spend", "report-menu-table"], `${alfredPeriodLabel(state.period)} · ${state.period === "mtd" ? "source sample; simulated recipe costs" : "DUMMY missing breakdowns"}`],
        [["report-brief-holidays"], "Fixed 2026 / 2025 holiday totals"],
        [["report-brand-holidays", "report-source-store-holidays"], alfredPeriodLabel(state.period)],
      ];
      for (const [ids, label] of scopes) for (const id of ids) {
        const article = $(id)?.closest("article.card");
        const heading = article?.querySelector("h2");
        if (!heading) continue;
        if (!heading.dataset.sourceTitle) heading.dataset.sourceTitle = heading.textContent;
        const dynamic = !label.startsWith("Fixed");
        const title = dynamic ? heading.dataset.sourceTitle
          .replace(/October daily sales|Month by month|Daily sales[^—]*?(?=$|—)/gi, "Sales trend")
          .replace(/— (?:October MTD|Oct MTD vs LY)|— 2026/gi, "")
          .replace(/— October sample/gi, "— selected sample")
          .replace(/Biggest movers — month on month/gi, "Biggest movers — vs September reference")
          .replace(/Ramadan & Eid by brand/, "Selected-period sales by brand")
          .replace(/Ramadan & Eid — selected store/, "Selected-period channel sales")
          : heading.dataset.sourceTitle;
        heading.textContent = `${title} — ${label}`;
        const note = article.querySelector(":scope > .ceo-chart-note");
        if (note && dynamic) {
          if (id.startsWith("report-alfred-delivery")) note.textContent =
            root.AlfaPeriodData.delivery(root.AlfaOctoberDaily.delivery, state.period, root.AlfaOctoberDaily.branches).periodNote;
          else if (["report-brand-month", "report-source-store-month", "report-source-store-daily", "report-alfred-brand-daily"].includes(id)) note.textContent =
            `${label}. Totals reconcile to selected-period source revenue; missing interval/budget distributions are allocations, not additional actuals.`;
          else if (id === "report-brand-holidays" || id === "report-source-store-holidays") note.textContent =
            "Actual selected-period revenue and LY comparisons. The former fixed holiday chart has been replaced by a period-aware sales comparison.";
          else if (id === "report-source-store-peers") note.textContent = "Trading peers in the selected store scope, ranked by selected-period source sales.";
          else if (id === "report-source-store-watch") note.textContent = "Historical MTD/YTD watchlist membership; the graph shows the selected-period growth and budget variance.";
        }
      }
      document.querySelectorAll(".report-page div.notice:not([id])").forEach((notice) => {
        const details = document.createElement("details");
        details.className = "notice report-methodology";
        const summary = document.createElement("summary");
        summary.textContent = notice.querySelector("strong")?.textContent.replace(/^ILLUSTRATIVE/, "Illustrative") ||
          "Report definitions and source notes";
        const body = document.createElement("div");
        body.className = "report-methodology-body";
        body.append(...notice.childNodes);
        details.append(summary, body);
        notice.replaceWith(details);
      });
    }
    function bars(id, items, percent = false, illustrative = false, unit = "") {
      chartInstances.get(id)?.destroy();
      chartInstances.delete(id);
      if (!items.length) return unavailable(id, "no comparable records for this selection.");
      const colors = percent ? items.map((item) => item.current >= 0 ? "#299bb0" : item.current >= -5 ? "#ff9228" : "#ed4654") : chartColors.current;
      const datasets = [{
        label: percent ? "Change vs LY" : unit ? `Illustrative CY ${unit}` : illustrative ? "Illustrative CY daily split" : "This year",
        data: items.map((item) => item.current),
        backgroundColor: chartFill(colors), borderColor: colors, borderWidth: 1, maxBarThickness: 42,
      }];
      if (!percent) datasets.push({
        label: unit ? `Illustrative LY ${unit}` : illustrative ? "Illustrative LY daily split" : "Last year", data: items.map((item) => item.prior),
        backgroundColor: chartFill(chartColors.prior), borderColor: chartColors.prior, borderWidth: 1, maxBarThickness: 42,
      });
      $(id).innerHTML = `<div style="max-width:100%;overflow:auto" tabindex="0" role="region" aria-label="Scroll chart categories"><div style="position:relative;height:320px;min-width:${Math.max(260, items.length * 72)}px"><canvas tabindex="0" role="img" aria-label="${escape($(id).closest("article").querySelector("h2").textContent)}"></canvas></div></div>`;
      const chart = new Chart($(id).querySelector("canvas"), {
        type: "bar",
        data: { labels: items.map((item) => item.label), datasets },
        options: {
          indexAxis: "x", responsive: true, maintainAspectRatio: false, animation: false,
          scales: {
            x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, font: { size: 10 }, callback: (v) => items[v].label.length > 22 ? `${items[v].label.slice(0, 20)}…` : items[v].label } },
            y: { beginAtZero: true, title: { display: Boolean(unit), text: unit }, ticks: { callback: (v) => percent ? `${v}%` : new Intl.NumberFormat("en", { notation: "compact" }).format(v) } },
          },
          plugins: {
            legend: { display: !percent, position: "top" },
            tooltip: { callbacks: { title: (contexts) => items[contexts[0].dataIndex].label, label: (context) => `${context.dataset.label}: ${percent ? percentage(context.parsed.y) : money(context.parsed.y)}${unit ? " per seat-hour" : ""}` } },
          },
        },
      });
      chartInstances.set(id, chart);
      chart.canvas.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const index = ((chart.getActiveElements()[0]?.index ?? -1) + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
        const active = datasets.map((_, datasetIndex) => ({ datasetIndex, index }));
        chart.setActiveElements(active);
        const point = chart.getDatasetMeta(0).data[index];
        chart.tooltip.setActiveElements(active, { x: point.x, y: point.y });
        chart.update("none");
      });
    }
    const financeHeaders = ["Brand / store", "Sales", "Last year", "Change SAR", "Change %", "Budget", "vs budget SAR"];
    const financeRecord = (name, amount) => [name, money(amount.cy), money(amount.ly), money(amount.cy - amount.ly), percentage(growth(amount.cy, amount.ly)), money(amount.budget), money(amount.budget === null ? null : amount.cy - amount.budget)];
    const penetrationHeaders = ["Brand / store", "Total revenue", "Alfred delivery", "Delivery %", "Alfred dine-in", "Dine-in %"];
    const penetrationRecord = (name, amount) => [name, money(amount.cy), money(amount.delivery), share(amount.delivery, amount.cy), money(amount.nonDelivery), share(amount.nonDelivery, amount.cy)];
    const group = (rs, key) => [...new Set(rs.map((row) => row[key]))].sort().map((name) => ({ name, ...totals(rs.filter((row) => row[key] === name)) }));
    $("overview").innerHTML = `<div class="notice">Imported report data · 27 Oct 2026. Reported totals use no sample values. Separately labeled daily trends, traffic/check and map positions are illustrative; actual transaction counts and branch GPS are not mapped. Hybrid brand halves are counted once; their physical-site totals are excluded.</div><div class="kpis" id="report-overview-kpis"></div>
      <div class="ceo-grid report-brief-trends">${card("Daily sales — October", "report-october-daily")}${card("Why sales moved — bridge from last year", "report-brief-bridge", "Start at last year, add or take away each reason, and end at this year. Source sales; guests are estimates. YTD uses same-store change without a guest split.")}</div>
      <div class="ceo-grid report-brief-comparison-row">${card("Sales vs budget — company and brands", "report-sales-budget")}${card("Every comparison at a glance", "report-brief-comparisons", "Teal = up; coral = down. Yesterday: 27 Oct; last week: 20 Oct. MoM compares sales/day, October vs September.")}</div>
      <div class="ceo-grid report-brief-seasonality">${card("Ramadan & Eid — like for like", "report-brief-holidays", "Alfred Ramadan and Eid al-Fitr totals. Eid al-Adha sales are unavailable.")}${card("Which weekdays are slipping", "report-brief-weekdays", "Average daily sales per aligned weekday, 1–27 October; independent of period selection.")}</div>
      ${card("Alfred says — executive readout", "report-brief-story")}
      ${card("Sales map", "report-map")}
      ${card("October daily sales — by brand", "report-overview-brand-daily", "Actual Alfred source series for 1–27 October 2026. Global brand, region and store-basis filters apply; period selection does not change this October timeline. Teal = this year; dashed navy = last year.")}
      ${card("Look at today — alerts", "report-brief-alerts")}
      ${card("Same-store growth — every store", "report-brief-ranking", "All comparable Alfred stores, replacing the limited Top/Worst panels. Click Inspect to open the store detail.")}
      ${card("Alfred financial totals", "report-finance", "The same Alfred branch figures underpin every selected-period KPI, chart and financial table.", "ceo-table-view")}`;
    $("brands").innerHTML = `${card("Brand manager view", "report-brand-manager")}
      ${card("Brands — every comparison", "report-brand-comparisons", "Yesterday, weekly, monthly and year-on-year comparisons use Alfred's fixed reporting dates. Heat cells are relative percentage changes; exact amounts appear in Table View.")}
      <div class="ceo-grid">${card("Sales by brand — this year vs last year", "report-alfred-brand-sales")}${card("Budget attainment by brand", "report-alfred-brand-budget")}</div>
      <div class="ceo-grid">${card("Budget gap by store", "report-brand-gap")}${card("New stores — shown separately", "report-brand-new", "Alfred new-store flags. MTD sales/day compared with the same source brand's mature same-store average across all regions; new stores are excluded from same-store growth.")}</div>
      ${card("Contribution to the change — by brand", "report-brand-contribution", "Selected-period source sales minus last year. Positive brands offset declining brands; amounts reconcile to the source scope change.")}
      <div class="ceo-grid">${card("Brand across its stores", "report-brand-store-map")}${card("Brand overall — by city", "report-brand-city-map")}</div>
      <div class="ceo-grid">${card("Month by month — this year, last year, budget", "report-brand-month", "January–October 2026; October covers 1–27 only.")}${card("Ramadan & Eid by brand", "report-brand-holidays", "Ramadan: 18 Feb–19 Mar 2026 vs 1–29 Mar 2025. Eid al-Fitr: three days each. Eid al-Adha sales are unavailable.")}</div>
      ${card("Daily trend per brand — October", "report-alfred-brand-daily", "Actual source daily series, not illustrative splits. Each brand uses its own scale; dashed navy = last year.")}`;
    $("stores").innerHTML = `${card("Stores — Alfred source scope", "report-store-scope")}
      <div class="table-head report-search"><label for="report-store-search">Search stores</label><input class="search" id="report-store-search" type="search" aria-label="Search stores" placeholder="Search stores, brands or cities…"></div>
      ${card("Stores — every comparison", "report-source-store-comparisons", "Fixed October comparisons, matching Alfred. Graph View shows percentage changes; Table View includes exact amounts. Click table headers to sort or a row to inspect a store.")}
      ${card("Store detail", "report-source-store-detail")}
      <div class="ceo-grid">${card("October day by day", "report-source-store-daily", "1–27 October 2026. Same weekday last week starts on day 8.")}${card("Month by month", "report-source-store-month", "January–October 2026; October covers 1–27 only.")}</div>
      ${card("Against its peers — same brand, MTD", "report-source-store-peers", "Top 12 trading peers across all Alfred regions, plus the selected store. Rank uses the full source brand, not the filtered list.")}
      <div class="ceo-grid">${card("Store economics — simulated inputs", "report-source-store-economics", "Alfred's simulated size, seating, table and rent inputs. Annual sales extrapolate October MTD / 27 × 365; not an actual annual forecast.")}${card("Ramadan & Eid — selected store", "report-source-store-holidays", "Aligned source event totals. Ramadan: 18 Feb–19 Mar 2026 vs 1–29 Mar 2025. Eid al-Fitr: 20–22 Mar 2026 vs 30 Mar–1 Apr 2025.")}</div>
      <div class="ceo-grid">${card("Traffic × check — same-store", "report-store-traffic", "Guest growth × spend per guest growth; bubble area = source sales. Guest/check counts are Alfred estimates, not a POS feed. YTD traffic is unavailable.")}${card("Watchlist", "report-source-store-watch", "MTD sales ≥ SAR 30,000 and either MTD + YTD declines worse than 15%, or MTD budget attainment below 85%. Fixed MTD/YTD criteria.")}</div>
      ${card("Sales per seat-hour · RevPASH unavailable", "report-store-seat-hour")}`;
    $("delivery").innerHTML = `<div class="notice"><strong>Source: Alfred delivery report.</strong> The summary and four panels below are fixed company-wide January–October 2026 data; October covers 1–27. Like Alfred, they do not change with global period, brand, region or store-basis filters: no matched allocation is supplied. Virtual brands are retained under their source names, not mapped to physical kitchen brands. Commission is an estimate using Alfred's source contract rates; VAT basis remains unconfirmed. Alfred branch penetration in Table View follows the selected period and filters.</div><div class="kpis" id="report-delivery-kpis"></div>
      <div class="ceo-grid">${card("Delivery sales by aggregator — 2026", "report-alfred-delivery-vendors", "Stacked monthly sales. Keeta, Hunger Station, Jahez, other aggregators and Sufra app; October is partial.")}${card("Delivery share of sales", "report-alfred-delivery-share", "Monthly Alfred delivery / Alfred total net sales.")}</div>
      <div class="ceo-grid">${card("Estimated commission — October MTD", "report-alfred-delivery-commission", "Vendor sales × source contract rate. Includes zero-rate vendors in Table View. VAT basis to confirm.")}${card("Delivery by brand incl. virtual brands — Oct MTD vs LY", "report-alfred-delivery-brands", "Earth Bowlz, Curry Club, Pat & Gino and other virtual brands remain distinct from their host kitchens.")}</div>
      ${card("Alfred revenue categories — selected scope", "report-channel-table", "", "ceo-table-view")}
      ${card("Delivery order types — source figures", "report-vendor-table", "", "ceo-table-view")}
      <div class="notice ceo-table-view" id="report-delivery-reconciliation"></div>
      ${card("Delivery penetration by brand", "report-brand-penetration", "Reported delivery definition; pickup-free penetration by brand is N/A until matched branch/order-type data is mapped.", "ceo-table-view")}
      <article class="card ceo-full-card ceo-table-view"><div class="table-head"><h2>Delivery penetration by store</h2><input class="search" id="report-delivery-search" type="search" aria-label="Search delivery stores" placeholder="Search stores or brands…"></div><div id="report-store-penetration" style="max-height:520px;overflow:auto"></div></article>
      `;
    $("menu").innerHTML = `<div id="report-menu-source"></div>
      <div class="ceo-inline-controls"><label class="field">ALFRED MENU BRAND FOCUS<select id="report-menu-focus"><option value="all">All brands in selected scope</option>${["Hybrid", "Steak House", "Piatto", "CFK"].map((name) => `<option>${name}</option>`).join("")}</select></label><label class="field">MENU CATEGORY<select id="report-menu-category"><option value="all">All categories</option></select></label><label class="field">SEARCH ITEMS<input class="search" id="report-menu-search" type="search" placeholder="Search item names"></label></div>
      <div class="kpis" id="report-menu-kpis"></div>
      <div class="ceo-grid">${card("Top 15 items — October sample", "report-menu-top", "October sales; rank movement compares September sales per 1,000 checks.")}${card("Menu engineering — simulated cost", "report-menu-engineering", "Actual sample units per 1,000 checks × price less simulated recipe cost. Stars: keep; Plowhorses: re-price; Puzzles: promote; Dogs: review.")}</div>
      ${card("Item by item — DoD, WoW, MoM, YoY", "report-menu-table", "Changes in units per 1,000 checks: DoD = 27 vs 20 Oct; WoW = 21–27 vs 14–20 Oct; MoM = Oct 1–27 vs Sep 1–27; YoY = Oct 1–27 2026 vs Oct 2–28 2025. Different sample coverage; not like-for-like store growth.", "ceo-table-view")}
      <div class="ceo-grid">${card("Biggest movers — month on month", "report-menu-movers", "At least 5 units per 1,000 checks in both October and September. Up to eight rising and eight falling items.")}${card("Category mix and attachment", "report-menu-attachment", "Fixed full e-invoice sample, not brand/category/search filtered. Percentage of checks including a category; categories can overlap.")}</div>
      <div class="ceo-grid">${card("Bought together — combo ideas", "report-menu-pairs", "October same-check pairs. Lift above 1 indicates association above chance. Item filters match either member of a pair.")}${card("Spend per check by store type", "report-menu-spend", "Source brand scope only; category/search do not change check-level metrics. Missing LY checks show N/A.")}</div>`;
    let menuCategory = "all";
    let menuFocus = "all";
    let menuQuery = "";
    $("report-store-seat-hour").closest("article").insertAdjacentHTML("afterend",
      card("Discount, Voids & Check Comps %", "report-store-adjustments"));
    $("report-menu-category").onchange = (event) => {
      menuCategory = event.target.value;
      renderMenu();
      navigate(state.page);
    };
    $("report-menu-focus").onchange = (event) => { menuFocus = event.target.value; menuCategory = "all"; renderMenu(); navigate(state.page); };
    $("report-menu-search").oninput = (event) => { menuQuery = event.target.value; renderMenu(); navigate(state.page); };
    document.querySelectorAll(".ceo-card-tag").forEach((tag) => { if (/sample|simulat/i.test(tag.textContent)) tag.remove(); });
    document.querySelector(".date-pill").textContent = "As of 27 Oct 2026 · Alfred source";
    document.querySelector('[data-period="dtd"]').textContent = "Yesterday";
    document.querySelector('[data-period="dtd"]').title = "Presentation yesterday: 27 Oct 2026";
    const headerTag = document.querySelector(".header-right .tag, .topbar .tag, .topbar .badge");
    if (headerTag) headerTag.textContent = "ALFRED SOURCE DATA";
    document.querySelectorAll("body *").forEach((el) => {
      if (el.children.length === 0 && el.textContent.trim() === "SAMPLE DATA") el.textContent = "ALFRED SOURCE DATA";
    });
    document.querySelector("main.content > footer").textContent = "Source: Alfred snapshot, 27 Oct 2026; not a live feed. Selected-period financial totals remain actual source figures. Missing hourly/menu/delivery breakdowns and YTD traffic graphs use explicitly labeled deterministic DUMMY projections. Maps retain unavailable source YTD traffic. Recipe costs, store economics and commissions remain estimates. Do not treat dummy figures as actual POS results.";
    $("overview").querySelector(".notice").textContent = "Alfred source · 27 Oct 2026 · 94 branches. CEO, Brands and Stores use the same branch figures and source same-store flags. Hybrid and Asian Dining remain combined source brands. Transactions use Alfred's estimated checks; YTD checks are unavailable. No validated JSON totals or additional mock figures are substituted.";
    $("brand").replaceChildren(new Option("All brands", "all"), ...[...new Set(data.periods.mtd.stores.map((row) => row.brand))].sort().map((name) => new Option(name, name)));
    $("region").replaceChildren(new Option("All regions", "all"), ...[...new Set(data.periods.mtd.stores.map((row) => row.region))].sort().map((name) => new Option(name, name)));
    let storeQuery = "";
    let deliveryQuery = "";
    let storeFocus = "all";
    let selectedStore = "";
    let sortColumn = 9;
    let sortAscending = false;
    function renderStoreTables(rs) {
      const matches = (query) => rs.filter((row) => `${row.name} ${row.brand}`.toLowerCase().includes(query.toLowerCase()));
      table("report-store-penetration", penetrationHeaders, matches(deliveryQuery).map((row) => penetrationRecord(`${row.name} · ${row.brand}`, row)));
      renderAlfredStores();
      unavailable("report-store-seat-hour", "Alfred does not provide verified trading hours for RevPASH.");
      unavailable("report-store-adjustments", "Alfred does not provide POS discounts, voids or complimentary-check amounts.");
      compactNotices();
    }
    $("report-store-search").oninput = (event) => { storeQuery = event.target.value; renderStoreTables(filtered()); navigate(state.page); };
    $("report-store-search").parentElement.classList.add("report-search");
    $("report-delivery-search").oninput = (event) => { deliveryQuery = event.target.value; renderStoreTables(filtered()); };
    function renderAlfredStores() {
      const branches = alfredBranches().filter((branch) =>
        (storeFocus === "all" || branch.brand === storeFocus) &&
        `${branch.name} ${branch.brand} ${branch.city}`.toLowerCase().includes(storeQuery.toLowerCase()));
      const rows = branches.filter((branch) => branch.mtd.cy || branch.mtd.py || branch.ytd.cy).map((branch) => ({
        branch, ...alfredStoreMetrics(branch, "mtd"),
      }));
      $("report-store-scope").innerHTML = `${alfredNotice()}<label class="field">ALFRED STORE BRAND FOCUS<select id="report-store-focus"><option value="all">All brands in selected scope</option>${[...new Set(root.AlfaOctoberDaily.branches.map((branch) => branch.brand))].sort().map((name) => `<option${storeFocus === name ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></label><p class="ceo-chart-note">Focus narrows global filters. Search applies to the store list, picker, watchlist and traffic. Fixed-period comparisons retain their stated source dates. RevPASH and POS adjustments are unavailable in Alfred.</p><div class="kpis" id="report-store-kpis"></div>`;
      $("report-store-focus").onchange = (event) => { storeFocus = event.target.value; renderAlfredStores(); compactNotices(); navigate(state.page); };
      const scopeMetrics = alfredMetrics(branches, state.period);
      kpis("report-store-kpis", [
        ["Source stores", String(branches.length), `${scopeMetrics.trading} trading in selected period`],
        ["Sales", branches.length ? money(scopeMetrics.cy) : "N/A", "Alfred source · selected period"],
        ["Same-store growth", percentage(scopeMetrics.sameGrowth), "Source same-store flags; new stores excluded"],
        ["Watchlist", String(rows.filter((row) => row.watch).length), "Fixed MTD/YTD thresholds"],
      ]);
      const values = (row) => [row.branch.name, row.branch.brand, row.branch.city, row.branch.new ? "New" : row.branch.sss ? "Same-store" : "Non-comparable",
        row.yesterday, row.yesterdayVsWeek, row.yesterdayVsLy, row.wow, row.mom, row.mtd, row.mtdGrowth, row.attainment,
        row.ytdGrowth, row.guestGrowth, row.spend, row.branch.checks.mtd[0], row.deliveryShare, row.watch ? "Watch" : ""];
      const sorted = [...rows].sort((a, b) => {
        const left = values(a)[sortColumn], right = values(b)[sortColumn];
        if (left === null || right === null) return left === right ? a.branch.name.localeCompare(b.branch.name) : left === null ? 1 : -1;
        return (sortAscending ? 1 : -1) * (typeof left === "number" ? left - right : left.localeCompare(right)) || a.branch.name.localeCompare(b.branch.name);
      });
      const headers = ["Store", "Brand", "City", "Basis", "Yesterday", "vs last week", "Yesterday vs LY", "WoW", "MoM / day", "MTD", "MTD vs LY", "Budget attainment", "YTD vs LY", "Guest growth MTD (est.)", "Spend / guest MTD", "Checks MTD (est.)", "Delivery MTD", "Status"];
      $("report-source-store-comparisons").innerHTML = '<div class="ceo-graph-view report-comparison-heat" id="report-source-store-heat"></div><div id="report-source-store-table"></div>';
      renderComparisonHeat("report-source-store-heat", sorted.map(row => ({ ...row, name: row.branch.name })), false);
      table("report-source-store-table", headers, sorted.map((row) => values(row).map((value, i) =>
        [4, 9, 14].includes(i) ? money(value) : [5, 6, 7, 8, 10, 11, 12, 13, 16].includes(i) ? percentage(value) : value)),
      { column: sortColumn, ascending: sortAscending, onSort: (column) => {
        sortAscending = sortColumn === column ? !sortAscending : true; sortColumn = column; renderAlfredStores(); compactNotices(); navigate(state.page);
      } });
      $("report-source-store-table").querySelectorAll("tbody tr").forEach((tr, index) => {
        const name = sorted[index].branch.name, button = document.createElement("button");
        button.type = "button"; button.className = "report-store-inspect"; button.textContent = "Inspect";
        button.setAttribute("aria-label", `Inspect ${name}`); tr.children[0].append(" ", button);
        tr.style.cursor = "pointer";
        tr.onclick = () => {
          selectedStore = name; $("report-source-store-picker").value = name; renderSourceStoreDetail(branches);
          compactNotices(); navigate(state.page);
          $("report-source-store-detail").closest("article").scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
      const watches = rows.filter((row) => row.watch).sort((a, b) => a.mtdGrowth - b.mtdGrowth);
      if (!branches.some((branch) => branch.name === selectedStore)) {
        selectedStore = watches.toSorted((a, b) => b.mtd - a.mtd)[0]?.branch.name ||
          rows.toSorted((a, b) => b.mtd - a.mtd)[0]?.branch.name || "";
      }
      $("report-source-store-detail").innerHTML = `<label class="field">STORE<select id="report-source-store-picker">${branches.length ? branches.toSorted((a, b) => a.name.localeCompare(b.name)).map((branch) => `<option${branch.name === selectedStore ? " selected" : ""}>${escape(branch.name)}</option>`).join("") : '<option value="">No matching stores</option>'}</select></label><p id="report-source-store-subtitle"></p><div class="kpis" id="report-source-store-kpis"></div>`;
      $("report-source-store-picker").onchange = (event) => { selectedStore = event.target.value; renderSourceStoreDetail(branches); compactNotices(); navigate(state.page); };
      renderSourceStoreDetail(branches);
      brandPanel("report-source-store-watch");
      brandChart("report-source-store-watch-chart", watches.map((row) => row.branch.name), [
        { label: "Selected period vs LY", data: watches.map((row) => growth(row.branch[state.period].cy, row.branch[state.period].py)) },
        { label: "Selected period vs budget", data: watches.map((row) => growth(row.branch[state.period].cy, row.branch[state.period].bud)) },
      ], { percent: true, horizontal: true });
      table("report-source-store-watch-table", ["Store", "Brand", "MTD", "MTD vs LY", "YTD vs LY", "Budget attainment", "Reason"], watches.map((row) => [
        row.branch.name, row.branch.brand, money(row.mtd), percentage(row.mtdGrowth), percentage(row.ytdGrowth), percentage(row.attainment),
        [row.branch.mtd.py > 0 && row.branch.mtd.cy < row.branch.mtd.py * 0.85 && row.branch.ytd.py > 0 && row.branch.ytd.cy < row.branch.ytd.py * 0.85 ? "Falling MTD and YTD" : "", row.branch.mtd.bud > 0 && row.branch.mtd.cy < row.branch.mtd.bud * 0.85 ? "Far below MTD budget" : ""].filter(Boolean).join("; "),
      ]));
      $("report-source-store-watch-table").querySelectorAll("tbody tr").forEach((tr, index) => {
        if (!watches[index]) return;
        const button = document.createElement("button");
        button.type = "button"; button.className = "report-store-inspect"; button.textContent = "Inspect";
        button.setAttribute("aria-label", `Inspect ${watches[index].branch.name}`);
        tr.children[0].append(" ", button);
        tr.style.cursor = "pointer";
        tr.onclick = () => {
          selectedStore = watches[index].branch.name; $("report-source-store-picker").value = selectedStore;
          renderSourceStoreDetail(branches); compactNotices();
          $("report-source-store-detail").closest("article").scrollIntoView({ block: "start" });
        };
      });
      if (!watches.length && branches.length) {
        $("report-source-store-watch-chart").innerHTML = '<div class="empty">No stores meet the watchlist criteria.</div>';
        $("report-source-store-watch-table").innerHTML = '<div class="empty">No stores meet the watchlist criteria.</div>';
      }
      renderStoreTraffic(branches);
    }
    function renderSourceStoreDetail(branches) {
      const branch = branches.find((branch) => branch.name === selectedStore);
      const ids = ["report-source-store-daily", "report-source-store-month", "report-source-store-peers", "report-source-store-economics", "report-source-store-holidays"];
      ids.forEach((id) => {
        chartInstances.get(`${id}-chart`)?.destroy(); chartInstances.delete(`${id}-chart`); brandPanel(id);
      });
      if (!branch) {
        $("report-source-store-subtitle").textContent = "No Alfred stores match the selected filters.";
        $("report-source-store-kpis").replaceChildren();
        ids.forEach((id) => { unavailable(`${id}-chart`, "select a matching store."); unavailable(`${id}-table`, "select a matching store."); });
        return;
      }
      const period = state.period;
      const metrics = alfredStoreMetrics(branch, period);
      const trend = root.AlfaPeriodData.trend([branch], period);
      const peers = branches.filter((other) => other.brand === branch.brand && other[period].cy > 0).toSorted((a, b) => b[period].cy - a[period].cy);
      const rank = peers.indexOf(branch);
      $("report-source-store-subtitle").textContent = `${branch.brand} · ${branch.city} · ${branch.region}${branch.opened ? ` · opened ${branch.opened}` : ""}${branch.new ? " · new store" : ""}${metrics.watch ? " · watchlist" : ""}. ${trend.note}.`;
      kpis("report-source-store-kpis", [
        ["Yesterday", money(metrics.yesterday), `${percentage(metrics.yesterdayVsWeek)} vs last Tuesday · ${percentage(metrics.yesterdayVsLy)} vs LY`],
        ["Last 7 days", money(metrics.lastWeek), `${percentage(metrics.wow)} WoW`],
        ["Selected-period sales", money(branch[period].cy), `${percentage(metrics.growth)} vs LY · ${alfredPeriodLabel(period)}`],
        ["Selected-period budget", percentage(metrics.attainment), `Gap ${money(branch[period].cy - branch[period].bud)}`],
        ["Year to date", money(branch.ytd.cy), `${percentage(metrics.ytdGrowth)} vs LY`],
        ["Guests MTD (estimated)", branch.guests.mtd[0].toLocaleString("en-GB"), `${percentage(metrics.guestGrowth)} vs LY`],
        ["Spend per guest MTD", money(metrics.spend), "Source sales / estimated guests; not average check"],
        ["Rank in source brand", rank >= 0 ? `${rank + 1} / ${peers.length}` : "N/A", `${percentage(metrics.deliveryShare)} MTD delivery share · trading peers only`],
      ]);
      brandChart("report-source-store-daily-chart", trend.labels, [
        { label: "This year", data: trend.cy },
        { label: "Budget", data: trend.bud, borderColor: chartColors.budget, borderDash: [2, 3] },
        { label: "Last year", data: trend.py, borderColor: chartColors.prior, borderDash: [4, 3] },
      ], { line: true });
      table("report-source-store-daily-table", ["Interval", "This year", "Budget", "Last year"], trend.labels.map((day, i) => [day, money(trend.cy[i]), money(trend.bud[i]), money(trend.py[i])]));
      brandChart("report-source-store-month-chart", trend.labels, [
        { label: "This year", data: trend.cy }, { label: "Last year", data: trend.py },
        { label: "Budget", type: "line", data: trend.bud },
      ]);
      table("report-source-store-month-table", ["Interval", "This year", "Last year", "Budget"], trend.labels.map((month, i) => [month, money(trend.cy[i]), money(trend.py[i]), money(trend.bud[i])]));
      const topPeers = peers.slice(0, 12);
      if (!topPeers.includes(branch)) topPeers.push(branch);
      brandChart("report-source-store-peers-chart", topPeers.map((other) => other.name), [
        { label: alfredPeriodLabel(period), data: topPeers.map((other) => other[period].cy), backgroundColor: topPeers.map((other) => other === branch ? chartColors.budget : chartColors.current) },
      ], { horizontal: true });
      table("report-source-store-peers-table", ["Store", "Selected sales", "vs LY", "Budget attainment"], topPeers.map((other) => [other.name, money(other[period].cy), percentage(growth(other[period].cy, other[period].py)), share(other[period].cy, other[period].bud)]));
      const econCards = [
        ["Store size", `${branch.sim.sqft.toLocaleString("en-GB")} sq ft`, `${branch.sim.seats} simulated seats · ${branch.sim.tables} simulated tables`],
        ["Annual rent", money(branch.sim.rentYear), "Alfred simulated rent / year"],
        ["Annualized sales", money(metrics.annualSales), "October sales/day × 365"],
        ["Occupancy cost", percentage(metrics.occupancy), `${money(branch.sim.rentYear)} simulated annual rent`],
        ["Sales per sq ft", money(metrics.salesPerSqft), `${branch.sim.sqft} simulated sq ft · annualized`],
        ["Sales per table / day", money(metrics.salesPerTable), `${branch.sim.tables} simulated tables`],
        ["Guests per seat / day", metrics.guestsPerSeat === null ? "N/A" : metrics.guestsPerSeat.toFixed(1), `${branch.sim.seats} simulated seats · estimated MTD guests`],
      ];
      $("report-source-store-economics-chart").innerHTML = '<div class="kpis" id="report-source-store-econ-kpis"></div>';
      kpis("report-source-store-econ-kpis", econCards);
      table("report-source-store-economics-table", ["Metric", "Value", "Basis"], econCards);
      const holidays = [["Dine-in", branch[period].dcy, branch[period].dpy], ["Delivery", branch[period].vcy, branch[period].vpy]];
      brandChart("report-source-store-holidays-chart", holidays.map((row) => row[0]), [
        { label: "2026", data: holidays.map((row) => row[1]) }, { label: "2025", data: holidays.map((row) => row[2]) },
      ]);
      table("report-source-store-holidays-table", ["Channel", "2026", "2025", "Change", "Basis"], holidays.map(([name, cy, py]) => [name, money(cy), money(py), percentage(growth(cy, py)), alfredPeriodLabel(period)]));
      if (state.period === "ytd") {
        $("report-source-store-kpis").insertAdjacentHTML("beforeend", '<article class="kpi"><div class="kpi-top">Guests YTD</div><div class="kpi-value">N/A</div><div class="kpi-bottom">Not provided by Alfred</div></article><article class="kpi"><div class="kpi-top">Spend / guest YTD</div><div class="kpi-value">N/A</div><div class="kpi-bottom">Not provided by Alfred</div></article>');
      }
    }
    function enableChartZoom(chart) {
      const canvas = chart.canvas;
      const viewport = canvas.parentElement.parentElement;
      const controls = document.createElement("div");
      controls.className = "report-chart-zoom";
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", "Chart zoom and pan");
      const initial = Object.fromEntries(["x", "y"].map(key => [key, {
        min: chart.options.scales[key].min, max: chart.options.scales[key].max,
      }]));
      const transform = (factor, dx = 0, dy = 0, anchor = { x: 0.5, y: 0.5 }) => {
        for (const key of ["x", "y"]) {
          const scale = chart.scales[key];
          const logarithmic = scale.type === "logarithmic";
          const forward = logarithmic ? Math.log : value => value;
          const inverse = logarithmic ? Math.exp : value => value;
          const min = forward(scale.min), max = forward(scale.max);
          const span = max - min;
          const center = min + span * anchor[key];
          const shift = span * (key === "x" ? dx : dy);
          const nextMin = inverse(center + (min - center) * factor + shift);
          const nextMax = inverse(center + (max - center) * factor + shift);
          if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax) || nextMax <= nextMin) return;
          chart.options.scales[key].min = nextMin;
          chart.options.scales[key].max = nextMax;
        }
        chart.update("none");
      };
      for (const [label, title, callback] of [
        ["Reset zoom", "Restore the complete chart", () => {
          for (const key of ["x", "y"]) {
            chart.options.scales[key].min = initial[key].min;
            chart.options.scales[key].max = initial[key].max;
          }
          chart.update("none");
        }],
      ]) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "report-store-inspect";
        button.textContent = label; button.title = title; button.onclick = callback;
        controls.append(button);
      }
      viewport.before(controls);
      const hint = document.createElement("p");
      hint.className = "ceo-chart-note";
      hint.textContent = "Scroll over the plot to zoom. Drag to pan; pinch with two fingers to zoom on touch screens. Double-click or Reset zoom restores all points. Keyboard: + / - to zoom, 0 to reset. Filters reset zoom.";
      controls.after(hint);
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      const position = event => {
        const rect = canvas.getBoundingClientRect(), area = chart.chartArea;
        return {
          x: ((event.clientX - rect.left) * chart.width / rect.width - area.left) / (area.right - area.left),
          y: (area.bottom - (event.clientY - rect.top) * chart.height / rect.height) / (area.bottom - area.top),
        };
      };
      canvas.addEventListener("wheel", event => {
        if (!event.deltaY) return;
        const anchor = position(event);
        if (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? chart.height : 1);
        transform(Math.exp(Math.max(-0.3, Math.min(0.3, delta * 0.002))), 0, 0, anchor);
      }, { passive: false });
      const pointers = new Map();
      let moved = false, gestureEnded = -Infinity;
      const originalClick = chart.options.onClick;
      chart.options.onClick = (...args) => {
        if (!moved && performance.now() - gestureEnded > 350) originalClick?.(...args);
      };
      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const point = position(event);
        if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
        if (!pointers.size) moved = false;
        pointers.set(event.pointerId, { ...point, clientX: event.clientX, clientY: event.clientY });
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
      });
      canvas.addEventListener("pointermove", event => {
        if (!pointers.has(event.pointerId)) return;
        const previous = pointers.get(event.pointerId), next = position(event);
        if (!moved && Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY) < 4) return;
        moved = true;
        const before = [...pointers.values()];
        pointers.set(event.pointerId, { ...next, clientX: event.clientX, clientY: event.clientY });
        const after = [...pointers.values()];
        if (before.length === 1) {
          transform(1, previous.x - next.x, previous.y - next.y);
        } else if (before.length === 2) {
          const distance = points => Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
          const center = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
          const oldCenter = center(before), newCenter = center(after);
          if (distance(after) > 0 && distance(before) > 0) transform(distance(before) / distance(after), oldCenter.x - newCenter.x, oldCenter.y - newCenter.y, newCenter);
        }
      });
      const release = event => {
        pointers.delete(event.pointerId);
        if (moved) gestureEnded = performance.now();
        if (!pointers.size) { moved = false; canvas.style.cursor = "grab"; }
      };
      canvas.addEventListener("pointerup", release);
      canvas.addEventListener("pointercancel", release);
      canvas.addEventListener("lostpointercapture", release);
      const reset = () => controls.querySelector("button").click();
      canvas.addEventListener("dblclick", reset);
      canvas.addEventListener("keydown", event => {
        if (!["+", "=", "-", "0"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "0") reset();
        else transform(event.key === "-" ? 1.25 : 0.8);
      });
    }
    function brandPanel(id) {
      $(id).innerHTML = `<div class="ceo-graph-view" id="${id}-chart"></div><div id="${id}-table"></div>`;
    }
    function brandChart(id, labels, datasets, { line = false, percent = false, horizontal = false, target = false, stacked = false, count = false } = {}) {
      chartInstances.get(id)?.destroy();
      chartInstances.delete(id);
      if (!labels.length) return unavailable(id, "no Alfred records match the selected filters.");
      $(id).innerHTML = `<div style="overflow:auto;max-width:100%" tabindex="0" role="region" aria-label="Scroll chart"><div style="position:relative;height:${horizontal ? Math.max(320, labels.length * 24 + 60) : 320}px;min-width:${horizontal ? 480 : Math.max(320, labels.length * (line ? 22 : 65))}px"><canvas tabindex="0" role="img" aria-label="${escape($(id).closest("article").querySelector("h2").textContent)}; exact values in Table View"></canvas></div></div>`;
      const numberAxis = horizontal ? "x" : "y";
      const chart = new Chart($(id).querySelector("canvas"), {
        type: line ? "line" : "bar",
        data: { labels, datasets: datasets.map((dataset, index) => {
          const color = dataset.backgroundColor || dataset.borderColor || [chartColors.current, chartColors.prior, chartColors.budget][index % 3];
          return {
            pointRadius: line ? 0 : 3, pointHoverRadius: 5, tension: 0.25, maxBarThickness: 28, ...dataset,
            borderColor: dataset.borderColor || color, backgroundColor: chartFill(color),
            borderWidth: line || dataset.type === "line" ? 2 : 1,
          };
        }) },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? "y" : "x",
          interaction: { mode: "index", intersect: false },
          scales: {
            [numberAxis]: { stacked, beginAtZero: true, suggestedMax: target ? 120 : undefined, ticks: { callback: (value) => percent ? `${value}%` : new Intl.NumberFormat("en", { notation: "compact" }).format(value) } },
            [horizontal ? "y" : "x"]: { stacked, grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, font: { size: 10 } } },
          },
          plugins: { legend: { display: datasets.length > 1, position: "top" }, tooltip: { callbacks: {
            label: (context) => `${context.dataset.label}: ${percent ? percentage(context.raw) : count ? context.raw.toLocaleString("en-GB") : money(context.raw)}`,
          } } },
        },
        plugins: target ? [{ id: "brand-budget-target", afterDraw: (chart) => {
          const axis = chart.scales[numberAxis], point = axis.getPixelForValue(100), area = chart.chartArea, ctx = chart.ctx;
          ctx.save(); ctx.strokeStyle = "#172338"; ctx.setLineDash([4, 3]); ctx.beginPath();
          ctx.moveTo(horizontal ? point : area.left, horizontal ? area.top : point);
          ctx.lineTo(horizontal ? point : area.right, horizontal ? area.bottom : point);
          ctx.stroke(); ctx.restore();
        } }] : [],
      });
      chartInstances.set(id, chart);
      chart.canvas.onkeydown = (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const index = ((chart.getActiveElements()[0]?.index ?? -1) + (event.key === "ArrowRight" ? 1 : -1) + labels.length) % labels.length;
        const active = chart.data.datasets.flatMap((dataset, datasetIndex) => dataset.data[index] === null ? [] : [{ datasetIndex, index }]);
        chart.setActiveElements(active);
        const point = chart.getDatasetMeta(0).data[index];
        chart.tooltip.setActiveElements(active, { x: point.x, y: point.y }); chart.update("none");
      };
    }
    function renderAlfredBrands() {
      const source = root.AlfaOctoberDaily;
      const base = alfredBranches();
      const branches = base.filter((branch) => brandFocus === "all" || branch.brand === brandFocus);
      const rows = [...new Set(branches.map((branch) => branch.brand))].map((name) => ({
        name, ...alfredMetrics(branches.filter((branch) => branch.brand === name), state.period),
      })).sort((a, b) => b.cy - a.cy);
      const amount = alfredMetrics(branches, state.period);
      const allRows = rows.length ? [...rows, { name: "ALFA total / selected scope", ...amount }] : [];
      $("report-brand-manager").innerHTML = `${alfredNotice()}<label class="field">ALFRED BRAND FOCUS<select id="report-brand-focus"><option value="all">All brands in selected scope</option>${[...new Set(source.branches.map((branch) => branch.brand))].sort().map((name) => `<option${brandFocus === name ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></label><p class="ceo-chart-note">Graphs follow Yesterday, MTD or YTD and this source scope. Actual source sales and budgets are unchanged; missing hourly profiles are labeled DUMMY. Focus narrows the global brand/region/store-basis selection. Hybrid = SH + Piatto physical sites counted once. Historical comparison tables keep their labeled dates; no live AI analysis.</p><div class="kpis" id="report-brand-manager-kpis"></div><p id="report-brand-manager-notes"></p>`;
      $("report-brand-focus").onchange = (event) => { brandFocus = event.target.value; renderAlfredBrands(); compactNotices(); navigate(state.page); };
      const active = branches.filter((branch) => branch[state.period].cy > 0);
      const ranked = active.filter((branch) => branch[state.period].py > 0).sort((a, b) => growth(b[state.period].cy, b[state.period].py) - growth(a[state.period].cy, a[state.period].py));
      kpis("report-brand-manager-kpis", [
        ["Sales", branches.length ? money(amount.cy) : "N/A", `${amount.trading} stores trading · ${percentage(amount.growth)} vs LY`],
        ["Budget attainment", percentage(amount.attainment), `Gap ${branches.length ? money(amount.cy - amount.budget) : "N/A"}`],
        ["Same-store growth", percentage(amount.sameGrowth), `${active.filter((branch) => branch.new).length} new stores trading`],
        ["Guests", percentage(amount.guestGrowth), state.period === "ytd" ? "Not available in Alfred's YTD sample" : `Spend/guest ${money(amount.spend)} (${percentage(amount.spendGrowth)}) · source estimates, not average check`],
        ["Week on week", percentage(amount.wow), `Last 7 days ${money(branches.reduce((n, branch) => n + branch.daily.cy.slice(-7).reduce((a, b) => a + b, 0), 0))} · October`],
        ["Delivery share", percentage(amount.deliveryShare), `LY ${share(branches.reduce((n, branch) => n + branch[state.period].vpy, 0), amount.ly)} · source delivery / revenue`],
        ["Below 90% of budget", String(active.filter((branch) => branch[state.period].bud > 0 && branch[state.period].cy / branch[state.period].bud < 0.9).length), `Of ${active.length} stores trading · ${active.filter((branch) => branch[state.period].bud > 0 && branch[state.period].cy / branch[state.period].bud < 0.9).slice(0, 2).map(branch => branch.name).join(", ")}`],
      ]);
      $("report-brand-manager-notes").textContent = ranked.length
        ? `Best store: ${ranked[0].name} (${percentage(growth(ranked[0][state.period].cy, ranked[0][state.period].py))}). Worst: ${ranked.at(-1).name} (${percentage(growth(ranked.at(-1)[state.period].cy, ranked.at(-1)[state.period].py))}).`
        : "No comparable trading stores in this selection.";
      const notes = [];
      if (amount.guestGrowth !== null && amount.spendGrowth !== null) notes.push(amount.guestGrowth < amount.spendGrowth
        ? `Guests are the problem (${percentage(amount.guestGrowth)}); spend per guest is ${percentage(amount.spendGrowth)}. Look at footfall drivers: mall traffic, marketing, waiting times.`
        : `Spend per guest is the weaker side (${percentage(amount.spendGrowth)}). Look at menu mix, upsell and discounts.`);
      const largestGap = active.filter(branch => branch[state.period].bud > 0).sort((a, b) => a[state.period].cy - a[state.period].bud - (b[state.period].cy - b[state.period].bud))[0];
      if (largestGap && amount.budget > amount.cy) notes.push(`${largestGap.name} accounts for ${money(largestGap[state.period].bud - largestGap[state.period].cy)} of the ${money(amount.budget - amount.cy)} net budget gap (${share(largestGap[state.period].bud - largestGap[state.period].cy, amount.budget - amount.cy)}). Positive stores offset deficits, so a share can exceed 100%.`);
      if (branches.length) notes.push(`Ramadan ${percentage(growth(...amount.holidays.ramadan))} vs last Ramadan; Eid al-Fitr ${percentage(growth(...amount.holidays.eidFitr))}.`);
      const sourceBrands = [...new Set(branches.map(branch => branch.brand))];
      const sellers = sourceBrands.length === 1 && ["Hybrid", "Steak House", "Piatto", "CFK"].includes(sourceBrands[0])
        ? source.menu.items.filter(item => item.brand === sourceBrands[0]).slice(0, 3) : [];
      if (sellers.length) notes.push(`Top sellers in the e-invoice sample: ${sellers.map(item => item.item).join(", ")}. See the Menu page.`);
      $("report-brand-manager-notes").insertAdjacentHTML("afterend", `<ul class="report-brand-readout">${notes.map(note=>`<li>${escape(note)}</li>`).join("")}</ul><div id="report-brand-actions"></div>`);
      const inspectStore = (branch) => {
        selectedStore = branch.name; storeFocus = "all"; storeQuery = ""; $("report-store-search").value = "";
        renderAlfredStores(); navigate("stores");
        $("report-source-store-detail").closest("article").scrollIntoView({ block: "start" });
      };
      const action = (label, callback) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "report-store-inspect";
        button.textContent = label; button.onclick = callback; $("report-brand-actions").append(button, " ");
      };
      if (ranked.length) {
        action(`Inspect best: ${ranked[0].name}`, () => inspectStore(ranked[0]));
        action(`Inspect worst: ${ranked.at(-1).name}`, () => inspectStore(ranked.at(-1)));
      }
      if (sellers.length) action("Explore Menu sample", () => { menuFocus = sourceBrands.length === 1 ? sourceBrands[0] : "all"; menuCategory = "all"; menuQuery = ""; $("report-menu-search").value = ""; renderMenu(); navigate("menu"); });
      $("report-brand-comparisons").innerHTML = '<div class="ceo-graph-view report-comparison-heat" id="report-brand-comparison-heat"></div><div id="report-brand-comparison-table"></div>';
      renderComparisonHeat("report-brand-comparison-heat", allRows);
      table("report-brand-comparison-table", ["Brand", "Stores", "Yesterday", "Yesterday vs last week", "Yesterday vs LY", "WoW", "MoM / day", "MTD vs LY", "YTD vs LY", "MTD vs budget", "MTD", "Budget MTD", "Same-store MTD"],
        allRows.map((row) => [row.name, branches.filter((branch) => (row.name.startsWith("ALFA total") || branch.brand === row.name) && branch.mtd.cy > 0).length, money(row.yesterday),
          ...["yesterdayVsWeek", "yesterdayVsLy", "wow", "mom", "mtdGrowth", "ytdGrowth", "mtdBudgetGrowth"].map((key) => percentage(row[key])),
          money(row.mtd), money(row.mtdBudget), percentage(alfredMetrics(branches.filter((branch) => row.name.startsWith("ALFA total") || branch.brand === row.name), "mtd").sameGrowth)]));
      ["report-alfred-brand-sales", "report-alfred-brand-budget", "report-brand-gap", "report-brand-contribution", "report-brand-new", "report-brand-month", "report-brand-holidays"].forEach(brandPanel);
      brandChart("report-brand-contribution-chart", rows.map((row) => row.name), [{
        label: "Sales change vs LY", data: rows.map((row) => row.cy - row.ly), backgroundColor: rows.map((row) => row.cy >= row.ly ? "#299bb0" : "#ed4654"),
      }], { horizontal: true });
      table("report-brand-contribution-table", ["Brand", "This year", "Last year", "Change SAR"], allRows.map((row) => [row.name, money(row.cy), money(row.ly), money(row.cy - row.ly)]));
      brandChart("report-alfred-brand-sales-chart", rows.map((row) => row.name), [{ label: "This year", data: rows.map((row) => row.cy) }, { label: "Last year", data: rows.map((row) => row.ly) }]);
      table("report-alfred-brand-sales-table", ["Brand", "Sales", "Last year", "Growth vs LY"], rows.map((row) => [row.name, money(row.cy), money(row.ly), percentage(row.growth)]));
      const budgetRows = rows.filter((row) => row.budget > 0);
      brandChart("report-alfred-brand-budget-chart", budgetRows.map((row) => row.name), [{ label: "Attainment", data: budgetRows.map((row) => row.attainment), backgroundColor: budgetRows.map((row) => root.AlfaSalesMap.budColor(row.cy / row.budget)) }], { percent: true, horizontal: true, target: true });
      table("report-alfred-brand-budget-table", ["Brand", "Sales", "Budget", "Budget attainment"], rows.map((row) => [row.name, money(row.cy), money(row.budget), percentage(row.attainment)]));
      const gaps = branches.filter((branch) => branch[state.period].bud > 0).sort((a, b) => (a[state.period].cy - a[state.period].bud) - (b[state.period].cy - b[state.period].bud));
      const gapValues = gaps.map((branch) => branch[state.period].cy - branch[state.period].bud);
      brandChart("report-brand-gap-chart", gaps.map((branch) => branch.name), [{ label: "Sales minus budget", data: gapValues, backgroundColor: gapValues.map((value) => value >= 0 ? "#299bb0" : "#ed4654") }], { horizontal: true });
      const gapChart = chartInstances.get("report-brand-gap-chart");
      if (gapChart) {
        gapChart.options.plugins.tooltip.callbacks.label = context => {
          const branch = gaps[context.dataIndex], amount = branch[state.period];
          return [`${gapValues[context.dataIndex] >= 0 ? "Ahead" : "Behind"} by ${money(Math.abs(gapValues[context.dataIndex]))}`, `Sales ${money(amount.cy)} of ${money(amount.bud)} (${share(amount.cy, amount.bud)})`, `${share(amount.bud, gaps.reduce((n, branch) => n + branch[state.period].bud, 0))} of scope budget`];
        };
        gapChart.options.onClick = (_, elements) => { if (elements.length) inspectStore(gaps[elements[0].index]); };
        gapChart.canvas.addEventListener("keydown", event => { if (event.key === "Enter" && gapChart.getActiveElements().length) inspectStore(gaps[gapChart.getActiveElements()[0].index]); });
        gapChart.update("none");
      }
      table("report-brand-gap-table", ["Store", "Brand", "Sales", "Budget", "Budget gap", "Share of scope budget"], gaps.map((branch, i) => [branch.name, branch.brand, money(branch[state.period].cy), money(branch[state.period].bud), money(gapValues[i]), share(branch[state.period].bud, amount.budget)]));
      const newStores = branches.filter((branch) => branch.new).sort((a, b) => b.opened.localeCompare(a.opened));
      brandChart("report-brand-new-chart", newStores.map((branch) => branch.name), [{ label: alfredPeriodLabel(state.period), data: newStores.map((branch) => branch[state.period].cy) }]);
      const selectedDays = root.AlfaPeriodData.days[state.period];
      table("report-brand-new-table", ["Store", "Brand", "Opened", "Months", "Selected sales", "Sales / day", "vs mature average", "Budget attainment"], newStores.map((branch) => {
        const mature = source.branches.filter((other) => other.brand === branch.brand && !other.new && other.sss && other[state.period].cy > 0);
        const average = mature.length ? mature.reduce((total, other) => total + other[state.period].cy, 0) / mature.length / selectedDays : null;
        return [branch.name, branch.brand, branch.opened, Math.round((new Date(source.asOf) - new Date(branch.opened)) / 2.63e9), money(branch[state.period].cy), money(branch[state.period].cy / selectedDays), average > 0 ? percentage(branch[state.period].cy / selectedDays / average * 100) : "N/A", share(branch[state.period].cy, branch[state.period].bud)];
      }));
      const newSales = newStores.reduce((n, branch) => n + branch[state.period].cy, 0);
      const existing = branches.filter(branch => !branch.new);
      $("report-brand-new").insertAdjacentHTML("beforeend", `<p class="ceo-chart-note">${newStores.length ? `New stores add ${money(newSales)} in ${alfredPeriodLabel(state.period)}, ${share(newSales, amount.cy)} of scope sales. Without them, the scope is ${percentage(growth(existing.reduce((n, branch) => n + branch[state.period].cy, 0), existing.reduce((n, branch) => n + branch[state.period].py, 0)))} vs LY. Ramp uses all-region source mature peers, not this filtered scope.` : "No new stores in this selection."}</p>`);
      const trend = root.AlfaPeriodData.trend(branches, state.period);
      brandChart("report-brand-month-chart", branches.length ? trend.labels : [], [
        { label: "This year", data: trend.cy }, { label: "Last year", data: trend.py },
        { label: "Budget", type: "line", data: trend.bud },
      ]);
      table("report-brand-month-table", ["Interval", "This year", "Last year", "Budget"], branches.length ? trend.labels.map((month, i) => [month, money(trend.cy[i]), money(trend.py[i]), money(trend.bud[i])]) : []);
      const holidayLabels = rows.map((row) => row.name);
      brandChart("report-brand-holidays-chart", holidayLabels, [
        { label: "2026", data: rows.map((row) => row.cy) },
        { label: "2025", data: rows.map((row) => row.ly) },
      ]);
      table("report-brand-holidays-table", ["Brand", "Selected 2026", "Selected 2025", "vs LY"], allRows.map((row) => [row.name, money(row.cy), money(row.ly), percentage(row.growth)]));
      renderBrandDaily("report-alfred-brand-daily", rows);
      renderBrandMaps(branches);
    }
    function renderBrandDaily(hostId, rows) {
      const prefix = `${hostId}-series-`;
      for (const [id, chart] of chartInstances) if (id.startsWith(prefix)) { chart.destroy(); chartInstances.delete(id); }
      $(hostId).innerHTML = `<div class="ceo-grid" id="${hostId}-grid"></div>`;
      if (!rows.length) $(`${hostId}-grid`).innerHTML = '<div class="empty">No Alfred brands match the selected filters.</div>';
      rows.forEach((row, i) => {
        const id = `${prefix}${i}`;
        const branches = alfredBranches().filter((branch) => branch.brand === row.name && (hostId !== "report-alfred-brand-daily" || brandFocus === "all" || branch.brand === brandFocus));
        const trend = hostId === "report-overview-brand-daily"
          ? { labels: root.AlfaOctoberDaily.days, cy: row.daily.cy, py: row.daily.py, note: "Fixed October source sample" }
          : root.AlfaPeriodData.trend(branches, state.period);
        $(`${hostId}-grid`).insertAdjacentHTML("beforeend", card(`${row.name} · ${trend.note}`, id));
        brandPanel(id);
        brandChart(`${id}-chart`, trend.labels, [{ label: "This year", data: trend.cy }, { label: "Last year", data: trend.py, borderDash: [4, 3] }], { line: true });
        table(`${id}-table`, ["Interval", "This year", "Last year"], trend.labels.map((day, index) => [day, money(trend.cy[index]), money(trend.py[index])]));
      });
    }
    function renderComparisonHeat(id, rows, total = true) {
      rows = rows.map((row) => {
        const values = row.branch ? alfredStoreMetrics(row.branch, state.period) : row;
        return { ...row, ...values, budgetGap: values.attainment === null ? null : values.attainment - 100 };
      });
      const fixed = id === "report-brief-heat";
      const keys = fixed ? ["yesterdayVsWeek", "yesterdayVsLy", "wow", "mom", "mtdGrowth", "ytdGrowth", "mtdBudgetGrowth"]
        : ["growth", "budgetGap", "sameGrowth", "deliveryShare", "guestGrowth", "spendGrowth", "attainment"];
      const labels = fixed ? ["Yesterday vs week", "Yesterday vs LY", "WoW", "MoM / day", "MTD vs LY", "YTD vs LY", "MTD vs budget"]
        : ["Selected vs LY", "Selected vs budget", "Same-store vs LY", "Delivery share", "Guest growth (est.)", "Spend growth", "Budget attained"];
      $(id).innerHTML = rows.length
        ? `<div class="report-heat-grid" role="group" aria-label="Comparison heatmap; exact figures also in Table View."><div class="report-heat-row report-heat-header" aria-hidden="true"><strong>${total ? "Brand" : "Store"}</strong>${labels.map(label => `<strong>${label}</strong>`).join("")}</div>${rows.map((row, index) => `<div class="report-heat-row${total && index === rows.length - 1 ? " report-heat-total" : ""}"><strong>${escape(row.name)}</strong>${keys.map((key, i) => `<div class="report-heat-cell ${row[key] === null ? "" : row[key] >= 0 ? "report-heat-up" : "report-heat-down"}" aria-label="${escape(row.name)} · ${labels[i]}: ${percentage(row[key])}"><b>${percentage(row[key])}</b></div>`).join("")}</div>`).join("")}</div>`
        : '<div class="empty">No source comparisons in scope.</div>';
    }
    function renderBriefExtras() {
      const branches = alfredBranches(), metrics = alfredBriefMetrics(branches, state.period);
      const brandRows = [...new Set(branches.map((branch) => branch.brand))].map((name) => ({
        name, ...alfredMetrics(branches.filter((branch) => branch.brand === name), state.period),
      }));
      const worstBudget = brandRows.filter((row) => row.budget > 0).sort((a, b) => a.cy - a.budget - (b.cy - b.budget))[0];
      $("report-brief-story").innerHTML = branches.length
        ? `<p>Alfred source sales are <strong>${money(metrics.cy)}</strong>, ${percentage(metrics.growth)} vs LY and ${percentage(metrics.attainment)} of budget. Same-store growth is ${percentage(metrics.sameGrowth)}.${worstBudget ? ` Largest budget gap: <strong>${escape(worstBudget.name)}</strong> (${money(worstBudget.cy - worstBudget.budget)}).` : ""}</p><p>Dine-in source change ${percentage(metrics.dineGrowth)}; delivery ${percentage(metrics.deliveryGrowth)}. ${metrics.newCount} new stores contribute ${money(metrics.newSales)}. ${metrics.ranked.filter((row) => row.growth < -25).length} material comparable stores are down more than 25%.</p><div class="kpis" id="report-brief-source-kpis"></div>`
        : '<div class="empty">No Alfred branches match the selected filters.</div>';
      if (branches.length) kpis("report-brief-source-kpis", [
        ["Same-store guests", state.period === "ytd" ? "N/A" : metrics.guests.toLocaleString("en-GB"), state.period === "ytd" ? "YTD guests are not provided by Alfred" : `Alfred estimates · ${percentage(metrics.guestGrowth)} vs LY`],
        ["Spend / guest", money(metrics.spend), state.period === "ytd" ? "YTD guests are not provided by Alfred" : `Alfred estimates · ${percentage(metrics.spendGrowth)} vs LY`],
        ["Sales / store / day", money(metrics.salesPerStoreDay), `${metrics.trading} source stores trading · selected period`],
        ["New stores", String(metrics.newCount), `${money(metrics.newSales)} source sales · selected period`],
      ]);
      ["report-brief-bridge", "report-brief-ranking", "report-brief-holidays", "report-brief-weekdays"].forEach(brandPanel);
      const bridge = branches.length ? metrics.bridge : [];
      brandChart("report-brief-bridge-chart", bridge.map((step) => step.label), [{
        label: "Sales bridge", data: bridge.map((step) => step.range),
        backgroundColor: bridge.map((step) => step.total ? chartColors.current : step.value >= 0 ? "#299bb0" : "#ed4654"),
        borderSkipped: false,
      }]);
      const bridgeChart = chartInstances.get("report-brief-bridge-chart");
      if (bridgeChart) {
        bridgeChart.options.plugins.tooltip.callbacks.label = (context) => `${bridge[context.dataIndex].label}: ${money(bridge[context.dataIndex].value)}`;
        bridgeChart.update("none");
      }
      if (bridge.length) {
        const effects = bridge.slice(1, -1).map((step) => `${escape(step.label)} ${step.value >= 0 ? "added" : "took away"} <strong>${money(Math.abs(step.value))}</strong>.`).join(" ");
        $("report-brief-bridge-chart").insertAdjacentHTML("beforeend", `<p class="report-bridge-readout"><strong>In plain words.</strong> Start with last year's <strong>${money(metrics.ly)}</strong>. ${effects} That leaves this year's <strong>${money(metrics.cy)}</strong>. Guests and spend use Alfred's source estimates.</p>`);
      }
      table("report-brief-bridge-table", ["Metric", "Sales / change", "Running total"], bridge.map((step) => [step.label, money(step.value), money(step.range[1])]));
      const comparisons = ["yesterdayVsWeek", "yesterdayVsLy", "wow", "mom", "mtdGrowth", "ytdGrowth", "mtdBudgetGrowth"];
      const comparisonLabels = ["Yesterday vs week", "Yesterday vs LY", "WoW", "MoM / day", "MTD vs LY", "YTD vs LY", "MTD vs budget"];
      const scopeRows = branches.length ? [...brandRows, { name: "ALFA selected scope", ...metrics }] : [];
      $("report-brief-comparisons").innerHTML = '<div class="ceo-graph-view report-comparison-heat" id="report-brief-heat"></div><div id="report-brief-comparison-table"></div>';
      renderComparisonHeat("report-brief-heat", scopeRows);
      table("report-brief-comparison-table", ["Brand", ...comparisonLabels], scopeRows.map((row) => [row.name, ...comparisons.map((key) => percentage(row[key]))]));
      const alerts = [];
      if (metrics.attainment !== null && metrics.attainment < 90) alerts.push(["Behind budget", `${percentage(metrics.attainment)} attained; gap ${money(metrics.cy - metrics.budget)}.`]);
      if (metrics.guestGrowth !== null && metrics.guestGrowth < -10) alerts.push(["Guest decline", `${percentage(metrics.guestGrowth)} same-store source guest growth.`]);
      if (metrics.wow !== null && metrics.wow < -5) alerts.push(["Weekly decline", `${percentage(metrics.wow)} vs preceding seven days.`]);
      if (metrics.deliveryGrowth > 5) alerts.push(["Delivery growing", `${percentage(metrics.deliveryGrowth)} vs LY. Review channel costs and Sufra conversion.`]);
      const bad = metrics.ranked.filter((row) => row.growth < -25);
      if (bad.length) alerts.push(["Material store declines", `${bad.length} comparable stores are down more than 25%; inspect the full ranking.`]);
      if (metrics.zeroYesterday) alerts.push(["No sales yesterday", `${metrics.zeroYesterday} source stores traded LY but reported zero yesterday. Confirm trading status before treating as a POS outage.`]);
      $("report-brief-alerts").innerHTML = branches.length
        ? alerts.length ? alerts.map(([title, text]) => `<div class="report-alert"><strong>${title}</strong><p>${text}</p></div>`).join("") : '<p>No alerts meet Alfred thresholds in this scope.</p>'
        : '<div class="empty">No Alfred branches in scope.</div>';
      brandChart("report-brief-ranking-chart", metrics.ranked.map((row) => row.branch.name), [{
        label: "Growth vs LY", data: metrics.ranked.map((row) => row.growth), backgroundColor: metrics.ranked.map((row) => row.growth >= 0 ? "#299bb0" : "#ed4654"),
      }], { horizontal: true, percent: true });
      const rankingChart = chartInstances.get("report-brief-ranking-chart");
      const inspect = (name) => { selectedStore = name; storeFocus = "all"; storeQuery = ""; $("report-store-search").value = ""; renderAlfredStores(); navigate("stores"); $("report-source-store-detail").closest("article").scrollIntoView({ block: "start" }); };
      if (rankingChart) {
        rankingChart.options.onClick = (_, elements) => { if (elements.length) inspect(metrics.ranked[elements[0].index].branch.name); };
        rankingChart.canvas.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && rankingChart.getActiveElements().length) inspect(metrics.ranked[rankingChart.getActiveElements()[0].index].branch.name);
        });
      }
      $("report-brief-ranking-chart").insertAdjacentHTML("beforeend", `<label class="field">INSPECT RANKED STORE<select id="report-brief-rank-picker"><option value="">Select a store</option>${metrics.ranked.map((row) => `<option>${escape(row.branch.name)}</option>`).join("")}</select></label><p class="ceo-chart-note">Alfred materiality: LY sales above ${money(metrics.threshold)}. ${metrics.ranked.filter((row) => row.growth >= 0).length} growing; ${metrics.ranked.filter((row) => row.growth < 0).length} declining. Click a bar, press Enter after arrow-key inspection, or select a store.</p>`);
      $("report-brief-rank-picker").onchange = (event) => { if (event.target.value) inspect(event.target.value); };
      table("report-brief-ranking-table", ["Store", "Brand", "City", "Sales", "Last year", "Growth vs LY"], metrics.ranked.map(({ branch, growth }) => [branch.name, branch.brand, branch.city, money(branch[state.period].cy), money(branch[state.period].py), percentage(growth)]));
      $("report-brief-ranking-table").querySelectorAll("tbody tr").forEach((tr, i) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "report-store-inspect"; button.textContent = "Inspect";
        button.setAttribute("aria-label", `Inspect ${metrics.ranked[i].branch.name}`); button.onclick = () => inspect(metrics.ranked[i].branch.name); tr.children[0].append(" ", button);
      });
      const holidays = branches.length ? [["Ramadan", ...metrics.holidays.ramadan], ["Eid al-Fitr", ...metrics.holidays.eidFitr]] : [];
      brandChart("report-brief-holidays-chart", holidays.map((row) => row[0]), [{ label: "2026", data: holidays.map((row) => row[1]) }, { label: "2025", data: holidays.map((row) => row[2]) }]);
      table("report-brief-holidays-table", ["Holiday", "2026", "2025", "Change", "Basis"], holidays.map(([name, cy, ly]) => [name, money(cy), money(ly), percentage(growth(cy, ly)), name.includes("mock") ? "Mock: 90% of source Eid al-Fitr" : "Alfred event totals"]));
      brandChart("report-brief-weekdays-chart", branches.length ? metrics.weekdays.map((row) => row.name) : [], [{ label: "This year", data: metrics.weekdays.map((row) => row.cy) }, { label: "Last year", data: metrics.weekdays.map((row) => row.ly) }]);
      table("report-brief-weekdays-table", ["Weekday", "This year / day", "Last year / day", "Change"], branches.length ? metrics.weekdays.map((row) => [row.name, money(row.cy), money(row.ly), percentage(row.growth)]) : []);
    }
    function renderBrandMaps(branches) {
      brandMapObserver.disconnect();
      const guestPeriod = state.period;
      const points = branches.map((branch) => ({
        name: branch.name, brand: branch.brand, city: branch.city, lat: branch.lat, lng: branch.lng, n: 1,
        cy: branch[state.period].cy, py: branch[state.period].py, bud: branch[state.period].bud,
        g: guestPeriod === "ytd" ? null : branch.guests[guestPeriod][0], chk: guestPeriod === "ytd" ? null : branch.checks[guestPeriod][0],
      }));
      const cities = [...new Set(points.map((point) => point.city))].map((city) => {
        const peers = points.filter((point) => point.city === city);
        return { name: city, n: peers.length, lat: sum(peers, "lat") / peers.length, lng: sum(peers, "lng") / peers.length,
          cy: sum(peers, "cy"), py: sum(peers, "py"), bud: sum(peers, "bud"),
          g: guestPeriod === "ytd" ? null : sum(peers, "g"), chk: guestPeriod === "ytd" ? null : sum(peers, "chk") };
      }).sort((a, b) => b.cy - a.cy);
      const draws = [];
      for (const kind of ["stores", "cities"]) {
        const id = kind === "stores" ? "report-brand-store-map" : "report-brand-city-map";
        const mapState = brandMapState[kind], entries = root.AlfaSalesMap.pointsInView(kind === "stores" ? points : cities, mapState.view);
        if (guestPeriod === "ytd" && ["guests", "checks"].includes(mapState.metric)) mapState.metric = "revenue";
        $(id).innerHTML = `<div class="ceo-graph-view"><div class="report-map-controls"><div class="segment" role="group" aria-label="${kind} map metric">${[["revenue", "Revenue"], ["checks", "Checks"], ["guests", "Guests"], ["budget", "Budget attainment"]].map(([value, label]) => `<button type="button" data-brand-map-metric="${value}" aria-pressed="${value === mapState.metric}">${label}</button>`).join("")}</div>${kind === "stores" ? `<div class="segment" role="group" aria-label="Brand map area">${[["ksa", "Saudi"], ["riyadh", "Riyadh"], ["jeddah", "Jeddah"], ["eastern", "Eastern"]].map(([value, label]) => `<button type="button" data-brand-map-view="${value}" aria-pressed="${value === mapState.view}">${label}</button>`).join("")}</div>` : ""}</div><p class="ceo-chart-note">Alfred mall/district coordinates. Guests/checks are source estimates; YTD uses MTD counts. City coordinates are the average of their branch positions.</p><div class="report-sales-map" id="${id}-canvas"></div><div class="report-map-legend" id="${id}-legend"></div><label class="field">Inspect ${kind === "stores" ? "branch" : "city"}<select id="${id}-inspect"><option value="">Select ${kind === "stores" ? "a branch" : "a city"}</option>${entries.map((point, index) => `<option value="${index}">${escape(point.name)}</option>`).join("")}</select></label><p id="${id}-detail" role="status">${entries.length} ${kind} in scope.</p></div><div id="${id}-table"></div>`;
        table(`${id}-table`, [kind === "stores" ? "Store" : "City", "Stores", "Sales", "Last year", "Budget attainment", `Estimated ${guestPeriod.toUpperCase()} guests`, `Estimated ${guestPeriod.toUpperCase()} checks`],
          entries.map((point) => [point.name, point.n, money(point.cy), money(point.py), share(point.cy, point.bud), count(point.g), count(point.chk)]));
        $(id).querySelector(".ceo-chart-note").textContent = "Alfred mall/district coordinates; city positions average their branches. Guests/checks are source estimates for the selected period; YTD counts are unavailable.";
        $(id).querySelectorAll('[data-brand-map-metric="guests"],[data-brand-map-metric="checks"]').forEach(button => {
          button.disabled = guestPeriod === "ytd";
          button.title = button.disabled ? "YTD traffic is not provided by Alfred" : "";
        });
        const describe = (point) => `${escape(point.name)} · ${point.n} ${point.n === 1 ? "store" : "stores"}<br>Sales ${money(point.cy)} · ${percentage(growth(point.cy, point.py))} vs LY<br>Budget ${share(point.cy, point.bud)} · estimated ${guestPeriod.toUpperCase()} guests ${count(point.g)} · checks ${count(point.chk)}`;
        $(`${id}-canvas`).insertAdjacentHTML("beforebegin", `<p class="ceo-chart-note" role="status">${escape(mapProvider === "offline" ? "Offline source map selected." : googleMapError || (googleMaps ? "Google heatmap · heat intensity is relative to this scope. Small pins open exact details." : "Google Maps is loading or requires maps-config.js setup. Use the Sales map provider control to select offline maps."))} ${root.AlfaMapsConfig?.mapId ? "Configured cloud map style." : "Monochrome cloud style pending: set mapId in maps-config.js after publishing the style."}</p>`);
        const draw = () => {
          const host = $(`${id}-canvas`);
          if (!host.checkVisibility()) return;
          if (!entries.length) { host.innerHTML = '<div class="empty">No Alfred records match the selected filters.</div>'; $(`${id}-legend`).textContent = ""; return; }
          if (mapProvider === "google") {
            if (!googleMaps) {
              const configuredKey = typeof root.AlfaMapsConfig?.apiKey === "string" && root.AlfaMapsConfig.apiKey.trim();
              host.innerHTML = `<div class="empty" role="${googleMapError || !configuredKey ? "alert" : "status"}">${escape(googleMapError || (configuredKey ? "Loading Google Maps…" : "Google Maps configuration unavailable. Set apiKey in maps-config.js beside index.html, then reload."))}</div>`;
              $(`${id}-legend`).textContent = "";
              return;
            }
            let controller = googleBrandMaps.get(kind);
            if (!controller) {
              const element = document.createElement("div");
              element.className = "report-google-map";
              host.replaceChildren(element);
              controller = root.AlfaSalesMap.createGoogleMap(element, googleMaps);
              googleBrandMaps.set(kind, controller);
            }
            if (controller.element.parentElement !== host) host.replaceChildren(controller.element);
            if (!host.dataset.googleRendered) {
              controller.update(entries, {
                view: mapState.view, metric: mapState.metric, describe,
                onInspect: (point) => {
                  $(`${id}-inspect`).value = String(entries.indexOf(point));
                  $(`${id}-detail`).innerHTML = describe(point);
                },
              });
              host.dataset.googleRendered = "true";
            }
            controller.resize();
            root.AlfaSalesMap.legend(`${id}-legend`, mapState.metric === "budget" ? "budget" : "heat");
            return;
          }
          const additive = mapState.metric !== "budget";
          root.AlfaSalesMap.drawMap(host.id, entries.map((point) => ({ ...point, v: Math.max(0, mapState.metric === "guests" ? point.g : mapState.metric === "checks" ? point.chk : point.cy) })), {
            view: mapState.view, additive, dot: kind === "cities" || !additive, city: kind === "cities", tip: describe,
            color: (point) => mapState.metric === "budget" ? root.AlfaSalesMap.budColor(point.bud > 0 ? point.cy / point.bud : null) : root.AlfaSalesMap.growthColor(point.py > 0 ? point.cy / point.py - 1 : null),
          });
          const canvas = host.querySelector("canvas");
          canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", `${kind} map: ${mapState.metric}. Inspect using the selector below or Table View.`);
          root.AlfaSalesMap.legend(`${id}-legend`, additive && kind === "stores" ? "heat" : mapState.metric === "budget" ? "budget" : "growth");
        };
        draws.push(draw);
        $(id).querySelectorAll("[data-brand-map-metric],[data-brand-map-view]").forEach((button) => {
          button.onclick = () => {
            if (button.dataset.brandMapMetric) mapState.metric = button.dataset.brandMapMetric;
            else mapState.view = button.dataset.brandMapView;
            renderBrandMaps(branches);
          };
        });
        $(`${id}-inspect`).onchange = (event) => {
          $(`${id}-detail`).innerHTML = event.target.value === "" ? `${entries.length} ${kind} in scope.` : describe(entries[Number(event.target.value)]);
          if (event.target.value !== "" && mapProvider === "google" && googleMaps) googleBrandMaps.get(kind)?.inspect(entries[Number(event.target.value)]);
        };
        brandMapObserver.observe($(`${id}-canvas`));
      }
      drawBrandMaps = () => draws.forEach((draw) => draw());
      drawBrandMaps();
    }
    function alfredBranches() {
      return root.AlfaOctoberDaily.branches.filter((branch) =>
        (state.region === "all" || branch.region === state.region) &&
        (state.brand === "all" || branch.brand === state.brand) &&
        (state.basis === "all" || branch.sss && !branch.new));
    }
    function renderOctoberDaily() {
      const source = root.AlfaOctoberDaily;
      if (!source || source.days.length !== 27 || source.branches.some((branch) =>
        !Number.isFinite(branch.budget) || !branch.daily ||
        ["cy", "py"].some((key) => branch.daily[key].length !== 27 || branch.daily[key].some((value) => !Number.isFinite(value))))) {
        throw new Error("October daily sales source is missing or invalid.");
      }
      chartInstances.get("report-october-daily")?.destroy();
      chartInstances.delete("report-october-daily");
      const branches = alfredBranches();
      const cy = source.days.map((_, i) => branches.reduce((total, branch) => total + branch.daily.cy[i], 0));
      const ly = source.days.map((_, i) => branches.reduce((total, branch) => total + branch.daily.py[i], 0));
      const average = cy.map((_, i) => i < 6 ? null : cy.slice(i - 6, i + 1).reduce((total, value) => total + value, 0) / 7);
      const budget = sum(branches, "budget") / source.days.length;
      $("report-october-daily").innerHTML = `<p class="ceo-chart-note">1–27 October 2026 · CY, same-weekday LY, 7-day average and flat MTD budget per day. Always October MTD; brand, region and same-store filters apply.</p><div class="notice"><strong>Daily source: Alfred October report.</strong> ${branches.length} of ${source.branches.length} source branches selected. This source has different coverage and LY/budget definitions from the validated revenue reports below. Its Hybrid and Asian Dining groups cannot be allocated to individual brands; unmatched brand selections show N/A. Its lines are copied without rescaling and do not feed the financial KPIs.</div><div class="ceo-graph-view" id="report-october-daily-chart"></div><div id="report-october-daily-table"></div>`;
      table("report-october-daily-table", ["October day", "This year", "Last year", "7-day average", "Budget per day"],
        branches.length ? source.days.map((day, i) => [day, money(cy[i]), money(ly[i]), money(average[i]), money(budget)]) : []);
      if (!branches.length) {
        unavailable("report-october-daily-chart", "no Alfred daily-sales branches match the selected filters.");
        return;
      }
      $("report-october-daily-chart").innerHTML = '<div style="max-width:100%;overflow:auto" tabindex="0" role="region" aria-label="Scroll October daily sales chart"><div style="position:relative;height:360px;min-width:600px"><canvas tabindex="0" role="img" aria-label="October daily sales: this year, last year, seven-day average and daily budget. Exact figures in Table View."></canvas></div></div>';
      const chart = new Chart($("report-october-daily-chart").querySelector("canvas"), {
        type: "line",
        data: {
          labels: source.days,
          datasets: [
            { label: "This year", data: cy, borderColor: chartColors.current, tension: 0.25 },
            { label: "Last year", data: ly, borderColor: chartColors.prior, borderDash: [4, 3], tension: 0.25 },
            { label: "7-day average", data: average, borderColor: chartColors.budget, tension: 0.3 },
            { label: "Budget per day (flat)", data: source.days.map(() => budget), borderColor: "#52514e", borderDash: [2, 4], borderWidth: 1 },
          ].map((dataset) => ({ borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, backgroundColor: chartFill(dataset.borderColor), ...dataset })),
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
            y: { beginAtZero: true, title: { display: true, text: "Sales (SAR)" }, ticks: { callback: (value) => new Intl.NumberFormat("en", { notation: "compact" }).format(value) } },
          },
          plugins: { legend: { position: "top" }, tooltip: { callbacks: {
            label: (context) => `${context.dataset.label}: ${money(context.raw)}`,
            afterBody: (items) => items.length > 1 ? `vs LY ${percentage(growth(cy[items[0].dataIndex], ly[items[0].dataIndex]))}` : "",
          } } },
        },
      });
      chartInstances.set("report-october-daily", chart);
      chart.canvas.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const index = ((chart.getActiveElements()[0]?.index ?? -1) + (event.key === "ArrowRight" ? 1 : -1) + source.days.length) % source.days.length;
        const active = chart.data.datasets.flatMap((dataset, datasetIndex) => dataset.data[index] === null ? [] : [{ datasetIndex, index }]);
        chart.setActiveElements(active);
        const point = chart.getDatasetMeta(0).data[index];
        chart.tooltip.setActiveElements(active, { x: point.x, y: point.y });
        chart.update("none");
      });
    }
    function renderStoreTraffic(rs) {
      chartInstances.get("report-store-traffic-chart")?.destroy();
      chartInstances.delete("report-store-traffic-chart");
      const period = state.period;
      const eligible = rs.map((branch) => {
        if (period !== "ytd") return { branch, ...alfredStoreMetrics(branch, period) };
        const guests = root.AlfaPeriodData.traffic(branch, period).guests;
        const guestGrowth = guests[1] > 0 ? (guests[0] / guests[1] - 1) * 100 : null;
        const spend = guests[0] > 0 ? branch.ytd.cy / guests[0] : null;
        const spendLy = guests[1] > 0 ? branch.ytd.py / guests[1] : null;
        return { branch, ...alfredStoreMetrics(branch, period), guestGrowth, spend,
          spendGrowth: spendLy > 0 ? (spend / spendLy - 1) * 100 : null,
          trafficEligible: branch.sss && !branch.new && guests[0] > 0 && guests[1] > 0 };
      }).filter((row) => row.trafficEligible);
      const visible = eligible.filter((row) => Math.abs(row.guestGrowth) < 90 && Math.abs(row.spendGrowth) < 90);
      $("report-store-traffic").innerHTML = `<div class="ceo-graph-view"><p class="ceo-chart-note">${escape(period.toUpperCase())} ${period === "ytd" ? "DUMMY traffic: YTD revenue / October spend-per-guest assumption" : "source estimated traffic"}: right = more guests; up = higher spend/guest. ${eligible.length - visible.length} eligible outliers at ±90% or beyond are excluded from the graph, matching Alfred; all eligible stores remain in Table View.</p><div style="overflow:auto;max-width:100%" tabindex="0" role="region" aria-label="Scroll source store traffic chart"><div style="position:relative;height:360px;min-width:420px"><canvas id="report-store-traffic-chart" tabindex="0" role="img" aria-label="Guest growth versus spend per guest growth"></canvas></div></div><p id="report-store-traffic-chart-detail" role="status">Hover a bubble or use arrow keys to inspect figures. Click a bubble or press Enter to open its store detail.</p></div><div id="report-store-traffic-chart-table"></div>`;
      table("report-store-traffic-chart-table", ["Store", "Brand", "Guest growth", "Spend / guest growth", "Sales", "Growth vs LY"], eligible.map((row) => [row.branch.name, row.branch.brand, percentage(row.guestGrowth), percentage(row.spendGrowth), money(row.cy), percentage(row.growth)]));
      if (!visible.length) {
        $("report-store-traffic-chart").parentElement.innerHTML = '<div class="empty">No source stores qualify for the traffic graph.</div>';
        return;
      }
      const sourceBrands = [...new Set(root.AlfaOctoberDaily.branches.map((branch) => branch.brand))];
      const colors = [chartColors.current, chartColors.prior, chartColors.budget, "#5ecbd0", "#ffb576", "#ed4654", "#83a7b5"];
      const points = visible.map((row) => ({
        x: row.guestGrowth, y: row.spendGrowth,
        r: Math.max(3, Math.sqrt(Math.max(0, row.cy)) / (period === "dtd" ? 8 : 45)),
      }));
      const describe = (index) => {
        const row = visible[index];
        return `${row.branch.name} (${row.branch.brand}) · Guests ${percentage(row.guestGrowth)} · Spend ${percentage(row.spendGrowth)} · Sales ${money(row.cy)} (${percentage(row.growth)} vs LY)`;
      };
      const canvas = $("report-store-traffic-chart");
      const inspectTraffic = (index) => {
        selectedStore = visible[index].branch.name;
        $("report-source-store-picker").value = selectedStore;
        renderSourceStoreDetail(rs); compactNotices();
        $("report-source-store-detail").closest("article").scrollIntoView({ block: "start" });
      };
      const chart = new Chart(canvas, {
        type: "bubble",
        data: { datasets: [{ data: points, backgroundColor: visible.map((row) => chartFill(colors[sourceBrands.indexOf(row.branch.brand)])), borderColor: visible.map((row) => colors[sourceBrands.indexOf(row.branch.brand)]), borderWidth: 1 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          scales: {
            x: { title: { display: true, text: "Guest growth vs LY" }, suggestedMin: -5, suggestedMax: 5, ticks: { callback: (value) => `${value}%` } },
            y: { title: { display: true, text: "Spend per guest vs LY" }, suggestedMin: -5, suggestedMax: 5, ticks: { callback: (value) => `${value}%` } },
          },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => describe(context.dataIndex) } } },
          onClick: (_, elements) => { if (elements.length) inspectTraffic(elements[0].index); },
        },
        plugins: [{ id: "source-traffic-quadrants", beforeDatasetsDraw: (chart) => {
          const { ctx, scales: { x, y } } = chart;
          ctx.save(); ctx.strokeStyle = "#718096"; ctx.beginPath();
          ctx.moveTo(x.getPixelForValue(0), y.top); ctx.lineTo(x.getPixelForValue(0), y.bottom);
          ctx.moveTo(x.left, y.getPixelForValue(0)); ctx.lineTo(x.right, y.getPixelForValue(0));
          ctx.stroke(); ctx.fillStyle = "#718096"; ctx.font = "10px system-ui";
          ctx.fillText("Fewer guests, higher spend", x.left + 5, y.top + 12);
          ctx.fillText("Growing", x.right - 45, y.top + 12);
          ctx.fillText("Declining", x.left + 5, y.bottom - 5);
          ctx.fillText("More guests, lower spend", x.right - 125, y.bottom - 5); ctx.restore();
        } }],
      });
      chartInstances.set("report-store-traffic-chart", chart);
      enableChartZoom(chart);
      let activeIndex = -1;
      canvas.onkeydown = (event) => {
        if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); inspectTraffic(activeIndex); return; }
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        activeIndex = (activeIndex + (event.key === "ArrowRight" ? 1 : -1) + points.length) % points.length;
        const active = [{ datasetIndex: 0, index: activeIndex }], point = chart.getDatasetMeta(0).data[activeIndex];
        chart.setActiveElements(active); chart.tooltip.setActiveElements(active, { x: point.x, y: point.y }); chart.update("none");
        $("report-store-traffic-chart-detail").textContent = describe(activeIndex);
      };
    }
    function renderSeatHour(rs) {
      const entries = rs.map((row) => ({ name: row.name, ...illustrativeSeatHour(row, state.period) }))
        .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));
      const seatHours = sum(entries, "seatHours");
      $("report-store-seat-hour").innerHTML = `<div class="notice"><strong>ILLUSTRATIVE ASSUMPTIONS — not actual RevPASH.</strong> Sales per available seat-hour = assumed dine-in sales ÷ (seats × trading hours). Each reporting unit assumes 60 seats, 12 hours/day and 80% of positive reported dine-in &amp; takeaway sales as dine-in. Negative sales adjustments are excluded. DTD uses 1 day, MTD 27 days and YTD 300 days through 27 Oct 2026. LY uses the same assumed capacity/days, not verified historical hours. Closures, opening dates and hybrid shared seating are not modeled. Period, filters and store search apply; reported KPIs are unchanged.</div><div class="kpis" id="report-seat-hour-kpis"></div><div class="ceo-graph-view"><h3>Top 10 reporting units · illustrative SAR per seat-hour</h3><div id="report-seat-hour-chart"></div></div><div id="report-seat-hour-table"></div>`;
      kpis("report-seat-hour-kpis", [
        ["Illustrative sales / seat-hour", seatHours > 0 ? `${money(sum(entries, "dineIn") / seatHours)} / seat-hour` : "N/A", "Capacity-weighted selected scope"],
        ["Assumed dine-in sales", entries.length ? money(sum(entries, "dineIn")) : "N/A", "80% of positive non-delivery sales"],
        ["Assumed seat-hours", seatHours.toLocaleString("en-GB"), "60 seats × 12 hours/day × period days per unit"],
      ]);
      bars("report-seat-hour-chart", entries.slice(0, 10).map((row) => ({ label: row.name, current: row.current, prior: row.prior })), false, false, "SAR / seat-hour");
      table("report-seat-hour-table", ["Reporting unit", "Illustrative seats", "Hours/day", "Days", "Seat-hours", "Assumed CY dine-in", "Illustrative CY SAR/seat-hour", "Illustrative LY SAR/seat-hour"],
        entries.map((row) => [row.name, row.seats, row.hoursPerDay, row.days, row.seatHours.toLocaleString("en-GB"), money(row.dineIn), money(row.current), money(row.prior)]));
    }
    function renderAdjustments(rs) {
      chartInstances.get("report-adjustment-chart")?.destroy();
      chartInstances.delete("report-adjustment-chart");
      const entries = rs.map((row) => ({ name: row.name, ...illustrativeAdjustments(row) }));
      const gross = sum(entries, "gross");
      const metrics = [
        { key: "discount", label: "Discount %", color: "#299bb0" },
        { key: "voids", label: "Voids %", color: "#ed4654" },
        { key: "comps", label: "Check Comps %", color: "#ff9228" },
      ];
      $("report-store-adjustments").innerHTML = `<div class="notice"><strong>ILLUSTRATIVE DATA — not actual POS adjustments.</strong> Each percentage is its assumed monetary amount ÷ assumed gross sales before discounts/comps. Check Comps means complimentary-check value, not the percentage of checks. Stable sample rates: discounts 2–6%, comps 0.25–1.50%, voids 0.30–2.00% (amounts rounded to cents). Gross is modeled from positive reported sales plus illustrative discounts/comps; voids are canceled order value tracked separately and are not deducted again. Zero/negative sales show N/A rates. This is not an accounting reconciliation. Period, filters and store search apply; reported sales stay unchanged.</div><div class="kpis" id="report-adjustment-kpis"></div><div class="ceo-graph-view"><h3>Illustrative adjustment rates by reporting unit</h3><div id="report-adjustment-chart"></div></div><div id="report-adjustment-table"></div>`;
      kpis("report-adjustment-kpis", metrics.map((metric) => [metric.label, share(sum(entries, metric.key), gross), "Illustrative amount / total assumed gross sales"]));
      table("report-adjustment-table", ["Reporting unit", "Assumed gross sales", "Illustrative discounts", "Discount %", "Illustrative void value", "Voids %", "Illustrative check comps", "Check Comps %"],
        entries.map((row) => [row.name, money(row.gross), money(row.discount), share(row.discount, row.gross), money(row.voids), share(row.voids, row.gross), money(row.comps), share(row.comps, row.gross)]));
      const positive = entries.filter((row) => row.gross > 0);
      if (!positive.length) return unavailable("report-adjustment-chart", "no positive sales in scope; no illustrative adjustment rates generated.");
      $("report-adjustment-chart").innerHTML = `<div style="max-width:100%;overflow:auto" tabindex="0" role="region" aria-label="Scroll illustrative adjustment rates"><div style="position:relative;height:320px;min-width:${Math.max(260, positive.length * 90)}px"><canvas role="img" aria-label="Illustrative discount, voids and complimentary-check value percentages by store; details in Table View"></canvas></div></div>`;
      const chart = new Chart($("report-adjustment-chart").querySelector("canvas"), {
        type: "bar",
        data: { labels: positive.map((row) => row.name), datasets: metrics.map((metric) => ({
          label: `Illustrative ${metric.label}`, data: positive.map((row) => row[metric.key] / row.gross * 100),
          backgroundColor: `${metric.color}80`, borderColor: metric.color, borderWidth: 1, maxBarThickness: 32,
        })) },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45 } }, y: { beginAtZero: true, title: { display: true, text: "% of assumed gross sales" }, ticks: { callback: (value) => `${value}%` } } },
          plugins: { legend: { position: "top" }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}% of assumed gross sales` } } },
        },
      });
      chartInstances.set("report-adjustment-chart", chart);
    }
    const alfredNotice = () => `<div class="notice"><strong>Source: Alfred October report.</strong> All financial figures and mall/district coordinates use the same 94-branch source. Hybrid and Asian Dining remain combined brands. Selected period and filters apply unless a panel explicitly states a fixed timeline or sample period.</div>`;
    function renderSalesBudget() {
      const branches = alfredBranches();
      const rows = [...new Set(branches.map((branch) => branch.brand))].map((brand) => {
        const peers = branches.filter((branch) => branch.brand === brand);
        return { name: brand, cy: peers.reduce((total, branch) => total + branch[state.period].cy, 0),
          ly: peers.reduce((total, branch) => total + branch[state.period].py, 0),
          budget: peers.reduce((total, branch) => total + branch[state.period].bud, 0) };
      }).sort((a, b) => b.cy - a.cy);
      if (rows.length) rows.push({ name: "ALFA total", cy: sum(rows, "cy"), ly: sum(rows, "ly"), budget: sum(rows, "budget") });
      $("report-sales-budget").innerHTML = `${alfredNotice()}<p class="ceo-chart-note">Sales as % of budget. Dashed reference = 100%; colors indicate budget attainment. Values are not visually capped. Hover or use arrow keys for exact percentages; Table View includes sales and budget amounts.</p><div class="ceo-graph-view" id="report-budget-chart"></div><div id="report-budget-table"></div>`;
      table("report-budget-table", ["Brand", "Sales", "Budget", "Attained", "vs LY"],
        rows.map((row) => [row.name, money(row.cy), money(row.budget), share(row.cy, row.budget), percentage(growth(row.cy, row.ly))]));
      brandChart("report-budget-chart", rows.map((row) => row.name), [{
        label: "Budget attainment",
        data: rows.map((row) => row.budget > 0 ? row.cy / row.budget * 100 : null),
        backgroundColor: rows.map((row) => root.AlfaSalesMap.budColor(row.budget > 0 ? row.cy / row.budget : null)),
      }], { percent: true, horizontal: true, target: true });
    }
    function renderAlfredDelivery() {
      const source = root.AlfaPeriodData.delivery(root.AlfaOctoberDaily.delivery, state.period, root.AlfaOctoberDaily.branches);
      const metrics = alfredDeliveryMetrics(source);
      const sales = (vendor) => vendor.sales.reduce((a, b) => a + b, 0);
      const commission = (vendor) => vendor.commission.reduce((a, b) => a + b, 0);
      const biggest = metrics.vendors.filter((vendor) => vendor.name !== "Sufra app (online)").toSorted((a, b) => sales(b) - sales(a))[0];
      const total = metrics.ytd, fee = metrics.commissionYtd;
      const app = metrics.vendors.find((vendor) => vendor.name === "Sufra app (online)");
      kpis("report-delivery-kpis", [
        ["Delivery sales", money(total), alfredPeriodLabel(state.period)],
        ["Delivery share", percentage(metrics.ytdShare), "Selected-period delivery / company net sales"],
        ["Commission (est.)", money(fee), "Selected vendor sales × source rates; VAT basis unconfirmed"],
        ["Sufra app share", share(app ? sales(app) : 0, total), "Selected period · source 0% commission"],
        ["Biggest aggregator", biggest?.name || "N/A", biggest ? `${share(sales(biggest), total)} of selected-period delivery` : "No aggregator sales"],
        ["Net delivery revenue", money(total - fee), "Selected-period sales less estimated commission"],
        ["Reporting scope", "Company", source.periodNote],
      ]);
      ["report-alfred-delivery-vendors", "report-alfred-delivery-share", "report-alfred-delivery-commission", "report-alfred-delivery-brands"].forEach(brandPanel);
      const main = ["Keeta", "Hunger Station", "Jahez"];
      const other = metrics.vendors.filter((vendor) => !main.includes(vendor.name) && vendor.name !== "Sufra app (online)");
      const series = [
        ...main.map((name, i) => {
          const vendor = metrics.vendors.find((vendor) => vendor.name === name);
          if (!vendor) throw new Error(`Missing Alfred delivery vendor: ${name}`);
          return { label: name, data: vendor.sales, backgroundColor: [chartColors.current, chartColors.prior, chartColors.budget][i] };
        }),
        { label: "Other aggregators", data: source.months.map((_, i) => other.reduce((n, vendor) => n + vendor.sales[i], 0)), backgroundColor: "#5ecbd0" },
        { label: "Sufra app", data: metrics.vendors.find((vendor) => vendor.name === "Sufra app (online)")?.sales || [], backgroundColor: "#5ecbd0" },
      ];
      if (series.at(-1).data.length !== source.months.length) throw new Error("Missing Alfred Sufra app series.");
      brandChart("report-alfred-delivery-vendors-chart", source.months, series, { stacked: true });
      table("report-alfred-delivery-vendors-table", ["Month", ...metrics.vendors.map((vendor) => vendor.name), "Total delivery"], source.months.map((month, i) =>
        [month, ...metrics.vendors.map((vendor) => money(vendor.sales[i])), money(metrics.totals[i])]));
      brandChart("report-alfred-delivery-share-chart", source.months, [{
        label: "Delivery share", data: metrics.shares, pointRadius: 3,
        pointBackgroundColor: chartColors.current,
      }], { line: true, percent: true });
      table("report-alfred-delivery-share-table", ["Interval", "Delivery sales", "Total net sales", "Delivery share"], source.months.map((month, i) =>
        [month, money(metrics.totals[i]), money(source.netSales[i]), percentage(metrics.shares[i])]));
      const vendors = metrics.vendors.toSorted((a, b) => commission(b) - commission(a));
      const paid = vendors.filter((vendor) => commission(vendor) > 0);
      brandChart("report-alfred-delivery-commission-chart", paid.map((vendor) => `${vendor.name} (${(vendor.rate * 100).toFixed(0)}%)`), [
        { label: `${alfredPeriodLabel(state.period)} commission`, data: paid.map(commission), backgroundColor: "#ed4654" },
      ], { horizontal: true });
      table("report-alfred-delivery-commission-table", ["Vendor", "Selected sales", "Contract rate", "Selected commission (est.)"], [
        ...vendors.map((vendor) => [vendor.name, money(sales(vendor)), percentage(vendor.rate * 100), money(commission(vendor))]),
        ["Total", money(total), "Vendor-specific", money(fee)],
      ]);
      brandChart("report-alfred-delivery-brands-chart", source.brandsMtd.map((row) => row.brand), [
        { label: alfredPeriodLabel(state.period), data: source.brandsMtd.map((row) => row.cy) },
        { label: state.period === "mtd" ? "MTD LY" : "DUMMY selected-period LY", data: source.brandsMtd.map((row) => row.py) },
      ], { horizontal: true });
      table("report-alfred-delivery-brands-table", ["Brand", "Selected CY", state.period === "mtd" ? "Selected LY" : "DUMMY selected LY", "Growth vs LY"], source.brandsMtd.map((row) =>
        [row.brand, money(row.cy), money(row.py), percentage(growth(row.cy, row.py))]));
    }
    function renderSalesMap() {
      if (!root.AlfaSalesMap) throw new Error("Alfred sales map renderer is not loaded.");
      mapObserver.disconnect();
      const branches = alfredBranches();
      const guestPeriod = state.period;
      if (guestPeriod === "ytd" && mapMetric === "guests") mapMetric = "revenue";
      const points = root.AlfaSalesMap.pointsInView(branches.map((branch) => ({
        name: branch.name, brand: branch.brand, lat: branch.lat, lng: branch.lng,
        cy: branch[state.period].cy, py: branch[state.period].py, bud: branch[state.period].bud,
        g: guestPeriod === "ytd" ? null : branch.guests[guestPeriod][0], chk: guestPeriod === "ytd" ? null : branch.checks[guestPeriod][0],
      })), mapView);
      $("report-map").innerHTML = `${alfredNotice()}<div class="ceo-graph-view"><div class="report-map-controls"><div class="segment" role="group" aria-label="Sales map metric">${[["revenue", "Revenue"], ["growth", "Growth vs LY"], ["budget", "Budget attainment"], ["guests", "Guests"]].map(([value, label]) => `<button type="button" data-map-metric="${value}" aria-pressed="${mapMetric === value}">${label}</button>`).join("")}</div><div class="segment" role="group" aria-label="Sales map area">${[["ksa", "Saudi"], ["riyadh", "Riyadh"], ["jeddah", "Jeddah"], ["eastern", "Eastern"]].map(([value, label]) => `<button type="button" data-map-view="${value}" aria-pressed="${mapView === value}">${label}</button>`).join("")}</div></div><p class="ceo-chart-note">Heat = concentration of sales or guests. Dot color = growth or budget attainment. Guest/check counts are estimates in the Alfred source; YTD uses its MTD guest/check counts, not YTD counts.</p><div class="report-sales-map" id="report-sales-map-canvas"></div><div class="report-map-legend" id="report-sales-map-legend"></div><label class="field">Inspect branch<select id="report-map-branch"><option value="">Select a branch</option>${points.map((point, index) => `<option value="${index}">${escape(point.name)}</option>`).join("")}</select></label><p id="report-map-detail" role="status">${points.length} source branches in scope.</p></div><div id="report-sales-map-table"></div>`;
      table("report-sales-map-table", ["Branch", "Brand", "Region", "Sales", "Last year", "Budget", "Growth vs LY", "Budget attainment"],
        branches.map((branch) => [branch.name, branch.brand, branch.region, money(branch[state.period].cy), money(branch[state.period].py), money(branch[state.period].bud),
          percentage(growth(branch[state.period].cy, branch[state.period].py)), share(branch[state.period].cy, branch[state.period].bud)]));
      $("report-map").querySelector(".report-map-controls").nextElementSibling.textContent = mapProvider === "google"
        ? "Interactive heatmap: warmer areas show higher sales or estimated guest concentration. Small pins open branch details. Growth/budget views show performance-colored pins, not additive heat."
        : "Offline source map: heat shows concentration of sales or guests; dot color shows growth or budget attainment.";
      $("report-map").querySelector('[data-map-metric="guests"]').disabled = guestPeriod === "ytd";
      if (guestPeriod === "ytd") $("report-map").querySelector(".report-map-controls").nextElementSibling.textContent += " YTD guests/checks are unavailable; monthly counts are not substituted.";
      const configuredKey = typeof root.AlfaMapsConfig?.apiKey === "string" ? root.AlfaMapsConfig.apiKey.trim() : "";
      if (!root.AlfaMapsConfig?.mapId) $("report-map").querySelector(".report-map-controls").nextElementSibling.textContent += " Monochrome cloud style pending: configure a styled mapId in maps-config.js.";
      const setupMessage = "Set apiKey in the untracked maps-config.js file beside index.html, then reload. Google Maps connects automatically.";
      $("report-sales-map-canvas").insertAdjacentHTML("beforebegin", `<div class="report-google-settings"><p class="ceo-chart-note">Google Maps · pan, zoom and select a branch. Heat intensity is relative to the selected scope, not comparable across different filters. Google receives standard Maps requests, not sales, guest or budget figures. Guest/check estimates use ${guestPeriod.toUpperCase()}.</p><button type="button" class="report-store-inspect" id="report-map-provider">${mapProvider === "google" ? "Use offline source map" : "Use Google Maps"}</button><p id="report-google-status" role="${googleMapError || (!configuredKey && mapProvider === "google") ? "alert" : "status"}">${escape(googleMapError || (mapProvider === "offline" ? "Offline source map selected; no Google basemap." : googleMaps ? "Google Maps connected." : googleMapLoading || configuredKey ? "Loading Google Maps…" : setupMessage))}</p></div>`);
      $("report-map-provider").onclick = () => {
        mapProvider = mapProvider === "google" ? "offline" : "google";
        renderSalesMap(); renderAlfredBrands(); compactNotices();
      };
      const connectGoogleMap = async () => {
        googleMapAttempted = true;
        googleMapLoading = true; googleMapError = "";
        renderSalesMap(); compactNotices();
        const fail = (error) => {
          console.error("Google Sales map:", error.message);
          googleMapError = error.message; googleMaps = null;
          googleMap?.destroy(); googleMap = null;
          googleBrandMaps.forEach((controller) => controller.destroy());
          googleBrandMaps.clear();
          renderSalesMap(); renderAlfredBrands(); compactNotices();
        };
        try {
          googleMaps = await root.AlfaSalesMap.loadGoogleMaps(configuredKey, fail);
          googleMapLoading = false;
          renderSalesMap(); renderAlfredBrands(); compactNotices();
        } catch (error) {
          googleMapLoading = false;
          fail(error);
        }
      };
      const describe = (point) => `${escape(point.name)} · ${escape(point.brand)}<br>Sales ${money(point.cy)} · ${percentage(growth(point.cy, point.py))} vs LY<br>Budget ${share(point.cy, point.bud)} · estimated ${guestPeriod.toUpperCase()} guests ${count(point.g)} · checks ${count(point.chk)}`;
      drawSalesMap = () => {
        const host = $("report-sales-map-canvas");
        if (!host.checkVisibility()) return;
        if (!points.length) { host.innerHTML = '<div class="empty">No Alfred branches match the selected filters.</div>'; $("report-sales-map-legend").textContent = ""; return; }
        if (mapProvider === "google") {
          if (!googleMaps) {
            host.innerHTML = `<div class="empty">${escape(googleMapError || (configuredKey ? "Loading Google Maps…" : setupMessage))} You can also select the offline source map.</div>`;
            $("report-sales-map-legend").textContent = "";
            return;
          }
          if (!googleMap) {
            const element = document.createElement("div");
            element.className = "report-google-map";
            host.replaceChildren(element);
            googleMap = root.AlfaSalesMap.createGoogleMap(element, googleMaps);
          }
          if (googleMap.element.parentElement !== host) host.replaceChildren(googleMap.element);
          if (!host.dataset.googleRendered) {
            googleMap.update(points, {
              view: mapView, metric: mapMetric, describe,
              onInspect: (point) => {
                $("report-map-branch").value = String(points.indexOf(point));
                $("report-map-detail").innerHTML = describe(point);
              },
            });
            host.dataset.googleRendered = "true";
          }
          googleMap.resize();
          if (mapMetric === "growth" || mapMetric === "budget") root.AlfaSalesMap.legend("report-sales-map-legend", mapMetric);
          else root.AlfaSalesMap.legend("report-sales-map-legend", "heat");
          return;
        }
        const additive = mapMetric === "revenue" || mapMetric === "guests";
        root.AlfaSalesMap.drawMap(host.id, points.map((point) => ({ ...point, v: Math.max(0, mapMetric === "guests" ? point.g : point.cy) })), {
          view: mapView, additive, dot: !additive, tip: describe,
          color: (point) => mapMetric === "budget" ? root.AlfaSalesMap.budColor(point.bud > 0 ? point.cy / point.bud : null) : root.AlfaSalesMap.growthColor(point.py > 0 ? point.cy / point.py - 1 : null),
        });
        const canvas = host.querySelector("canvas");
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${mapMetric} map · ${mapView}. Inspect branches using the selector below or Table View.`);
        root.AlfaSalesMap.legend("report-sales-map-legend", additive ? "heat" : mapMetric === "budget" ? "budget" : "growth");
      };
      $("report-map").querySelectorAll("[data-map-metric],[data-map-view]").forEach((button) => {
        button.onclick = () => {
          if (button.dataset.mapMetric) mapMetric = button.dataset.mapMetric;
          else mapView = button.dataset.mapView;
          renderSalesMap();
          compactNotices();
        };
      });
      $("report-map-branch").onchange = (event) => {
        if (event.target.value === "") { $("report-map-detail").textContent = `${points.length} source branches in scope.`; return; }
        $("report-map-detail").innerHTML = describe(points[Number(event.target.value)]);
        if (mapProvider === "google" && googleMaps) googleMap?.inspect(points[Number(event.target.value)]);
      };
      mapObserver.observe($("report-sales-map-canvas"));
      drawSalesMap();
      if (mapProvider === "google" && configuredKey && !googleMapAttempted) void connectGoogleMap();
    }
    function renderMenu() {
      const source = root.AlfaPeriodData.menu(root.AlfaOctoberDaily.menu, state.period, root.AlfaOctoberDaily.branches);
      const brand = state.brand === "all" ? menuFocus : state.brand;
      const unsupported = state.region !== "all" || state.basis !== "all" || state.brand !== "all" && menuFocus !== "all" && menuFocus !== state.brand;
      const base = alfredMenuMetrics(source, { brand });
      if (!base.categories.includes(menuCategory)) menuCategory = "all";
      $("report-menu-category").innerHTML = `<option value="all">All categories</option>${base.categories.map((name) => `<option${menuCategory === name ? " selected" : ""}>${escape(name)}</option>`).join("")}`;
      const metrics = alfredMenuMetrics(source, { brand, category: menuCategory, query: menuQuery });
      const coverage = source.storesOct.filter((store) => store[1] >= 300);
      const sourceOpen = $("report-menu-source").querySelector("details")?.open || false;
      $("report-menu-source").innerHTML = `<details class="notice report-methodology"${sourceOpen ? " open" : ""}><summary>${escape(source.periodNote)}</summary><div class="report-methodology-body">${escape(source.source)}. Selected sample: ${source.checks.oct.toLocaleString("en-GB")} checks. ${state.period === "mtd" ? `${coverage.length} stores have at least 300 checks; actual sample quantities and sales are preserved.` : "Missing totals, attachment, pairs and check values are deterministic DUMMY projections; they are not actual POS totals."} No FireGrill stores are covered. Recipe costs are simulated. September and October LY remain explicitly labeled reference baselines for rates/check averages, not selected-period totals. Global brand and local focus intersect; Hybrid is not split. Region and same-store allocations are unavailable and show no results. Attachment uses the full sample denominator.</div></details>`;
      ["report-menu-top", "report-menu-engineering", "report-menu-movers", "report-menu-attachment", "report-menu-pairs", "report-menu-spend"].forEach((id) => {
        chartInstances.get(`${id}-chart`)?.destroy();
        chartInstances.delete(`${id}-chart`);
        brandPanel(id);
      });
      if (unsupported) {
        kpis("report-menu-kpis", [["Menu coverage", "N/A", "No matched region/store-basis data, or brand focus conflicts with global brand."]]);
        for (const id of ["report-menu-top", "report-menu-engineering", "report-menu-movers", "report-menu-attachment", "report-menu-pairs", "report-menu-spend"]) {
          unavailable(`${id}-chart`, "no matched menu sample for the selected scope.");
          table(`${id}-table`, ["Metric", "Value"], []);
        }
        table("report-menu-table", ["Item", "Brand", "Category", "Sales"], []);
        compactNotices();
        return;
      }
      const check = metrics.spend.length === 1 ? metrics.spend[0] : null;
      kpis("report-menu-kpis", [
        ["Checks in selected sample", source.checks.oct.toLocaleString("en-GB"), source.periodNote],
        ["Average check", money(check?.oct.avg ?? null), check ? `${check.name} · ${percentage(growth(check.oct.avg, check.sep?.avg))} vs Sep` : "Select one covered source brand"],
        ["Items per check", check ? String(check.oct.items) : "N/A", check?.sep ? `September ${check.sep.items}` : "Select one covered source brand"],
        ["Dessert attachment", percentage(source.attach.Desserts.oct), `Full sample · Sep ${source.attach.Desserts.sep}% · LY ${source.attach.Desserts.ly}%`],
        ["Drinks attachment", percentage(source.attach["Soft drinks"].oct + source.attach["Juices & mocktails"].oct), "Full sample · soft drinks + juices; overlap possible"],
      ]);
      const labels = (items) => items.map((item) => `${item.brand} · ${item.item}`);
      brandChart("report-menu-top-chart", metrics.top.map((item) => `${item.item} (${item.rankChange > 0 ? "+" : ""}${item.rankChange})`), [{ label: `${alfredPeriodLabel(state.period)} sample sales${state.period === "mtd" ? "" : " (DUMMY)"}`, data: metrics.top.map((item) => item.sales) }], { horizontal: true });
      table("report-menu-top-table", ["Item", "Brand", "Category", "Sales", "Sold", "Sample share", "Per 1k checks", "Rank change vs Sep"],
        metrics.top.map((item) => [item.item, item.brand, item.cat, money(item.sales), item.qty.toLocaleString("en-GB"), percentage(item.share * 100), item.per1k.oct, item.rankChange]));
      table("report-menu-table", ["Item", "Brand", "Category", "Price", "Sold", "Sales", "Sample share", "Per 1k checks", "Source DoD", "Source WoW", "vs Sep reference", "vs Oct LY reference", "Class"],
        metrics.rows.map((item) => [item.item, item.brand, item.cat, money(item.price), item.qty.toLocaleString("en-GB"), money(item.sales), percentage(item.share * 100), item.per1k.oct, ...["dod", "wow", "mom", "yoy"].map((key) => percentage(item[key])), item.classification || "N/A"]));
      const movers = [...metrics.rising, ...metrics.falling];
      brandChart("report-menu-movers-chart", labels(movers), [{ label: "Units per 1,000 checks change vs Sep", data: movers.map((item) => item.mom), backgroundColor: movers.map((item) => item.mom >= 0 ? "#299bb0" : "#ed4654") }], { horizontal: true, percent: true });
      table("report-menu-movers-table", ["Item", "Brand", "September reference per 1k", "Selected per 1k", "Change vs Sep reference"], movers.map((item) => [item.item, item.brand, item.per1k.sep, item.per1k.oct, percentage(item.mom)]));
      brandChart("report-menu-attachment-chart", metrics.attachments.map(([name]) => name), [
        { label: alfredPeriodLabel(state.period), data: metrics.attachments.map(([, value]) => value.oct) },
        { label: "Oct 2025 baseline", data: metrics.attachments.map(([, value]) => value.ly) },
        { label: "Sep 2026 baseline", data: metrics.attachments.map(([, value]) => value.sep) },
      ], { horizontal: true, percent: true });
      table("report-menu-attachment-table", ["Category", "Selected sample", "Sep 2026 baseline", "Oct 2025 baseline"], metrics.attachments.map(([name, value]) => [name, percentage(value.oct), percentage(value.sep), percentage(value.ly)]));
      brandChart("report-menu-pairs-chart", metrics.pairs.map((pair) => `${pair.brand} · ${pair.a} + ${pair.b}`), [{ label: "Checks together", data: metrics.pairs.map((pair) => pair.n) }], { horizontal: true, count: true });
      table("report-menu-pairs-table", ["Item", "Bought with", "Brand", "Checks", "% of first item", "Lift"], metrics.pairs.map((pair) => [pair.a, pair.b, pair.brand, pair.n, percentage(pair.pct), pair.lift]));
      const priorCheck = (row) => row.ly?.avg ?? null;
      brandChart("report-menu-spend-chart", metrics.spend.map((row) => row.name), [
        { label: alfredPeriodLabel(state.period), data: metrics.spend.map((row) => row.oct.avg) },
        { label: "Oct 2025 baseline (where available)", data: metrics.spend.map(priorCheck) },
        { label: "Sep 2026 baseline", data: metrics.spend.map((row) => row.sep?.avg ?? null) },
      ]);
      table("report-menu-spend-table", ["Store type", "Selected checks", "Selected average check", "Sep baseline", "Oct 2025 baseline", "Items / check", "Basis"], metrics.spend.map((row) => [row.name, row.oct.checks.toLocaleString("en-GB"), money(row.oct.avg), money(row.sep?.avg ?? null), money(priorCheck(row)), row.oct.items, source.periodNote]));
      table("report-menu-engineering-table", ["Item", "Brand", "Per 1k checks", "Price", "Simulated unit cost", "Simulated contribution / item", "Class"], metrics.engineering.map((item) => [item.item, item.brand, item.per1k.oct, money(item.price), money(item.cost), money(item.margin), item.classification]));
      if (!metrics.engineering.length) {
        unavailable("report-menu-engineering-chart", "no eligible sample items match the selected filters.");
      } else {
        $("report-menu-engineering-chart").innerHTML = '<div style="max-width:100%;overflow:auto" tabindex="0" role="region" aria-label="Scroll menu engineering chart"><div style="position:relative;height:420px;min-width:480px"><canvas tabindex="0" role="img" aria-label="Menu engineering: sample popularity versus simulated contribution. Use left and right arrows to inspect items; exact values in Table View."></canvas></div></div>';
        const colors = { Star: chartColors.current, Plowhorse: chartColors.budget, Puzzle: "#5ecbd0", Dog: "#ed4654" };
        const chart = new Chart($("report-menu-engineering-chart").querySelector("canvas"), {
          type: "scatter",
          data: { datasets: [{ label: "Sample items", data: metrics.engineering.map((item) => ({ x: item.per1k.oct, y: item.margin })), backgroundColor: metrics.engineering.map((item) => chartFill(colors[item.classification])), borderColor: metrics.engineering.map((item) => colors[item.classification]), borderWidth: 1, pointRadius: 5, pointHoverRadius: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false,
            scales: { x: { type: "logarithmic", title: { display: true, text: "Sold per 1,000 checks (log scale)" } }, y: { title: { display: true, text: "Contribution per item (SAR; simulated cost)" } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => {
              const item = metrics.engineering[context.dataIndex];
              return [`${item.brand} · ${item.item} (${item.classification})`, `${item.per1k.oct} per 1,000 checks · price ${money(item.price)}`, `Contribution ${money(item.margin)} · simulated cost ${money(item.cost)}`];
            } } } },
          },
          plugins: [{ id: "menu-quadrants", beforeDatasetsDraw(chart) {
            const { ctx, scales: { x, y } } = chart;
            const px = x.getPixelForValue(metrics.popularity), py = y.getPixelForValue(metrics.margin);
            ctx.save(); ctx.strokeStyle = "#075577"; ctx.setLineDash([4, 3]); ctx.beginPath();
            ctx.moveTo(px, y.top); ctx.lineTo(px, y.bottom); ctx.moveTo(x.left, py); ctx.lineTo(x.right, py); ctx.stroke();
            ctx.fillStyle = "#637083"; ctx.font = "12px system-ui";
            ctx.fillText("Puzzles", x.left + 6, y.top + 14); ctx.fillText("Stars", x.right - 40, y.top + 14);
            ctx.fillText("Dogs", x.left + 6, y.bottom - 6); ctx.fillText("Plowhorses", x.right - 80, y.bottom - 6); ctx.restore();
          } }],
        });
        chartInstances.set("report-menu-engineering-chart", chart);
        enableChartZoom(chart);
        chart.canvas.onkeydown = (event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          const index = ((chart.getActiveElements()[0]?.index ?? -1) + (event.key === "ArrowRight" ? 1 : -1) + metrics.engineering.length) % metrics.engineering.length;
          const active = [{ datasetIndex: 0, index }], point = chart.getDatasetMeta(0).data[index];
          chart.setActiveElements(active); chart.tooltip.setActiveElements(active, { x: point.x, y: point.y }); chart.update("none");
        };
      }
      for (const id of ["report-menu-top", "report-menu-movers", "report-menu-pairs"]) {
        const chart = chartInstances.get(`${id}-chart`);
        if (!chart) continue;
        chart.options.scales.y.ticks.callback = function (value) {
          const label = this.getLabelForValue(value);
          return label.length > 46 ? `${label.slice(0, 43)}...` : label;
        };
        chart.update("none");
      }
      compactNotices();
    }
    function render() {
      const rs = filtered();
      const amount = totals(rs);
      const same = totals(rs.filter((row) => row.sss));
      const brands = group(rs, "brand");
      $("scope-note").textContent = `${{ dtd: "27 Oct 2026 vs 28 Oct 2025", mtd: "1–27 Oct 2026 vs source MTD 2025", ytd: "1 Jan–27 Oct 2026 vs source YTD 2025" }[state.period]} · ${rs.length} Alfred branches · source same-store flags`;
      const checks = state.period === "ytd" || !rs.length ? null : sum(rs, "checks");
      kpis("report-overview-kpis", [
        ["Total Same Store", percentage(growth(same.cy, same.ly)), `Sales ${money(same.cy)} · difference ${money(same.cy - same.ly)}`],
        ["Total ALFA / selected scope", percentage(growth(amount.cy, amount.ly)), `Sales ${money(amount.cy)} · difference ${money(amount.cy - amount.ly)}`],
        ["Budget", money(amount.budget), "From source comparison sheet"],
        ["Budget variance", money(amount.budget === null ? null : amount.cy - amount.budget), "Current sales minus source budget"],
        ["Transactions (estimated)", checks === null ? "N/A" : checks.toLocaleString("en-GB"), state.period === "ytd" ? "YTD checks are unavailable in Alfred" : "Alfred source checks · selected period and filters"],
        ["Average check", money(checks > 0 ? amount.cy / checks : null), "Alfred sales / source estimated checks"],
      ]);
      const mix = [
        { label: "Alfred dine-in", current: amount.nonDelivery, prior: amount.nonDeliveryLy },
        { label: "Reported delivery", current: amount.delivery, prior: amount.deliveryLy },
      ];
      table("report-channel-table", ["Channel", "Sales", "% of total revenue"], rs.length ? [
        ...mix.map((row) => [row.label, money(row.current), share(row.current, amount.cy)]),
        ["Total", money(amount.cy), share(amount.cy, amount.cy)],
        ["Separate takeout", "N/A", "N/A"],
      ] : []);
      const financial = brands.map((row) => financeRecord(row.name, row));
      const sameBrands = group(rs.filter((row) => row.sss), "brand").map((row) => financeRecord(`${row.name} · same-store`, row));
      table("report-finance", financeHeaders, rs.length ? [...sameBrands, ...financial, financeRecord("Total Same Store", same), financeRecord("Total selected scope", amount)] : []);
      table("report-brand-penetration", penetrationHeaders, brands.map((row) => penetrationRecord(row.name, row)));
      renderStoreTables(rs);
      renderMenu();
      unavailable("report-vendor-table", "Alfred does not provide a matched delivery/pickup order-type breakdown.");
      $("report-delivery-reconciliation").textContent = root.AlfaPeriodData.delivery(root.AlfaOctoberDaily.delivery, state.period, root.AlfaOctoberDaily.branches).periodNote;
      renderOctoberDaily();
      renderSalesBudget();
      renderSalesMap();
      renderBriefExtras();
      const dailyBranches = alfredBranches();
      const dailyBrands = [...new Set(dailyBranches.map((branch) => branch.brand))].map((name) => ({
        name, ...alfredMetrics(dailyBranches.filter((branch) => branch.brand === name), state.period),
      })).sort((a, b) => b.cy - a.cy);
      renderBrandDaily("report-overview-brand-daily", dailyBrands);
      renderAlfredBrands();
      renderAlfredDelivery();
      compactNotices();
      navigate(state.page);
    }
    function navigate(page) {
      if (!["overview", "brands", "stores", "menu", "delivery"].includes(page)) page = "overview";
      state.page = page;
      document.querySelectorAll(".section").forEach((section) => {
        section.hidden = section.id !== page;
        section.classList.toggle("active", section.id === page);
      });
      document.querySelectorAll(".nav-button[data-page]").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === page);
        if (button.dataset.page === page) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      const title = { overview: "CEO Brief", brands: "Brands", stores: "Stores", menu: "Menu", delivery: "Delivery" }[page];
      document.querySelector(".breadcrumb strong").textContent = title;
      document.querySelector("h1").textContent = page === "overview" ? "CEO Brief" : title;
      for (const chart of chartInstances.values()) {
        if (chart.canvas.closest(".section").id === page) chart.resize();
      }
      if (page === "overview") drawSalesMap();
      if (page === "brands") drawBrandMaps();
    }
    return { render, navigate };
  }
  root.AlfaReportView = { periodGraphsVersion: 1, create, alfredReportData, alfredPeriodLabel, illustrativeBrandTrend, illustrativeTraffic, illustrativeTrafficSummary, illustrativeMenu, illustrativeSeatHour, illustrativeAdjustments, alfredMetrics, alfredStoreMetrics, alfredDeliveryMetrics, alfredMenuMetrics, alfredBriefMetrics, presentationGaps };
})(typeof window === "undefined" ? globalThis : window);
