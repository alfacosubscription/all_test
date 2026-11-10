const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("./report-data.js");
require("./report-view.js");

const directory = path.join(__dirname, "json_data");
const revenueName = "Revenue%20Sales_%202026%20vs%202025%20_OCTOBER%20(1).json";
const deliveryName = "delivery_growth_mtd_october.json";
const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const parse = (revenue = read(revenueName), delivery = read(deliveryName)) =>
  AlfaReportData.parseReports(revenue, delivery);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.02, `${actual} != ${expected}`);

test("all periods reconcile to published revenue and same-store totals", () => {
  const data = parse();
  const expected = {
    dtd: [1137517.26, 1236035.3093548391, 1053924.83, 313727.22],
    mtd: [31298842.51, 33430074.372580647, 29177530.44, 8630946.11],
    ytd: [364712285.8613045, 365849554.3291068, 336745238.25130457, 87845154.09],
  };
  for (const [period, [cy, ly, sss, delivery]] of Object.entries(expected)) {
    const sum = (field, sameStore = false) => data.periods[period].stores
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
  assert.ok(stores.every((store) => store.brand !== "Hybrid" && !/closed|convert/i.test(store.name)));
  assert.ok(stores.some((store) => store.brand === "Onami"));
  assert.ok(stores.some((store) => store.brand === "Chinese Palace"));
});

test("delivery retains pickup and the distinct source prior-year denominator", () => {
  const data = parse();
  const pickup = data.channels.find((channel) => /pickup/i.test(channel.label));
  close(pickup.current, 9481.89);
  close(data.channels.reduce((sum, channel) => sum + channel.current, 0), 8630946.11);
  close(data.channels.reduce((sum, channel) => sum + channel.prior, 0), 7840678.65);
  const revenueLy = data.periods.mtd.stores.reduce((sum, store) => sum + store.deliveryLy, 0);
  assert.ok(Math.abs(revenueLy - 7840678.65) > 21000);
});

test("missing and non-numeric sales fail instead of substituting sample values", () => {
  for (const value of [null, undefined, "not a number"]) {
    const revenue = read(revenueName);
    const store = revenue["Sales Comparison_MTD"].find((item) => item["Unnamed: 2"] === "SH-Olaya");
    store["Unnamed: 4"] = value;
    assert.throws(() => parse(revenue), /Missing or invalid numeric/);
  }
});

test("numeric changes that break reconciliation fail validation", () => {
  const revenue = read(revenueName);
  revenue["Sales Comparison_MTD"].find((row) => row["Unnamed: 2"] === "SH-Olaya")["Unnamed: 4"] += 1;
  assert.throws(() => parse(revenue), /does not reconcile/);
});

test("a missing budget remains unavailable rather than becoming zero", () => {
  const revenue = read(revenueName);
  const sheet = revenue["Sales Comparison_MTD"];
  const budgetKey = Object.keys(sheet[7]).find((key) => sheet[7][key] === "BUDGET");
  sheet.find((row) => row["Unnamed: 2"] === "SH-Olaya")[budgetKey] = null;
  assert.equal(parse(revenue).periods.mtd.stores.find((store) => store.name === "SH-Olaya").budget, null);
});

test("a budget change that breaks the published total is rejected", () => {
  const revenue = read(revenueName);
  const sheet = revenue["Sales Comparison_YTD"];
  const budgetKey = Object.keys(sheet[7]).find((key) => sheet[7][key] === "BUDGET");
  sheet.find((row) => row["Unnamed: 2"] === "SH-Olaya")[budgetKey] += 1;
  assert.throws(() => parse(revenue), /budget does not reconcile/);
});

test("internally balanced but mismatched delivery reports are rejected", () => {
  const delivery = read(deliveryName);
  const rows = delivery.sheets["DELIVERY MTD OCTOBER"].rows;
  rows[6][23] += 1;
  rows.find((row) => row[22] === "Grand Total")[23] += 1;
  assert.throws(() => parse(read(revenueName), delivery), /do not reconcile to current-year/);
});

test("literal percent-encoded filenames are fetched without changing their names", async () => {
  const requested = [];
  await AlfaReportData.loadReports(async (url) => {
    requested.push(url);
    const name = decodeURIComponent(url.slice("json_data/".length));
    return { ok: true, json: async () => read(name) };
  });
  assert.deepEqual(requested.sort(), [
    `json_data/${encodeURIComponent(revenueName)}`,
    `json_data/${encodeURIComponent(deliveryName)}`,
  ].sort());
  assert.ok(requested.some((url) => url.includes("%2520")));
});

test("HTTP errors and malformed JSON propagate explicitly", async () => {
  await assert.rejects(AlfaReportData.loadReports(async () => ({ ok: false, status: 404 })), /404/);
  await assert.rejects(AlfaReportData.loadReports(async () => ({
    ok: true,
    json: async () => { throw new SyntaxError("Invalid report JSON"); },
  })), /Invalid report JSON/);
});

test("illustrative daily series reconcile exactly in cents across brand and filtered MTD totals", () => {
  const { stores } = parse().periods.mtd;
  for (const subset of [stores, stores.filter((store) => store.sss), stores.filter((store) => store.region === "Central")]) {
    for (const brand of new Set(subset.map((store) => store.brand))) {
      const matches = subset.filter((store) => store.brand === brand);
      const cy = matches.reduce((total, store) => total + store.cy, 0);
      const ly = matches.reduce((total, store) => total + store.ly, 0);
      const days = AlfaReportView.illustrativeBrandTrend(brand, cy, ly);
      assert.equal(days.length, 27);
      assert.equal(days[0].label, "1 Oct");
      assert.equal(days[26].label, "27 Oct");
      for (const [key, total] of [["current", cy], ["prior", ly]]) {
        assert.equal(days.reduce((sum, day) => sum + Math.round(day[key] * 100), 0), Math.round(total * 100));
        assert.ok(days.every((day) => Number.isFinite(day[key]) && day[key] >= 0));
      }
      assert.deepEqual(days, AlfaReportView.illustrativeBrandTrend(brand, cy, ly));
    }
  }
});

test("illustrative splits handle zero, small and signed totals without mutating source reports", () => {
  for (const total of [0, 0.01, -123.45, 99.999]) {
    const days = AlfaReportView.illustrativeBrandTrend("Test", total, 0);
    assert.equal(days.reduce((sum, day) => sum + Math.round(day.current * 100), 0), Math.round(total * 100));
    assert.ok(days.every((day) => day.prior === 0));
  }
  assert.throws(() => AlfaReportView.illustrativeBrandTrend("Test", NaN, 0), /finite MTD totals/);
  const data = parse();
  const before = JSON.stringify(data);
  for (const store of data.periods.mtd.stores) AlfaReportView.illustrativeBrandTrend(store.brand, store.cy, store.ly);
  assert.equal(JSON.stringify(data), before);
});
