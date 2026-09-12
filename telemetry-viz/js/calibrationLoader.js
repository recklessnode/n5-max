/**
 * Pack loader — calibrate + cell1-single (sealed cells only; provisional · shape/DEMO).
 * Packs: data/calibration/ and data/cell1-single/ → {meta.json,telemetry.min.json}
 * Public face: SN labels only — no full by-id / serials.
 */
(function (global) {
  'use strict';

  const PACKS = {
    calibrate: 'data/calibration',
    cell1: 'data/cell1-single',
  };
  const PACK_BASE = PACKS.calibrate; // legacy default

  const cache = {}; // root -> { root, meta, ticks }

  async function loadPack(base) {
    const root = base || PACK_BASE;
    if (cache[root]) return cache[root];

    const [metaRes, tickRes] = await Promise.all([
      fetch(root + '/meta.json'),
      fetch(root + '/telemetry.min.json'),
    ]);
    if (!metaRes.ok) throw new Error('pack meta.json HTTP ' + metaRes.status + ' @ ' + root);
    if (!tickRes.ok) throw new Error('pack telemetry.min.json HTTP ' + tickRes.status + ' @ ' + root);

    const meta = await metaRes.json();
    const ticks = await tickRes.json();
    if (!Array.isArray(ticks) || !ticks.length) {
      throw new Error('pack empty @ ' + root);
    }

    cache[root] = { root: root, meta: meta, ticks: ticks };
    return cache[root];
  }

  async function probePack(base) {
    try {
      const res = await fetch(base + '/meta.json', { method: 'GET' });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function packKind(meta) {
    const badge = (meta && meta.playback_badge) || '';
    const layout = (meta && meta.layout) || '';
    if (/CELL1/i.test(badge) || /single/i.test(layout)) return 'cell1';
    if (/CALIBRATE/i.test(badge) || /calibrate/i.test(layout)) return 'calibrate';
    return 'calibrate';
  }

  /**
   * Slice ticks for a chapter (by epoch_ms window) and stamp meta.
   * @returns {{ scenario: object, samples: object[] }} pre-normalize samples
   */
  function chapterRun(pack, chapterId) {
    const meta = pack.meta;
    const kind = packKind(meta);
    const chapter =
      (meta.chapters || []).find(function (c) { return c.id === chapterId; }) ||
      (meta.chapters || [])[0];
    if (!chapter) throw new Error('no pack chapters');

    const begin = chapter.begin_ms;
    const end = chapter.end_ms;
    const slice = pack.ticks.filter(function (row) {
      return row.epoch_ms >= begin && row.epoch_ms <= end;
    });

    const activeRoles =
      chapter.activeRoles ||
      meta.activeRoles ||
      ['face3-mid', 'face3-low', 'opp-a', 'opp-b'];
    const nActive =
      meta.nActive != null
        ? meta.nActive
        : activeRoles.length;

    // Re-base t to chapter start for scrubber UX
    const t0 = slice.length ? slice[0].t : 0;
    const samples = slice.map(function (row) {
      return {
        t: Math.max(0, +(row.t - t0).toFixed(3)),
        drives: row.drives,
        pool: row.pool,
        meta: {
          demo: false,
          calibrate: kind === 'calibrate',
          cell1: kind === 'cell1',
          provisional: true,
          storySealed: false,
          testName: chapter.name || chapter.tag,
          layout: meta.layout || chapter.layout,
          headline: chapter.headline,
          playlistId: chapter.id,
          nActive: nActive,
          protocol: meta.protocol_label || meta.protocol,
          playbackBadge: meta.playback_badge || (kind === 'cell1' ? 'CELL1 · single · provisional' : 'CALIBRATE · provisional'),
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
      activeRoles: activeRoles,
      mode: chapter.mode || kind,
      optional: !!chapter.optional,
      calibrate: kind === 'calibrate',
      cell1: kind === 'cell1',
    };

    return { scenario: scenario, samples: samples, meta: meta };
  }

  function playlistFromMeta(meta) {
    const kind = packKind(meta);
    return (meta.chapters || []).map(function (c) {
      return {
        id: c.id,
        name: shortName(c),
        layout: meta.layout,
        headline: c.headline,
        headlineTarget: c.headlineTarget,
        optional: !!c.optional,
        calibrate: kind === 'calibrate',
        cell1: kind === 'cell1',
        mode: c.mode || kind,
      };
    });
  }

  function shortName(c) {
    const tag = c.tag || c.id || '';
    return tag
      .replace(/^STO-0?/, 'STO-')
      .replace(/_/g, ' ');
  }

  function preferredChapterId(playlist) {
    return (
      (playlist.find(function (p) { return p.id === 'STO-01_seq_read_1M_j4'; }) ||
        playlist[0] ||
        null)
    );
  }

  global.N5Calibration = {
    loadPack: loadPack,
    probePack: probePack,
    chapterRun: chapterRun,
    playlistFromMeta: playlistFromMeta,
    preferredChapterId: preferredChapterId,
    packKind: packKind,
    PACK_BASE: PACK_BASE,
    PACKS: PACKS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
