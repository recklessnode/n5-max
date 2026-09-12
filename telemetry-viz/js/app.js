/**
 * N5 MAX board telemetry viz — playback, HUD, side panel, wiring.
 * Modes: CELL1 | CALIBRATE | Simulator (Stage 1) | DEMO (synthetic).
 */
(function () {
  'use strict';

  const state = {
    source: 'cell1', // 'cell1' | 'calibrate' | 'simulator' | 'demo'
    playlistId: null,
    samples: [], // normalized
    scenario: null,
    packMeta: null,
    packPlaylist: [],
    stage1Catalog: null,
    stage1CellN: null,
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

  function isPackSource() {
    return (
      (state.source === 'cell1' ||
        state.source === 'calibrate' ||
        state.source === 'simulator') &&
      state.packMeta
    );
  }

  function isCell1() {
    return state.source === 'cell1' && state.packMeta;
  }

  function isCalibrate() {
    return state.source === 'calibrate' && state.packMeta;
  }

  function isSimulator() {
    return state.source === 'simulator' && state.packMeta;
  }

  function packRootFor(src) {
    if (src === 'cell1') return N5Calibration.PACKS.cell1;
    if (src === 'calibrate') return N5Calibration.PACKS.calibrate;
    if (src === 'simulator') {
      const cell = stage1CellByN(state.stage1CellN);
      return cell ? N5Calibration.packRootForCell(cell) : null;
    }
    return null;
  }

  function stage1CellByN(n) {
    if (!state.stage1Catalog || n == null) return null;
    return (state.stage1Catalog.cells || []).find(function (c) {
      return c.n === n;
    }) || null;
  }

  function statusChipHTML() {
    if (isSimulator()) {
      const cell = stage1CellByN(state.stage1CellN);
      const badge =
        (state.packMeta && state.packMeta.playback_badge) ||
        (cell && cell.badge) ||
        'SIM · Stage 1 · provisional';
      return (
        '<span class="demo-chip sim-chip" title="Stage 1 Simulator — provisional · shape/DEMO · not story-sealed">' +
        escapeHtml(badge) +
        '</span>'
      );
    }
    if (isCell1()) {
      return '<span class="demo-chip cell1-chip" title="Cell 1 single-drive pack — provisional · shape/DEMO · not story-sealed">CELL1 · single · provisional</span>';
    }
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

    // Warm Stage 1 catalog (non-blocking); prefer cell1 → calibrate → DEMO
    N5Calibration.loadCatalog()
      .then(function (cat) {
        state.stage1Catalog = cat;
      })
      .catch(function (err) {
        console.warn('stage1 catalog unavailable', err);
      });
    bootstrap();
  }

  async function bootstrap() {
    const order = ['cell1', 'calibrate'];
    for (let i = 0; i < order.length; i++) {
      const src = order[i];
      const root = packRootFor(src);
      try {
        const pack = await N5Calibration.loadPack(root);
        state.packMeta = pack.meta;
        state.packPlaylist = N5Calibration.playlistFromMeta(pack.meta);
        state.source = src;
        state.packError = null;
        const preferred = N5Calibration.preferredChapterId(state.packPlaylist);
        state.playlistId = preferred ? preferred.id : null;
        updateBanner();
        buildPlaylistUI();
        await loadScenario(state.playlistId);
        play();
        return;
      } catch (err) {
        console.warn(src + ' pack unavailable', err);
        state.packError = String(err && err.message ? err.message : err);
      }
    }
    // DEMO fallback
    state.source = 'demo';
    state.playlistId = 'nm790-x1';
    updateBanner();
    buildPlaylistUI();
    loadScenario(state.playlistId);
    play();
  }

  function bindSourceToggle() {
    const map = {
      'src-cell1': 'cell1',
      'src-calibrate': 'calibrate',
      'src-simulator': 'simulator',
      'src-demo': 'demo',
    };
    Object.keys(map).forEach(function (id) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', function () {
        setSource(map[id]);
      });
    });
  }

  async function setSource(src) {
    if (src === state.source && state.samples.length && src !== 'simulator') return;
    pause();
    state.source = src;
    updateBanner();
    if (src === 'cell1' || src === 'calibrate' || src === 'simulator') {
      try {
        if (src === 'simulator') {
          await ensureStage1Catalog();
          if (state.stage1CellN == null) {
            state.stage1CellN = (state.stage1Catalog.cells[0] || {}).n;
          }
          buildStage1CellUI();
        } else {
          hideStage1CellUI();
        }
        const root = packRootFor(src);
        if (!root) throw new Error('no pack root for ' + src);
        const pack = await N5Calibration.loadPack(root);
        state.packMeta = pack.meta;
        state.packPlaylist = N5Calibration.playlistFromMeta(pack.meta);
        state.packError = null;
        const preferred = N5Calibration.preferredChapterId(state.packPlaylist);
        state.playlistId = preferred ? preferred.id : null;
        updateBanner();
        buildPlaylistUI();
        await loadScenario(state.playlistId);
        play();
      } catch (err) {
        state.packError = String(err && err.message ? err.message : err);
        const label =
          src === 'cell1' ? 'Cell1' : src === 'calibrate' ? 'Calibration' : 'Simulator';
        alert(label + ' pack failed to load: ' + state.packError);
        state.source = 'demo';
        hideStage1CellUI();
        updateBanner();
        buildPlaylistUI();
        loadScenario('nm790-x1');
      }
    } else {
      hideStage1CellUI();
      state.playlistId = 'nm790-x1';
      buildPlaylistUI();
      loadScenario(state.playlistId);
      play();
    }
  }

  async function ensureStage1Catalog() {
    if (state.stage1Catalog) return state.stage1Catalog;
    state.stage1Catalog = await N5Calibration.loadCatalog();
    return state.stage1Catalog;
  }

  function hideStage1CellUI() {
    const el = document.getElementById('stage1-cell-picker');
    if (el) el.hidden = true;
  }

  function buildStage1CellUI() {
    const el = document.getElementById('stage1-cell-picker');
    if (!el || !state.stage1Catalog) return;
    el.hidden = false;
    el.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'stage1-picker-label';
    title.textContent = 'Stage 1 cell';
    el.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'stage1-cell-grid';
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Stage 1 cells');
    (state.stage1Catalog.cells || []).forEach(function (cell) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stage1-cell-chip';
      btn.dataset.n = String(cell.n);
      btn.title = cell.label + ' · ' + (cell.badge || 'SIM');
      btn.innerHTML =
        '<span class="n">' +
        escapeHtml(String(cell.n)) +
        '</span><span class="layout">' +
        escapeHtml(cell.layout) +
        '</span><span class="pc">' +
        escapeHtml(cell.primarycache) +
        '</span>';
      if (cell.n === state.stage1CellN) btn.classList.add('active');
      btn.addEventListener('click', function () {
        selectStage1Cell(cell.n);
      });
      grid.appendChild(btn);
    });
    el.appendChild(grid);
  }

  async function selectStage1Cell(n) {
    if (state.source !== 'simulator') return;
    if (n === state.stage1CellN && state.samples.length) return;
    pause();
    state.stage1CellN = n;
    buildStage1CellUI();
    try {
      const root = packRootFor('simulator');
      const pack = await N5Calibration.loadPack(root);
      state.packMeta = pack.meta;
      state.packPlaylist = N5Calibration.playlistFromMeta(pack.meta);
      state.packError = null;
      const preferred = N5Calibration.preferredChapterId(state.packPlaylist);
      state.playlistId = preferred ? preferred.id : null;
      updateBanner();
      buildPlaylistUI();
      await loadScenario(state.playlistId);
      play();
    } catch (err) {
      state.packError = String(err && err.message ? err.message : err);
      alert('Simulator cell failed to load: ' + state.packError);
    }
  }

  function updateBanner() {
    const banner = document.getElementById('mode-banner');
    ['src-cell1', 'src-calibrate', 'src-simulator', 'src-demo'].forEach(function (id) {
      const btn = document.getElementById(id);
      if (!btn) return;
      const want =
        (id === 'src-cell1' && state.source === 'cell1') ||
        (id === 'src-calibrate' && state.source === 'calibrate') ||
        (id === 'src-simulator' && state.source === 'simulator') ||
        (id === 'src-demo' && state.source === 'demo');
      btn.classList.toggle('active', want);
    });

    if (!banner) return;
    if (isSimulator()) {
      const cell = stage1CellByN(state.stage1CellN);
      banner.className = 'demo-banner sim-banner';
      banner.textContent =
        'SIMULATOR · Stage 1 · provisional · shape/DEMO only · not story-sealed · ' +
        (cell ? cell.label : 'cell?') +
        ' · ' +
        (state.packMeta.source_cell || '');
    } else if (isCell1()) {
      banner.className = 'demo-banner cell1-banner';
      banner.textContent =
        'CELL1 · single · provisional · shape/DEMO only · stage1-single-full · not story-sealed · cell ' +
        (state.packMeta.source_cell || '');
    } else if (isCalibrate()) {
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
      if (isSimulator()) {
        const cell = stage1CellByN(state.stage1CellN);
        notes.innerHTML =
          'Stage 1 <strong>Simulator</strong> — ' +
          escapeHtml(cell ? cell.label : 'cell') +
          ' · pack <code>' +
          escapeHtml(state.packMeta.source_cell || '') +
          '</code> — <strong>not story-sealed</strong>. Ceiling <strong>' +
          escapeHtml(String(state.packMeta.ceiling_gbps)) +
          ' GB/s</strong> · nActive <strong>' +
          escapeHtml(String(state.packMeta.nActive)) +
          '</strong> · primarycache=<strong>' +
          escapeHtml(String(state.packMeta.primarycache || (cell && cell.primarycache) || '?')) +
          '</strong>. ' +
          statusChipHTML();
      } else if (isCell1()) {
        notes.innerHTML =
          'Shape/DEMO of <strong>stage1-single-full</strong> pack ' +
          escapeHtml(state.packMeta.source_cell || '') +
          ' — <strong>not story-sealed</strong> (steadiness incomplete). Ceiling <strong>' +
          escapeHtml(String(state.packMeta.ceiling_gbps)) +
          ' GB/s</strong> · 1× Gen4×1 (SN1 · face3-mid). ' +
          '<span class="demo-chip cell1-chip">CELL1 · single · provisional</span>';
      } else if (isCalibrate()) {
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
      isPackSource() && state.packPlaylist.length
        ? state.packPlaylist
        : demoTelemetry.PLAYLIST;

    list.forEach(function (p, i) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = p.id;
      let chip = ' <span class="demo-chip">DEMO</span>';
      if (p.stage1) chip = ' <span class="demo-chip sim-chip">SIM</span>';
      else if (p.cell1) chip = ' <span class="demo-chip cell1-chip">CELL1</span>';
      else if (p.calibrate) chip = ' <span class="demo-chip calibrate-chip">CAL</span>';
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

    if (
      isPackSource() ||
      state.source === 'cell1' ||
      state.source === 'calibrate' ||
      state.source === 'simulator'
    ) {
      const pack = await N5Calibration.loadPack(packRootFor(state.source));
      state.packMeta = pack.meta;
      const run = N5Calibration.chapterRun(pack, id);
      state.playlistId = run.scenario.id;
      state.scenario = run.scenario;
      const kind = N5Calibration.packKind(pack.meta);
      state.samples = run.samples.map(function (raw) {
        const n = normalizeSample(raw);
        n.meta.demo = false;
        n.meta.calibrate = kind === 'calibrate';
        n.meta.cell1 = kind === 'cell1';
        n.meta.stage1 = kind === 'stage1' || state.source === 'simulator';
        n.meta.provisional = true;
        n.meta.storySealed = false;
        if (!n.meta.playbackBadge) {
          n.meta.playbackBadge = N5Calibration.badgeForKind(kind, pack.meta);
        }
        if (n.meta.nActive == null && run.scenario.activeRoles) {
          n.meta.nActive = run.scenario.activeRoles.length;
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
        driveSubtempHTML(d) +
        (d.active
          ? '<div style="margin-top:4px">' + statusChipHTML() + '</div>'
          : '<div style="margin-top:4px;font-size:0.65rem;color:var(--text-dim)">idle</div>');
      list.appendChild(card);
    });

    document.getElementById('pool-read').innerHTML =
      sample.pool.readGBs.toFixed(2) + ' <small>GB/s</small> ' + statusChipHTML();
    document.getElementById('pool-write').innerHTML =
      sample.pool.writeGBs.toFixed(2) + ' <small>GB/s</small> ' + statusChipHTML();
    renderPlatform(sample.platform);
  }

  function driveSubtempHTML(d) {
    const bits = [];
    if (Number.isFinite(d.tempCtrlC)) bits.push('ctrl ' + d.tempCtrlC.toFixed(0) + '°');
    if (Number.isFinite(d.tempNandC)) bits.push('nand ' + d.tempNandC.toFixed(0) + '°');
    if (!bits.length) return '';
    return '<div class="drive-subtemp">' + bits.join(' · ') + '</div>';
  }

  function fmtPlat(v, unit, digits) {
    if (!Number.isFinite(v)) return { html: '—', cls: 'muted' };
    const d = digits == null ? 1 : digits;
    return { html: v.toFixed(d) + (unit ? ' <small>' + unit + '</small>' : ''), cls: '' };
  }

  function renderPlatform(plat) {
    const missing = document.getElementById('platform-missing-note');
    const hasHwmon = !!(plat && (Number.isFinite(plat.socketPowerW) || Number.isFinite(plat.socTempC)));
    if (missing) missing.hidden = hasHwmon;

    function set(id, html, cls) {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = html;
      el.className = 'val' + (cls ? ' ' + cls : '');
    }

    if (!plat) {
      ['plat-cpu','plat-soc','plat-power','plat-corepwr','plat-fclk','plat-dram','plat-nic','plat-throttle']
        .forEach(function (id) { set(id, '—', 'muted'); });
      return;
    }

    const cpu = fmtPlat(plat.cpuTempC, '°C', 1);
    let cpuCls = cpu.cls;
    if (Number.isFinite(plat.cpuTempC) && plat.cpuTempC >= 90) cpuCls = 'hot';
    else if (Number.isFinite(plat.cpuTempC) && plat.cpuTempC >= 80) cpuCls = 'warn';
    set('plat-cpu', cpu.html, cpuCls);

    const soc = fmtPlat(plat.socTempC, '°C', 1);
    set('plat-soc', soc.html, soc.cls);

    const pwr = fmtPlat(plat.socketPowerW != null ? plat.socketPowerW : plat.apuPowerW, 'W', 0);
    set('plat-power', pwr.html, pwr.cls);

    const core = fmtPlat(plat.allCorePowerW, 'W', 0);
    set('plat-corepwr', core.html, core.cls);

    const fclk = fmtPlat(plat.fclkMhz, 'MHz', 0);
    set('plat-fclk', fclk.html, fclk.cls);

    if (Number.isFinite(plat.dramReadMBps) || Number.isFinite(plat.dramWriteMBps)) {
      const rd = Number.isFinite(plat.dramReadMBps) ? plat.dramReadMBps.toFixed(0) : '—';
      const wr = Number.isFinite(plat.dramWriteMBps) ? plat.dramWriteMBps.toFixed(0) : '—';
      set('plat-dram', rd + '/' + wr + ' <small>MB/s</small>', '');
    } else {
      set('plat-dram', '—', 'muted');
    }

    const nic = Number.isFinite(plat.nic0TempC)
      ? plat.nic0TempC
      : Number.isFinite(plat.nic1TempC)
        ? plat.nic1TempC
        : NaN;
    const nicF = fmtPlat(nic, '°C', 0);
    set('plat-nic', nicF.html, nicF.cls);

    if (plat.throttleFlags && plat.throttleFlags.length) {
      set('plat-throttle', escapeHtml(plat.throttleFlags.join(',')), 'warn');
    } else if (hasHwmon) {
      set('plat-throttle', 'none', 'muted');
    } else {
      set('plat-throttle', '—', 'muted');
    }
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
