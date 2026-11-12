(function (root) {
"use strict";
const C = { muted: "#718096", good: "#168565", warn: "#e5b83d", serious: "#eb6834", crit: "#b82b35", land: "#eef1eb", axis: "#cbd5e1", ink2: "#516079", ink: "#172338", surface: "#ffffff" };
        const KSA = [
          [34.95, 29.36],
          [36.07, 29.19],
          [37.5, 29.99],
          [38, 30.5],
          [37, 31.5],
          [39, 32],
          [40.4, 31.95],
          [42.08, 31.1],
          [44.71, 29.18],
          [46.57, 29.1],
          [47.7, 28.53],
          [48.42, 28.55],
          [48.8, 27.69],
          [49.3, 27.45],
          [49.57, 26.9],
          [50.12, 26.66],
          [50.21, 26.28],
          [50.1, 25.95],
          [50.24, 25.61],
          [50.53, 25.33],
          [50.81, 24.75],
          [51.11, 24.56],
          [51.58, 24.25],
          [52, 23],
          [55, 22.7],
          [55.67, 22],
          [55, 20],
          [52, 19],
          [49.12, 18.62],
          [48.18, 18.17],
          [47.47, 17.12],
          [46.75, 17.28],
          [46.37, 17.23],
          [45.4, 17.33],
          [45.21, 17.43],
          [44.06, 17.41],
          [43.79, 17.32],
          [43.38, 17.58],
          [43.12, 17.09],
          [42.78, 16.35],
          [42.65, 16.77],
          [42.35, 17.08],
          [42.27, 17.47],
          [41.75, 17.83],
          [41.22, 18.67],
          [40.94, 19.49],
          [40.25, 20.17],
          [39.8, 20.34],
          [39.14, 21.29],
          [39.02, 21.99],
          [39.07, 22.58],
          [38.49, 23.69],
          [38.02, 24.08],
          [37.48, 24.29],
          [37.15, 24.86],
          [37.21, 25.08],
          [36.93, 25.6],
          [36.64, 25.83],
          [36.25, 26.57],
          [35.64, 27.38],
          [35.13, 28.06],
          [34.63, 28.06],
          [34.79, 28.61],
          [34.95, 29.36],
        ];
        const VIEWS = {
          ksa: [34.3, 55.9, 16.2, 32.3],
          riyadh: [46.5, 46.9, 24.55, 24.92],
          jeddah: [38.98, 39.32, 21.3, 21.86],
          eastern: [49.4, 50.4, 25.3, 27.25],
        };
        const CITIES = [
          ["Riyadh", 46.71, 24.71],
          ["Jeddah", 39.17, 21.54],
          ["Makkah", 39.83, 21.42],
          ["Madinah", 39.61, 24.47],
          ["Dammam", 50.1, 26.43],
          ["Khobar", 50.2, 26.28],
          ["Jubail", 49.66, 27.0],
          ["Al Ahsa", 49.59, 25.38],
          ["Tabuk", 36.57, 28.38],
          ["Buraydah", 43.97, 26.33],
          ["KAEC", 39.09, 22.4],
          ["Al Kharj", 47.33, 24.15],
        ];
        const HEAT = ["#fff3b0", "#fdc76e", "#f78f4b", "#e0533a", "#a8202a"];
        function hexToRgb(h) {
          h = h.replace("#", "");
          return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16),
          ];
        }
        const HEATRGB = HEAT.map(hexToRgb);
        function rampAt(t) {
          t = Math.max(0, Math.min(1, t)) * (HEATRGB.length - 1);
          const i = Math.min(HEATRGB.length - 2, Math.floor(t)),
            f = t - i;
          return HEATRGB[i].map((v, k) =>
            Math.round(v + (HEATRGB[i + 1][k] - v) * f),
          );
        }
        function growthColor(x) {
          if (x == null) return C.muted;
          return x >= 0.05
            ? C.good
            : x >= 0
              ? "#7cc47c"
              : x >= -0.05
                ? C.warn
                : x >= -0.15
                  ? C.serious
                  : C.crit;
        }
        function budColor(x) {
          if (x == null) return C.muted;
          return x >= 1
            ? C.good
            : x >= 0.95
              ? "#7cc47c"
              : x >= 0.9
                ? C.warn
                : x >= 0.8
                  ? C.serious
                  : C.crit;
        }
        function drawMap(id, pts, o) {
          const wrap = document.getElementById(id);
          if (!wrap) return;
          let cv = wrap.querySelector("canvas"),
            tip = wrap.querySelector(".maptip");
          if (!cv) {
            cv = document.createElement("canvas");
            wrap.appendChild(cv);
            tip = document.createElement("div");
            tip.className = "maptip";
            tip.hidden = true;
            wrap.appendChild(tip);
          }
          const W = wrap.clientWidth,
            H = wrap.clientHeight;
          if (!W) return;
          const dpr = window.devicePixelRatio || 1;
          cv.width = W * dpr;
          cv.height = H * dpr;
          cv.style.width = W + "px";
          cv.style.height = H + "px";
          const g = cv.getContext("2d");
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.clearRect(0, 0, W, H);
          const [x0, x1, y0, y1] = VIEWS[o.view || "ksa"],
            k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
          const s = Math.min((W - 28) / ((x1 - x0) * k), (H - 28) / (y1 - y0)),
            ox = (W - (x1 - x0) * k * s) / 2,
            oy = (H - (y1 - y0) * s) / 2;
          const P = (lng, lat) => [
            ox + (lng - x0) * k * s,
            oy + (y1 - lat) * s,
          ];
          g.beginPath();
          KSA.forEach(([a, b], i) => {
            const [x, y] = P(a, b);
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          });
          g.closePath();
          g.fillStyle = C.land;
          g.fill();
          g.strokeStyle = C.axis;
          g.lineWidth = 1;
          g.stroke();
          const zoom = o.view && o.view !== "ksa";
          const Q = pts
            .filter((p) => p.lat)
            .map((p) => ({ ...p, xy: P(p.lng, p.lat) }))
            .filter(
              (q) =>
                q.xy[0] > -40 &&
                q.xy[0] < W + 40 &&
                q.xy[1] > -40 &&
                q.xy[1] < H + 40,
            );
          const vmax = Math.max(1, ...Q.map((q) => q.v || 0));
          const R = zoom ? 46 : o.city ? 34 : 24;
          if (o.heat !== false && Q.length) {
            const oc = document.createElement("canvas");
            oc.width = W;
            oc.height = H;
            const og = oc.getContext("2d");
            if (o.additive) {
              Q.forEach((q) => {
                const a = Math.min(1, Math.sqrt((q.v || 0) / vmax)) * 0.9;
                const rg = og.createRadialGradient(
                  q.xy[0],
                  q.xy[1],
                  0,
                  q.xy[0],
                  q.xy[1],
                  R,
                );
                rg.addColorStop(0, `rgba(0,0,0,${a})`);
                rg.addColorStop(1, "rgba(0,0,0,0)");
                og.fillStyle = rg;
                og.fillRect(q.xy[0] - R, q.xy[1] - R, 2 * R, 2 * R);
              });
              const im = og.getImageData(0, 0, W, H),
                d = im.data;
              for (let i = 0; i < d.length; i += 4) {
                const A = d[i + 3];
                if (!A) continue;
                const [r, gg, b] = rampAt(A / 255);
                d[i] = r;
                d[i + 1] = gg;
                d[i + 2] = b;
                d[i + 3] = Math.min(235, A * 1.35);
              }
              og.putImageData(im, 0, 0);
            } else {
              Q.forEach((q) => {
                const col = hexToRgb(o.color(q));
                const rg = og.createRadialGradient(
                  q.xy[0],
                  q.xy[1],
                  0,
                  q.xy[0],
                  q.xy[1],
                  R * 0.8,
                );
                rg.addColorStop(0, `rgba(${col},0.55)`);
                rg.addColorStop(1, `rgba(${col},0)`);
                og.fillStyle = rg;
                og.fillRect(q.xy[0] - R, q.xy[1] - R, 2 * R, 2 * R);
              });
            }
            g.drawImage(oc, 0, 0, W, H);
          }
          g.font = "11px system-ui";
          g.fillStyle = C.ink2;
          CITIES.forEach(([n, a, b]) => {
            const [x, y] = P(a, b);
            if (x < 4 || x > W - 40 || y < 10 || y > H - 4) return;
            if (!zoom || n.length) {
              g.fillText(n, x + 6, y - 6);
            }
          });
          const sorted = [...Q].sort((a, b) => (b.v || 0) - (a.v || 0));
          sorted.forEach((q) => {
            const r = o.dot
              ? Math.max(3, Math.sqrt((q.v || 0) / vmax) * (o.city ? 22 : 13))
              : 3.2;
            g.beginPath();
            g.arc(q.xy[0], q.xy[1], r, 0, Math.PI * 2);
            g.fillStyle = o.color ? o.color(q) : C.ink;
            g.globalAlpha = o.dot ? 0.85 : 1;
            g.fill();
            g.globalAlpha = 1;
            g.lineWidth = 1.2;
            g.strokeStyle = C.surface;
            g.stroke();
          });
          cv.onmousemove = (e) => {
            const rc = cv.getBoundingClientRect(),
              mx = e.clientX - rc.left,
              my = e.clientY - rc.top;
            const near = Q.filter(
              (q) => Math.hypot(q.xy[0] - mx, q.xy[1] - my) < 12,
            ).sort((a, b) => (b.v || 0) - (a.v || 0));
            if (!near.length) {
              tip.hidden = true;
              return;
            }
            tip.innerHTML =
              near
                .slice(0, 5)
                .map(o.tip)
                .join(
                  '<hr style="border:0;border-top:1px solid rgba(127,127,127,.4);margin:4px 0">',
                ) +
              (near.length > 5
                ? `<div>+${near.length - 5} more here</div>`
                : "");
            tip.hidden = false;
            const tx = Math.min(mx + 12, W - 270),
              ty = Math.min(my + 12, H - tip.offsetHeight - 6);
            tip.style.left = Math.max(4, tx) + "px";
            tip.style.top = Math.max(4, ty) + "px";
          };
          cv.onmouseleave = () => (tip.hidden = true);
        }
        function legend(id, kind) {
          const el = document.getElementById(id);
          if (!el) return;
          if (kind === "heat")
            el.innerHTML = `<span>less</span><span class="ramp" style="background:linear-gradient(90deg,${HEAT.join(",")})"></span><span>more</span>`;
          else if (kind === "growth")
            el.innerHTML = [
              [C.crit, "< −15%"],
              [C.serious, "−15 to −5%"],
              [C.warn, "−5 to 0%"],
              ["#7cc47c", "0 to +5%"],
              [C.good, "> +5%"],
            ]
              .map(
                ([c, t]) =>
                  `<span><span class="ico" style="background:${c};width:10px;height:10px"></span> ${t}</span>`,
              )
              .join("");
          else
            el.innerHTML =
              [
                [C.crit, "< 80%"],
                [C.serious, "80–90%"],
                [C.warn, "90–95%"],
                ["#7cc47c", "95–100%"],
                [C.good, "≥ 100%"],
              ]
                .map(
                  ([c, t]) =>
                    `<span><span class="ico" style="background:${c};width:10px;height:10px"></span> ${t}</span>`,
                )
                .join("") + "<span>of budget</span>";
        }

let googleMapsRequest = null;
function loadGoogleMaps(key, onAuthError) {
  if (!key.trim()) return Promise.reject(new Error("Enter a restricted Google Maps browser API key."));
  if (googleMapsRequest) return googleMapsRequest;
  googleMapsRequest = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const callback = "alfaGoogleMapsReady";
    const previousAuthFailure = root.gm_authFailure;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete root[callback];
      if (error) {
        script.remove();
        root.gm_authFailure = previousAuthFailure;
        googleMapsRequest = null;
        root.gm_authFailure = previousAuthFailure;
        reject(error);
      } else resolve(root.google.maps);
    };
    root.gm_authFailure = () => {
      const error = new Error("Google Maps authorization failed. Check API enablement, billing and HTTP-referrer restrictions.");
      googleMapsRequest = null;
      if (!settled) finish(error);
      onAuthError(error);
      if (typeof previousAuthFailure === "function") previousAuthFailure();
    };
    root[callback] = () => {
      if (!root.google?.maps?.Map || !root.google?.maps?.marker?.AdvancedMarkerElement) {
        finish(new Error("Google Maps did not provide the required map and marker libraries."));
        return;
      }
      finish();
    };
    const timer = setTimeout(() => finish(new Error("Google Maps loading timed out. Check your connection and blocked requests.")), 20000);
    const url = new URL("https://maps.googleapis.com/maps/api/js");
    url.searchParams.set("key", key.trim());
    url.searchParams.set("callback", callback);
    url.searchParams.set("libraries", "marker");
    url.searchParams.set("loading", "async");
    url.searchParams.set("v", "weekly");
    script.src = url.href;
    script.async = true;
    script.onerror = () => finish(new Error("Google Maps could not be loaded. Check your connection or content-security policy."));
    document.head.append(script);
  });
  return googleMapsRequest;
}
function pointsInView(points, view) {
  if (!VIEWS[view]) throw new Error(`Unknown map area: ${view}`);
  if (view === "ksa") return points;
  const [west, east, south, north] = VIEWS[view];
  return points.filter((point) => point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north);
}
function createGoogleMap(element, maps) {
  const map = new maps.Map(element, {
    center: { lat: 23.8859, lng: 45.0792 }, zoom: 6,
    mapId: root.AlfaMapsConfig?.mapId?.trim() || "DEMO_MAP_ID", mapTypeControl: false, streetViewControl: false,
    fullscreenControl: true, zoomControl: true, gestureHandling: "cooperative",
  });
  const info = new maps.InfoWindow();
  let markers = [], currentPoints = [], describe, onInspect;
  let heatMetric = "revenue";
  const heat = new maps.OverlayView();
  let heatCanvas = null;
  heat.onAdd = () => {
    heatCanvas = document.createElement("canvas");
    heatCanvas.style.position = "absolute";
    heatCanvas.style.pointerEvents = "none";
    heatCanvas.setAttribute("aria-hidden", "true");
    heat.getPanes().overlayLayer.appendChild(heatCanvas);
  };
  heat.draw = () => {
    if (!heatCanvas) return;
    const bounds = map.getBounds(), projection = heat.getProjection();
    if (!bounds || !projection) return;
    const origin = projection.fromLatLngToDivPixel(new maps.LatLng(bounds.getNorthEast().lat(), bounds.getSouthWest().lng()));
    const width = element.clientWidth, height = element.clientHeight;
    heatCanvas.width = width; heatCanvas.height = height;
    heatCanvas.style.left = `${origin.x}px`;
    heatCanvas.style.top = `${origin.y}px`;
    const ctx = heatCanvas.getContext("2d");
    if (!width || !height || !["revenue", "guests", "checks"].includes(heatMetric)) return;
    const values = currentPoints.map((point) => Math.max(0, heatMetric === "guests" ? point.g : heatMetric === "checks" ? point.chk : point.cy));
    const max = Math.max(1, ...values), radius = 36;
    currentPoints.forEach((point, index) => {
      if (!values[index]) return;
      const pixel = projection.fromLatLngToDivPixel(new maps.LatLng(point.lat, point.lng));
      const x = pixel.x - origin.x, y = pixel.y - origin.y;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${Math.sqrt(values[index] / max) * 0.65})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
    const image = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < image.data.length; i += 4) {
      const alpha = image.data[i + 3];
      if (!alpha) continue;
      const [r, g, b] = rampAt(alpha / 255);
      image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b;
      image.data[i + 3] = Math.min(180, alpha);
    }
    ctx.putImageData(image, 0, 0);
  };
  heat.onRemove = () => { heatCanvas?.remove(); heatCanvas = null; };
  heat.setMap(map);
  const clear = () => {
    info.close();
    markers.forEach((marker) => {
      maps.event.clearInstanceListeners(marker);
      marker.map = null;
    });
    markers = [];
  };
  const inspect = (point) => {
    const index = currentPoints.indexOf(point);
    if (index < 0) return;
    map.panTo({ lat: point.lat, lng: point.lng });
    info.setContent(describe(point));
    info.open({ map, anchor: markers[index] });
    onInspect(point);
  };
  return {
    element,
    update(points, options) {
      clear();
      currentPoints = pointsInView(points, options.view);
      heatMetric = options.metric;
      describe = options.describe;
      onInspect = options.onInspect;
      markers = currentPoints.map((point) => {
        const color = options.metric === "budget"
          ? budColor(point.bud > 0 ? point.cy / point.bud : null)
          : options.metric === "growth"
            ? growthColor(point.py > 0 ? point.cy / point.py - 1 : null)
            : "#299bb0";
        const pin = new maps.marker.PinElement({
          background: color, borderColor: "#ffffff", glyphColor: "#075577",
          scale: 0.6,
        });
        const marker = new maps.marker.AdvancedMarkerElement({
          map, position: { lat: point.lat, lng: point.lng },
          title: `${point.name} · ${point.brand}`, content: pin.element,
        });
        marker.addListener("click", () => inspect(point));
        return marker;
      });
      const [west, east, south, north] = VIEWS[options.view];
      map.fitBounds({ west, east, south, north }, 24);
      heat.draw();
      return currentPoints;
    },
    inspect,
    resize() { maps.event.trigger(map, "resize"); heat.draw(); },
    destroy() { clear(); heat.setMap(null); maps.event.clearInstanceListeners(map); element.remove(); },
  };
}
root.AlfaSalesMap = { drawMap, legend, growthColor, budColor, loadGoogleMaps, createGoogleMap, pointsInView };
})(globalThis);
