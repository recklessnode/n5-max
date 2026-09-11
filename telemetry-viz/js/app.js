/**
 * N5 MAX board telemetry viz — playback, HUD, side panel, wiring.
 */
(function () {
  'use strict';

  const state = {
    playlistId: 'nm790-x1',
    samples: [], // normalized
    scenario: null,
    idx: 0,
    playing: false,
    speed: 10, // default 10×
    serialMode: 'last4', // hide | last4 | full
    showIndividuals: false,
    raf: null,
    lastTick: 0,
    accum: 0,
  };

  let chart;

  function demoChipHTML() {
    return '<span class="demo-chip" title="Synthetic demo — provisional / not Protocol B sealed">DEMO · provisional</span>';
  }

  function init() {
    N5Board.buildBoardSVG(document.getElementById('board-root'));
    chart = new N5Chart(document.getElementById('chart'));

    buildPlaylistUI();
    bindControls();
    loadScenario(state.playlistId);
    render();
    // Auto-play gently at default 10×
    play();
  }

  function buildPlaylistUI() {
    const el = document.getElementById('playlist');
    el.innerHTML = '';
    demoTelemetry.PLAYLIST.forEach(function (p, i) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = p.id;
      btn.innerHTML =
        (i + 1) + '. ' +
        escapeHtml(p.name) +
        ' <span class="demo-chip">DEMO</span>' +
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

  function loadScenario(id) {
    const run = demoTelemetry.synthesizeRun(id);
    state.playlistId = run.scenario.id;
    state.scenario = run.scenario;
    state.samples = run.samples.map(function (raw) {
      return normalizeSample(raw);
    });
    state.idx = 0;
    state.accum = 0;
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
    const sample = state.samples[state.idx] || normalizeSample({ t: 0, drives: [], meta: { demo: true } });
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
    const n = (sample.drives || []).filter(function (d) { return d.active; }).length;
    document.getElementById('hud-n').innerHTML =
      n + ' drive' + (n === 1 ? '' : 's') + ' ' + demoChipHTML();
    document.getElementById('hud-test').textContent = meta.testName || state.scenario?.name || '—';
    document.getElementById('hud-layout').textContent = meta.layout || state.scenario?.layout || '—';

    const pr = sample.pool.readGBs;
    const headline =
      (state.scenario && state.scenario.headline ? state.scenario.headline + ' · ' : '') +
      'now ' + pr.toFixed(2) + ' GB/s read';
    document.getElementById('hud-headline').innerHTML =
      escapeHtml(headline) + ' ' + demoChipHTML();
  }

  function renderSide(sample) {
    const list = document.getElementById('drive-list');
    list.innerHTML = '';
    const maxRail = Math.max(
      2,
      ...sample.drives.map(function (d) { return Math.max(d.readGBs, d.writeGBs); }),
      sample.pool.readGBs / Math.max(1, sample.drives.filter(function (d) { return d.active; }).length)
    );

    sample.drives.forEach(function (d) {
      const card = document.createElement('div');
      card.className = 'drive-card' + (d.active ? ' active' : '');
      const tempCol = N5Board.heatColor(d.tempC);
      const serial = N5Board.formatSerial(d, state.serialMode);
      card.innerHTML =
        '<div class="drive-card-head">' +
        '<span class="drive-role">' + escapeHtml(d.role) + '</span>' +
        '<span class="drive-temp" style="color:' + tempCol + '">' +
        (d.active && Number.isFinite(d.tempC) ? d.tempC.toFixed(1) + '°C' : '—') +
        '</span></div>' +
        (serial
          ? '<div class="drive-serial">' + escapeHtml(serial) + '</div>'
          : '') +
        railHTML('rd', d.readGBs, maxRail, 'read') +
        railHTML('wr', d.writeGBs, maxRail, 'write') +
        (d.active ? '<div style="margin-top:4px">' + demoChipHTML() + '</div>' : '');
      list.appendChild(card);
    });

    document.getElementById('pool-read').innerHTML =
      sample.pool.readGBs.toFixed(2) + ' <small>GB/s</small> ' + demoChipHTML();
    document.getElementById('pool-write').innerHTML =
      sample.pool.writeGBs.toFixed(2) + ' <small>GB/s</small> ' + demoChipHTML();
  }

  function railHTML(label, val, max, kind) {
    const pct = Math.min(100, (val / max) * 100);
    return (
      '<div class="rail">' +
      '<span class="rail-label">' + label + '</span>' +
      '<div class="rail-bar-track"><div class="rail-bar ' + kind + '" style="width:' + pct + '%"></div></div>' +
      '<span class="rail-val">' + val.toFixed(2) + '</span>' +
      '</div>'
    );
  }

  function renderTime() {
    const t = state.samples[state.idx] ? state.samples[state.idx].t : 0;
    const total = state.samples.length ? state.samples[state.samples.length - 1].t : 0;
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
