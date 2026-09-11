/**
 * calibrationLoader — load calibrate pack (cell seal only; provisional · shape/DEMO).
 * Pack: data/calibration/{meta.json,telemetry.min.json}
 * Public face: SN labels only — no full by-id / serials.
 */
(function (global) {
  'use strict';

  const PACK_BASE = 'data/calibration';

  let cached = null; // { meta, ticks }

  async function loadPack(base) {
    const root = base || PACK_BASE;
    if (cached && cached.root === root) return cached;

    const [metaRes, tickRes] = await Promise.all([
      fetch(root + '/meta.json'),
      fetch(root + '/telemetry.min.json'),
    ]);
    if (!metaRes.ok) throw new Error('calibration meta.json HTTP ' + metaRes.status);
    if (!tickRes.ok) throw new Error('calibration telemetry.min.json HTTP ' + tickRes.status);

    const meta = await metaRes.json();
    const ticks = await tickRes.json();
    if (!Array.isArray(ticks) || !ticks.length) {
      throw new Error('calibration pack empty');
    }

    cached = { root: root, meta: meta, ticks: ticks };
    return cached;
  }

  /**
   * Slice ticks for a chapter (by epoch_ms window) and stamp meta.
   * @returns {{ scenario: object, samples: object[] }} pre-normalize samples
   */
  function chapterRun(pack, chapterId) {
    const meta = pack.meta;
    const chapter =
      (meta.chapters || []).find(function (c) { return c.id === chapterId; }) ||
      (meta.chapters || [])[0];
    if (!chapter) throw new Error('no calibration chapters');

    const begin = chapter.begin_ms;
    const end = chapter.end_ms;
    const slice = pack.ticks.filter(function (row) {
      return row.epoch_ms >= begin && row.epoch_ms <= end;
    });

    // Re-base t to chapter start for scrubber UX
    const t0 = slice.length ? slice[0].t : 0;
    const samples = slice.map(function (row) {
      return {
        t: Math.max(0, +(row.t - t0).toFixed(3)),
        drives: row.drives,
        pool: row.pool,
        meta: {
          demo: false,
          calibrate: true,
          provisional: true,
          storySealed: false,
          testName: chapter.name || chapter.tag,
          layout: meta.layout || chapter.layout,
          headline: chapter.headline,
          playlistId: chapter.id,
          nActive: 4,
          protocol: meta.protocol_label || meta.protocol,
          playbackBadge: meta.playback_badge || 'CALIBRATE · provisional',
          sourceCell: meta.source_cell,
        },
      };
    });

    const scenario = {
      id: chapter.id,
      name: chapter.name || chapter.tag,
      layout: meta.layout,
      headline: chapter.headline,
      headlineTarget: chapter.headlineTarget,
      durationS: samples.length ? samples[samples.length - 1].t : 0,
      activeRoles: chapter.activeRoles || ['face3-mid', 'face3-low', 'opp-a', 'opp-b'],
      mode: 'calibrate',
      optional: !!chapter.optional,
      calibrate: true,
    };

    return { scenario: scenario, samples: samples, meta: meta };
  }

  function playlistFromMeta(meta) {
    return (meta.chapters || []).map(function (c) {
      return {
        id: c.id,
        name: shortName(c),
        layout: meta.layout,
        headline: c.headline,
        headlineTarget: c.headlineTarget,
        optional: !!c.optional,
        calibrate: true,
        mode: 'calibrate',
      };
    });
  }

  function shortName(c) {
    // STO-01 seq read 1M j4 → compact label
    const tag = c.tag || c.id || '';
    return tag
      .replace(/^STO-0?/, 'STO-')
      .replace(/_/g, ' ');
  }

  global.N5Calibration = {
    loadPack: loadPack,
    chapterRun: chapterRun,
    playlistFromMeta: playlistFromMeta,
    PACK_BASE: PACK_BASE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
