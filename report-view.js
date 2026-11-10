(function (root) {
  "use strict";
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
  function create(data, state) {
    const $ = (id) => document.getElementById(id);
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
    const card = (title, id, note = "", classes = "") =>
      `<article class="card ceo-full-card ${classes}"><div class="card-head"><h2>${escape(title)}</h2></div><div id="${id}"></div>${note ? `<p class="ceo-chart-note">${escape(note)}</p>` : ""}</article>`;
    const table = (id, headers, records, sorting = null) => {
      $(id).innerHTML = records.length
        ? `<div class="table-wrap"><table class="ceo-data-table"><thead><tr>${headers.map((h, index) => sorting
          ? `<th scope="col" aria-sort="${sorting.column === index ? sorting.ascending ? "ascending" : "descending" : "none"}"><button type="button" data-sort-column="${index}" aria-label="Sort by ${escape(h)}">${escape(h)}</button></th>`
          : `<th scope="col">${escape(h)}</th>`).join("")}</tr></thead><tbody>${records.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
        : '<div class="empty">No records match the selected filters.</div>';
      if (sorting) $(id).querySelectorAll("[data-sort-column]").forEach((button) => {
        button.onclick = () => sorting.onSort(Number(button.dataset.sortColumn));
      });
    };
    const unavailable = (id, message) => { $(id).innerHTML = `<div class="empty">N/A — ${escape(message)}</div>`; };
    const kpis = (id, cards) => {
      $(id).innerHTML = cards.map(([label, value, detail]) =>
        `<article class="kpi"><div class="kpi-top">${escape(label)}</div><div class="kpi-value">${escape(value)}</div><div class="kpi-bottom">${escape(detail)}</div></article>`).join("");
    };
    function bars(id, items, percent = false, illustrative = false) {
      chartInstances.get(id)?.destroy();
      chartInstances.delete(id);
      if (!items.length) return unavailable(id, "no comparable records for this selection.");
      const colors = percent ? items.map((item) => item.current >= 0 ? "#168565" : item.current >= -5 ? "#b67d22" : "#d05c64") : "#4478ed";
      const translucent = (color) => Array.isArray(color) ? color.map((c) => `${c}80`) : `${color}80`;
      const datasets = [{
        label: percent ? "Change vs LY" : illustrative ? "Illustrative CY daily split" : "This year",
        data: items.map((item) => item.current),
        backgroundColor: translucent(colors), borderColor: colors, borderWidth: 1, maxBarThickness: 42,
      }];
      if (!percent) datasets.push({
        label: illustrative ? "Illustrative LY daily split" : "Last year", data: items.map((item) => item.prior),
        backgroundColor: "#d05c6480", borderColor: "#d05c64", borderWidth: 1, maxBarThickness: 42,
      });
      $(id).innerHTML = `<div style="max-width:100%;overflow:auto" tabindex="0" role="region" aria-label="Scroll chart categories"><div style="position:relative;height:320px;min-width:${Math.max(260, items.length * 72)}px"><canvas tabindex="0" role="img" aria-label="${escape($(id).closest("article").querySelector("h2").textContent)}"></canvas></div></div>`;
      const chart = new Chart($(id).querySelector("canvas"), {
        type: "bar",
        data: { labels: items.map((item) => item.label), datasets },
        options: {
          indexAxis: "x", responsive: true, maintainAspectRatio: false, animation: false,
          scales: {
            x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, font: { size: 10 }, callback: (v) => items[v].label.length > 22 ? `${items[v].label.slice(0, 20)}…` : items[v].label } },
            y: { beginAtZero: true, ticks: { callback: (v) => percent ? `${v}%` : new Intl.NumberFormat("en", { notation: "compact" }).format(v) } },
          },
          plugins: {
            legend: { display: !percent, position: "top" },
            tooltip: { callbacks: { title: (contexts) => items[contexts[0].dataIndex].label, label: (context) => `${context.dataset.label}: ${percent ? percentage(context.parsed.y) : money(context.parsed.y)}` } },
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
    $("overview").innerHTML = `<div class="notice">Imported report data · 27 Oct 2026. Transactions, average check, menu costs and branch GPS are not supplied by the mapped comparison sheets. Reported totals use no sample values; only the separately labeled Brand daily trends use illustrative daily splits. Hybrid brand halves are counted once; their physical-site totals are excluded.</div><div class="kpis" id="report-overview-kpis"></div>
      <div class="ceo-grid ceo-graph-view">${card("Sales by brand", "report-overview-sales")}${card("Regional performance", "report-region")}</div>
      <div class="ceo-grid ceo-graph-view">${card("Top 5 branches by % change", "report-top", "Same-store only; highest comparable growth first.")}${card("Worst 5 branches by % change", "report-worst", "Same-store only; lowest comparable growth first.")}</div>
      ${card("Branches on the map", "report-map", "", "ceo-graph-view")}
      ${card("Same-store growth by brand", "report-brand-growth", "", "ceo-graph-view")}
      ${card("Sales by source", "report-source", "The revenue comparison groups dine-in and takeaway together. Reported delivery follows the workbook definition.", "ceo-graph-view")}
      ${card("Same Store · brand · company", "report-finance")}
      ${card("Daily sales and traffic × check", "report-trends")}`;
    $("brands").innerHTML = `<div class="kpis" id="report-brand-kpis"></div><div class="ceo-grid ceo-graph-view">${card("Sales by brand", "report-brand-sales")}${card("Same-store growth by brand", "report-brand-changes")}</div>${card("Brand performance", "report-brand-table")}${card("Brand daily trends", "report-brand-trends")}`;
    $("stores").innerHTML = `<div class="kpis" id="report-store-kpis"></div>${card("Same-store sales", "report-store-chart", "Up to 10 comparable stores; lowest growth first. Search and filters apply.", "ceo-graph-view")}<article class="card"><div class="table-head"><h2>Store league table</h2><input class="search" id="report-store-search" type="search" aria-label="Search stores" placeholder="Search stores or brands…"></div><div id="report-store-table" style="max-height:620px;overflow:auto"></div></article>${card("Traffic × check", "report-store-traffic")}`;
    $("delivery").innerHTML = `<div class="notice">Revenue and delivery reports use different definitions. The revenue workbook's reported delivery category is retained unchanged for store/brand reconciliation. The MTD order-type report includes ALFA Online Pickup; this is shown separately and is not described as delivered revenue. Separate dine-in/takeout data is N/A. No proportional allocations are used.</div><div class="kpis" id="report-delivery-kpis"></div>
      ${card("Sales channel mix", "report-channel-chart", "Reported revenue categories; dine-in and takeaway cannot be separated from these comparison sheets.", "ceo-graph-view")}
      ${card("Sales channel mix — sales and share", "report-channel-table")}
      ${card("Delivery order types — MTD source report", "report-vendor-chart", "Unfiltered company MTD report only. No allocations to periods, brands or stores.", "ceo-graph-view")}
      ${card("Delivery order types — source figures", "report-vendor-table")}
      <div class="notice" id="report-delivery-reconciliation"></div>
      ${card("Delivery penetration by brand", "report-brand-penetration", "Reported delivery definition; pickup-free penetration by brand is N/A until matched branch/order-type data is mapped.")}
      <article class="card ceo-full-card"><div class="table-head"><h2>Delivery penetration by store</h2><input class="search" id="report-delivery-search" type="search" aria-label="Search delivery stores" placeholder="Search stores or brands…"></div><div id="report-store-penetration" style="max-height:520px;overflow:auto"></div></article>
      ${card("Commission", "report-commission")}`;
    $("menu").innerHTML = '<div class="notice">N/A — item-level sales, quantities and recipe costs are not mapped from these reports. Simulated menu results have been removed.</div>';
    document.querySelectorAll(".ceo-card-tag").forEach((tag) => { if (/sample|simulat/i.test(tag.textContent)) tag.remove(); });
    document.querySelector(".date-pill").textContent = "As of 27 Oct 2026 · imported reports";
    document.querySelector('[data-period="dtd"]').textContent = "27 Oct 2026";
    const headerTag = document.querySelector(".header-right .tag, .topbar .tag, .topbar .badge");
    if (headerTag) headerTag.textContent = "JSON REPORT DATA";
    document.querySelectorAll("body *").forEach((el) => {
      if (el.children.length === 0 && el.textContent.trim() === "SAMPLE DATA") el.textContent = "JSON REPORT DATA";
    });
    document.querySelector("main.content > footer").textContent = "Source: imported October 2026 reports in json_data. Not a live feed. Reported totals preserve source definitions. Brand daily trends are illustrative splits of actual MTD totals, not actual daily sales; other unavailable metrics are shown as N/A.";
    $("brand").replaceChildren(new Option("All brands", "all"), ...[...new Set(data.periods.mtd.stores.map((row) => row.brand))].sort().map((name) => new Option(name, name)));
    $("region").replaceChildren(new Option("All regions", "all"), ...[...new Set(data.periods.mtd.stores.map((row) => row.region))].sort().map((name) => new Option(name, name)));
    let storeQuery = "";
    let deliveryQuery = "";
    let sortColumn = 4;
    let sortAscending = true;
    function renderStoreTables(rs) {
      const matches = (query) => rs.filter((row) => `${row.name} ${row.brand}`.toLowerCase().includes(query.toLowerCase()));
      const matching = matches(storeQuery).sort((a, b) => (growth(a.cy, a.ly) ?? Infinity) - (growth(b.cy, b.ly) ?? Infinity) || a.name.localeCompare(b.name));
      const sortValues = (row) => [row.name, row.cy, row.ly, row.cy - row.ly, growth(row.cy, row.ly), row.budget,
        row.budget === null ? null : row.cy - row.budget, row.brand, row.region, row.sss ? "Same-store" : "Non-comparable",
        row.cy > 0 ? row.delivery / row.cy : null];
      const sorted = [...matching].sort((a, b) => {
        const left = sortValues(a)[sortColumn];
        const right = sortValues(b)[sortColumn];
        if (left === null || right === null) return left === right ? a.name.localeCompare(b.name) : left === null ? 1 : -1;
        const comparison = typeof left === "number" ? left - right : left.localeCompare(right);
        return (sortAscending ? comparison : -comparison) || a.name.localeCompare(b.name);
      });
      table("report-store-table", [...financeHeaders, "Brand", "Region", "Basis", "Reported delivery %"],
        sorted.map((row) => [...financeRecord(row.name, row), row.brand, row.region, row.sss ? "Same-store" : "Non-comparable", share(row.delivery, row.cy)]),
        { column: sortColumn, ascending: sortAscending, onSort: (column) => {
          sortAscending = column === sortColumn ? !sortAscending : true;
          sortColumn = column;
          renderStoreTables(filtered());
        } });
      bars("report-store-chart", matching.filter((row) => row.sss && row.ly > 0).slice(0, 10).map((row) => ({ label: row.name, current: row.cy, prior: row.ly })));
      table("report-store-penetration", penetrationHeaders, matches(deliveryQuery).map((row) => penetrationRecord(`${row.name} · ${row.brand}`, row)));
    }
    $("report-store-search").oninput = (event) => { storeQuery = event.target.value; renderStoreTables(filtered()); };
    $("report-delivery-search").oninput = (event) => { deliveryQuery = event.target.value; renderStoreTables(filtered()); };
    function renderBrandTrends() {
      for (const [id, chart] of chartInstances) {
        if (id.startsWith("report-brand-daily-")) {
          chart.destroy();
          chartInstances.delete(id);
        }
      }
      const mtdBrands = group(filtered("mtd"), "brand");
      $("report-brand-trends").innerHTML = `<div class="notice"><strong>ILLUSTRATIVE — not actual daily sales.</strong> Actual daily series are not mapped. These sample splits cover 1–27 Oct 2026 and reconcile to each brand's actual MTD CY and source LY totals, rounded to SAR 0.01. The same illustrative shape is used for both years; daily movements are not evidence of performance. Brand, region and store-basis filters apply. This panel always shows MTD, regardless of the global period.</div><div class="ceo-grid" id="report-brand-daily-grid"></div>`;
      if (!mtdBrands.length) {
        $("report-brand-daily-grid").innerHTML = '<div class="empty">No records match the selected filters. No sample values are generated without MTD totals.</div>';
        return;
      }
      $("report-brand-daily-grid").innerHTML = mtdBrands.map((brand, index) =>
        card(`${brand.name} · illustrative daily sales`, `report-brand-daily-${index}`, `Actual MTD totals: CY ${money(brand.cy)} · LY ${money(brand.ly)}. Daily values are illustrative, not reported.`, "ceo-graph-view") +
        card(`${brand.name} · illustrative daily values`, `report-brand-daily-table-${index}`, "Sample daily splits, not actual daily sales.", "ceo-table-view")).join("");
      mtdBrands.forEach((brand, index) => {
        const days = illustrativeBrandTrend(brand.name, brand.cy, brand.ly);
        bars(`report-brand-daily-${index}`, days, false, true);
        table(`report-brand-daily-table-${index}`, ["October day", "Illustrative CY", "Illustrative LY"], [
          ...days.map((day) => [day.label, money(day.current), money(day.prior)]),
          ["Actual MTD total (rounded)", money(brand.cy), money(brand.ly)],
        ]);
      });
    }
    function render() {
      const rs = filtered();
      const amount = totals(rs);
      const same = totals(rs.filter((row) => row.sss));
      const brands = group(rs, "brand");
      const comparable = rs.filter((row) => row.sss && row.ly > 0).map((row) => ({ label: row.name, current: growth(row.cy, row.ly) }));
      const brandChanges = group(rs.filter((row) => row.sss), "brand").filter((row) => row.ly > 0).map((row) => ({ label: row.name, current: growth(row.cy, row.ly) }));
      const comparison = brands.map((row) => ({ label: row.name, current: row.cy, prior: row.ly }));
      $("scope-note").textContent = `${{ dtd: "27 Oct 2026 vs 28 Oct 2025", mtd: "1–27 Oct 2026 vs source MTD 2025", ytd: "1 Jan–27 Oct 2026 vs source YTD 2025" }[state.period]} · ${rs.length} reporting units · source same-store flags · closed/converted stores excluded`;
      kpis("report-overview-kpis", [
        ["Total Same Store", percentage(growth(same.cy, same.ly)), `Sales ${money(same.cy)} · difference ${money(same.cy - same.ly)}`],
        ["Total ALFA / selected scope", percentage(growth(amount.cy, amount.ly)), `Sales ${money(amount.cy)} · difference ${money(amount.cy - amount.ly)}`],
        ["Budget", money(amount.budget), "From source comparison sheet"],
        ["Budget variance", money(amount.budget === null ? null : amount.cy - amount.budget), "Current sales minus source budget"],
        ["Transactions", "N/A", "Not mapped from source reports"],
        ["Average check", "N/A", "Requires transaction counts"],
      ]);
      bars("report-overview-sales", comparison);
      bars("report-brand-sales", comparison);
      bars("report-region", group(rs, "region").map((row) => ({ label: row.name, current: row.cy, prior: row.ly })));
      bars("report-top", [...comparable].sort((a, b) => b.current - a.current || a.label.localeCompare(b.label)).slice(0, 5), true);
      bars("report-worst", [...comparable].sort((a, b) => a.current - b.current || a.label.localeCompare(b.label)).slice(0, 5), true);
      bars("report-brand-growth", brandChanges, true);
      bars("report-brand-changes", brandChanges, true);
      const mix = [
        { label: "Dine-in & takeaway (combined)", current: amount.nonDelivery, prior: amount.nonDeliveryLy },
        { label: "Reported delivery", current: amount.delivery, prior: amount.deliveryLy },
      ];
      bars("report-source", rs.length ? mix : []);
      bars("report-channel-chart", rs.length ? mix : []);
      table("report-channel-table", ["Channel", "Sales", "% of total revenue"], rs.length ? [
        ...mix.map((row) => [row.label, money(row.current), share(row.current, amount.cy)]),
        ["Total", money(amount.cy), share(amount.cy, amount.cy)],
        ["Separate dine-in", "N/A", "N/A"], ["Separate takeout", "N/A", "N/A"],
      ] : []);
      const financial = brands.map((row) => financeRecord(row.name, row));
      const sameBrands = group(rs.filter((row) => row.sss), "brand").map((row) => financeRecord(`${row.name} · same-store`, row));
      table("report-finance", financeHeaders, rs.length ? [...sameBrands, ...financial, financeRecord("Total Same Store", same), financeRecord("Total selected scope", amount)] : []);
      table("report-brand-table", financeHeaders, rs.length ? [...financial, financeRecord("Total", amount)] : []);
      kpis("report-brand-kpis", [["Brands", String(brands.length), "Source brand mapping"], ["Sales", money(amount.cy), "Selected scope"], ["Growth", percentage(growth(amount.cy, amount.ly)), "Source prior-year comparison"], ["Budget attainment", amount.budget > 0 ? share(amount.cy, amount.budget) : "N/A", "Sales divided by source budget"]]);
      kpis("report-store-kpis", [["Reporting units", String(rs.length), "Includes hybrid brand halves, not duplicate sites"], ["Same-store", String(rs.filter((row) => row.sss).length), "Source SSS flags"], ["Sales", money(amount.cy), "Selected period"], ["Growth", percentage(growth(amount.cy, amount.ly)), "vs source prior year"]]);
      kpis("report-delivery-kpis", [["Reported delivery sales", money(amount.delivery), "Workbook category; see definition below"], ["Reported delivery share", share(amount.delivery, amount.cy), "Of total selected revenue"], ["Last year reported delivery", money(amount.deliveryLy), "Revenue workbook comparison"], ["Dine-in & takeaway", money(amount.nonDelivery), "Source combined category"]]);
      table("report-brand-penetration", penetrationHeaders, brands.map((row) => penetrationRecord(row.name, row)));
      renderStoreTables(rs);
      const showChannels = state.period === "mtd" && state.region === "all" && state.brand === "all" && state.basis === "all";
      if (showChannels) {
        bars("report-vendor-chart", data.channels);
        const pickup = data.channels.filter((row) => /pickup/i.test(row.label)).reduce((n, row) => n + row.current, 0);
        const deliveryOnly = data.deliveryTotal.cy - pickup;
        table("report-vendor-table", ["Order type", "This year", "Last year", "% of source delivery/pickup pool"], [
          ...data.channels.map((row) => [row.label, money(row.current), money(row.prior), share(row.current, data.deliveryTotal.cy)]),
          ["Total source pool (includes pickup)", money(data.deliveryTotal.cy), money(data.deliveryTotal.ly), "100.0%"],
          ["Delivered only (excludes pickup)", money(deliveryOnly), "See source order types", share(deliveryOnly, data.deliveryTotal.cy)],
        ]);
        $("report-delivery-reconciliation").textContent = `MTD reconciliation: current-year order types reconcile to reported delivery. Pickup is ${money(pickup)}; delivered-only sales are ${money(deliveryOnly)} (${share(deliveryOnly, amount.cy)} of company revenue). Prior-year order-type total is ${money(data.deliveryTotal.ly)}, versus ${money(data.periods.mtd.summary.deliveryLy)} in the revenue workbook: difference ${money(data.deliveryTotal.ly - data.periods.mtd.summary.deliveryLy)}. These prior-year definitions are not interchangeable.`;
      } else {
        chartInstances.get("report-vendor-chart")?.destroy();
        chartInstances.delete("report-vendor-chart");
        unavailable("report-vendor-chart", "order-type summary is company MTD only. Select MTD, all brands, all regions and all stores.");
        unavailable("report-vendor-table", "a matched order-type breakdown is not loaded for this scope.");
        $("report-delivery-reconciliation").textContent = "Order-type breakdown is available for company MTD only. No sample split is substituted for filtered or other-period views.";
      }
      unavailable("report-map", "exact branch coordinates are not supplied; illustrative locations have been removed.");
      unavailable("report-trends", "daily series and transaction counts are not mapped in this integration. Period totals above are sourced, not simulated.");
      renderBrandTrends();
      unavailable("report-store-traffic", "transaction counts and average checks are not mapped from source reports.");
      unavailable("report-commission", "contract commission rates are not supplied.");
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
    }
    return { render, navigate };
  }
  root.AlfaReportView = { create, illustrativeBrandTrend };
})(typeof window === "undefined" ? globalThis : window);
