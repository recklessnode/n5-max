/**
 * N5 MAX board telemetry viz — playback, HUD, side panel, wiring.
 * Modes: DEMO (synthetic) | CALIBRATE (calibrate pack · provisional · shape/DEMO).
 */
(function () {
  'use strict';

  const state = {
    source: 'calibrate', // 'calibrate' | 'demo' — prefer calibrate pack when it loads
    playlistId: null,
    samples: [], // normalized
    scenario: null,
    packMeta: null,
    calibratePlaylist: [],
    idx: 0,
    playing: false,
    speed: 10, // default 10×
    serialMode: 'last4', // hide | last4 | full
    showIndividuals: false,
    raf: null,
    lastTick: 0,
    accum: 0,
    packError: null,
  };

  let chart;

  function isCalibrate() {
    return state.source === 'calibrate' && state.packMeta;
  }

  function statusChipHTML() {
    if (isCalibrate()) {
      return '<span class="demo-chip calibrate-chip" title="Calibrate pack — Protocol B raidz2 · provisional · shape/DEMO · not story-sealed">CALIBRATE · provisional</span>';
    }
    return '<span class="demo-chip" title="Synthetic demo — provisional / not Protocol B sealed">DEMO · provisional</span>';
  }

  function init() {
    N5Board.buildBoardSVG(document.getElementById('board-root'));
    chart = new N5Chart(document.getElementById('chart'));

    bindControls();
    bindSourceToggle();

    // Prefer calibration pack; fall back to DEMO if missing
    bootstrap();
  }

  async function bootstrap() {
    try {
      const pack = await N5Calibration.loadPack();
      state.packMeta = pack.meta;
      state.calibratePlaylist = N5Calibration.playlistFromMeta(pack.meta);
      state.source = 'calibrate';
      state.packError = null;
      // Default chapter: STO-01 j4 read (~5 GB/s)
      const preferred =
        state.calibratePlaylist.find(function (p) {
          return p.id === 'STO-01_seq_read_1M_j4';
        }) || state.calibratePlaylist[0];
      state.playlistId = preferred ? preferred.id : null;
      updateBanner();
      buildPlaylistUI();
      await loadScenario(state.playlistId);
      play();
    } catch (err) {
      console.warn('calibration pack unavailable — DEMO fallback', err);
      state.packError = String(err && err.message ? err.message : err);
      state.source = 'demo';
      state.playlistId = 'nm790-x1';
      updateBanner();
      buildPlaylistUI();
      loadScenario(state.playlistId);
      play();
    }
  }

  function bindSourceToggle() {
    const demoBtn = document.getElementById('src-demo');
    const calBtn = document.getElementById('src-calibrate');
    if (demoBtn) {
      demoBtn.addEventListener('click', function () {
        setSource('demo');
      });
    }
    if (calBtn) {
      calBtn.addEventListener('click', function () {
        setSource('calibrate');
      });
    }
  }

  async function setSource(src) {
    if (src === state.source && state.samples.length) return;
    pause();
    state.source = src;
    updateBanner();
    if (src === 'calibrate') {
      try {
        const pack = await N5Calibration.loadPack();
        state.packMeta = pack.meta;
        state.calibratePlaylist = N5Calibration.playlistFromMeta(pack.meta);
        state.packError = null;
        const preferred =
          state.calibratePlaylist.find(function (p) {
            return p.id === 'STO-01_seq_read_1M_j4';
          }) || state.calibratePlaylist[0];
        state.playlistId = preferred.id;
        buildPlaylistUI();
        await loadScenario(state.playlistId);
        play();
      } catch (err) {
        state.packError = String(err && err.message ? err.message : err);
        alert('Calibration pack failed to load: ' + state.packError);
        state.source = 'demo';
        updateBanner();
        buildPlaylistUI();
        loadScenario('nm790-x1');
      }
    } else {
      state.playlistId = 'nm790-x1';
      buildPlaylistUI();
      loadScenario(state.playlistId);
      play();
    }
  }

  function updateBanner() {
    const banner = document.getElementById('mode-banner');
    const demoBtn = document.getElementById('src-demo');
    const calBtn = document.getElementById('src-calibrate');
    if (demoBtn) demoBtn.classList.toggle('active', state.source === 'demo');
    if (calBtn) calBtn.classList.toggle('active', state.source === 'calibrate');

    if (!banner) return;
    if (isCalibrate()) {
      banner.className = 'demo-banner calibrate-banner';
      banner.textContent =
        'CALIBRATE · provisional · shape/DEMO only · Protocol B raidz2 · not story-sealed · cell ' +
        (state.packMeta.source_cell || '');
    } else {
      banner.className = 'demo-banner';
      banner.textContent = 'DEMO · provisional · synthetic 1 Hz';
    }

    const notes = document.getElementById('side-context-notes');
    if (notes) {
      if (isCalibrate()) {
        notes.innerHTML =
          'Shape/DEMO of <strong>stage1-raidz2-calibrate</strong> pack ' +
          escapeHtml(state.packMeta.source_cell || '') +
          ' — <strong>not a story promote</strong>. Ceiling <strong>' +
          escapeHtml(String(state.packMeta.ceiling_gbps)) +
          ' GB/s</strong> · 4× Gen4×1 (os-x4 idle). ' +
          'Not the public RAID10/RAIDZ1 chapter. ' +
          '<span class="demo-chip calibrate-chip">CALIBRATE · provisional</span>';
      } else {
        notes.innerHTML =
          'RAIDZ1 seq read <strong>6.02 GB/s</strong> · amp <strong>1.375×</strong> · ' +
          '×1 ceiling <strong>1.97</strong> · NM790@×1 ≈ <strong>1.81</strong>. ' +
          'Playback below is <strong>synthetic DEMO</strong> shaped toward those ceilings.';
      }
    }
  }

  function buildPlaylistUI() {
    const el = document.getElementById('playlist');
    el.innerHTML = '';
    const list =
      state.source === 'calibrate' && state.calibratePlaylist.length
        ? state.calibratePlaylist
        : demoTelemetry.PLAYLIST;

    list.forEach(function (p, i) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = p.id;
      const chip = p.calibrate
        ? ' <span class="demo-chip calibrate-chip">CAL</span>'
        : ' <span class="demo-chip">DEMO</span>';
      btn.innerHTML =
        i +
        1 +
        '. ' +
        escapeHtml(p.name) +
        chip +
        (p.optional ? ' <span style="color:var(--text-dim)">(opt)</span>' : '');
      if (p.id === state.playlistId) btn.classList.add('active');
      btn.addEventListener('click', function () {
        loadScenario(p.id);
        document.querySelectorAll('#playlist button').forEach(function (b) {
          b.classList.toggle('active', b.dataset.id === p.id);
        });
      });
      el.appendChild(btn);
    });
  }

  async function loadScenario(id) {
    pause();
    state.accum = 0;
    state.idx = 0;

    if (state.source === 'calibrate' && state.packMeta) {
      const pack = await N5Calibration.loadPack();
      const run = N5Calibration.chapterRun(pack, id);
      state.playlistId = run.scenario.id;
      state.scenario = run.scenario;
      state.samples = run.samples.map(function (raw) {
        const n = normalizeSample(raw);
        // Force calibrate meta (normalize defaults demo:true historically)
        n.meta.demo = false;
        n.meta.calibrate = true;
        n.meta.provisional = true;
        n.meta.storySealed = false;
        if (!n.meta.playbackBadge) {
          n.meta.playbackBadge = 'CALIBRATE · provisional';
        }
        return n;
      });
    } else {
      const run = demoTelemetry.synthesizeRun(id);
      state.playlistId = run.scenario.id;
      state.scenario = run.scenario;
      state.samples = run.samples.map(function (raw) {
        return normalizeSample(raw);
      });
    }

    chart.setHistory(state.samples);
    chart.setShowIndividuals(state.showIndividuals);
    chart.setPlayhead(0);
    updateScrubberRange();
    render();
  }

  function bindControls() {
    document.getElementById('btn-play').addEventListener('click', function () {
      if (state.playing) pause();
      else play();
    });
    document.getElementById('scrubber').addEventListener('input', function (e) {
      state.idx = Number(e.target.value);
      state.accum = 0;
      render();
    });
    document.querySelectorAll('[data-speed]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.speed = Number(btn.dataset.speed);
        document.querySelectorAll('[data-speed]').forEach(function (b) {
          b.classList.toggle('active', Number(b.dataset.speed) === state.speed);
        });
      });
    });
    document.getElementById('serial-mode').addEventListener('change', function (e) {
      state.serialMode = e.target.value;
      if (state.serialMode === 'full') {
        document.getElementById('serial-warn').hidden = false;
      } else {
        document.getElementById('serial-warn').hidden = true;
      }
      render();
    });
    document.getElementById('toggle-indiv').addEventListener('click', function () {
      state.showIndividuals = !state.showIndividuals;
      this.classList.toggle('active', state.showIndividuals);
      chart.setShowIndividuals(state.showIndividuals);
    });
  }

  function play() {
    state.playing = true;
    state.lastTick = performance.now();
    document.getElementById('btn-play').textContent = 'Pause';
    document.getElementById('btn-play').classList.add('active');
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }

  function pause() {
    state.playing = false;
    document.getElementById('btn-play').textContent = 'Play';
    document.getElementById('btn-play').classList.remove('active');
  }

  function tick(now) {
    state.raf = requestAnimationFrame(tick);
    if (!state.playing || !state.samples.length) return;
    const dt = (now - state.lastTick) / 1000;
    state.lastTick = now;
    // samples are 1Hz; speed multiplies wall-clock advance
    state.accum += dt * state.speed;
    while (state.accum >= 1) {
      state.accum -= 1;
      if (state.idx < state.samples.length - 1) {
        state.idx += 1;
      } else {
        // loop
        state.idx = 0;
      }
      render();
    }
  }

  function updateScrubberRange() {
    const scrub = document.getElementById('scrubber');
    scrub.max = Math.max(0, state.samples.length - 1);
    scrub.value = state.idx;
  }

  function render() {
    const sample =
      state.samples[state.idx] ||
      normalizeSample({ t: 0, drives: [], meta: { demo: true } });
    const scrub = document.getElementById('scrubber');
    scrub.value = state.idx;

    N5Board.updateBoard(sample, state.serialMode);
    chart.setPlayhead(state.idx);
    renderHUD(sample);
    renderSide(sample);
    renderTime();
  }

  function renderHUD(sample) {
    const meta = sample.meta || {};
    const n = (sample.drives || []).filter(function (d) {
      return d.active;
    }).length;
    document.getElementById('hud-n').innerHTML =
      n + ' drive' + (n === 1 ? '' : 's') + ' ' + statusChipHTML();
    document.getElementById('hud-test').textContent =
      meta.testName || state.scenario?.name || '—';
    document.getElementById('hud-layout').textContent =
      meta.layout || state.scenario?.layout || '—';

    const pr = sample.pool.readGBs;
    const pw = sample.pool.writeGBs;
    const nowLine =
      pr >= pw
        ? 'now ' + pr.toFixed(2) + ' GB/s read'
        : 'now ' + pw.toFixed(2) + ' GB/s write';
    const headline =
      (state.scenario && state.scenario.headline ? state.scenario.headline + ' · ' : '') +
      nowLine;
    document.getElementById('hud-headline').innerHTML =
      escapeHtml(headline) + ' ' + statusChipHTML();
  }

  function renderSide(sample) {
    const list = document.getElementById('drive-list');
    list.innerHTML = '';
    const maxRail = Math.max(
      2,
      ...sample.drives.map(function (d) {
        return Math.max(d.readGBs, d.writeGBs);
      }),
      sample.pool.readGBs /
        Math.max(1, sample.drives.filter(function (d) {
          return d.active;
        }).length)
    );

    sample.drives.forEach(function (d) {
      const card = document.createElement('div');
      card.className = 'drive-card' + (d.active ? ' active' : '');
      const tempCol = N5Board.heatColor(d.tempC);
      const serial = N5Board.formatSerial(d, state.serialMode);
      card.innerHTML =
        '<div class="drive-card-head">' +
        '<span class="drive-role">' +
        escapeHtml(d.role) +
        '</span>' +
        '<span class="drive-temp" style="color:' +
        tempCol +
        '">' +
        (Number.isFinite(d.tempC) ? d.tempC.toFixed(1) + '°C' : '—') +
        '</span></div>' +
        (serial
          ? '<div class="drive-serial">' + escapeHtml(serial) + '</div>'
          : '') +
        railHTML('rd', d.readGBs, maxRail, 'read') +
        railHTML('wr', d.writeGBs, maxRail, 'write') +
        (d.active
          ? '<div style="margin-top:4px">' + statusChipHTML() + '</div>'
          : '<div style="margin-top:4px;font-size:0.65rem;color:var(--text-dim)">idle</div>');
      list.appendChild(card);
    });

    document.getElementById('pool-read').innerHTML =
      sample.pool.readGBs.toFixed(2) + ' <small>GB/s</small> ' + statusChipHTML();
    document.getElementById('pool-write').innerHTML =
      sample.pool.writeGBs.toFixed(2) + ' <small>GB/s</small> ' + statusChipHTML();
  }

  function railHTML(label, val, max, kind) {
    const pct = Math.min(100, (val / max) * 100);
    return (
      '<div class="rail">' +
      '<span class="rail-label">' +
      label +
      '</span>' +
      '<div class="rail-bar-track"><div class="rail-bar ' +
      kind +
      '" style="width:' +
      pct +
      '%"></div></div>' +
      '<span class="rail-val">' +
      val.toFixed(2) +
      '</span>' +
      '</div>'
    );
  }

  function renderTime() {
    const t = state.samples[state.idx] ? state.samples[state.idx].t : 0;
    const total = state.samples.length
      ? state.samples[state.samples.length - 1].t
      : 0;
    document.getElementById('time-display').textContent =
      formatTime(t) + ' / ' + formatTime(total) + ' · ' + state.speed + '×';
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
