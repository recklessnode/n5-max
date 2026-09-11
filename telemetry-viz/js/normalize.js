/**
 * normalizeSample — adapter from raw sampler / golden-image channels → viz model
 * See ADAPTER.md for §6 channel mapping. Sampler CSV schema may change.
 *
 * Role vocabulary (layout brief — stable IDs until photo/silkscreen map / serial→slot):
 *   os-x4 | face3-mid | face3-low | opp-a | opp-b
 * Legacy aliases accepted: backside-a→opp-a, backside-b→opp-b, inner-cpu→face3-mid, outer→face3-low
 */
(function (global) {
  'use strict';

  /** Canonical board seat roles (layout brief). */
  const ROLE_VOCAB = [
    'os-x4',
    'face3-mid',
    'face3-low',
    'opp-a',
    'opp-b',
  ];

  /** Map older schematic / draft names → brief IDs. */
  const ROLE_ALIASES = {
    'slot-x4': 'os-x4',
    'backside-a': 'opp-a',
    'backside-b': 'opp-b',
    'inner-cpu': 'face3-mid',
    'outer': 'face3-low',
  };

  /**
   * @param {object} raw — one tick from synthesizer or future live sampler
   * @returns {{
   *   t: number,
   *   drives: Array<{role:string, serialSuffix:string, serialFull?:string, tempC:number, readGBs:number, writeGBs:number, active:boolean}>,
   *   pool: {readGBs:number, writeGBs:number},
   *   meta: object
   * }}
   */
  function normalizeSample(raw) {
    if (!raw || typeof raw !== 'object') {
      return emptySample(0);
    }

    const t = num(raw.t ?? raw.time ?? raw.timestamp ?? raw.elapsed_s, 0);

    const drivesIn = Array.isArray(raw.drives)
      ? raw.drives
      : Array.isArray(raw.ssds)
        ? raw.ssds
        : Array.isArray(raw.devices)
          ? raw.devices
          : [];

    const drives = drivesIn.map(function (d, i) {
      let role = String(d.role ?? d.slot ?? d.seat ?? d.id ?? 'drive-' + i);
      if (ROLE_ALIASES[role]) role = ROLE_ALIASES[role];
      const serialFull = d.serialFull ?? d.serial ?? d.sn ?? '';
      const serialSuffix =
        d.serialSuffix ??
        d.label ??
        (serialFull ? String(serialFull).slice(-4) : pad2(i + 1));
      const tempC = num(d.tempC ?? d.temp_c ?? d.temperature ?? d.temp, NaN);
      const readGBs = num(
        d.readGBs ?? d.read_GBs ?? d.read_gb_s ?? (d.read_MBs != null ? d.read_MBs / 1000 : null) ?? d.rd,
        0
      );
      const writeGBs = num(
        d.writeGBs ?? d.write_GBs ?? d.write_gb_s ?? (d.write_MBs != null ? d.write_MBs / 1000 : null) ?? d.wr,
        0
      );
      const active = d.active != null ? !!d.active : readGBs > 0.01 || writeGBs > 0.01 || (d.present === true);
      return {
        role: role,
        serialSuffix: String(serialSuffix).slice(-4),
        serialFull: serialFull ? String(serialFull) : undefined,
        tempC: tempC,
        readGBs: readGBs,
        writeGBs: writeGBs,
        active: active,
      };
    });

    let poolRead = num(
      raw.pool && (raw.pool.readGBs ?? raw.pool.read_GBs ?? raw.pool.read_gb_s),
      NaN
    );
    let poolWrite = num(
      raw.pool && (raw.pool.writeGBs ?? raw.pool.write_GBs ?? raw.pool.write_gb_s),
      NaN
    );
    if (Number.isNaN(poolRead)) {
      poolRead = drives.reduce(function (s, d) { return s + (d.active ? d.readGBs : 0); }, 0);
    }
    if (Number.isNaN(poolWrite)) {
      poolWrite = drives.reduce(function (s, d) { return s + (d.active ? d.writeGBs : 0); }, 0);
    }

    const meta = Object.assign({}, raw.meta || {});
    if (raw.testName && !meta.testName) meta.testName = raw.testName;
    if (raw.layout && !meta.layout) meta.layout = raw.layout;
    if (raw.headline && !meta.headline) meta.headline = raw.headline;
    if (raw.demo != null && meta.demo == null) meta.demo = !!raw.demo;
    if (raw.calibrate != null && meta.calibrate == null) meta.calibrate = !!raw.calibrate;
    if (meta.calibrate && meta.demo == null) meta.demo = false;
    if (meta.demo == null) meta.demo = true;

    return {
      t: t,
      drives: drives,
      pool: { readGBs: poolRead, writeGBs: poolWrite },
      meta: meta,
    };
  }

  function emptySample(t) {
    return {
      t: t,
      drives: [],
      pool: { readGBs: 0, writeGBs: 0 },
      meta: { demo: true },
    };
  }

  function num(v, fallback) {
    if (v == null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function pad2(n) {
    return String(n).padStart(4, '0');
  }

  global.normalizeSample = normalizeSample;
  global.N5Normalize = {
    normalizeSample: normalizeSample,
    emptySample: emptySample,
    ROLE_VOCAB: ROLE_VOCAB,
    ROLE_ALIASES: ROLE_ALIASES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
