(function (root) {
  "use strict";
  const chartColors = { current: "#299bb0", prior: "#075577", budget: "#ff9228" };
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
    const guestPeriod = period === "ytd" ? "mtd" : period;
    const guests = branch.guests[guestPeriod];
    const annualSales = branch.mtd.cy / 27 * 365;
    return {
      ...metrics,
      lastWeek: branch.daily.cy.slice(20, 27).reduce((total, value) => total + value, 0),
      watch: branch.mtd.cy >= 30000 && (
        branch.mtd.py > 0 && branch.mtd.cy < branch.mtd.py * 0.85 && branch.ytd.py > 0 && branch.ytd.cy < branch.ytd.py * 0.85 ||
        branch.mtd.bud > 0 && branch.mtd.cy < branch.mtd.bud * 0.85
      ),
      guestGrowth: ratio(guests[0], guests[1]),
      spend: guests[0] > 0 ? branch[guestPeriod].cy / guests[0] : null,
      spendGrowth: guests[0] > 0 && guests[1] > 0 ? ratio(branch[guestPeriod].cy / guests[0], branch[guestPeriod].py / guests[1]) : null,
      trafficEligible: branch.sss && !branch.new && guests[0] > 0 && guests[1] > 0 && branch[guestPeriod].py > 0,
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
    const $ = (id) => document.getElementById(id);
    ["overview", "brands", "stores", "menu", "delivery"].forEach((id) => $(id).classList.add("report-page"));
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const money = (value) => value === null ? "N/A" : `SAR ${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    let mapMetric = "revenue";
    let mapView = "ksa";
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
    const penetrationHeaders = ["Brand / store", "Total revenue", "Reported delivery", "Reported delivery %", "Dine-in & takeaway", "Non-delivery %"];
    const penetrationRecord = (name, amount) => [name, money(amount.cy), money(amount.delivery), share(amount.delivery, amount.cy), money(amount.nonDelivery), share(amount.nonDelivery, amount.cy)];
    const group = (rs, key) => [...new Set(rs.map((row) => row[key]))].sort().map((name) => ({ name, ...totals(rs.filter((row) => row[key] === name)) }));
    $("overview").innerHTML = `<div class="notice">Imported report data · 27 Oct 2026. Reported totals use no sample values. Separately labeled daily trends, traffic/check and map positions are illustrative; actual transaction counts and branch GPS are not mapped. Hybrid brand halves are counted once; their physical-site totals are excluded.</div><div class="kpis" id="report-overview-kpis"></div>
      <div class="ceo-grid report-brief-trends">${card("Daily sales — October", "report-october-daily")}${card("Why sales moved — bridge from last year", "report-brief-bridge", "Start at last year, add or take away each reason, and end at this year. Source sales; guests are estimates. YTD uses same-store change without a guest split.")}</div>
      <div class="ceo-grid report-brief-comparison-row">${card("Sales vs budget — company and brands", "report-sales-budget")}${card("Every comparison at a glance", "report-brief-comparisons", "Teal = up; coral = down. Yesterday: 27 Oct; last week: 20 Oct. MoM compares sales/day, October vs September.")}</div>
      <div class="ceo-grid report-brief-seasonality">${card("Ramadan & Eid — like for like", "report-brief-holidays", "Source Ramadan and Eid al-Fitr totals; Eid al-Adha is a separately labeled mock estimate.")}${card("Which weekdays are slipping", "report-brief-weekdays", "Average daily sales per aligned weekday, 1–27 October; independent of period selection.")}</div>
      ${card("Alfred says — executive readout", "report-brief-story")}
      ${card("Sales map", "report-map")}
      ${card("October daily sales — by brand", "report-overview-brand-daily", "Actual Alfred source series for 1–27 October 2026. Global brand, region and store-basis filters apply; period selection does not change this October timeline. Teal = this year; dashed navy = last year.")}
      ${card("Look at today — alerts", "report-brief-alerts")}
      ${card("Same-store growth — every store", "report-brief-ranking", "All comparable Alfred stores, replacing the limited Top/Worst panels. Click Inspect to open the store detail.")}
      ${card("Validated financial totals", "report-finance", "Revenue workbook figures underpin the KPIs; Alfred panels use a separately disclosed source.", "ceo-table-view")}`;
    $("brands").innerHTML = `${card("Brand manager view", "report-brand-manager")}
      ${card("Brands — every comparison", "report-brand-comparisons", "Yesterday, weekly, monthly and year-on-year comparisons use Alfred's fixed reporting dates.", "ceo-table-view")}
      <div class="ceo-grid">${card("Sales by brand — this year vs last year", "report-alfred-brand-sales")}${card("Budget attainment by brand", "report-alfred-brand-budget")}</div>
      ${card("Budget gap by store", "report-brand-gap")}
      ${card("Contribution to the change — by brand", "report-brand-contribution", "Selected-period source sales minus last year. Positive brands offset declining brands; amounts reconcile to the source scope change.")}
      ${card("New stores — shown separately", "report-brand-new", "Alfred new-store flags. MTD sales/day compared with the same source brand's mature same-store average across all regions; new stores are excluded from same-store growth.")}
      <div class="ceo-grid">${card("Brand across its stores", "report-brand-store-map")}${card("Brand overall — by city", "report-brand-city-map")}</div>
      ${card("Month by month — this year, last year, budget", "report-brand-month", "January–October 2026; October covers 1–27 only.")}
      ${card("Ramadan & Eid by brand", "report-brand-holidays", "Ramadan: 18 Feb–19 Mar 2026 vs 1–29 Mar 2025. Eid al-Fitr: three days each. Mock Eid al-Adha = 90% of source Eid al-Fitr, not actual event sales.")}
      ${card("Daily trend per brand — October", "report-alfred-brand-daily", "Actual source daily series, not illustrative splits. Each brand uses its own scale; dashed navy = last year.")}`;
    $("stores").innerHTML = `${card("Stores — Alfred source scope", "report-store-scope")}
      <div class="table-head report-search"><label for="report-store-search">Search stores</label><input class="search" id="report-store-search" type="search" aria-label="Search stores" placeholder="Search stores, brands or cities…"></div>
      ${card("Stores — every comparison", "report-source-store-table", "October comparisons: Yesterday, WoW, MoM/day, MTD and YTD. Click headers to sort; use a store's Inspect button to open its detail.", "ceo-table-view")}
      ${card("Store detail", "report-source-store-detail")}
      <div class="ceo-grid">${card("October day by day", "report-source-store-daily", "1–27 October 2026. Same weekday last week starts on day 8.")}${card("Month by month", "report-source-store-month", "January–October 2026; October covers 1–27 only.")}</div>
      ${card("Against its peers — same brand, MTD", "report-source-store-peers", "Top 12 trading peers across all Alfred regions, plus the selected store. Rank uses the full source brand, not the filtered list.")}
      <div class="ceo-grid">${card("Store economics — simulated inputs", "report-source-store-economics", "Alfred's simulated size, seating, table and rent inputs. Annual sales extrapolate October MTD / 27 × 365; not an actual annual forecast.")}${card("Ramadan & Eid — selected store", "report-source-store-holidays", "Aligned source event totals. Ramadan: 18 Feb–19 Mar 2026 vs 1–29 Mar 2025. Eid al-Fitr: 20–22 Mar 2026 vs 30 Mar–1 Apr 2025.")}</div>
      <div class="ceo-grid">${card("Traffic × check — same-store", "report-store-traffic", "Guest growth × spend per guest growth; bubble area = source sales. Guest/check counts are estimates, not a POS feed. YTD selection uses October MTD traffic.")}${card("Watchlist", "report-source-store-watch", "MTD sales ≥ SAR 30,000 and either MTD + YTD declines worse than 15%, or MTD budget attainment below 85%. Fixed MTD/YTD criteria.")}</div>
      ${card("Sales per seat-hour · illustrative RevPASH", "report-store-seat-hour")}`;
    $("delivery").innerHTML = `<div class="notice"><strong>Source: Alfred delivery report.</strong> The summary and four panels below are fixed company-wide January–October 2026 data; October covers 1–27. Like Alfred, they do not change with global period, brand, region or store-basis filters: no matched allocation is supplied. Virtual brands are retained under their source names, not mapped to physical kitchen brands. Commission is an estimate using Alfred's source contract rates; VAT basis remains unconfirmed. Validated-report detail in Table View follows its stated scope.</div><div class="kpis" id="report-delivery-kpis"></div>
      <div class="ceo-grid">${card("Delivery sales by aggregator — 2026", "report-alfred-delivery-vendors", "Stacked monthly sales. Keeta, Hunger Station, Jahez, other aggregators and Sufra app; October is partial.")}${card("Delivery share of sales", "report-alfred-delivery-share", "Monthly source delivery / source total net sales, not the validated revenue-workbook denominator.")}</div>
      <div class="ceo-grid">${card("Estimated commission — October MTD", "report-alfred-delivery-commission", "Vendor sales × source contract rate. Includes zero-rate vendors in Table View. VAT basis to confirm.")}${card("Delivery by brand incl. virtual brands — Oct MTD vs LY", "report-alfred-delivery-brands", "Earth Bowlz, Curry Club, Pat & Gino and other virtual brands remain distinct from their host kitchens.")}</div>
      ${card("Validated revenue categories — selected scope", "report-channel-table", "", "ceo-table-view")}
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
      <div class="ceo-grid">${card("Bought together — combo ideas", "report-menu-pairs", "October same-check pairs. Lift above 1 indicates association above chance. Item filters match either member of a pair.")}${card("Spend per check by store type", "report-menu-spend", "Source brand scope only; category/search do not change check-level metrics. Missing LY checks are shown as a labeled mock estimate.")}</div>
      ${card("Missing menu coverage — mock preview", "report-menu-mock", "Only shown when matching e-invoice data is absent. Generic items allocate positive validated sales; quantities and recipe costs are assumed, not actual item performance.")}`;
    let menuCategory = "all";
    let mockMenuCategory = "all";
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
    document.querySelector(".date-pill").textContent = "As of 27 Oct 2026 · imported reports";
    document.querySelector('[data-period="dtd"]').textContent = "Yesterday";
    document.querySelector('[data-period="dtd"]').title = "Presentation yesterday: 27 Oct 2026";
    const headerTag = document.querySelector(".header-right .tag, .topbar .tag, .topbar .badge");
    if (headerTag) headerTag.textContent = "JSON REPORT DATA";
    document.querySelectorAll("body *").forEach((el) => {
      if (el.children.length === 0 && el.textContent.trim() === "SAMPLE DATA") el.textContent = "JSON REPORT DATA";
    });
    document.querySelector("main.content > footer").textContent = "Source: validated October 2026 revenue/delivery reports and separately disclosed Alfred daily, budget, Brands, Stores, Menu and Delivery figures. Not a live feed. Menu uses a limited e-invoice sample with simulated recipe costs. Alfred commissions and guests/checks are estimates; economics inputs are simulated. CEO transactions/average check, RevPASH and POS adjustments are illustrative; unavailable metrics show N/A.";
    $("overview").querySelector(".notice").textContent = "Imported report data · 27 Oct 2026. Validated financial totals use no sample values. CEO Transactions and Average check are illustrative presentation values: assumed transactions per positive-sales reporting unit, with average check = positive sales / total assumed transactions. Zero/negative sales are excluded from these two metrics only. Alfred panels use a separately disclosed source. Hybrid brand halves are counted once in validated totals; duplicate physical-site totals are excluded.";
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
      const matching = matches(storeQuery);
      renderSeatHour(matching);
      renderAdjustments(matching);
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
      $("report-store-scope").innerHTML = `${alfredNotice()}<label class="field">ALFRED STORE BRAND FOCUS<select id="report-store-focus"><option value="all">All brands in selected scope</option>${[...new Set(root.AlfaOctoberDaily.branches.map((branch) => branch.brand))].sort().map((name) => `<option${storeFocus === name ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></label><p class="ceo-chart-note">Focus narrows the global filters for Alfred panels only. Select global All brands to access Hybrid / Asian Dining. Search applies to the store list, picker, watchlist and traffic. RevPASH and adjustments below keep their validated-report scope and assumptions.</p><div class="kpis" id="report-store-kpis"></div>`;
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
      table("report-source-store-table", headers, sorted.map((row) => values(row).map((value, i) =>
        [4, 9, 14].includes(i) ? money(value) : [5, 6, 7, 8, 10, 11, 12, 13, 16].includes(i) ? percentage(value) : value)),
      { column: sortColumn, ascending: sortAscending, onSort: (column) => {
        sortAscending = sortColumn === column ? !sortAscending : true; sortColumn = column; renderAlfredStores(); compactNotices(); navigate(state.page);
      } });
      $("report-source-store-table").querySelectorAll("tbody tr").forEach((tr, index) => {
        const name = sorted[index].branch.name, button = document.createElement("button");
        button.type = "button"; button.className = "report-store-inspect"; button.textContent = "Inspect";
        button.setAttribute("aria-label", `Inspect ${name}`); tr.children[0].append(" ", button);
        button.onclick = () => {
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
        { label: "MTD vs LY", data: watches.map((row) => row.mtdGrowth) },
        { label: "YTD vs LY", data: watches.map((row) => row.ytdGrowth) },
      ], { percent: true, horizontal: true });
      table("report-source-store-watch-table", ["Store", "Brand", "MTD", "MTD vs LY", "YTD vs LY", "Budget attainment", "Reason"], watches.map((row) => [
        row.branch.name, row.branch.brand, money(row.mtd), percentage(row.mtdGrowth), percentage(row.ytdGrowth), percentage(row.attainment),
        [row.branch.mtd.py > 0 && row.branch.mtd.cy < row.branch.mtd.py * 0.85 && row.branch.ytd.py > 0 && row.branch.ytd.cy < row.branch.ytd.py * 0.85 ? "Falling MTD and YTD" : "", row.branch.mtd.bud > 0 && row.branch.mtd.cy < row.branch.mtd.bud * 0.85 ? "Far below MTD budget" : ""].filter(Boolean).join("; "),
      ]));
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
      const metrics = alfredStoreMetrics(branch, "mtd");
      const peers = root.AlfaOctoberDaily.branches.filter((other) => other.brand === branch.brand && other.mtd.cy > 0).toSorted((a, b) => b.mtd.cy - a.mtd.cy);
      const rank = peers.indexOf(branch);
      $("report-source-store-subtitle").textContent = `${branch.brand} · ${branch.city} · ${branch.region}${branch.opened ? ` · opened ${branch.opened}` : ""}${branch.new ? " · new store" : ""}${metrics.watch ? " · watchlist" : ""}. Detail always uses the stated October / YTD periods.`;
      kpis("report-source-store-kpis", [
        ["Yesterday", money(metrics.yesterday), `${percentage(metrics.yesterdayVsWeek)} vs last Tuesday · ${percentage(metrics.yesterdayVsLy)} vs LY`],
        ["Last 7 days", money(metrics.lastWeek), `${percentage(metrics.wow)} WoW`],
        ["Month to date", money(branch.mtd.cy), `${percentage(metrics.mtdGrowth)} vs LY · ${percentage(metrics.mom)} MoM/day`],
        ["Budget MTD", percentage(metrics.attainment), `Gap ${money(branch.mtd.cy - branch.mtd.bud)}`],
        ["Year to date", money(branch.ytd.cy), `${percentage(metrics.ytdGrowth)} vs LY`],
        ["Guests MTD (estimated)", branch.guests.mtd[0].toLocaleString("en-GB"), `${percentage(metrics.guestGrowth)} vs LY`],
        ["Spend per guest MTD", money(metrics.spend), "Source sales / estimated guests; not average check"],
        ["Rank in source brand", rank >= 0 ? `${rank + 1} / ${peers.length}` : "N/A", `${percentage(metrics.deliveryShare)} MTD delivery share · trading peers only`],
      ]);
      const lastWeek = branch.daily.cy.map((_, i) => i >= 7 ? branch.daily.cy[i - 7] : null);
      brandChart("report-source-store-daily-chart", root.AlfaOctoberDaily.days, [
        { label: "This year", data: branch.daily.cy },
        { label: "Same weekday last week", data: lastWeek, borderColor: chartColors.budget, borderDash: [2, 3] },
        { label: "Last year", data: branch.daily.py, borderColor: chartColors.prior, borderDash: [4, 3] },
      ], { line: true });
      table("report-source-store-daily-table", ["October day", "This year", "Same weekday last week", "Last year"], root.AlfaOctoberDaily.days.map((day, i) => [day, money(branch.daily.cy[i]), money(lastWeek[i]), money(branch.daily.py[i])]));
      brandChart("report-source-store-month-chart", root.AlfaOctoberDaily.months, [
        { label: "This year", data: branch.month.cy }, { label: "Last year", data: branch.month.py },
        { label: "Budget", type: "line", data: branch.month.bud },
      ]);
      table("report-source-store-month-table", ["Month", "This year", "Last year", "Budget"], root.AlfaOctoberDaily.months.map((month, i) => [month, money(branch.month.cy[i]), money(branch.month.py[i]), money(branch.month.bud[i])]));
      const topPeers = peers.slice(0, 12);
      if (!topPeers.includes(branch)) topPeers.push(branch);
      brandChart("report-source-store-peers-chart", topPeers.map((other) => other.name), [
        { label: "MTD sales", data: topPeers.map((other) => other.mtd.cy), backgroundColor: topPeers.map((other) => other === branch ? chartColors.budget : chartColors.current) },
      ], { horizontal: true });
      table("report-source-store-peers-table", ["Store", "MTD", "MTD vs LY", "Budget attainment", "Spend / guest MTD"], topPeers.map((other) => [other.name, money(other.mtd.cy), percentage(growth(other.mtd.cy, other.mtd.py)), share(other.mtd.cy, other.mtd.bud), money(other.guests.mtd[0] > 0 ? other.mtd.cy / other.guests.mtd[0] : null)]));
      const econCards = [
        ["Annualized sales", money(metrics.annualSales), "October sales/day × 365"],
        ["Occupancy cost", percentage(metrics.occupancy), `${money(branch.sim.rentYear)} simulated annual rent`],
        ["Sales per sq ft", money(metrics.salesPerSqft), `${branch.sim.sqft} simulated sq ft · annualized`],
        ["Sales per table / day", money(metrics.salesPerTable), `${branch.sim.tables} simulated tables`],
        ["Guests per seat / day", metrics.guestsPerSeat === null ? "N/A" : metrics.guestsPerSeat.toFixed(1), `${branch.sim.seats} simulated seats · estimated MTD guests`],
      ];
      $("report-source-store-economics-chart").innerHTML = '<div class="kpis" id="report-source-store-econ-kpis"></div>';
      kpis("report-source-store-econ-kpis", econCards);
      table("report-source-store-economics-table", ["Metric", "Value", "Basis"], econCards);
      const holidays = [["Ramadan", ...branch.hol.ramadan], ["Eid al-Fitr", ...branch.hol.eidFitr], ["Eid al-Adha (mock)", ...presentationGaps([branch], state.period).eidAdha]];
      brandChart("report-source-store-holidays-chart", holidays.map((row) => row[0]), [
        { label: "2026", data: holidays.map((row) => row[1]) }, { label: "2025", data: holidays.map((row) => row[2]) },
      ]);
      table("report-source-store-holidays-table", ["Holiday", "2026", "2025", "Change", "Basis"], holidays.map(([name, cy, py]) => [name, money(cy), money(py), percentage(growth(cy, py)), name.includes("mock") ? "Mock: 90% of source Eid al-Fitr" : "Alfred event totals"]));
      if (state.period === "ytd") {
        const guests = illustrativeTraffic(branch.ytd.cy, branch.name).transactions;
        $("report-source-store-kpis").insertAdjacentHTML("beforeend", `<article class="kpi"><div class="kpi-top">Guests YTD · mock</div><div class="kpi-value">${guests.toLocaleString("en-GB")}</div><div class="kpi-bottom">Assumed guests from positive YTD sales; not actual traffic</div></article><article class="kpi"><div class="kpi-top">Spend / guest YTD · mock</div><div class="kpi-value">${money(guests ? Math.max(0, branch.ytd.cy) / guests : null)}</div><div class="kpi-bottom">YTD sales / assumed guests; source MTD estimates above stay unchanged</div></article>`);
      }
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
      $("report-brand-manager").innerHTML = `${alfredNotice()}<label class="field">ALFRED BRAND FOCUS<select id="report-brand-focus"><option value="all">All brands in selected scope</option>${[...new Set(source.branches.map((branch) => branch.brand))].sort().map((name) => `<option${brandFocus === name ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></label><p class="ceo-chart-note">Focus narrows the global brand/region/store-basis selection. Hybrid = SH + Piatto physical sites counted once; standalone brands exclude those sites. All panels below use this same source scope. Daily/monthly/holiday comparisons have their stated fixed periods.</p><div class="kpis" id="report-brand-manager-kpis"></div><p id="report-brand-manager-notes"></p>`;
      $("report-brand-focus").onchange = (event) => { brandFocus = event.target.value; renderAlfredBrands(); compactNotices(); navigate(state.page); };
      const active = branches.filter((branch) => branch[state.period].cy > 0);
      const ranked = active.filter((branch) => branch[state.period].py > 0).sort((a, b) => growth(b[state.period].cy, b[state.period].py) - growth(a[state.period].cy, a[state.period].py));
      kpis("report-brand-manager-kpis", [
        ["Sales", branches.length ? money(amount.cy) : "N/A", `${amount.trading} stores trading · ${percentage(amount.growth)} vs LY`],
        ["Budget attainment", percentage(amount.attainment), `Gap ${branches.length ? money(amount.cy - amount.budget) : "N/A"}`],
        ["Same-store growth", percentage(amount.sameGrowth), `${active.filter((branch) => branch.new).length} new stores trading`],
        ["Guest growth", percentage(state.period === "ytd" ? presentationGaps(branches, state.period).guestGrowth : amount.guestGrowth), state.period === "ytd" ? "Mock YTD · assumed CY/LY guests, not source traffic" : "Source estimates · comparable same-store guests"],
        ["Spend per guest", money(state.period === "ytd" ? presentationGaps(branches, state.period).spend : amount.spend), state.period === "ytd" ? "Mock YTD · sales / assumed guests" : `${percentage(amount.spendGrowth)} vs LY · not average check`],
        ["Week on week", percentage(amount.wow), "Last 7 days vs preceding 7 days · October"],
        ["Delivery share", percentage(amount.deliveryShare), "Alfred source delivery / total revenue"],
        ["Below 90% of budget", String(active.filter((branch) => branch[state.period].bud > 0 && branch[state.period].cy / branch[state.period].bud < 0.9).length), `Of ${active.length} stores trading`],
      ]);
      if (state.period === "ytd") $("report-brand-manager-kpis").insertAdjacentHTML("beforeend", `<article class="kpi"><div class="kpi-top">Same-store guests · mock YTD</div><div class="kpi-value">${presentationGaps(branches, state.period).guests.toLocaleString("en-GB")}</div><div class="kpi-bottom">Deterministic assumed guests from positive sales; not source traffic</div></article>`);
      $("report-brand-manager-notes").textContent = ranked.length
        ? `Best store: ${ranked[0].name} (${percentage(growth(ranked[0][state.period].cy, ranked[0][state.period].py))}). Worst: ${ranked.at(-1).name} (${percentage(growth(ranked.at(-1)[state.period].cy, ranked.at(-1)[state.period].py))}).`
        : "No comparable trading stores in this selection.";
      table("report-brand-comparisons", ["Brand", "Stores", "Yesterday", "Yesterday vs last week", "Yesterday vs LY", "WoW", "MoM / day", "MTD vs LY", "YTD vs LY", "MTD vs budget", "MTD", "Budget MTD", "Same-store MTD"],
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
      table("report-brand-gap-table", ["Store", "Brand", "Sales", "Budget", "Budget gap", "Share of scope budget"], gaps.map((branch, i) => [branch.name, branch.brand, money(branch[state.period].cy), money(branch[state.period].bud), money(gapValues[i]), share(branch[state.period].bud, amount.budget)]));
      const newStores = branches.filter((branch) => branch.new).sort((a, b) => b.opened.localeCompare(a.opened));
      brandChart("report-brand-new-chart", newStores.map((branch) => branch.name), [{ label: "MTD sales", data: newStores.map((branch) => branch.mtd.cy) }]);
      table("report-brand-new-table", ["Store", "Brand", "Opened", "Months", "MTD", "Sales / day", "vs mature average", "Budget attainment"], newStores.map((branch) => {
        const mature = source.branches.filter((other) => other.brand === branch.brand && !other.new && other.sss && other.mtd.cy > 0);
        const average = mature.length ? mature.reduce((total, other) => total + other.mtd.cy, 0) / mature.length / 27 : null;
        return [branch.name, branch.brand, branch.opened, Math.round((new Date(source.asOf) - new Date(branch.opened)) / 2.63e9), money(branch.mtd.cy), money(branch.mtd.cy / 27), average > 0 ? percentage(branch.mtd.cy / 27 / average * 100) : "N/A", share(branch.mtd.cy, branch.mtd.bud)];
      }));
      brandChart("report-brand-month-chart", branches.length ? source.months : [], [
        { label: "This year", data: amount.monthly.cy }, { label: "Last year", data: amount.monthly.py },
        { label: "Budget", type: "line", data: amount.monthly.budget },
      ]);
      table("report-brand-month-table", ["Month", "This year", "Last year", "Budget"], branches.length ? source.months.map((month, i) => [month, money(amount.monthly.cy[i]), money(amount.monthly.py[i]), money(amount.monthly.budget[i])]) : []);
      const holidayLabels = rows.flatMap((row) => [`${row.name} · Ramadan`, `${row.name} · Eid al-Fitr`, `${row.name} · Eid al-Adha (mock)`]);
      brandChart("report-brand-holidays-chart", holidayLabels, [
        { label: "2026", data: rows.flatMap((row) => [row.holidays.ramadan[0], row.holidays.eidFitr[0], Math.round(row.holidays.eidFitr[0] * 90) / 100]) },
        { label: "2025", data: rows.flatMap((row) => [row.holidays.ramadan[1], row.holidays.eidFitr[1], Math.round(row.holidays.eidFitr[1] * 90) / 100]) },
      ]);
      table("report-brand-holidays-table", ["Brand", "Ramadan 2026", "Ramadan 2025", "Ramadan change", "Eid 2026", "Eid 2025", "Eid change", "Mock Adha 2026", "Mock Adha 2025"], allRows.map((row) => [row.name, ...row.holidays.ramadan.map(money), percentage(growth(...row.holidays.ramadan)), ...row.holidays.eidFitr.map(money), percentage(growth(...row.holidays.eidFitr)), ...row.holidays.eidFitr.map((value) => money(Math.round(value * 90) / 100))]));
      renderBrandDaily("report-alfred-brand-daily", rows);
      renderBrandMaps(branches);
    }
    function renderBrandDaily(hostId, rows) {
      const source = root.AlfaOctoberDaily;
      const prefix = `${hostId}-series-`;
      for (const [id, chart] of chartInstances) if (id.startsWith(prefix)) { chart.destroy(); chartInstances.delete(id); }
      $(hostId).innerHTML = `<div class="ceo-grid" id="${hostId}-grid"></div>`;
      if (!rows.length) $(`${hostId}-grid`).innerHTML = '<div class="empty">No Alfred brands match the selected filters.</div>';
      rows.forEach((row, i) => {
        const id = `${prefix}${i}`;
        $(`${hostId}-grid`).insertAdjacentHTML("beforeend", card(`${row.name} · October daily sales`, id));
        brandPanel(id);
        brandChart(`${id}-chart`, source.days, [{ label: "This year", data: row.daily.cy }, { label: "Last year", data: row.daily.py, borderDash: [4, 3] }], { line: true });
        table(`${id}-table`, ["October day", "This year", "Last year"], source.days.map((day, index) => [day, money(row.daily.cy[index]), money(row.daily.py[index])]));
      });
    }
    function renderBriefExtras() {
      const branches = alfredBranches(), metrics = alfredBriefMetrics(branches, state.period);
      const brandRows = [...new Set(branches.map((branch) => branch.brand))].map((name) => ({
        name, ...alfredMetrics(branches.filter((branch) => branch.brand === name), state.period),
      }));
      const worstBudget = brandRows.filter((row) => row.budget > 0).sort((a, b) => a.cy - a.budget - (b.cy - b.budget))[0];
      const gaps = presentationGaps(branches, state.period);
      $("report-brief-story").innerHTML = branches.length
        ? `<p>Alfred source sales are <strong>${money(metrics.cy)}</strong>, ${percentage(metrics.growth)} vs LY and ${percentage(metrics.attainment)} of budget. Same-store growth is ${percentage(metrics.sameGrowth)}.${worstBudget ? ` Largest budget gap: <strong>${escape(worstBudget.name)}</strong> (${money(worstBudget.cy - worstBudget.budget)}).` : ""}</p><p>Dine-in source change ${percentage(metrics.dineGrowth)}; delivery ${percentage(metrics.deliveryGrowth)}. ${metrics.newCount} new stores contribute ${money(metrics.newSales)}. ${metrics.ranked.filter((row) => row.growth < -25).length} material comparable stores are down more than 25%.</p><div class="kpis" id="report-brief-source-kpis"></div>`
        : '<div class="empty">No Alfred branches match the selected filters.</div>';
      if (branches.length) kpis("report-brief-source-kpis", [
        ["Same-store guests", (state.period === "ytd" ? gaps.guests : metrics.guests).toLocaleString("en-GB"), state.period === "ytd" ? `Mock YTD · ${percentage(gaps.guestGrowth)} vs assumed LY guests` : `Alfred estimates · ${percentage(metrics.guestGrowth)} vs LY`],
        ["Spend / guest", money(state.period === "ytd" ? gaps.spend : metrics.spend), state.period === "ytd" ? `Mock YTD · ${percentage(gaps.spendGrowth)} vs assumed LY spend` : `Alfred estimates · ${percentage(metrics.spendGrowth)} vs LY`],
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
        $("report-brief-bridge-chart").insertAdjacentHTML("beforeend", `<p class="report-bridge-readout"><strong>In plain words.</strong> Start with last year's <strong>${money(metrics.ly)}</strong>. ${effects} That leaves this year's <strong>${money(metrics.cy)}</strong>. Guest/spend estimates are separate from validated financial totals.</p>`);
      }
      table("report-brief-bridge-table", ["Metric", "Sales / change", "Running total"], bridge.map((step) => [step.label, money(step.value), money(step.range[1])]));
      const comparisons = ["yesterdayVsWeek", "yesterdayVsLy", "wow", "mom", "mtdGrowth", "ytdGrowth", "mtdBudgetGrowth"];
      const comparisonLabels = ["Yesterday vs week", "Yesterday vs LY", "WoW", "MoM / day", "MTD vs LY", "YTD vs LY", "MTD vs budget"];
      const scopeRows = branches.length ? [...brandRows, { name: "ALFA selected scope", ...metrics }] : [];
      $("report-brief-comparisons").innerHTML = '<div class="ceo-graph-view report-comparison-heat" id="report-brief-heat"></div><div id="report-brief-comparison-table"></div>';
      $("report-brief-heat").innerHTML = scopeRows.length
        ? `<div class="report-heat-grid" role="group" aria-label="Brand comparison heatmap; exact figures also in Table View."><div class="report-heat-row report-heat-header" aria-hidden="true"><strong>Brand</strong>${comparisonLabels.map((label) => `<strong>${label}</strong>`).join("")}</div>${scopeRows.map((row, index) => `<div class="report-heat-row${index === scopeRows.length - 1 ? " report-heat-total" : ""}"><strong>${escape(row.name)}</strong>${comparisons.map((key, i) => `<div class="report-heat-cell ${row[key] === null ? "" : row[key] >= 0 ? "report-heat-up" : "report-heat-down"}" aria-label="${escape(row.name)} · ${comparisonLabels[i]}: ${percentage(row[key])}"><b>${percentage(row[key])}</b></div>`).join("")}</div>`).join("")}</div>`
        : '<div class="empty">No source comparisons in scope.</div>';
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
      const holidays = branches.length ? [["Ramadan", ...metrics.holidays.ramadan], ["Eid al-Fitr", ...metrics.holidays.eidFitr], ["Eid al-Adha (mock)", ...gaps.eidAdha]] : [];
      brandChart("report-brief-holidays-chart", holidays.map((row) => row[0]), [{ label: "2026", data: holidays.map((row) => row[1]) }, { label: "2025", data: holidays.map((row) => row[2]) }]);
      table("report-brief-holidays-table", ["Holiday", "2026", "2025", "Change", "Basis"], holidays.map(([name, cy, ly]) => [name, money(cy), money(ly), percentage(growth(cy, ly)), name.includes("mock") ? "Mock: 90% of source Eid al-Fitr" : "Alfred event totals"]));
      brandChart("report-brief-weekdays-chart", branches.length ? metrics.weekdays.map((row) => row.name) : [], [{ label: "This year", data: metrics.weekdays.map((row) => row.cy) }, { label: "Last year", data: metrics.weekdays.map((row) => row.ly) }]);
      table("report-brief-weekdays-table", ["Weekday", "This year / day", "Last year / day", "Change"], branches.length ? metrics.weekdays.map((row) => [row.name, money(row.cy), money(row.ly), percentage(row.growth)]) : []);
    }
    function renderBrandMaps(branches) {
      brandMapObserver.disconnect();
      const guestPeriod = state.period === "dtd" ? "dtd" : "mtd";
      const points = branches.map((branch) => ({
        name: branch.name, brand: branch.brand, city: branch.city, lat: branch.lat, lng: branch.lng, n: 1,
        cy: branch[state.period].cy, py: branch[state.period].py, bud: branch[state.period].bud,
        g: branch.guests[guestPeriod][0], chk: branch.checks[guestPeriod][0],
      }));
      const cities = [...new Set(points.map((point) => point.city))].map((city) => {
        const peers = points.filter((point) => point.city === city);
        return { name: city, n: peers.length, lat: sum(peers, "lat") / peers.length, lng: sum(peers, "lng") / peers.length,
          cy: sum(peers, "cy"), py: sum(peers, "py"), bud: sum(peers, "bud"), g: sum(peers, "g"), chk: sum(peers, "chk") };
      }).sort((a, b) => b.cy - a.cy);
      const draws = [];
      for (const kind of ["stores", "cities"]) {
        const id = kind === "stores" ? "report-brand-store-map" : "report-brand-city-map";
        const mapState = brandMapState[kind], entries = kind === "stores" ? points : cities;
        $(id).innerHTML = `<div class="ceo-graph-view"><div class="report-map-controls"><div class="segment" role="group" aria-label="${kind} map metric">${[["revenue", "Revenue"], ["checks", "Checks"], ["guests", "Guests"], ["budget", "Budget attainment"]].map(([value, label]) => `<button type="button" data-brand-map-metric="${value}" aria-pressed="${value === mapState.metric}">${label}</button>`).join("")}</div>${kind === "stores" ? `<div class="segment" role="group" aria-label="Brand map area">${[["ksa", "Saudi"], ["riyadh", "Riyadh"], ["jeddah", "Jeddah"], ["eastern", "Eastern"]].map(([value, label]) => `<button type="button" data-brand-map-view="${value}" aria-pressed="${value === mapState.view}">${label}</button>`).join("")}</div>` : ""}</div><p class="ceo-chart-note">Alfred mall/district coordinates. Guests/checks are source estimates; YTD uses MTD counts. City coordinates are the average of their branch positions.</p><div class="report-sales-map" id="${id}-canvas"></div><div class="report-map-legend" id="${id}-legend"></div><label class="field">Inspect ${kind === "stores" ? "branch" : "city"}<select id="${id}-inspect"><option value="">Select ${kind === "stores" ? "a branch" : "a city"}</option>${entries.map((point, index) => `<option value="${index}">${escape(point.name)}</option>`).join("")}</select></label><p id="${id}-detail" role="status">${entries.length} ${kind} in scope.</p></div><div id="${id}-table"></div>`;
        table(`${id}-table`, [kind === "stores" ? "Store" : "City", "Stores", "Sales", "Last year", "Budget attainment", `Estimated ${guestPeriod.toUpperCase()} guests`, `Estimated ${guestPeriod.toUpperCase()} checks`],
          entries.map((point) => [point.name, point.n, money(point.cy), money(point.py), share(point.cy, point.bud), point.g, point.chk]));
        const describe = (point) => `${escape(point.name)} · ${point.n} ${point.n === 1 ? "store" : "stores"}<br>Sales ${money(point.cy)} · ${percentage(growth(point.cy, point.py))} vs LY<br>Budget ${share(point.cy, point.bud)} · estimated ${guestPeriod.toUpperCase()} guests ${point.g.toLocaleString("en-GB")} · checks ${point.chk.toLocaleString("en-GB")}`;
        const draw = () => {
          const host = $(`${id}-canvas`);
          if (!host.checkVisibility()) return;
          if (!entries.length) { host.innerHTML = '<div class="empty">No Alfred records match the selected filters.</div>'; $(`${id}-legend`).textContent = ""; return; }
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
      const period = state.period === "ytd" ? "mtd" : state.period;
      const eligible = rs.map((branch) => ({ branch, ...alfredStoreMetrics(branch, period) })).filter((row) => row.trafficEligible);
      const visible = eligible.filter((row) => Math.abs(row.guestGrowth) < 90 && Math.abs(row.spendGrowth) < 90);
      $("report-store-traffic").innerHTML = `<div class="ceo-graph-view"><p class="ceo-chart-note">${escape(period.toUpperCase())} source traffic: right = more guests; up = higher spend/guest. ${eligible.length - visible.length} eligible outliers at ±90% or beyond are excluded from the graph, matching Alfred; all eligible stores remain in Table View.</p><div style="overflow:auto;max-width:100%" tabindex="0" role="region" aria-label="Scroll source store traffic chart"><div style="position:relative;height:360px;min-width:420px"><canvas id="report-store-traffic-chart" tabindex="0" role="img" aria-label="Source guest growth versus spend per guest growth"></canvas></div></div><p id="report-store-traffic-chart-detail" role="status">Hover a bubble or use arrow keys to inspect source figures.</p></div><div id="report-store-traffic-chart-table"></div>`;
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
      let activeIndex = -1;
      canvas.onkeydown = (event) => {
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
    const alfredNotice = () => `<div class="notice"><strong>Source: Alfred October report.</strong> These values and mall/district coordinates come from Alfred's 94-branch source, not the validated 96-reporting-unit revenue source. Hybrid and Asian Dining groups are not allocated to individual brands. Unmatched brand selections show N/A. Selected period and filters apply; reported financial KPIs are unchanged.</div>`;
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
      const source = root.AlfaOctoberDaily.delivery;
      const metrics = alfredDeliveryMetrics(source);
      const last = metrics.last;
      const biggest = metrics.biggest;
      kpis("report-delivery-kpis", [
        ["Delivery sales Oct MTD", money(metrics.mtd), `${percentage(metrics.shares[last])} of source net sales · company`],
        ["Delivery YTD", money(metrics.ytd), `${percentage(metrics.ytdShare)} of source net sales · Jan–27 Oct`],
        ["Commission Oct (est.)", money(metrics.commissionMtd), "Source contract rates · VAT basis unconfirmed"],
        ["Commission YTD (est.)", money(metrics.commissionYtd), "January–October source monthly sales × rates"],
        ["Sufra app share", percentage(metrics.appShare), "Of October delivery · source 0% commission"],
        ["Biggest aggregator", biggest?.name || "N/A", biggest ? `${share(biggest.sales[last], metrics.mtd)} of October delivery · ${(biggest.rate * 100).toFixed(0)}% rate` : "No aggregator sales"],
        ["Net delivery revenue", money(metrics.netMtd), "October sales less estimated commission only"],
        ["Reporting scope", "Company", "Fixed Jan–Oct / Oct MTD · global filters not applied"],
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
      brandChart("report-alfred-delivery-share-chart", source.months, [{ label: "Delivery share", data: metrics.shares }], { line: true, percent: true });
      table("report-alfred-delivery-share-table", ["Month", "Delivery sales", "Total net sales", "Delivery share"], source.months.map((month, i) =>
        [month, money(metrics.totals[i]), money(source.netSales[i]), percentage(metrics.shares[i])]));
      const vendors = metrics.vendors.toSorted((a, b) => b.commission[last] - a.commission[last]);
      const paid = vendors.filter((vendor) => vendor.commission[last] > 0);
      brandChart("report-alfred-delivery-commission-chart", paid.map((vendor) => `${vendor.name} (${(vendor.rate * 100).toFixed(0)}%)`), [
        { label: "Estimated October commission", data: paid.map((vendor) => vendor.commission[last]), backgroundColor: "#ed4654" },
      ], { horizontal: true });
      table("report-alfred-delivery-commission-table", ["Vendor", "October sales", "Contract rate", "October commission (est.)", "YTD commission (est.)"], [
        ...vendors.map((vendor) => [vendor.name, money(vendor.sales[last]), percentage(vendor.rate * 100), money(vendor.commission[last]), money(vendor.commission.reduce((a, b) => a + b, 0))]),
        ["Total", money(metrics.mtd), "Vendor-specific", money(metrics.commissionMtd), money(metrics.commissionYtd)],
      ]);
      brandChart("report-alfred-delivery-brands-chart", source.brandsMtd.map((row) => row.brand), [
        { label: "Oct 2026", data: source.brandsMtd.map((row) => row.cy) },
        { label: "Oct 2025", data: source.brandsMtd.map((row) => row.py) },
      ], { horizontal: true });
      table("report-alfred-delivery-brands-table", ["Brand", "Oct 2026", "Oct 2025", "Growth vs LY"], source.brandsMtd.map((row) =>
        [row.brand, money(row.cy), money(row.py), percentage(growth(row.cy, row.py))]));
    }
    function renderSalesMap() {
      if (!root.AlfaSalesMap) throw new Error("Alfred sales map renderer is not loaded.");
      mapObserver.disconnect();
      const branches = alfredBranches();
      const guestPeriod = state.period === "dtd" ? "dtd" : "mtd";
      const points = branches.map((branch) => ({
        name: branch.name, brand: branch.brand, lat: branch.lat, lng: branch.lng,
        cy: branch[state.period].cy, py: branch[state.period].py, bud: branch[state.period].bud,
        g: branch.guests[guestPeriod][0], chk: branch.checks[guestPeriod][0],
      }));
      $("report-map").innerHTML = `${alfredNotice()}<div class="ceo-graph-view"><div class="report-map-controls"><div class="segment" role="group" aria-label="Sales map metric">${[["revenue", "Revenue"], ["growth", "Growth vs LY"], ["budget", "Budget attainment"], ["guests", "Guests"]].map(([value, label]) => `<button type="button" data-map-metric="${value}" aria-pressed="${mapMetric === value}">${label}</button>`).join("")}</div><div class="segment" role="group" aria-label="Sales map area">${[["ksa", "Saudi"], ["riyadh", "Riyadh"], ["jeddah", "Jeddah"], ["eastern", "Eastern"]].map(([value, label]) => `<button type="button" data-map-view="${value}" aria-pressed="${mapView === value}">${label}</button>`).join("")}</div></div><p class="ceo-chart-note">Heat = concentration of sales or guests. Dot color = growth or budget attainment. Guest/check counts are estimates in the Alfred source; YTD uses its MTD guest/check counts, not YTD counts.</p><div class="report-sales-map" id="report-sales-map-canvas"></div><div class="report-map-legend" id="report-sales-map-legend"></div><label class="field">Inspect branch<select id="report-map-branch"><option value="">Select a branch</option>${points.map((point, index) => `<option value="${index}">${escape(point.name)}</option>`).join("")}</select></label><p id="report-map-detail" role="status">${points.length} source branches in scope.</p></div><div id="report-sales-map-table"></div>`;
      table("report-sales-map-table", ["Branch", "Brand", "Region", "Sales", "Last year", "Budget", "Growth vs LY", "Budget attainment"],
        branches.map((branch) => [branch.name, branch.brand, branch.region, money(branch[state.period].cy), money(branch[state.period].py), money(branch[state.period].bud),
          percentage(growth(branch[state.period].cy, branch[state.period].py)), share(branch[state.period].cy, branch[state.period].bud)]));
      const describe = (point) => `${escape(point.name)} · ${escape(point.brand)}<br>Sales ${money(point.cy)} · ${percentage(growth(point.cy, point.py))} vs LY<br>Budget ${share(point.cy, point.bud)} · estimated ${guestPeriod.toUpperCase()} guests ${point.g.toLocaleString("en-GB")} · checks ${point.chk.toLocaleString("en-GB")}`;
      drawSalesMap = () => {
        const host = $("report-sales-map-canvas");
        if (!host.checkVisibility()) return;
        if (!points.length) { host.innerHTML = '<div class="empty">No Alfred branches match the selected filters.</div>'; $("report-sales-map-legend").textContent = ""; return; }
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
      };
      mapObserver.observe($("report-sales-map-canvas"));
      drawSalesMap();
    }
    function renderMenu() {
      const source = root.AlfaOctoberDaily.menu;
      const brand = state.brand === "all" ? menuFocus : state.brand;
      const unsupported = state.region !== "all" || state.basis !== "all" || state.brand !== "all" && menuFocus !== "all" && menuFocus !== state.brand;
      const base = alfredMenuMetrics(source, { brand });
      if (!base.categories.includes(menuCategory)) menuCategory = "all";
      $("report-menu-category").innerHTML = `<option value="all">All categories</option>${base.categories.map((name) => `<option${menuCategory === name ? " selected" : ""}>${escape(name)}</option>`).join("")}`;
      const metrics = alfredMenuMetrics(source, { brand, category: menuCategory, query: menuQuery });
      renderMissingMenu(unsupported || !base.rows.length);
      const coverage = source.storesOct.filter((store) => store[1] >= 300);
      const sourceOpen = $("report-menu-source").querySelector("details")?.open || false;
      $("report-menu-source").innerHTML = `<details class="notice report-methodology"${sourceOpen ? " open" : ""}><summary>Alfred e-invoice sample · 1–27 October · simulated recipe costs · source and filter notes</summary><div class="report-methodology-body">${escape(source.source)}. October 1–27 covers ${source.checks.oct.toLocaleString("en-GB")} checks; ${coverage.length} stores have at least 300 checks. No FireGrill stores are covered. Actual sample quantities, sales and per-1,000-check rates are preserved; these are not company totals. Recipe costs and contribution margins are simulated. Item shares and attachment use the full sample denominator, not a filtered denominator. Fixed October/September/LY comparisons do not follow the global period. Global brand and local focus intersect; Hybrid is not split into Steak House/Piatto. Region and same-store allocations are unavailable: those selections show no menu results rather than unrelated company values. Attachment remains explicitly full-sample when brand/category/search change.</div></details>`;
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
        ["Checks in sample — Oct", source.checks.oct.toLocaleString("en-GB"), `Full sample · Sep ${source.checks.sep.toLocaleString("en-GB")} · LY ${source.checks.ly.toLocaleString("en-GB")}`],
        ["Average check", money(check?.oct.avg ?? null), check ? `${check.name} · ${percentage(growth(check.oct.avg, check.sep?.avg))} vs Sep` : "Select one covered source brand"],
        ["Items per check", check ? String(check.oct.items) : "N/A", check?.sep ? `September ${check.sep.items}` : "Select one covered source brand"],
        ["Dessert attachment", percentage(source.attach.Desserts.oct), `Full sample · Sep ${source.attach.Desserts.sep}% · LY ${source.attach.Desserts.ly}%`],
        ["Drinks attachment", percentage(source.attach["Soft drinks"].oct + source.attach["Juices & mocktails"].oct), "Full sample · soft drinks + juices; overlap possible"],
      ]);
      const labels = (items) => items.map((item) => `${item.brand} · ${item.item}`);
      brandChart("report-menu-top-chart", metrics.top.map((item) => `${item.item} (${item.rankChange > 0 ? "+" : ""}${item.rankChange})`), [{ label: "October sample sales", data: metrics.top.map((item) => item.sales) }], { horizontal: true });
      table("report-menu-top-table", ["Item", "Brand", "Category", "Sales", "Sold", "Sample share", "Per 1k checks", "Rank change vs Sep"],
        metrics.top.map((item) => [item.item, item.brand, item.cat, money(item.sales), item.qty.toLocaleString("en-GB"), percentage(item.share * 100), item.per1k.oct, item.rankChange]));
      table("report-menu-table", ["Item", "Brand", "Category", "Price", "Sold", "Sales", "Sample share", "Per 1k checks", "DoD", "WoW", "MoM", "YoY", "Class"],
        metrics.rows.map((item) => [item.item, item.brand, item.cat, money(item.price), item.qty.toLocaleString("en-GB"), money(item.sales), percentage(item.share * 100), item.per1k.oct, ...["dod", "wow", "mom", "yoy"].map((key) => percentage(item[key])), item.classification || "N/A"]));
      const movers = [...metrics.rising, ...metrics.falling];
      brandChart("report-menu-movers-chart", labels(movers), [{ label: "Units per 1,000 checks change vs Sep", data: movers.map((item) => item.mom), backgroundColor: movers.map((item) => item.mom >= 0 ? "#299bb0" : "#ed4654") }], { horizontal: true, percent: true });
      table("report-menu-movers-table", ["Item", "Brand", "September per 1k", "October per 1k", "MoM"], movers.map((item) => [item.item, item.brand, item.per1k.sep, item.per1k.oct, percentage(item.mom)]));
      brandChart("report-menu-attachment-chart", metrics.attachments.map(([name]) => name), [
        { label: "Oct 2026", data: metrics.attachments.map(([, value]) => value.oct) },
        { label: "Oct 2025", data: metrics.attachments.map(([, value]) => value.ly) },
        { label: "Sep 2026", data: metrics.attachments.map(([, value]) => value.sep) },
      ], { horizontal: true, percent: true });
      table("report-menu-attachment-table", ["Category", "Oct 2026", "Sep 2026", "Oct 2025"], metrics.attachments.map(([name, value]) => [name, percentage(value.oct), percentage(value.sep), percentage(value.ly)]));
      brandChart("report-menu-pairs-chart", metrics.pairs.map((pair) => `${pair.brand} · ${pair.a} + ${pair.b}`), [{ label: "Checks together", data: metrics.pairs.map((pair) => pair.n) }], { horizontal: true, count: true });
      table("report-menu-pairs-table", ["Item", "Bought with", "Brand", "Checks", "% of first item", "Lift"], metrics.pairs.map((pair) => [pair.a, pair.b, pair.brand, pair.n, percentage(pair.pct), pair.lift]));
      const priorCheck = (row) => row.ly?.avg ?? Math.round(row.oct.avg * 0.95 * 100) / 100;
      brandChart("report-menu-spend-chart", metrics.spend.map((row) => row.ly ? row.name : `${row.name} (LY mock)`), [
        { label: "Oct 2026", data: metrics.spend.map((row) => row.oct.avg) },
        { label: "Oct 2025 (mock where labeled)", data: metrics.spend.map(priorCheck) },
        { label: "Sep 2026", data: metrics.spend.map((row) => row.sep?.avg ?? null) },
      ]);
      table("report-menu-spend-table", ["Store type", "Checks Oct", "Average check Oct", "Sep", "Oct 2025", "Items / check", "Basis"], metrics.spend.map((row) => [row.name, row.oct.checks.toLocaleString("en-GB"), money(row.oct.avg), money(row.sep?.avg ?? null), money(priorCheck(row)), row.oct.items, row.ly ? "Alfred sample" : "LY mock: 95% of October average check"]));
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
    function renderMissingMenu(show) {
      const host = $("report-menu-mock");
      host.closest("article").hidden = !show;
      chartInstances.get("report-menu-mock-chart")?.destroy();
      chartInstances.delete("report-menu-mock-chart");
      if (!show) { host.replaceChildren(); return; }
      const rows = filtered().filter((row) => menuFocus === "all" || row.brand === menuFocus);
      const categories = [...new Set(menuTemplates.map((item) => item.category))];
      const items = illustrativeMenu(rows).filter((item) => (mockMenuCategory === "all" || item.category === mockMenuCategory) && item.name.toLowerCase().includes(menuQuery.toLowerCase()));
      host.innerHTML = `<div class="notice">MOCK MENU PREVIEW — missing source coverage only. Selected period and global scope apply. Generic item sales are allocated, not imported. Source panels remain empty for unsupported scopes.</div><label class="field">MOCK CATEGORY<select id="report-menu-mock-category"><option value="all">All mock categories</option>${categories.map((name) => `<option${mockMenuCategory === name ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></label><div class="ceo-graph-view" id="report-menu-mock-chart"></div><div id="report-menu-mock-table"></div>`;
      $("report-menu-mock-category").onchange = (event) => { mockMenuCategory = event.target.value; renderMissingMenu(true); navigate(state.page); };
      const top = items.toSorted((a, b) => b.cy - a.cy).slice(0, 15);
      brandChart("report-menu-mock-chart", top.map((item) => `${item.brand} · ${item.name}`), [{ label: "Mock current sales", data: top.map((item) => item.cy) }, { label: "Mock LY sales", data: top.map((item) => item.ly) }], { horizontal: true });
      table("report-menu-mock-table", ["Brand", "Illustrative item", "Category", "Allocated CY sales", "Allocated LY sales", "Mock units", "Mock cost", "Mock contribution"], items.map((item) => [item.brand, item.name, item.category, money(item.cy), money(item.ly), item.units.toLocaleString("en-GB"), money(item.unitCost), money(item.profit)]));
    }
    function render() {
      const rs = filtered();
      const amount = totals(rs);
      const same = totals(rs.filter((row) => row.sss));
      const brands = group(rs, "brand");
      $("scope-note").textContent = `${{ dtd: "27 Oct 2026 vs 28 Oct 2025", mtd: "1–27 Oct 2026 vs source MTD 2025", ytd: "1 Jan–27 Oct 2026 vs source YTD 2025" }[state.period]} · ${rs.length} reporting units · source same-store flags · closed/converted stores excluded`;
      const traffic = illustrativeTrafficSummary(rs);
      kpis("report-overview-kpis", [
        ["Total Same Store", percentage(growth(same.cy, same.ly)), `Sales ${money(same.cy)} · difference ${money(same.cy - same.ly)}`],
        ["Total ALFA / selected scope", percentage(growth(amount.cy, amount.ly)), `Sales ${money(amount.cy)} · difference ${money(amount.cy - amount.ly)}`],
        ["Budget", money(amount.budget), "From source comparison sheet"],
        ["Budget variance", money(amount.budget === null ? null : amount.cy - amount.budget), "Current sales minus source budget"],
        ["Transactions", rs.length ? traffic.transactions.toLocaleString("en-GB") : "N/A", "Illustrative · selected period and filters"],
        ["Average check", money(traffic.check), "Illustrative · positive sales / assumed transactions"],
      ]);
      const mix = [
        { label: "Dine-in & takeaway (combined)", current: amount.nonDelivery, prior: amount.nonDeliveryLy },
        { label: "Reported delivery", current: amount.delivery, prior: amount.deliveryLy },
      ];
      table("report-channel-table", ["Channel", "Sales", "% of total revenue"], rs.length ? [
        ...mix.map((row) => [row.label, money(row.current), share(row.current, amount.cy)]),
        ["Total", money(amount.cy), share(amount.cy, amount.cy)],
        ["Separate dine-in", "N/A", "N/A"], ["Separate takeout", "N/A", "N/A"],
      ] : []);
      const financial = brands.map((row) => financeRecord(row.name, row));
      const sameBrands = group(rs.filter((row) => row.sss), "brand").map((row) => financeRecord(`${row.name} · same-store`, row));
      table("report-finance", financeHeaders, rs.length ? [...sameBrands, ...financial, financeRecord("Total Same Store", same), financeRecord("Total selected scope", amount)] : []);
      table("report-brand-penetration", penetrationHeaders, brands.map((row) => penetrationRecord(row.name, row)));
      renderStoreTables(rs);
      renderMenu();
      const showChannels = state.period === "mtd" && state.region === "all" && state.brand === "all" && state.basis === "all";
      if (showChannels) {
        const pickup = data.channels.filter((row) => /pickup/i.test(row.label)).reduce((n, row) => n + row.current, 0);
        const deliveryOnly = data.deliveryTotal.cy - pickup;
        table("report-vendor-table", ["Order type", "This year", "Last year", "% of source delivery/pickup pool"], [
          ...data.channels.map((row) => [row.label, money(row.current), money(row.prior), share(row.current, data.deliveryTotal.cy)]),
          ["Total source pool (includes pickup)", money(data.deliveryTotal.cy), money(data.deliveryTotal.ly), "100.0%"],
          ["Delivered only (excludes pickup)", money(deliveryOnly), "See source order types", share(deliveryOnly, data.deliveryTotal.cy)],
        ]);
        const alfred = alfredDeliveryMetrics(root.AlfaOctoberDaily.delivery);
        $("report-delivery-reconciliation").textContent = `Source definitions: Alfred October delivery is ${money(alfred.mtd)} versus validated order-type revenue ${money(data.deliveryTotal.cy)}: difference ${money(alfred.mtd - data.deliveryTotal.cy)}. Alfred virtual-brand totals use their own source coverage and are not added to physical-brand totals. Validated current-year order types reconcile to reported delivery. Pickup is ${money(pickup)}; delivered-only sales are ${money(deliveryOnly)} (${share(deliveryOnly, amount.cy)} of company revenue). Prior-year order-type total is ${money(data.deliveryTotal.ly)}, versus ${money(data.periods.mtd.summary.deliveryLy)} in the revenue workbook: difference ${money(data.deliveryTotal.ly - data.periods.mtd.summary.deliveryLy)}. These source definitions are not interchangeable; no amounts are rescaled.`;
      } else {
        unavailable("report-vendor-table", "a matched order-type breakdown is not loaded for this scope.");
        $("report-delivery-reconciliation").textContent = "Alfred panels above remain fixed company-wide January–October / October MTD, like the reference page; global filters apply only to the validated revenue-category and penetration tables. Validated order types are available for unfiltered company MTD only. No filtered allocation is substituted. Alfred and validated delivery definitions are not interchangeable; pickup is identified in the validated order-type table.";
      }
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
  root.AlfaReportView = { create, illustrativeBrandTrend, illustrativeTraffic, illustrativeTrafficSummary, illustrativeMenu, illustrativeSeatHour, illustrativeAdjustments, alfredMetrics, alfredStoreMetrics, alfredDeliveryMetrics, alfredMenuMetrics, alfredBriefMetrics, presentationGaps };
})(typeof window === "undefined" ? globalThis : window);
