(function (root) {
  "use strict";
  const revenueFile =
    "Revenue%20Sales_%202026%20vs%202025%20_OCTOBER%20(1).json";
  const deliveryFile = "delivery_growth_mtd_october.json";
  const normalizeName = (name) =>
    name === "FireGrill Kharj" ? "FireGrill Al Kharj" : name;
  const finite = (value, label) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Missing or invalid numeric field: ${label}`);
    }
    return value;
  };
  const brandName = (name, concept) => {
    if (/^Onami\b/.test(name)) return "Onami";
    if (concept === "Al Dyafa") return "Chinese Palace";
    const brands = {
      SH: "Steak House",
      Piatto: "Piatto",
      FG: "FireGrill",
      CFK: "CFK",
      PE: "Piatto Express",
    };
    if (!brands[concept])
      throw new Error(`Unrecognized concept ${concept} for ${name}`);
    return brands[concept];
  };
  function parseReports(revenue, delivery) {
    const periods = {};
    const metadata = new Map();
    const mtd = revenue.Sales_Comparison_MTD || revenue["Sales Comparison_MTD"];
    if (!Array.isArray(mtd))
      throw new Error("Missing Sales Comparison_MTD sheet.");
    for (const row of mtd) {
      const name = row["Unnamed: 2"];
      const id = row["Unnamed: 25"];
      const concept = row["Unnamed: 23"];
      if (
        typeof name !== "string" ||
        typeof id !== "string" ||
        !concept ||
        concept === "Hybrid" ||
        /closed|convert/i.test(row["Unnamed: 3"] || "") ||
        metadata.has(id)
      )
        continue;
      metadata.set(id, {
        id,
        name,
        brand: brandName(name, concept),
        region: row["Unnamed: 24"],
        sss: row["Unnamed: 3"] === "SSS",
        hybridHalf: row["Unnamed: 1"] === "Hybrid",
      });
    }
    for (const period of ["dtd", "mtd", "ytd"]) {
      const sheet = revenue[`Sales Comparison_${period.toUpperCase()}`];
      if (!Array.isArray(sheet))
        throw new Error(`Missing ${period} comparison sheet.`);
      const daily = period === "dtd";
      const nameKey = daily ? "0" : "Unnamed: 2";
      const budgetKey = Object.keys(sheet[7]).find(
        (key) => sheet[7][key] === "BUDGET",
      );
      if (!budgetKey) throw new Error(`Missing ${period} budget header.`);
      const columns = daily
        ? {
            cy: "0.1",
            ly: "0.2",
            delivery: "0.5",
            deliveryLy: "0.6",
            nonDelivery: "0.3",
            nonDeliveryLy: "0.4",
          }
        : {
            cy: "Unnamed: 4",
            ly: "Unnamed: 5",
            delivery: "Unnamed: 12",
            deliveryLy: "Unnamed: 13",
            nonDelivery:
              period === "mtd" ? "2026-10-27 00:00:00" : "Unnamed: 8",
            nonDeliveryLy: "Unnamed: 9",
          };
      const seen = new Set();
      const stores = [];
      for (const row of sheet) {
        const info =
          metadata.get(row["Unnamed: 25"]) ||
          [...metadata.values()].find(
            (item) => item.name === normalizeName(row[nameKey]),
          );
        const id = info?.id;
        if (!info || seen.has(id) || normalizeName(row[nameKey]) !== info.name)
          continue;
        seen.add(id);
        const store = { ...info, sss: row["Unnamed: 3"] === "SSS" };
        for (const [field, key] of Object.entries(columns)) {
          store[field] = finite(row[key], `${period}/${info.name}/${field}`);
        }
        store.budget =
          row[budgetKey] == null
            ? null
            : finite(row[budgetKey], `${period}/${info.name}/budget`);
        stores.push(store);
      }
      if (stores.length !== metadata.size)
        throw new Error(
          `Incomplete ${period} store coverage: ${stores.length}/${metadata.size}.`,
        );
      const summaryRow = sheet.find((row) => row[nameKey] === "Total Sales");
      const sameStoreRow = sheet.find(
        (row) => row[nameKey] === "Total Same Store Sales",
      );
      if (!summaryRow || !sameStoreRow)
        throw new Error(`Missing ${period} company totals.`);
      const summary = {};
      for (const [field, key] of Object.entries(columns)) {
        summary[field] = finite(summaryRow[key], `${period}/company/${field}`);
        const actual = stores.reduce((sum, store) => sum + store[field], 0);
        if (Math.abs(actual - summary[field]) > 0.02) {
          throw new Error(
            `${period} ${field} does not reconcile to company total (${actual} vs ${summary[field]}).`,
          );
        }
        const sameStoreActual = stores
          .filter((store) => store.sss)
          .reduce((sum, store) => sum + store[field], 0);
        if (
          Math.abs(
            sameStoreActual -
              finite(sameStoreRow[key], `${period}/same-store/${field}`),
          ) > 0.02
        ) {
          throw new Error(
            `${period} ${field} does not reconcile to same-store total.`,
          );
        }
      }
      summary.budget =
        summaryRow[budgetKey] == null
          ? null
          : finite(summaryRow[budgetKey], `${period}/company/budget`);
      if (
        summary.budget !== null &&
        stores.every((store) => store.budget !== null) &&
        Math.abs(
          stores.reduce((sum, store) => sum + store.budget, 0) - summary.budget,
        ) > 0.02
      ) {
        throw new Error(
          `${period} budget does not reconcile to company total.`,
        );
      }
      periods[period] = { stores, summary };
    }
    const deliveryRows = delivery?.sheets?.["DELIVERY MTD OCTOBER"]?.rows;
    if (
      !Array.isArray(deliveryRows) ||
      deliveryRows[5]?.[22] !== "Order Type Name"
    ) {
      throw new Error("Missing delivery MTD order-type summary.");
    }
    const channels = [];
    let deliveryTotal = null;
    for (const row of deliveryRows.slice(6)) {
      if (row[22] === "Grand Total") {
        deliveryTotal = {
          cy: finite(row[23], "delivery grand total CY"),
          ly: finite(row[24], "delivery grand total LY"),
        };
        break;
      }
      if (typeof row[22] !== "string")
        throw new Error("Unexpected gap in delivery channel summary.");
      channels.push({
        label: row[22],
        current: finite(row[23], `${row[22]} CY`),
        prior: finite(row[24], `${row[22]} LY`),
      });
    }
    if (!deliveryTotal || !channels.length)
      throw new Error("Incomplete delivery channel summary.");
    for (const [key, totalKey] of [
      ["current", "cy"],
      ["prior", "ly"],
    ]) {
      if (
        Math.abs(
          channels.reduce((sum, channel) => sum + channel[key], 0) -
            deliveryTotal[totalKey],
        ) > 0.02
      ) {
        throw new Error(`Delivery ${key} channels do not reconcile.`);
      }
    }
    if (Math.abs(deliveryTotal.cy - periods.mtd.summary.delivery) > 0.02) {
      throw new Error(
        "MTD delivery order types do not reconcile to current-year reported delivery.",
      );
    }
    return {
      periods,
      channels,
      deliveryTotal,
      files: [revenueFile, deliveryFile],
    };
  }
  async function loadReports(fetcher = fetch) {
    const documents = await Promise.all(
      [revenueFile, deliveryFile].map(async (name) => {
        // Filenames literally contain "%20"; encode the percent signs as well.
        const response = await fetcher(
          `https://alfacosubscription.github.io/all_test/json_data/${encodeURIComponent(name)}`,
          { cache: "no-store" },
        );
        if (!response.ok)
          throw new Error(`Unable to load ${name}: HTTP ${response.status}`);
        return response.json();
      }),
    );
    return parseReports(...documents);
  }
  root.AlfaReportData = { parseReports, loadReports };
})(typeof window === "undefined" ? globalThis : window);
