const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("./report-data.js");
require("./report-view.js");
require("./october-daily-data.js");
require("./alfred-map.js");

const directory = path.join(__dirname, "json_data");
const revenueName = "Revenue%20Sales_%202026%20vs%202025%20_OCTOBER%20(1).json";
const deliveryName = "delivery_growth_mtd_october.json";
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const parse = (revenue = read(revenueName), delivery = read(deliveryName)) =>
  AlfaReportData.parseReports(revenue, delivery);
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.02, `${actual} != ${expected}`);

test("Alfred source exactly preserves daily series, period financials and map coordinates", () => {
  const html = fs.readFileSync(path.join(__dirname, "alfrednew.html"), "utf8");
  const start = html.indexOf("window.DASH = {");
  const context = { window: {} };
  require("node:vm").runInNewContext(html.slice(start, html.indexOf("</script>", start)), context, { timeout: 1000 });
  const source = context.window.DASH;
  const commissionStart = html.indexOf("const COMM = {");
  const commissionEnd = html.indexOf("};", commissionStart) + 2;
  require("node:vm").runInNewContext(html.slice(commissionStart, commissionEnd).replace("const COMM =", "globalThis.rates ="), context, { timeout: 1000 });
  const expected = {
    asOf: source.asOf, days: source.days, months: source.months, holidays: source.holidays,
    branches: source.branches.map((branch) => ({
      name: branch.name, brand: branch.brand, region: branch.region,
      sss: branch.sss, new: branch.new, budget: branch.mtd.bud,
      daily: branch.daily ? { cy: branch.daily.cy, py: branch.daily.py } : null,
      lat: branch.lat, lng: branch.lng, city: branch.city,
      dtd: branch.dtd, mtd: branch.mtd, ytd: branch.ytd,
      guests: branch.g, checks: branch.chk,
      opened: branch.opened, month: branch.month, hol: branch.hol, sim: branch.sim,
    })),
    delivery: { ...source.delivery, commissionRates: context.rates },
  };
  assert.deepEqual(AlfaOctoberDaily, JSON.parse(JSON.stringify(expected)));
  assert.equal(AlfaOctoberDaily.days.length, 27);
  assert.equal(AlfaOctoberDaily.branches.length, 94);
});

test("Alfred Delivery preserves monthly totals, shares, commissions and virtual brands", () => {
  const source = AlfaOctoberDaily.delivery;
  const before = JSON.stringify(source);
  const result = AlfaReportView.alfredDeliveryMetrics(source);
  for (let i = 0; i < source.months.length; i++) {
    const total = Object.values(source.vendors).reduce((n, values) => n + values[i], 0);
    const commission = Object.entries(source.vendors).reduce((n, [name, values]) => n + values[i] * source.commissionRates[name], 0);
    close(result.totals[i], total);
    close(result.commissions[i], commission);
    close(result.shares[i], total / source.netSales[i] * 100);
  }
  close(result.ytd, result.totals.reduce((a, b) => a + b, 0));
  close(result.commissionYtd, result.commissions.reduce((a, b) => a + b, 0));
  close(result.mtd, 8631142.64);
  close(result.netMtd, result.mtd - result.commissionMtd);
  close(result.appShare, source.vendors["Sufra app (online)"].at(-1) / result.mtd * 100);
  assert.equal(result.biggest.name, "Keeta");
  assert.equal(source.commissionRates.Keeta, 0.16);
  assert.equal(source.commissionRates["Sufra app (online)"], 0);
  assert.ok(source.brandsMtd.some((row) => row.brand === "Earth Bowlz"));
  assert.equal(JSON.stringify(source), before);
});

test("Alfred Delivery rejects missing rates and malformed series instead of assuming zero fees", () => {
  const source = structuredClone(AlfaOctoberDaily.delivery);
  delete source.commissionRates.Keeta;
  assert.throws(() => AlfaReportView.alfredDeliveryMetrics(source), /commission rate: Keeta/);
  source.commissionRates.Keeta = 0;
  assert.equal(AlfaReportView.alfredDeliveryMetrics(source).vendors.find((row) => row.name === "Keeta").commission[0], 0);
  source.vendors.Keeta.pop();
  assert.throws(() => AlfaReportView.alfredDeliveryMetrics(source), /vendor series/);
  source.vendors.Keeta.push(NaN);
  assert.throws(() => AlfaReportView.alfredDeliveryMetrics(source), /vendor series/);
  source.vendors.Keeta[9] = 0; source.netSales.pop();
  assert.throws(() => AlfaReportView.alfredDeliveryMetrics(source), /net-sales series/);
});

test("Alfred Brands preserves exact monthly, daily, holiday and period totals", () => {
  const before = JSON.stringify(AlfaOctoberDaily);
  const sum = (branches, fn) => branches.reduce((total, branch) => total + fn(branch), 0);
  for (const branches of [AlfaOctoberDaily.branches, ...[...new Set(AlfaOctoberDaily.branches.map((branch) => branch.brand))].map((brand) => AlfaOctoberDaily.branches.filter((branch) => branch.brand === brand)), AlfaOctoberDaily.branches.filter((branch) => branch.region === "Eastern" && branch.sss && !branch.new)]) {
    for (const period of ["dtd", "mtd", "ytd"]) {
      const result = AlfaReportView.alfredMetrics(branches, period);
      close(result.cy, sum(branches, (branch) => branch[period].cy));
      close(result.budget, sum(branches, (branch) => branch[period].bud));
      close(result.attainment, result.cy / result.budget * 100);
      close(result.yesterday, sum(branches, (branch) => branch.daily.cy[26]));
      close(result.wow, (sum(branches, (branch) => branch.daily.cy.slice(20, 27).reduce((a, b) => a + b, 0)) / sum(branches, (branch) => branch.daily.cy.slice(13, 20).reduce((a, b) => a + b, 0)) - 1) * 100);
      close(result.mom, (sum(branches, (branch) => branch.mtd.cy) / 27 / (sum(branches, (branch) => branch.month.cy[8]) / 30) - 1) * 100);
      const same = branches.filter((branch) => branch.sss && !branch.new);
      close(result.sameGrowth, (sum(same, (branch) => branch[period].cy) / sum(same, (branch) => branch[period].py) - 1) * 100);
      for (let i = 0; i < 10; i++) {
        close(result.monthly.cy[i], sum(branches, (branch) => branch.month.cy[i]));
        close(result.monthly.py[i], sum(branches, (branch) => branch.month.py[i]));
        close(result.monthly.budget[i], sum(branches, (branch) => branch.month.bud[i]));
      }
      for (const holiday of ["ramadan", "eidFitr"]) for (let i = 0; i < 2; i++) close(result.holidays[holiday][i], sum(branches, (branch) => branch.hol[holiday][i]));
      for (let i = 0; i < 27; i++) for (const key of ["cy", "py"]) close(result.daily[key][i], sum(branches, (branch) => branch.daily[key][i]));
    }
  }
  assert.equal(JSON.stringify(AlfaOctoberDaily), before);
});

test("Alfred Brands empty and zero-baseline scopes do not invent comparisons", () => {
  const empty = AlfaReportView.alfredMetrics([], "mtd");
  assert.equal(empty.cy, 0);
  for (const key of ["growth", "attainment", "sameGrowth", "deliveryShare", "wow", "mom", "yesterdayVsWeek", "yesterdayVsLy", "mtdGrowth", "ytdGrowth", "mtdBudgetGrowth", "guestGrowth", "spend", "spendGrowth"]) assert.equal(empty[key], null);
  const branch = structuredClone(AlfaOctoberDaily.branches[0]);
  branch.mtd.py = 0; branch.mtd.bud = 0;
  const noBaseline = AlfaReportView.alfredMetrics([branch], "mtd");
  assert.equal(noBaseline.growth, null);
  assert.equal(noBaseline.attainment, null);
  assert.throws(() => AlfaReportView.alfredMetrics([], "unknown"), /Invalid/);
});

test("Brand guest growth and spend use comparable guest-bearing stores, never YTD estimates", () => {
  const branches = AlfaOctoberDaily.branches;
  for (const period of ["dtd", "mtd"]) {
    const peers = branches.filter((branch) => branch.sss && !branch.new && branch.guests[period][0] > 0 && branch.guests[period][1] > 0);
    const sum = (fn) => peers.reduce((total, branch) => total + fn(branch), 0);
    const guests = sum((branch) => branch.guests[period][0]);
    const guestsLy = sum((branch) => branch.guests[period][1]);
    const result = AlfaReportView.alfredMetrics(branches, period);
    close(result.guestGrowth, (guests / guestsLy - 1) * 100);
    close(result.spend, sum((branch) => branch[period].cy) / guests);
    close(result.spendGrowth, (result.spend / (sum((branch) => branch[period].py) / guestsLy) - 1) * 100);
  }
  const ytd = AlfaReportView.alfredMetrics(branches, "ytd");
  for (const key of ["guestGrowth", "spend", "spendGrowth"]) assert.equal(ytd[key], null);
});

test("Alfred store detail preserves traffic, weekly sales and simulated economics formulas", () => {
  const before = JSON.stringify(AlfaOctoberDaily);
  for (const branch of AlfaOctoberDaily.branches) {
    for (const period of ["dtd", "mtd", "ytd"]) {
      const result = AlfaReportView.alfredStoreMetrics(branch, period);
      const guestPeriod = period === "ytd" ? "mtd" : period;
      const [guests, guestsLy] = branch.guests[guestPeriod];
      close(result.lastWeek, branch.daily.cy.slice(20, 27).reduce((a, b) => a + b, 0));
      assert.equal(result.trafficEligible, branch.sss && !branch.new && guests > 0 && guestsLy > 0 && branch[guestPeriod].py > 0);
      if (guestsLy > 0) close(result.guestGrowth, (guests / guestsLy - 1) * 100);
      else assert.equal(result.guestGrowth, null);
      if (guests > 0) close(result.spend, branch[guestPeriod].cy / guests);
      else assert.equal(result.spend, null);
      close(result.annualSales, branch.mtd.cy / 27 * 365);
      if (result.annualSales > 0) close(result.occupancy, branch.sim.rentYear / result.annualSales * 100);
      else assert.equal(result.occupancy, null);
      if (branch.sim.sqft > 0) close(result.salesPerSqft, result.annualSales / branch.sim.sqft);
      if (branch.sim.tables > 0) close(result.salesPerTable, branch.mtd.cy / 27 / branch.sim.tables);
      if (branch.sim.seats > 0) close(result.guestsPerSeat, branch.guests.mtd[0] / 27 / branch.sim.seats);
    }
  }
  assert.equal(JSON.stringify(AlfaOctoberDaily), before);
});

test("Alfred watchlist uses exact materiality and decline/budget thresholds", () => {
  const branch = structuredClone(AlfaOctoberDaily.branches[0]);
  const watch = () => AlfaReportView.alfredStoreMetrics(branch, "mtd").watch;
  branch.mtd.cy = 30000; branch.mtd.py = 40000; branch.ytd.cy = 300000; branch.ytd.py = 400000; branch.mtd.bud = 30000;
  assert.equal(watch(), true);
  branch.mtd.cy = 29999.99;
  assert.equal(watch(), false);
  branch.mtd.cy = 34000; branch.mtd.py = 40000;
  assert.equal(watch(), false);
  branch.mtd.cy = 33999.99;
  assert.equal(watch(), true);
  branch.ytd.cy = 340000;
  assert.equal(watch(), false);
  branch.mtd.cy = 34000; branch.mtd.py = 30000; branch.mtd.bud = 40000;
  assert.equal(watch(), false);
  branch.mtd.cy = 33999.99;
  assert.equal(watch(), true);
  branch.mtd.bud = 0; branch.mtd.py = 0;
  assert.equal(watch(), false);
});

test("CEO illustrative transactions and weighted check reconcile positive sales for every scope", () => {
  const data = parse();
  const before = JSON.stringify(data);
  for (const period of Object.values(data.periods)) {
    const scopes = [period.stores, period.stores.filter((row) => row.sss),
      ...[...new Set(period.stores.map((row) => row.brand))].map((brand) => period.stores.filter((row) => row.brand === brand)),
      ...[...new Set(period.stores.map((row) => row.region))].map((region) => period.stores.filter((row) => row.region === region))];
    for (const rows of scopes) {
      const result = AlfaReportView.illustrativeTrafficSummary(rows);
      assert.equal(result.transactions, rows.reduce((n, row) => n + AlfaReportView.illustrativeTraffic(row.cy, row.id).transactions, 0));
      close(result.sales, rows.reduce((n, row) => n + Math.max(0, row.cy), 0));
      close(result.transactions * result.check, result.sales);
      assert.ok(Number.isInteger(result.transactions) && result.transactions > 0);
    }
  }
  assert.deepEqual(AlfaReportView.illustrativeTrafficSummary([]), { transactions: 0, sales: 0, check: null });
  assert.deepEqual(AlfaReportView.illustrativeTrafficSummary([{ id: "zero", cy: 0 }, { id: "negative", cy: -100 }]), { transactions: 0, sales: 0, check: null });
  assert.equal(JSON.stringify(data), before);
});

test("Alfred map uses source budget and growth color thresholds", () => {
  const budget = AlfaSalesMap.budColor;
  const growth = AlfaSalesMap.growthColor;
  assert.equal(budget(null), "#718096");
  assert.equal(budget(1), "#168565");
  assert.equal(budget(0.95), "#7cc47c");
  assert.equal(budget(0.9), "#e5b83d");
  assert.equal(budget(0.8), "#eb6834");
  assert.equal(budget(0.799), "#b82b35");
  assert.equal(growth(null), "#718096");
  assert.equal(growth(0.05), "#168565");
  assert.equal(growth(0), "#7cc47c");
  assert.equal(growth(-0.05), "#e5b83d");
  assert.equal(growth(-0.15), "#eb6834");
  assert.equal(growth(-0.151), "#b82b35");
});

test("all periods reconcile to published revenue and same-store totals", () => {
  const data = parse();
  const expected = {
    dtd: [1137517.26, 1236035.3093548391, 1053924.83, 313727.22],
    mtd: [31298842.51, 33430074.372580647, 29177530.44, 8630946.11],
    ytd: [
      364712285.8613045, 365849554.3291068, 336745238.25130457, 87845154.09,
    ],
  };
  for (const [period, [cy, ly, sss, delivery]] of Object.entries(expected)) {
    const sum = (field, sameStore = false) =>
      data.periods[period].stores
        .filter((store) => !sameStore || store.sss)
        .reduce((total, store) => total + store[field], 0);
    close(sum("cy"), cy);
    close(sum("ly"), ly);
    close(sum("cy", true), sss);
    close(sum("delivery"), delivery);
    close(sum("delivery") + sum("nonDelivery"), cy);
    close(sum("budget"), data.periods[period].summary.budget);
  }
});

test("active reporting units are unique and hybrid physical totals are excluded", () => {
  const { stores } = parse().periods.mtd;
  assert.equal(stores.length, 96);
  assert.equal(new Set(stores.map((store) => store.id)).size, stores.length);
  assert.ok(
    stores.every(
      (store) =>
        store.brand !== "Hybrid" && !/closed|convert/i.test(store.name),
    ),
  );
  assert.ok(stores.some((store) => store.brand === "Onami"));
  assert.ok(stores.some((store) => store.brand === "Chinese Palace"));
});

test("delivery retains pickup and the distinct source prior-year denominator", () => {
  const data = parse();
  const pickup = data.channels.find((channel) => /pickup/i.test(channel.label));
  close(pickup.current, 9481.89);
  close(
    data.channels.reduce((sum, channel) => sum + channel.current, 0),
    8630946.11,
  );
  close(
    data.channels.reduce((sum, channel) => sum + channel.prior, 0),
    7840678.65,
  );
  const revenueLy = data.periods.mtd.stores.reduce(
    (sum, store) => sum + store.deliveryLy,
    0,
  );
  assert.ok(Math.abs(revenueLy - 7840678.65) > 21000);
});

test("missing and non-numeric sales fail instead of substituting sample values", () => {
  for (const value of [null, undefined, "not a number"]) {
    const revenue = read(revenueName);
    const store = revenue["Sales Comparison_MTD"].find(
      (item) => item["Unnamed: 2"] === "SH-Olaya",
    );
    store["Unnamed: 4"] = value;
    assert.throws(() => parse(revenue), /Missing or invalid numeric/);
  }
});

test("numeric changes that break reconciliation fail validation", () => {
  const revenue = read(revenueName);
  revenue["Sales Comparison_MTD"].find(
    (row) => row["Unnamed: 2"] === "SH-Olaya",
  )["Unnamed: 4"] += 1;
  assert.throws(() => parse(revenue), /does not reconcile/);
});

test("a missing budget remains unavailable rather than becoming zero", () => {
  const revenue = read(revenueName);
  const sheet = revenue["Sales Comparison_MTD"];
  const budgetKey = Object.keys(sheet[7]).find(
    (key) => sheet[7][key] === "BUDGET",
  );
  sheet.find((row) => row["Unnamed: 2"] === "SH-Olaya")[budgetKey] = null;
  assert.equal(
    parse(revenue).periods.mtd.stores.find((store) => store.name === "SH-Olaya")
      .budget,
    null,
  );
});

test("a budget change that breaks the published total is rejected", () => {
  const revenue = read(revenueName);
  const sheet = revenue["Sales Comparison_YTD"];
  const budgetKey = Object.keys(sheet[7]).find(
    (key) => sheet[7][key] === "BUDGET",
  );
  sheet.find((row) => row["Unnamed: 2"] === "SH-Olaya")[budgetKey] += 1;
  assert.throws(() => parse(revenue), /budget does not reconcile/);
});

test("internally balanced but mismatched delivery reports are rejected", () => {
  const delivery = read(deliveryName);
  const rows = delivery.sheets["DELIVERY MTD OCTOBER"].rows;
  rows[6][23] += 1;
  rows.find((row) => row[22] === "Grand Total")[23] += 1;
  assert.throws(
    () => parse(read(revenueName), delivery),
    /do not reconcile to current-year/,
  );
});

test("literal percent-encoded filenames are fetched without changing their names", async () => {
  const requested = [];
  await AlfaReportData.loadReports(async (url) => {
    requested.push(url);
    const name = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    return { ok: true, json: async () => read(name) };
  });
  assert.deepEqual(
    requested.sort(),
    [
      `https://alfacosubscription.github.io/all_test/json_data/${encodeURIComponent(revenueName)}`,
      `https://alfacosubscription.github.io/all_test/json_data/${encodeURIComponent(deliveryName)}`,
    ].sort(),
  );
  assert.ok(requested.some((url) => url.includes("%2520")));
});

test("HTTP errors and malformed JSON propagate explicitly", async () => {
  await assert.rejects(
    AlfaReportData.loadReports(async () => ({ ok: false, status: 404 })),
    /404/,
  );
  await assert.rejects(
    AlfaReportData.loadReports(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Invalid report JSON");
      },
    })),
    /Invalid report JSON/,
  );
});

test("illustrative daily series reconcile exactly in cents across brand and filtered MTD totals", () => {
  const { stores } = parse().periods.mtd;
  for (const subset of [
    stores,
    stores.filter((store) => store.sss),
    stores.filter((store) => store.region === "Central"),
  ]) {
    for (const brand of new Set(subset.map((store) => store.brand))) {
      const matches = subset.filter((store) => store.brand === brand);
      const cy = matches.reduce((total, store) => total + store.cy, 0);
      const ly = matches.reduce((total, store) => total + store.ly, 0);
      const days = AlfaReportView.illustrativeBrandTrend(brand, cy, ly);
      assert.equal(days.length, 27);
      assert.equal(days[0].label, "1 Oct");
      assert.equal(days[26].label, "27 Oct");
      for (const [key, total] of [
        ["current", cy],
        ["prior", ly],
      ]) {
        assert.equal(
          days.reduce((sum, day) => sum + Math.round(day[key] * 100), 0),
          Math.round(total * 100),
        );
        assert.ok(
          days.every((day) => Number.isFinite(day[key]) && day[key] >= 0),
        );
      }
      assert.deepEqual(
        days,
        AlfaReportView.illustrativeBrandTrend(brand, cy, ly),
      );
    }
  }
});

test("illustrative splits handle zero, small and signed totals without mutating source reports", () => {
  for (const total of [0, 0.01, -123.45, 99.999]) {
    const days = AlfaReportView.illustrativeBrandTrend("Test", total, 0);
    assert.equal(
      days.reduce((sum, day) => sum + Math.round(day.current * 100), 0),
      Math.round(total * 100),
    );
    assert.ok(days.every((day) => day.prior === 0));
  }
  assert.throws(
    () => AlfaReportView.illustrativeBrandTrend("Test", NaN, 0),
    /finite MTD totals/,
  );
  const data = parse();
  const before = JSON.stringify(data);
  for (const store of data.periods.mtd.stores)
    AlfaReportView.illustrativeBrandTrend(store.brand, store.cy, store.ly);
  assert.equal(JSON.stringify(data), before);
});

test("dummy traffic is deterministic and reconciles to sales without changing source values", () => {
  const data = parse();
  const before = JSON.stringify(data);
  for (const row of data.periods.mtd.stores) {
    const result = AlfaReportView.illustrativeTraffic(row.cy, row.id);
    assert.deepEqual(result, AlfaReportView.illustrativeTraffic(row.cy, row.id));
    assert.ok(Number.isInteger(result.transactions));
    if (row.cy > 0) {
      assert.ok(result.transactions > 0 && result.check > 0);
      assert.ok(Math.abs(result.transactions * result.check - row.cy) < 0.000001);
    } else assert.deepEqual(result, { transactions: 0, check: null });
  }
  assert.deepEqual(AlfaReportView.illustrativeTraffic(0, "Test"), { transactions: 0, check: null });
  assert.deepEqual(AlfaReportView.illustrativeTraffic(-10, "Test"), { transactions: 0, check: null });
  assert.throws(() => AlfaReportView.illustrativeTraffic(NaN, "Test"), /finite sales/);
  assert.equal(JSON.stringify(data), before);
});

test("dummy menu allocations reconcile positive sales per brand across every period", () => {
  const data = parse();
  const before = JSON.stringify(data);
  for (const { stores } of Object.values(data.periods)) {
    const items = AlfaReportView.illustrativeMenu(stores);
    for (const brand of new Set(stores.map((row) => row.brand))) {
      const matches = items.filter((item) => item.brand === brand);
      assert.equal(matches.length, 8);
      for (const key of ["cy", "ly"]) {
        assert.equal(matches.reduce((sum, item) => sum + Math.round(item[key] * 100), 0),
          Math.round(stores.filter((row) => row.brand === brand).reduce((sum, row) => sum + Math.max(0, row[key]), 0) * 100));
      }
      assert.ok(matches.every((item) => Number.isInteger(item.units) && item.units >= 0 && item.profit === item.cy - item.cost));
    }
    assert.deepEqual(items, AlfaReportView.illustrativeMenu(stores));
  }
  assert.deepEqual(AlfaReportView.illustrativeMenu([]), []);
  assert.deepEqual(AlfaReportView.illustrativeMenu([{ brand: "Test", cy: -10, ly: 0 }]), []);
  assert.equal(JSON.stringify(data), before);
});

test("dummy RevPASH uses explicit period capacity and dine-in assumptions", () => {
  for (const [period, days] of [["dtd", 1], ["mtd", 27], ["ytd", 300]]) {
    const row = { nonDelivery: 9000, nonDeliveryLy: 4500 };
    const before = JSON.stringify(row);
    const result = AlfaReportView.illustrativeSeatHour(row, period);
    assert.equal(result.seats, 60);
    assert.equal(result.hoursPerDay, 12);
    assert.equal(result.days, days);
    assert.equal(result.seatHours, 720 * days);
    assert.equal(result.dineIn, 7200);
    assert.equal(result.dineInLy, 3600);
    assert.equal(result.current, 10 / days);
    assert.equal(result.prior, 5 / days);
    assert.equal(JSON.stringify(row), before);
  }
  const zero = AlfaReportView.illustrativeSeatHour({ nonDelivery: -1, nonDeliveryLy: 0 }, "dtd");
  assert.equal(zero.current, 0);
  assert.equal(zero.prior, 0);
  assert.throws(() => AlfaReportView.illustrativeSeatHour({ nonDelivery: NaN, nonDeliveryLy: 0 }, "dtd"), /finite non-delivery/);
  assert.throws(() => AlfaReportView.illustrativeSeatHour({ nonDelivery: 1, nonDeliveryLy: 0 }, "invalid"), /Unsupported/);
});

test("illustrative adjustments preserve source sales and reconcile monetary assumptions", () => {
  const data = parse();
  const before = JSON.stringify(data);
  for (const { stores } of Object.values(data.periods)) {
    for (const row of stores) {
      const result = AlfaReportView.illustrativeAdjustments(row);
      assert.deepEqual(result, AlfaReportView.illustrativeAdjustments(row));
      assert.equal(Math.round(result.gross * 100) - Math.round(result.discount * 100) - Math.round(result.comps * 100),
        Math.round(Math.max(0, row.cy) * 100));
      assert.ok(Object.values(result).every((value) => Number.isFinite(value) && value >= 0));
    }
  }
  assert.deepEqual(AlfaReportView.illustrativeAdjustments({ id: "Test", cy: 0 }), { gross: 0, discount: 0, comps: 0, voids: 0 });
  assert.throws(() => AlfaReportView.illustrativeAdjustments({ id: "Test", cy: NaN }), /finite sales/);
  assert.equal(JSON.stringify(data), before);
});
