/* N5 MAX results charts — read-only.
 *
 * Every plotted value comes from the JSON that scripts/site/build.py embeds in #n5-data, which is itself a
 * set of lookups into data/sealed-metrics.json. The data is deep-frozen on load. The only interaction is
 * choosing among configurations that were actually tested (regime radios, layout checkboxes). There are
 * no sliders, weights, drag handles or editable fields, and chart click events are disabled.
 *
 * Append ?selftest to the URL to run the audit and print its result into <pre id="n5-selftest">.
 */
(function () {
  "use strict";

  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  var DATA = deepFreeze(JSON.parse(document.getElementById("n5-data").textContent));
  var CHARTS = {};
  var MAX_PICK = 4;
  var PALETTE = ["#1FA6A0", "#E86A2B", "#7c5cd6", "#3b82f6"];
  var READ_ONLY_EVENTS = ["mousemove", "mouseout", "touchstart", "touchmove"]; // no click → nothing to toggle or edit

  function css(v, fb) {
    var s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    return s || fb;
  }

  function fmt(v, unit) {
    if (v === null || v === undefined) return "not plotted";
    var n = Number(v);
    var s = unit === "IOPS" || unit === "s" ? Math.round(n).toLocaleString("en-US") : String(n);
    return s + " " + unit;
  }

  function baseOptions(unit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 300 },
      events: READ_ONLY_EVENTS,
      plugins: {
        legend: { onClick: function () {}, labels: { color: css("--ink-soft", "#333"), font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ": " + fmt(ctx.dataset.n5raw ? ctx.dataset.n5raw[ctx.dataIndex] : ctx.raw, unit);
            },
          },
        },
      },
    };
  }

  function renderStatic(spec) {
    var el = document.getElementById(spec.id);
    if (!el) return;
    var horizontal = !!spec.horizontal;
    var opts = baseOptions(spec.unit);
    var valAxis = {
      type: spec.log ? "logarithmic" : "linear",
      beginAtZero: !spec.log,
      title: { display: true, text: spec.unit, color: css("--muted", "#666") },
      ticks: { color: css("--muted", "#666") },
      grid: { color: css("--line", "#ddd") },
    };
    if (spec.max) valAxis.max = spec.max;
    var catAxis = { ticks: { color: css("--ink-soft", "#333"), font: { size: 12 } }, grid: { display: false } };
    opts.indexAxis = horizontal ? "y" : "x";
    opts.scales = horizontal ? { x: valAxis, y: catAxis } : { x: catAxis, y: valAxis };
    if (spec.type === "line") {
      opts.scales.x.title = { display: true, text: "context depth (tokens)", color: css("--muted", "#666") };
    }
    var chart = new Chart(el, {
      type: spec.type,
      data: {
        labels: spec.labels.slice(),
        datasets: spec.series.map(function (s) {
          return {
            label: s.label,
            data: s.values.slice(),
            backgroundColor: spec.type === "line" ? s.color : s.color + "cc",
            borderColor: s.color,
            borderWidth: spec.type === "line" ? 2 : 0,
            pointRadius: 3,
            spanGaps: false,
          };
        }),
      },
      options: opts,
    });
    CHARTS[spec.id] = { chart: chart, spec: spec };
  }

  // ------------------------------------------------------------ explorer
  var ex = { regime: null, picked: {} };

  function regimeById(id) {
    return DATA.explorer.regimes.filter(function (r) { return r.id === id; })[0];
  }

  function axisMax(regime) {
    var mx = {};
    DATA.explorer.axes.forEach(function (a) {
      var best = null, who = null;
      regime.configs.forEach(function (c) {
        var v = c.values[a.key];
        if (v !== null && (best === null || v > best)) { best = v; who = c.label; }
      });
      mx[a.key] = { v: best, who: who };
    });
    return mx;
  }

  function scaled(config, mx) {
    return DATA.explorer.axes.map(function (a) {
      var v = config.values[a.key];
      return v === null || !mx[a.key].v ? null : v / mx[a.key].v;
    });
  }

  function pickedConfigs() {
    var r = regimeById(ex.regime);
    return r.configs.filter(function (c) { return ex.picked[c.id]; });
  }

  function drawExplorer() {
    var r = regimeById(ex.regime);
    var mx = axisMax(r);
    var picks = pickedConfigs();
    var datasets = picks.map(function (c, i) {
      var col = PALETTE[i % PALETTE.length];
      return {
        label: c.label,
        data: scaled(c, mx),
        n5raw: DATA.explorer.axes.map(function (a) { return c.values[a.key]; }),
        n5id: c.id,
        borderColor: col,
        backgroundColor: col + "26",
        pointBackgroundColor: col,
        borderWidth: 2,
        spanGaps: false,
      };
    });
    var labels = DATA.explorer.axes.map(function (a) { return a.label; });
    var holder = CHARTS["ex-radar"];
    if (holder) {
      holder.chart.data.labels = labels;
      holder.chart.data.datasets = datasets;
      holder.chart.update();
    } else {
      var opts = baseOptions("");
      opts.plugins.tooltip.callbacks.label = function (ctx) {
        var a = DATA.explorer.axes[ctx.dataIndex];
        return ctx.dataset.label + ": " + fmt(ctx.dataset.n5raw[ctx.dataIndex], a.unit);
      };
      opts.scales = {
        r: {
          min: 0, max: 1,
          ticks: { display: false },
          grid: { color: css("--line-strong", "#ccc") },
          angleLines: { color: css("--line-strong", "#ccc") },
          pointLabels: { color: css("--ink-soft", "#333"), font: { size: 13 } },
        },
      };
      CHARTS["ex-radar"] = { chart: new Chart(document.getElementById("ex-radar"), { type: "radar", data: { labels: labels, datasets: datasets }, options: opts }) };
    }
    // absolute values table, same records
    var head = "<tr><th>Layout</th>" + DATA.explorer.axes.map(function (a) { return "<th>" + a.label + "<br><small>" + a.unit + "</small></th>"; }).join("") + "</tr>";
    var best = "<tr class='best'><td>100 % on the chart =</td>" + DATA.explorer.axes.map(function (a) {
      return "<td>" + (mx[a.key].v === null ? "—" : fmt(mx[a.key].v, a.unit) + "<br><small>" + mx[a.key].who + "</small>") + "</td>";
    }).join("") + "</tr>";
    var rows = picks.map(function (c) {
      return "<tr><td>" + c.label + "</td>" + DATA.explorer.axes.map(function (a) {
        var v = c.values[a.key];
        var note = c.notes[a.key];
        return "<td data-src=\"" + c.src[a.key] + "\">" + (v === null ? "<span class='tag ns'>" + (note || "n/a") + "</span>" : fmt(v, a.unit)) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    document.getElementById("ex-table").innerHTML = "<div class='tbl'><table class='data'><thead>" + head + "</thead><tbody>" + rows + best + "</tbody></table></div>";
  }

  function buildConfigList() {
    var r = regimeById(ex.regime);
    var host = document.getElementById("ex-configs");
    host.innerHTML = "";
    r.configs.forEach(function (c) {
      var lab = document.createElement("label");
      lab.className = "ex-opt";
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.value = c.id;
      inp.checked = !!ex.picked[c.id];
      inp.addEventListener("change", function () {
        if (inp.checked) ex.picked[c.id] = true; else delete ex.picked[c.id];
        syncLimits();
        drawExplorer();
      });
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(" " + c.label));
      host.appendChild(lab);
    });
    syncLimits();
  }

  function syncLimits() {
    var n = pickedConfigs().length;
    document.querySelectorAll("#ex-configs input").forEach(function (i) { i.disabled = !i.checked && n >= MAX_PICK; });
  }

  var DEFAULT_PICKS = {
    cold: ["stage1-raidz1-full", "stage1-raid10-full", "stage2-raidz2-full", "stage5-btrfs-raid5-full"],
    metadata: ["stage2-raidz1-full", "stage1-raid10-full", "stage2-raidz2-full"],
    warm: ["stage5-btrfs-raid5-full", "stage5-mdadm-ext4-raid5-full"],
  };

  function setRegime(id) {
    ex.regime = id;
    ex.picked = {};
    (DEFAULT_PICKS[id] || []).forEach(function (lf) { ex.picked[id + ":" + lf] = true; });
    buildConfigList();
    drawExplorer();
  }

  function buildExplorer() {
    var host = document.getElementById("ex-regimes");
    if (!host) return;
    DATA.explorer.regimes.forEach(function (r, i) {
      var lab = document.createElement("label");
      lab.className = "ex-opt";
      var inp = document.createElement("input");
      inp.type = "radio";
      inp.name = "ex-regime";
      inp.value = r.id;
      inp.checked = i === 0;
      inp.addEventListener("change", function () { if (inp.checked) setRegime(r.id); });
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(" " + r.label));
      host.appendChild(lab);
    });
    setRegime(DATA.explorer.regimes[0].id);
  }

  // ------------------------------------------------------------ audit (?selftest)
  function near(a, b) {
    if (a === null || b === null || a === undefined || b === undefined) return a === b || (a == null && b == null);
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  }

  function audit() {
    var fails = [];
    var checked = { static_points: 0, explorer_configs: 0, explorer_points: 0 };
    // 1. no control on the page can carry a free value
    document.querySelectorAll("input, select, textarea, [contenteditable]").forEach(function (el) {
      var t = (el.getAttribute("type") || "").toLowerCase();
      var ok = el.tagName === "INPUT" && (t === "radio" || t === "checkbox") && el.closest("#explorer");
      if (!ok) fails.push("free-value control: <" + el.tagName.toLowerCase() + " type=" + t + ">");
    });
    // 2. embedded data is frozen
    if (!Object.isFrozen(DATA) || !Object.isFrozen(DATA.explorer.regimes[0].configs[0].values)) fails.push("data not frozen");
    // 3. static charts plot exactly their spec
    DATA.charts.forEach(function (spec) {
      var h = CHARTS[spec.id];
      if (!h) { fails.push("chart missing: " + spec.id); return; }
      if (h.chart.options.events.indexOf("click") !== -1) fails.push(spec.id + ": click events enabled");
      spec.series.forEach(function (s, i) {
        s.values.forEach(function (v, j) {
          checked.static_points++;
          if (!near(h.chart.data.datasets[i].data[j], v)) fails.push(spec.id + " " + s.label + "[" + j + "]");
        });
      });
    });
    // 4. every selectable explorer option is a tested config and plots its own record
    var mxCache = {};
    DATA.explorer.regimes.forEach(function (r) {
      var radio = document.querySelector("#ex-regimes input[value='" + r.id + "']");
      if (!radio) { fails.push("regime not selectable: " + r.id); return; }
      radio.checked = true;
      setRegime(r.id);
      var offered = Array.prototype.map.call(document.querySelectorAll("#ex-configs input"), function (i) { return i.value; });
      var known = r.configs.map(function (c) { return c.id; });
      offered.forEach(function (id) { if (known.indexOf(id) === -1) fails.push("selectable but not in data: " + id); });
      known.forEach(function (id) { if (offered.indexOf(id) === -1) fails.push("in data but not selectable: " + id); });
      var mx = axisMax(r);
      r.configs.forEach(function (c) {
        ex.picked = {};
        ex.picked[c.id] = true;
        drawExplorer();
        checked.explorer_configs++;
        var ds = CHARTS["ex-radar"].chart.data.datasets;
        if (ds.length !== 1 || ds[0].n5id !== c.id) { fails.push("explorer did not plot " + c.id); return; }
        DATA.explorer.axes.forEach(function (a, k) {
          checked.explorer_points++;
          var want = c.values[a.key] === null ? null : c.values[a.key] / mx[a.key].v;
          if (!near(ds[0].data[k], want)) fails.push(c.id + " " + a.key + " plotted " + ds[0].data[k] + " want " + want);
        });
      });
    });
    // 5. no chart plugin beyond Chart.js built-ins (e.g. no drag-data plugin)
    var builtins = ["colors", "decimation", "filler", "legend", "subtitle", "title", "tooltip"];
    var plugins = Object.keys((Chart.registry && Chart.registry.plugins && Chart.registry.plugins.items) || {});
    plugins.forEach(function (p) { if (builtins.indexOf(p) === -1) fails.push("unexpected chart plugin: " + p); });
    var first = DATA.explorer.regimes[0];
    document.querySelector("#ex-regimes input[value='" + first.id + "']").checked = true;
    setRegime(first.id);
    return { ok: fails.length === 0, fails: fails, checked: checked, plugins: plugins };
  }

  function main() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = 'Ubuntu, "Segoe UI", system-ui, sans-serif';
    Chart.defaults.color = css("--muted", "#666");
    DATA.charts.forEach(renderStatic);
    buildExplorer();
    if (/[?&]selftest\b/.test(location.search)) {
      var pre = document.createElement("pre");
      pre.id = "n5-selftest";
      pre.textContent = JSON.stringify(audit());
      document.body.appendChild(pre);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
