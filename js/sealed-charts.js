/* Interactive sealed charts — numbers ONLY from data/sealed-metrics.json */
(function () {
  const RAID10 = "#E86A2B";
  const RAIDZ = "#1FA6A0";
  const BTRFS = "#6b46c1";
  const MDADM = "#718096";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function colorFor(layout) {
    if (layout.includes("btrfs")) return BTRFS;
    if (layout.includes("mdadm")) return MDADM;
    if (layout.includes("raid10")) return RAID10;
    return RAIDZ;
  }

  function testBw(entry, tid) {
    const t = (entry.tests || {})[tid];
    if (!t || t.publishable === false) return null;
    if (t.steady === false && !(tid || "").startsWith("STO-06")) return null;
    return t.bw_gbps;
  }

  async function main() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = '"Intel One Mono", Ubuntu, ui-sans-serif, system-ui, sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#6b665e";
    Chart.defaults.animation = reduceMotion ? false : { duration: 800, easing: "easeOutQuart" };

    const res = await fetch("data/sealed-metrics.json");
    const data = await res.json();
    if (data.meta && data.meta.story_sealed === true) {
      console.warn("story_sealed unexpectedly true — refusing interactive promote cues");
    }

    // Radar: raidz1 / raid10 / btrfs-raid5 on normalized axes
    const picks = [];
    for (const e of data.zfs_stage12_cold || []) {
      if (e.layout === "raidz1" || e.layout === "raid10") picks.push(e);
    }
    for (const e of data.fs_controls_cold || []) {
      if (e.layout === "btrfs-raid5") picks.push(e);
    }
    const axes = [
      ["seqRD", "STO-01_seq_read_1M_j4"],
      ["seqWR", "STO-01_seq_write_1M_j4"],
      ["rnd4kW", "STO-02_rand_write_4k_j4"],
      ["sync", "STO-04_sync_write_16k_j4"],
      ["TiB", null],
    ];
    const maxes = axes.map(([label, tid]) => {
      if (label === "TiB") return Math.max(...picks.map((p) => p.usable_tib || 0), 1);
      return Math.max(...picks.map((p) => testBw(p, tid) || 0), 1e-9);
    });

    const radarEl = document.getElementById("chart-radar");
    if (radarEl && picks.length) {
      new Chart(radarEl, {
        type: "radar",
        data: {
          labels: axes.map((a) => a[0]),
          datasets: picks.map((p) => ({
            label: p.layout,
            data: axes.map(([label, tid], i) => {
              const v = label === "TiB" ? p.usable_tib || 0 : testBw(p, tid) || 0;
              return v / maxes[i];
            }),
            borderColor: colorFor(p.layout),
            backgroundColor: colorFor(p.layout) + "33",
            pointBackgroundColor: colorFor(p.layout),
            borderWidth: 2,
          })),
        },
        options: {
          plugins: {
            legend: { display: true, labels: { font: { family: "Ubuntu, sans-serif" } } },
            title: {
              display: true,
              text: "Normalized tradeoff radar (cold, publishable)",
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

    // Small multiples: seqRD bars for FS cold (skip promoting mdadm 8x — show with note in title)
    const smEl = document.getElementById("chart-smallmultiples");
    if (smEl) {
      const rows = (data.fs_controls_cold || []).concat(
        (data.zfs_stage12_cold || []).filter((e) => ["raidz1", "raid10", "raidz2"].includes(e.layout))
      );
      const labels = rows.map((r) => r.layout);
      const seq = rows.map((r) => testBw(r, "STO-01_seq_read_1M_j4") || 0);
      const colors = rows.map((r) => colorFor(r.layout));
      new Chart(smEl, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "seqRD j4 GB/s",
              data: seq,
              backgroundColor: colors,
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: "Cold seq read — mdadm parity anomaly HOLDen (not an 8× claim)",
              font: { family: "Ubuntu, sans-serif", size: 12, weight: "600" },
            },
            tooltip: {
              callbacks: {
                afterBody(items) {
                  const i = items[0].dataIndex;
                  const e = rows[i];
                  return `usable ${e.usable_tib} TiB · ${e.layout}`;
                },
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: "GB/s", font: { family: '"Intel One Mono", monospace' } },
              ticks: { font: { family: '"Intel One Mono", monospace' } },
            },
            y: { ticks: { font: { family: '"Intel One Mono", monospace', size: 10 } } },
          },
        },
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
