/**
 * Throughput chart — bold pool-read hero with glow, gradient fill,
 * comet tip, and fossilized derivative particle field (trend vectors).
 * Vanilla canvas. Particles are deterministic from history×playhead
 * so scrubbing / speed changes stay coherent.
 */
(function (global) {
  'use strict';

  const COLORS = {
    poolRead: '#2dd4bf',
    poolWrite: '#60a5fa',
    drives: ['#5eead4aa', '#a78bfaaa', '#fbbf24aa', '#f472b6aa', '#94a3b8aa'],
  };

  const FONT_UI = 'Ubuntu, system-ui, sans-serif';
  const FONT_MONO = 'Ubuntu, system-ui, sans-serif';

  function Chart(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showIndividuals = false;
    this.history = [];
    this.playhead = 0;
    this._resize();
    window.addEventListener('resize', this._resize.bind(this));
  }

  Chart.prototype._resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(100, rect.width);
    const h = Math.max(80, rect.height);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.draw();
  };

  Chart.prototype.setHistory = function (samples) {
    this.history = samples || [];
    this.draw();
  };

  Chart.prototype.setPlayhead = function (idx) {
    this.playhead = idx;
    this.draw();
  };

  Chart.prototype.setShowIndividuals = function (on) {
    this.showIndividuals = !!on;
    this.draw();
  };

  Chart.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#151a1f';
    ctx.fillRect(0, 0, w, h);

    const pad = { l: 44, r: 12, t: 12, b: 22 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;

    const hist = this.history;
    if (!hist.length) {
      ctx.fillStyle = '#556069';
      ctx.font = '11px ' + FONT_MONO;
      ctx.fillText('No telemetry yet', pad.l, pad.t + 14);
      return;
    }

    let maxY = 0.5;
    hist.forEach(function (s) {
      maxY = Math.max(maxY, s.pool.readGBs, s.pool.writeGBs);
      if (this.showIndividuals) {
        s.drives.forEach(function (d) {
          maxY = Math.max(maxY, d.readGBs);
        });
      }
    }, this);
    maxY *= 1.12;

    // grid
    ctx.strokeStyle = '#222a31';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#556069';
    ctx.font = '9px ' + FONT_MONO;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ph * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
      ctx.fillText(((maxY * i) / 4).toFixed(1), 4, y + 3);
    }
    ctx.fillText('GB/s', 4, pad.t - 2);

    const n = hist.length;
    const xAt = function (i) {
      return pad.l + (n <= 1 ? 0 : (i / (n - 1)) * pw);
    };
    const yAt = function (v) {
      return pad.t + ph * (1 - v / maxY);
    };

    const pi = Math.max(0, Math.min(n - 1, this.playhead));

    // individual SSD lines — light only, no particles
    if (this.showIndividuals && hist[0]) {
      const roles = hist[0].drives.map(function (d) { return d.role; });
      roles.forEach(function (role, ri) {
        ctx.beginPath();
        ctx.strokeStyle = COLORS.drives[ri % COLORS.drives.length];
        ctx.lineWidth = 1;
        let started = false;
        for (let i = 0; i < n; i++) {
          const d = hist[i].drives.find(function (x) { return x.role === role; });
          if (!d) continue;
          const x = xAt(i);
          const y = yAt(d.readGBs);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    }

    // pool write — quieter
    ctx.beginPath();
    ctx.strokeStyle = COLORS.poolWrite;
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const y = yAt(hist[i].pool.writeGBs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // —— pool read: gradient fill under curve ——
    const baseY = pad.t + ph;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const y = yAt(hist[i].pool.readGBs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(xAt(n - 1), baseY);
    ctx.lineTo(xAt(0), baseY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, baseY);
    grad.addColorStop(0, 'rgba(45, 212, 191, 0.28)');
    grad.addColorStop(0.55, 'rgba(45, 212, 191, 0.08)');
    grad.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // —— pool read glow (soft dual-pass) ——
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const y = yAt(hist[i].pool.readGBs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.35)';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(45, 212, 191, 0.55)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // —— pool read bold hero stroke ——
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const y = yAt(hist[i].pool.readGBs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = COLORS.poolRead;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // —— fossilized derivative particle field (0..playhead) ——
    this._drawTrendParticles(ctx, hist, pi, xAt, yAt, maxY);

    // —— playhead guide ——
    const px = xAt(pi);
    const py = yAt(hist[pi].pool.readGBs);
    ctx.strokeStyle = 'rgba(251,191,36,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px, pad.t);
    ctx.lineTo(px, pad.t + ph);
    ctx.stroke();
    ctx.setLineDash([]);

    // —— comet tip at playhead ——
    this._drawCometTip(ctx, px, py, hist[pi].pool.readGBs);

    // legend
    ctx.font = '9px ' + FONT_UI;
    ctx.fillStyle = COLORS.poolRead;
    ctx.fillText('pool read', pad.l + pw - 140, pad.t + 10);
    ctx.fillStyle = COLORS.poolWrite;
    ctx.fillText('pool write', pad.l + pw - 70, pad.t + 10);
  };

  /**
   * Fossilized trend field: sparse marks along history up to playhead.
   * Angle encodes d(throughput)/dt — rise / fall / steady horizontal.
   * Deterministic from data so scrubbing & speed never desync.
   */
  Chart.prototype._drawTrendParticles = function (ctx, hist, pi, xAt, yAt, maxY) {
    if (pi < 1) return;

    // stride scales with series length — keep count lab-sparse (~18–28 marks)
    const stride = Math.max(1, Math.floor(pi / 22));
    const marks = [];

    for (let i = stride; i <= pi; i += stride) {
      const prev = hist[Math.max(0, i - stride)];
      const cur = hist[i];
      const v0 = prev.pool.readGBs;
      const v1 = cur.pool.readGBs;
      const dv = v1 - v0; // GB/s over stride samples (~stride seconds at 1 Hz)
      const throughput = v1;

      // screen-space slope for angle: negative y is up
      const x0 = xAt(i - stride);
      const x1 = xAt(i);
      const y0 = yAt(v0);
      const y1 = yAt(v1);
      const dx = x1 - x0;
      const dy = y1 - y0; // canvas: +dy is downward

      // trail direction: back along time (left) with slope angle
      // when rising, dy is negative → trail angles upward going left
      let angle = Math.atan2(dy, dx); // direction of travel (time forward)
      // particle streak points backward in time
      const backAngle = angle + Math.PI;

      // intensity from |dv| and throughput (restrained)
      const slopeMag = Math.abs(dv) / Math.max(0.15, maxY * 0.08);
      const intensity = Math.min(1, 0.25 + throughput / Math.max(maxY, 0.5) * 0.45 + Math.min(slopeMag, 1) * 0.3);

      // age fade: older fossils quieter, recent brighter — but all persist
      const age = (pi - i) / Math.max(pi, 1);
      const alpha = (0.18 + intensity * 0.42) * (1 - age * 0.55);

      marks.push({
        x: x1,
        y: y1,
        backAngle: backAngle,
        alpha: alpha,
        intensity: intensity,
        len: 5 + intensity * 7,
        rising: dv > 0.02,
        falling: dv < -0.02,
      });
    }

    marks.forEach(function (m) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.backAngle);

      // soft halo
      ctx.globalAlpha = m.alpha * 0.35;
      ctx.fillStyle = '#2dd4bf';
      ctx.beginPath();
      ctx.ellipse(-m.len * 0.35, 0, m.len * 0.7, 1.8 + m.intensity, 0, 0, Math.PI * 2);
      ctx.fill();

      // core streak
      ctx.globalAlpha = m.alpha;
      ctx.strokeStyle = m.rising
        ? 'rgba(94, 234, 212, 0.95)'
        : m.falling
          ? 'rgba(45, 180, 170, 0.85)'
          : 'rgba(45, 212, 191, 0.75)';
      ctx.lineWidth = 1.1 + m.intensity * 0.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-m.len, 0);
      ctx.stroke();

      // tiny head speck
      ctx.globalAlpha = Math.min(1, m.alpha + 0.15);
      ctx.fillStyle = '#e6fffa';
      ctx.beginPath();
      ctx.arc(0, 0, 1.1 + m.intensity * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    ctx.globalAlpha = 1;
  };

  Chart.prototype._drawCometTip = function (ctx, px, py, throughput) {
    const glow = Math.min(1, 0.4 + throughput / 8);
    ctx.save();

    // soft halo
    ctx.globalAlpha = 0.35 * glow;
    const halo = ctx.createRadialGradient(px, py, 0, px, py, 14);
    halo.addColorStop(0, 'rgba(230, 255, 250, 0.9)');
    halo.addColorStop(0.35, 'rgba(45, 212, 191, 0.45)');
    halo.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fill();

    // bright core
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#e6fffa';
    ctx.shadowColor = 'rgba(45, 212, 191, 0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // teal ring
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px, py, 4.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  };

  global.N5Chart = Chart;
})(typeof window !== 'undefined' ? window : globalThis);
