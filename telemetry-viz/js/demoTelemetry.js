/**
 * demoTelemetry — synthetic 1Hz-style runs for N5 MAX M.2 viz.
 * Sealed lab numbers used only as context ceilings; all series marked DEMO.
 *
 * Sealed context (not live / not claimed as this run):
 *   RAIDZ1 seq read ≈ 6.02 GB/s, amp 1.375×
 *   ×1 Gen4 ceiling ≈ 1.97 GB/s
 *   NM790 @ ×1 ≈ 1.81 GB/s
 *
 * Role IDs (layout brief):
 *   os-x4       — sole Gen4×4 on three-slot face (upper)
 *   face3-mid   — Gen4×1 mid face A (nearer SoC → warmer hyp)
 *   face3-low   — Gen4×1 lower face A (outer edge → cooler hyp)
 *   opp-a/b     — opposite-face ×1 pair (least airflow / backside hyp)
 */
(function (global) {
  'use strict';

  const ROLES = [
    { role: 'os-x4', placement: '×4 · face A upper', airflow: 'good', heatBias: 0 },
    { role: 'face3-mid', placement: '×1 · face A mid (nearer SoC)', airflow: 'warm-hyp', heatBias: 9 },
    { role: 'face3-low', placement: '×1 · face A low (edge)', airflow: 'cooler-hyp', heatBias: 2 },
    { role: 'opp-a', placement: '×1 · opposite (backside hyp)', airflow: 'least-hyp', heatBias: 10 },
    { role: 'opp-b', placement: '×1 · opposite (least airflow hyp)', airflow: 'least-hyp', heatBias: 12 },
  ];

  /** Fake serials — suffix only meaningful for demo UI */
  const SERIALS = {
    'os-x4': 'NM790-DEMO-A1B2C3D4',
    'face3-mid': 'NM790-DEMO-M3N4O5P6',
    'face3-low': 'NM790-DEMO-Q7R8S9T0',
    'opp-a': 'NM790-DEMO-E5F6G7H8',
    'opp-b': 'NM790-DEMO-I9J0K1L2',
  };

  const PLAYLIST = [
    {
      id: 'nm790-x1',
      name: 'single NM790 @ ×1',
      layout: '1× Gen4×1 (face3-low)',
      headline: '~1.81 GB/s seq read',
      headlineTarget: 1.81,
      durationS: 45,
      activeRoles: ['face3-low'],
      mode: 'single-x1',
      optional: false,
    },
    {
      id: 'nm790-x4',
      name: 'single NM790 @ ×4',
      layout: '1× Gen4×4 (os-x4 spine)',
      headline: '~6.0 GB/s seq read (same-silicon Gen4×4)',
      headlineTarget: 6.0,
      durationS: 40,
      activeRoles: ['os-x4'],
      mode: 'single-x4',
      optional: false,
    },
    {
      id: 'raidz1-4wide',
      name: '4-wide RAIDZ1',
      layout: '4× Gen4×1 (×4 idle)',
      headline: '~6 GB/s pool seq read',
      headlineTarget: 6.02,
      durationS: 60,
      // Four ×1 seats active; os-x4 idle — lane tax reads vs ×4 single
      activeRoles: ['face3-mid', 'face3-low', 'opp-a', 'opp-b'],
      mode: 'raidz1',
      optional: false,
    },
    {
      id: 'raid10',
      name: 'RAID10 (optional)',
      layout: '4× Gen4×1 mirrored stripes',
      headline: '~5.2 GB/s pool seq read',
      headlineTarget: 5.2,
      durationS: 50,
      activeRoles: ['face3-mid', 'face3-low', 'opp-a', 'opp-b'],
      mode: 'raid10',
      optional: true,
    },
  ];

  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function noise(t, seed, amp) {
    return (hash01(t * 0.37 + seed) - 0.5) * 2 * amp +
      Math.sin(t * 0.8 + seed) * amp * 0.35;
  }

  function ramp(t, rise, hold, fall, total) {
    if (t < rise) return t / rise;
    if (t < rise + hold) return 1;
    if (t < total) {
      const u = (t - rise - hold) / Math.max(fall, 0.001);
      return Math.max(0, 1 - u);
    }
    return 0;
  }

  /**
   * Generate full run as array of raw samples (pre-normalize).
   * @param {string|number} playlistId
   * @returns {{ scenario: object, samples: object[] }}
   */
  function synthesizeRun(playlistId) {
    const scenario =
      PLAYLIST.find(function (p) { return p.id === playlistId; }) ||
      PLAYLIST[Number(playlistId)] ||
      PLAYLIST[0];

    const samples = [];
    const dur = scenario.durationS;
    const rise = Math.min(4, Math.floor(dur * 0.08));
    const fall = Math.min(5, Math.floor(dur * 0.1));
    const hold = dur - rise - fall;

    for (let t = 0; t <= dur; t++) {
      const load = ramp(t, rise, hold, fall, dur);
      const drives = ROLES.map(function (r, i) {
        const active = scenario.activeRoles.indexOf(r.role) !== -1 && load > 0.02;
        let readGBs = 0;
        let writeGBs = 0;
        let tempC = 32 + r.heatBias * 0.15 + noise(t, i + 20, 0.4);

        if (active) {
          const targets = perDriveTargets(scenario, r.role);
          readGBs = Math.max(0, targets.read * load + noise(t, i, 0.04));
          writeGBs = Math.max(0, targets.write * load * 0.15 + noise(t, i + 9, 0.015));
          tempC =
            36 +
            r.heatBias +
            load * (18 + r.heatBias * 0.9) +
            noise(t, i + 3, 1.2);
          if (scenario.mode === 'raidz1' || scenario.mode === 'raid10') {
            tempC += load * 3; // multi-drive thermal stack
          }
        }

        return {
          role: r.role,
          placement: r.placement,
          serial: SERIALS[r.role],
          serialFull: SERIALS[r.role],
          serialSuffix: SERIALS[r.role].slice(-4),
          temp_c: round1(tempC),
          read_GBs: round3(readGBs),
          write_GBs: round3(writeGBs),
          active: active,
          present: true,
        };
      });

      let poolRead = 0;
      let poolWrite = 0;
      if (scenario.mode === 'raidz1') {
        const sum = drives.reduce(function (s, d) { return s + d.read_GBs; }, 0);
        poolRead = Math.min(scenario.headlineTarget * 1.02, sum * 0.78) * (load > 0 ? 1 : 0);
        if (load > 0.95) {
          poolRead = scenario.headlineTarget + noise(t, 99, 0.06);
        } else if (load > 0.02) {
          poolRead = scenario.headlineTarget * load + noise(t, 99, 0.08);
        }
        poolWrite = poolRead * 0.12 + noise(t, 98, 0.02);
      } else if (scenario.mode === 'raid10') {
        poolRead =
          load > 0.02
            ? scenario.headlineTarget * load + noise(t, 97, 0.1)
            : 0;
        poolWrite = poolRead * 0.18 + noise(t, 96, 0.03);
      } else {
        poolRead = drives.reduce(function (s, d) { return s + d.read_GBs; }, 0);
        poolWrite = drives.reduce(function (s, d) { return s + d.write_GBs; }, 0);
      }

      samples.push({
        t: t,
        elapsed_s: t,
        demo: true,
        testName: scenario.name,
        layout: scenario.layout,
        headline: scenario.headline,
        drives: drives,
        pool: {
          read_GBs: round3(Math.max(0, poolRead)),
          write_GBs: round3(Math.max(0, poolWrite)),
        },
        meta: {
          demo: true,
          testName: scenario.name,
          layout: scenario.layout,
          headline: scenario.headline,
          playlistId: scenario.id,
          nActive: scenario.activeRoles.length,
          sealedContext: {
            raidz1_seq_read_GBs: 6.02,
            amp: 1.375,
            x1_ceiling_GBs: 1.97,
            nm790_x1_GBs: 1.81,
          },
        },
      });
    }

    return { scenario: scenario, samples: samples };
  }

  function perDriveTargets(scenario, role) {
    if (scenario.mode === 'single-x1') {
      return { read: 1.81, write: 0.22 }; // NM790 @ ×1 DEMO
    }
    if (scenario.mode === 'single-x4') {
      // Same-silicon Gen4×4 DEMO ceiling — story vs ×1 ~1.81
      return { read: 6.0, write: 0.55 };
    }
    if (scenario.mode === 'raidz1') {
      return { read: 1.72, write: 0.2 };
    }
    if (scenario.mode === 'raid10') {
      return { read: 1.65, write: 0.28 };
    }
    return { read: 0, write: 0 };
  }

  function round1(n) { return Math.round(n * 10) / 10; }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  global.demoTelemetry = {
    PLAYLIST: PLAYLIST,
    ROLES: ROLES,
    SERIALS: SERIALS,
    synthesizeRun: synthesizeRun,
  };
})(typeof window !== 'undefined' ? window : globalThis);
