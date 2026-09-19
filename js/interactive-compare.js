/* Interactive dual-layout compare + weighted score — sealed-metrics.json only */
(function () {
  const RAID10 = "#E86A2B";
  const RAIDZ = "#1FA6A0";
  const BTRFS = "#6b46c1";
  const MDADM = "#718096";
  const MUTED = "#718096";

  const METRICS = [
    { key: "capacity", label: "capacity", tid: null, unit: "TiB", higherBetter: true },
    { key: "seqRD", label: "seqRD", tid: "STO-01_seq_read_1M_j4", unit: "GB/s", higherBetter: true },
    { key: "seqWR", label: "seqWR", tid: "STO-01_seq_write_1M_j4", unit: "GB/s", higherBetter: true },
    { key: "rnd4kW", label: "rnd4kW", tid: "STO-02_rand_write_4k_j4", unit: "GB/s", higherBetter: true },
    { key: "sync", label: "sync", tid: "STO-04_sync_write_16k_j4", unit: "GB/s", higherBetter: true },
  ];

  const DEFAULT_WEIGHTS = { capacity: 30, seqRD: 35, seqWR: 15, rnd4kW: 15, sync: 5 };

  function colorFor(layout) {
    const l = String(layout || "");
    if (l.includes("btrfs")) return BTRFS;
    if (l.includes("mdadm")) return MDADM;
    if (l.includes("raid10") || l.includes("mirror")) return RAID10;
    if (l.includes("raidz") || l.includes("raid0") || l.includes("single")) return RAIDZ;
    return MUTED;
  }

  function testBw(entry, tid) {
    if (!tid) return null;
    const t = (entry.tests || {})[tid];
    if (!t) return null;
    if (t.publishable === false) return null;
    if (t.steady === false && !(tid || "").startsWith("STO-06")) return null;
    return typeof t.bw_gbps === "number" ? t.bw_gbps : null;
  }

  function metricValue(entry, m) {
    if (m.key === "capacity") return entry.usable_tib != null ? Number(entry.usable_tib) : null;
    return testBw(entry, m.tid);
  }

  function catalog(data, mode) {
    // mode: cold | metadata | warm
    const out = [];
    const seen = new Set();

    function push(e, source) {
      if (!e || !e.layout) return;
      // Prefer stage1 for ZFS duplicates; skip raid0/singles as NAS picks but allow in picker as controls
      const id = e.layout + "|" + (e.layout_full || "") + "|" + source;
      if (seen.has(e.layout) && source.startsWith("zfs") && e.stage === 2) return;
      if (seen.has(e.layout) && !source.includes("stage")) {
        // keep first
        return;
      }
      // For ZFS: prefer stage===1 when duplicates
      if (source.startsWith("zfs") && e.stage === 2 && ["raidz1", "raidz2", "raid0"].includes(e.layout)) {
        return;
      }
      seen.add(e.layout);
      out.push({
        layout: e.layout,
        layout_full: e.layout_full || e.layout,
        usable_tib: e.usable_tib,
        tests: e.tests || {},
        source,
        cache: e.cache || mode,
        fs: e.fs || (e.layout.startsWith("btrfs") ? "btrfs" : e.layout.startsWith("mdadm") ? "mdadm-ext4" : "zfs"),
        hold: String(e.layout).includes("mdadm") && String(e.layout).includes("raid5") || String(e.layout).includes("mdadm") && String(e.layout).includes("raid6"),
      });
    }

    if (mode === "cold") {
      for (const e of data.zfs_stage12_cold || []) push(e, "zfs-cold");
      // reset seen logic: allow fs layouts even if name collision unlikely
      for (const e of data.fs_controls_cold || []) {
        seen.delete(e.layout); // force include
        push(e, "fs-cold");
      }
    } else if (mode === "metadata") {
      for (const e of data.zfs_stage12_metadata || []) push(e, "zfs-metadata");
    } else if (mode === "warm") {
      for (const e of data.fs_controls_warm || []) push(e, "fs-warm");
    }
    return out;
  }

  function rebuildCatalog(data, mode) {
    const out = [];
    const zfsPreferred = new Map();
    if (mode === "cold") {
      for (const e of data.zfs_stage12_cold || []) {
        const prev = zfsPreferred.get(e.layout);
        if (!prev || (e.stage || 99) < (prev.stage || 99)) zfsPreferred.set(e.layout, e);
      }
      for (const e of zfsPreferred.values()) {
        out.push({
          layout: e.layout,
          layout_full: e.layout_full || e.layout,
          usable_tib: e.usable_tib,
          tests: e.tests || {},
          source: "zfs-cold-s" + (e.stage || "?"),
          cache: e.cache || "none",
          fs: "zfs",
          hold: false,
        });
      }
      for (const e of data.fs_controls_cold || []) {
        out.push({
          layout: e.layout,
          layout_full: e.layout_full || e.layout,
          usable_tib: e.usable_tib,
          tests: e.tests || {},
          source: "fs-cold",
          cache: e.cache || "cold",
          fs: e.fs || "btrfs",
          hold: /mdadm.*raid[56]/.test(e.layout),
        });
      }
    } else if (mode === "metadata") {
      for (const e of data.zfs_stage12_metadata || []) {
        const prev = zfsPreferred.get(e.layout);
        if (!prev || (e.stage || 99) < (prev.stage || 99)) zfsPreferred.set(e.layout, e);
      }
      for (const e of zfsPreferred.values()) {
        out.push({
          layout: e.layout,
          layout_full: e.layout_full || e.layout,
          usable_tib: e.usable_tib,
          tests: e.tests || {},
          source: "zfs-metadata-s" + (e.stage || "?"),
          cache: e.cache || "metadata",
          fs: "zfs",
          hold: false,
        });
      }
    } else if (mode === "warm") {
      for (const e of data.fs_controls_warm || []) {
        out.push({
          layout: e.layout,
          layout_full: e.layout_full || e.layout,
          usable_tib: e.usable_tib,
          tests: e.tests || {},
          source: "fs-warm",
          cache: e.cache || "warm",
          fs: e.fs || "btrfs",
          hold: /mdadm.*raid[56]/.test(e.layout),
        });
      }
    }
    return out;
  }

  function $(id) { return document.getElementById(id); }

  function fillSelect(sel, entries, preferred) {
    sel.innerHTML = "";
    for (const e of entries) {
      const opt = document.createElement("option");
      opt.value = e.layout;
      opt.textContent = e.hold ? e.layout + " (HOLD)" : e.layout;
      sel.appendChild(opt);
    }
    if (preferred && entries.some((e) => e.layout === preferred)) sel.value = preferred;
    else if (entries.length) sel.selectedIndex = 0;
  }

  function findEntry(entries, layout) {
    return entries.find((e) => e.layout === layout) || null;
  }

  function normalizePair(a, b, m) {
    const va = a ? metricValue(a, m) : null;
    const vb = b ? metricValue(b, m) : null;
    const max = Math.max(va || 0, vb || 0, 1e-12);
    return {
      va, vb,
      na: va == null ? 0 : va / max,
      nb: vb == null ? 0 : vb / max,
      max,
    };
  }

  function weightedScore(entry, peer, weights) {
    let score = 0;
    let wsum = 0;
    const parts = [];
    for (const m of METRICS) {
      const w = Number(weights[m.key]) || 0;
      if (w <= 0) continue;
      const { va, na } = normalizePair(entry, peer, m);
      // When peer missing, normalize against self only → 1 if present
      const n = peer ? na : (va == null ? 0 : 1);
      score += w * n;
      wsum += w;
      parts.push({ key: m.key, w, n, v: va });
    }
    return { score: wsum ? score / wsum : 0, parts, raw: score, wsum };
  }

  function fmt(v, digits) {
    if (v == null || Number.isNaN(v)) return "—";
    return Number(v).toFixed(digits);
  }

  let radarChart = null;
  let state = {
    data: null,
    mode: "cold",
    entries: [],
    weights: Object.assign({}, DEFAULT_WEIGHTS),
  };

  function readWeights() {
    const w = {};
    for (const m of METRICS) {
      const el = $("ix-w-" + m.key);
      w[m.key] = el ? Number(el.value) : DEFAULT_WEIGHTS[m.key];
      const lab = $("ix-wv-" + m.key);
      if (lab) lab.textContent = String(w[m.key]);
    }
    state.weights = w;
    return w;
  }

  function updateBars(a, b) {
    const host = $("ix-bars");
    if (!host) return;
    host.innerHTML = "";
    for (const m of METRICS) {
      const { va, vb, na, nb } = normalizePair(a, b, m);
      const row = document.createElement("div");
      row.className = "ix-bar-row";
      const label = document.createElement("div");
      label.className = "metric-label";
      label.textContent = m.label;
      const track = document.createElement("div");
      track.className = "ix-bar-track";
      const fa = document.createElement("div");
      fa.className = "ix-bar-fill a";
      fa.style.width = (na * 100).toFixed(1) + "%";
      fa.style.background = colorFor(a && a.layout);
      fa.style.height = "50%";
      fa.style.top = "0";
      const fb = document.createElement("div");
      fb.className = "ix-bar-fill b";
      fb.style.width = (nb * 100).toFixed(1) + "%";
      fb.style.background = colorFor(b && b.layout);
      track.appendChild(fa);
      track.appendChild(fb);
      const val = document.createElement("div");
      val.className = "metric-val";
      const ua = m.key === "capacity" ? "TiB" : "GB/s";
      val.innerHTML = fmt(va, m.key === "capacity" ? 2 : 3) + "<br>" + fmt(vb, m.key === "capacity" ? 2 : 3);
      val.title = "A / B (" + ua + ")";
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(val);
      host.appendChild(row);
    }
  }

  function updateRadar(a, b) {
    const el = $("ix-radar");
    if (!el || typeof Chart === "undefined") return;
    const labels = METRICS.map((m) => m.label);
    const da = METRICS.map((m) => normalizePair(a, b, m).na);
    const db = METRICS.map((m) => normalizePair(a, b, m).nb);
    const datasets = [];
    if (a) {
      datasets.push({
        label: a.layout,
        data: da,
        borderColor: colorFor(a.layout),
        backgroundColor: colorFor(a.layout) + "33",
        pointBackgroundColor: colorFor(a.layout),
        borderWidth: 2,
      });
    }
    if (b) {
      datasets.push({
        label: b.layout,
        data: db,
        borderColor: colorFor(b.layout),
        backgroundColor: colorFor(b.layout) + "33",
        pointBackgroundColor: colorFor(b.layout),
        borderWidth: 2,
      });
    }
    if (radarChart) {
      radarChart.data.labels = labels;
      radarChart.data.datasets = datasets;
      radarChart.update("none");
      return;
    }
    radarChart = new Chart(el, {
      type: "radar",
      data: { labels, datasets },
      options: {
        plugins: {
          legend: { display: true, labels: { font: { family: "Ubuntu, sans-serif" } } },
          title: {
            display: true,
            text: "A vs B · normalized (current filter)",
            font: { family: "Ubuntu, sans-serif", size: 13, weight: "600" },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 1,
            ticks: { display: false },
            pointLabels: { font: { family: '"Intel One Mono", monospace', size: 10 } },
          },
        },
      },
    });
  }

  function updateScores(a, b) {
    const weights = readWeights();
    const sa = a ? weightedScore(a, b, weights) : { score: 0 };
    const sb = b ? weightedScore(b, a, weights) : { score: 0 };

    const elA = $("ix-score-a");
    const elB = $("ix-score-b");
    if (elA) {
      elA.querySelector(".name").textContent = a ? a.layout : "—";
      elA.querySelector(".score").textContent = (sa.score * 100).toFixed(1);
      elA.querySelector(".detail").textContent = a
        ? (a.layout_full + " · " + a.source + (a.hold ? " · mdadm HOLD" : ""))
        : "";
      elA.style.borderTopColor = colorFor(a && a.layout);
    }
    if (elB) {
      elB.querySelector(".name").textContent = b ? b.layout : "—";
      elB.querySelector(".score").textContent = (sb.score * 100).toFixed(1);
      elB.querySelector(".detail").textContent = b
        ? (b.layout_full + " · " + b.source + (b.hold ? " · mdadm HOLD" : ""))
        : "";
      elB.style.borderTopColor = colorFor(b && b.layout);
    }

    const rec = $("ix-recommend");
    if (rec) {
      let winner = "—";
      let why = "Set weights and pick two layouts.";
      if (a && b) {
        if (Math.abs(sa.score - sb.score) < 0.005) {
          winner = "tie";
          why = "Scores within 0.5 pts — pick by ecosystem / risk, not the slider.";
        } else if (sa.score > sb.score) {
          winner = a.layout;
          why = "Higher weighted score under current slider mix (cold numbers ≠ production risk).";
        } else {
          winner = b.layout;
          why = "Higher weighted score under current slider mix (cold numbers ≠ production risk).";
        }
        if ((a && a.hold) || (b && b.hold)) {
          why += " mdadm parity seqRD is HOLDen — do not treat as an 8× filesystem finding.";
        }
      }
      rec.querySelector(".winner").textContent = winner;
      rec.querySelector(".why").textContent = why;
      rec.querySelector(".winner").style.color = colorFor(winner);
    }
  }

  function refresh() {
    const a = findEntry(state.entries, $("ix-layout-a").value);
    const b = findEntry(state.entries, $("ix-layout-b").value);
    updateBars(a, b);
    updateRadar(a, b);
    updateScores(a, b);
  }

  function applyMode() {
    const cold = $("ix-mode-cold");
    const meta = $("ix-mode-metadata");
    const warm = $("ix-mode-warm");
    let mode = "cold";
    if (warm && warm.checked) mode = "warm";
    else if (meta && meta.checked) mode = "metadata";
    else mode = "cold";
    if (cold) cold.checked = mode === "cold";

    const warn = $("ix-mode-warn");
    if (warn) {
      if (mode === "cold") {
        warn.classList.remove("visible");
      } else {
        warn.classList.add("visible");
        warn.innerHTML =
          mode === "warm"
            ? "<strong>Warning:</strong> Warm FS-control seq read collapses to ~36&nbsp;GB/s DRAM across layouts — <em>warm ≠ layout story</em>. Use for cache-ceiling curiosity only."
            : "<strong>Warning:</strong> Metadata ARC lifts some ZFS read paths but is <em>not</em> the array. Cold (<span class=\"mono\">primarycache=none</span>) is the publishable layout control.";
      }
    }

    state.mode = mode;
    state.entries = rebuildCatalog(state.data, mode);
    const prevA = $("ix-layout-a").value;
    const prevB = $("ix-layout-b").value;
    fillSelect($("ix-layout-a"), state.entries, prevA || "btrfs-raid5");
    fillSelect($("ix-layout-b"), state.entries, prevB || "raidz1");
    // If preferred missing in this mode, keep first two distinct
    if ($("ix-layout-a").value === $("ix-layout-b").value && state.entries.length > 1) {
      $("ix-layout-b").selectedIndex = Math.min(1, state.entries.length - 1);
    }
    refresh();
  }

  function wire() {
    ["ix-layout-a", "ix-layout-b"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", refresh);
    });
    METRICS.forEach((m) => {
      const el = $("ix-w-" + m.key);
      if (el) el.addEventListener("input", refresh);
    });
    ["ix-mode-cold", "ix-mode-metadata", "ix-mode-warm"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", applyMode);
    });
    const preset = $("ix-preset");
    if (preset) {
      preset.addEventListener("change", () => {
        const v = preset.value;
        const map = {
          rag: { capacity: 40, seqRD: 45, seqWR: 10, rnd4kW: 5, sync: 0 },
          vm: { capacity: 15, seqRD: 10, seqWR: 15, rnd4kW: 40, sync: 20 },
          balanced: Object.assign({}, DEFAULT_WEIGHTS),
          sync: { capacity: 10, seqRD: 5, seqWR: 15, rnd4kW: 20, sync: 50 },
        };
        const w = map[v] || map.balanced;
        for (const m of METRICS) {
          const el = $("ix-w-" + m.key);
          if (el) el.value = w[m.key];
        }
        refresh();
      });
    }
  }

  async function main() {
    if (!$("ix-layout-a")) return;
    if (typeof Chart !== "undefined") {
      Chart.defaults.font.family = '"Intel One Mono", Ubuntu, ui-sans-serif, system-ui, sans-serif';
      Chart.defaults.font.size = 11;
      Chart.defaults.color =
        getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#6b665e";
    }
    const res = await fetch("data/sealed-metrics.json");
    state.data = await res.json();
    if (state.data.meta && state.data.meta.story_sealed === true) {
      console.warn("story_sealed unexpectedly true — refusing interactive promote cues");
    }
    wire();
    applyMode();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
