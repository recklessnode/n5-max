/**
 * Stylized N5 MAX motherboard schematic — ORIGINAL SVG only.
 * Layout brief applied (reference-derived geometry; still original artwork).
 * Open: Ronald photo map + serial→slot for absolute IDs.
 */
(function (global) {
  'use strict';

  /**
   * Seat geometry in viewBox 0 0 700 520
   * Orientation: rear I/O = TOP; SATA edge / cage = BOTTOM (front).
   * Left edge = three-slot face (×4 + two ×1). Opposite face = opp-a/b near SoC.
   */
  const SEATS = {
    'os-x4': {
      x: 96, y: 108, w: 124, h: 34, connectorW: 20,
      label: 'os-x4',
      caption: '×4',
      sub: 'Gen4 ×4 · face A upper',
      badge: '×4',
      isX4: true,
      face: 'A',
    },
    'face3-mid': {
      x: 96, y: 168, w: 112, h: 28, connectorW: 14,
      label: 'face3-mid',
      caption: '×1 · face A',
      sub: 'Gen4 ×1 · mid (nearer SoC)',
      note: 'hyp: warmer · nearer SoC',
      face: 'A',
    },
    'face3-low': {
      x: 96, y: 228, w: 112, h: 28, connectorW: 14,
      label: 'face3-low',
      caption: '×1 · face A',
      sub: 'Gen4 ×1 · lower (edge)',
      note: 'hyp: cooler · outer edge',
      face: 'A',
    },
    'opp-a': {
      x: 400, y: 118, w: 112, h: 28, connectorW: 14,
      label: 'opp-a',
      caption: '×1 · opposite',
      sub: 'Gen4 ×1 · opposite face',
      note: 'hyp: least airflow / backside',
      face: 'opp',
      connectorSide: 'right',
    },
    'opp-b': {
      x: 400, y: 172, w: 112, h: 28, connectorW: 14,
      label: 'opp-b',
      caption: '×1 · opposite',
      sub: 'Gen4 ×1 · opposite face',
      note: 'hyp: least airflow / backside',
      face: 'opp',
      connectorSide: 'right',
    },
  };

  function heatColor(tempC) {
    if (tempC == null || Number.isNaN(tempC)) return '#3b82f6';
    const t = Math.max(0, Math.min(1, (tempC - 35) / 35));
    if (t < 0.5) {
      const u = t / 0.5;
      return lerpColor('#3b82f6', '#f59e0b', u);
    }
    const u = (t - 0.5) / 0.5;
    return lerpColor('#f59e0b', '#ef4444', u);
  }

  function lerpColor(a, b, t) {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function buildBoardSVG(container) {
    const NS = 'http://www.w3.org/2000/svg';
    container.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 520');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Stylized Minisforum N5 MAX motherboard: rear I/O top, three-slot left face, opposite ×1 pair, SoC center, SATA cage forward'
    );

    // Compact PCB + landmarks (rear I/O top, SATA edge bottom, cage outside)
    svg.innerHTML = [
      // PCB body
      '<rect class="board-bg" x="72" y="48" width="500" height="300" rx="7"/>',
      '<rect class="board-outline" x="72" y="48" width="500" height="300" rx="7"/>',

      // —— Rear I/O along TOP (muted) ——
      '<text class="landmark-label" x="322" y="42" text-anchor="middle" style="font-size:7px;fill:#5a6a76">REAR I/O</text>',
      // dual 10GbE RJ45
      '<rect class="landmark" x="88" y="56" width="56" height="28" rx="2"/>',
      '<text class="landmark-label" x="116" y="70" text-anchor="middle">10GbE</text>',
      '<text class="landmark-label" x="116" y="80" text-anchor="middle">×2 RJ45</text>',
      // USB-A
      '<rect class="landmark" x="152" y="58" width="28" height="24" rx="2"/>',
      '<text class="landmark-label" x="166" y="73" text-anchor="middle">USB-A</text>',
      // HDMI
      '<rect class="landmark" x="188" y="58" width="36" height="24" rx="2"/>',
      '<text class="landmark-label" x="206" y="73" text-anchor="middle">HDMI</text>',
      // 2× USB-C 80Gbps
      '<rect class="landmark" x="232" y="56" width="64" height="28" rx="2"/>',
      '<text class="landmark-label" x="264" y="70" text-anchor="middle">USB-C</text>',
      '<text class="landmark-label" x="264" y="80" text-anchor="middle">80G ×2</text>',
      // AC inlet
      '<rect class="landmark" x="508" y="58" width="48" height="24" rx="2"/>',
      '<text class="landmark-label" x="532" y="73" text-anchor="middle">AC</text>',

      // —— Central SoC / heatsink + RAM ——
      '<rect class="landmark" x="250" y="130" width="130" height="100" rx="4"/>',
      '<text class="landmark-label" x="315" y="175" text-anchor="middle" style="font-size:8px">SoC / HEATSINK</text>',
      '<text class="landmark-label" x="315" y="188" text-anchor="middle" style="font-size:6px">central zone</text>',
      // RAM clustered around SoC
      '<rect class="landmark" x="230" y="138" width="14" height="42" rx="1"/>',
      '<rect class="landmark" x="230" y="186" width="14" height="42" rx="1"/>',
      '<rect class="landmark" x="386" y="138" width="14" height="42" rx="1"/>',
      '<rect class="landmark" x="386" y="186" width="14" height="42" rx="1"/>',
      '<text class="landmark-label" x="237" y="130" text-anchor="middle" style="font-size:5.5px">RAM</text>',
      '<text class="landmark-label" x="393" y="130" text-anchor="middle" style="font-size:5.5px">RAM</text>',

      // —— Face labels ——
      '<text class="face-label" x="152" y="100" text-anchor="middle">THREE-SLOT FACE</text>',
      '<text class="face-label" x="456" y="108" text-anchor="middle">OPPOSITE FACE</text>',
      '<text class="landmark-label" x="456" y="210" text-anchor="middle" style="font-size:5.5px;font-style:italic">hyp: least airflow / backside</text>',

      // Spine callout on ×4
      '<path class="spine-callout" d="M 230 120 L 250 98 L 380 98"/>',
      '<text class="spine-callout-text" x="385" y="101">spine = ×4 SLOT (lane budget), not the SSD</text>',

      // —— SATA edge connector at BOTTOM of PCB (toward front) ——
      '<rect class="landmark" x="200" y="320" width="200" height="16" rx="2"/>',
      '<text class="landmark-label" x="300" y="331" text-anchor="middle" style="font-size:6.5px">SATA edge / backplane</text>',
      // short finger stubs into cage
      '<line x1="220" y1="336" x2="220" y2="358" stroke="#2e3942" stroke-width="2"/>',
      '<line x1="260" y1="336" x2="260" y2="358" stroke="#2e3942" stroke-width="2"/>',
      '<line x1="300" y1="336" x2="300" y2="358" stroke="#2e3942" stroke-width="2"/>',
      '<line x1="340" y1="336" x2="340" y2="358" stroke="#2e3942" stroke-width="2"/>',
      '<line x1="380" y1="336" x2="380" y2="358" stroke="#2e3942" stroke-width="2"/>',

      // —— Five-bay SATA cage OUTSIDE board (front) ——
      '<rect class="landmark" x="180" y="358" width="240" height="88" rx="4" style="fill:#0f1418;stroke:#3a4650"/>',
      '<text class="landmark-label" x="300" y="374" text-anchor="middle" style="fill:#5a6a76;font-size:7.5px">5-BAY SATA CAGE (outside PCB)</text>',
      '<rect class="landmark" x="196" y="382" width="36" height="48" rx="2"/>',
      '<rect class="landmark" x="240" y="382" width="36" height="48" rx="2"/>',
      '<rect class="landmark" x="284" y="382" width="36" height="48" rx="2"/>',
      '<rect class="landmark" x="328" y="382" width="36" height="48" rx="2"/>',
      '<rect class="landmark" x="372" y="382" width="36" height="48" rx="2"/>',
      '<text class="landmark-label" x="214" y="410" text-anchor="middle" style="font-size:6px">1</text>',
      '<text class="landmark-label" x="258" y="410" text-anchor="middle" style="font-size:6px">2</text>',
      '<text class="landmark-label" x="302" y="410" text-anchor="middle" style="font-size:6px">3</text>',
      '<text class="landmark-label" x="346" y="410" text-anchor="middle" style="font-size:6px">4</text>',
      '<text class="landmark-label" x="390" y="410" text-anchor="middle" style="font-size:6px">5</text>',

      // Footer note
      '<text class="landmark-label" x="350" y="468" text-anchor="middle" style="font-size:7px">array seats: Gen4 ×1 lane tax  ·  layout brief · schematic ≠ photo</text>',
      '<text class="landmark-label" x="350" y="482" text-anchor="middle" style="font-size:6.5px;font-style:italic">airflow notes = hypotheses until Ronald photo map + chassis CFD</text>',
    ].join('\n');

    const seatsLayer = document.createElementNS(NS, 'g');
    seatsLayer.setAttribute('id', 'seats-layer');
    svg.appendChild(seatsLayer);

    Object.keys(SEATS).forEach(function (role) {
      seatsLayer.appendChild(makeSeatGroup(NS, SEATS[role], role));
    });

    container.appendChild(svg);
    return { svg: svg, seats: SEATS };
  }

  function makeSeatGroup(NS, seat, role) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'slot inactive' + (seat.isX4 ? ' os-x4' : ''));
    g.setAttribute('data-role', role);
    g.setAttribute('id', 'seat-' + role);

    const cw = seat.connectorW || 14;
    const rightConn = seat.connectorSide === 'right';

    const heat = document.createElementNS(NS, 'rect');
    heat.setAttribute('class', 'slot-heat');
    heat.setAttribute('x', seat.x - 4);
    heat.setAttribute('y', seat.y - 4);
    heat.setAttribute('width', seat.w + 8);
    heat.setAttribute('height', seat.h + 14);
    heat.setAttribute('rx', 4);
    heat.setAttribute('opacity', '0.25');
    g.appendChild(heat);

    // Connector — left edge for face A; right edge for opposite face
    const conn = document.createElementNS(NS, 'rect');
    conn.setAttribute('class', 'slot-connector');
    conn.setAttribute('x', rightConn ? seat.x + seat.w - cw : seat.x);
    conn.setAttribute('y', seat.y);
    conn.setAttribute('width', cw);
    conn.setAttribute('height', seat.h);
    g.appendChild(conn);

    const body = document.createElementNS(NS, 'rect');
    body.setAttribute('class', 'slot-body');
    body.setAttribute('x', rightConn ? seat.x : seat.x + cw - 2);
    body.setAttribute('y', seat.y);
    body.setAttribute('width', seat.w - cw + 2);
    body.setAttribute('height', seat.h);
    body.setAttribute('rx', 2);
    g.appendChild(body);

    // Finger notches
    const bodyLeft = rightConn ? seat.x + 8 : seat.x + cw + 8;
    for (let i = 0; i < 3; i++) {
      const n = document.createElementNS(NS, 'line');
      n.setAttribute('x1', bodyLeft + i * 26);
      n.setAttribute('x2', bodyLeft + i * 26);
      n.setAttribute('y1', seat.y + 4);
      n.setAttribute('y2', seat.y + seat.h - 4);
      n.setAttribute('stroke', '#2a353e');
      n.setAttribute('stroke-width', '2');
      g.appendChild(n);
    }

    if (seat.badge) {
      const bb = document.createElementNS(NS, 'rect');
      bb.setAttribute('class', 'x4-badge-bg');
      bb.setAttribute('x', seat.x + seat.w - 28);
      bb.setAttribute('y', seat.y - 14);
      bb.setAttribute('width', 26);
      bb.setAttribute('height', 12);
      g.appendChild(bb);
      const bt = document.createElementNS(NS, 'text');
      bt.setAttribute('class', 'x4-badge');
      bt.setAttribute('x', seat.x + seat.w - 15);
      bt.setAttribute('y', seat.y - 5);
      bt.setAttribute('text-anchor', 'middle');
      bt.textContent = seat.badge;
      g.appendChild(bt);
    }

    // Role id (small)
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'slot-label');
    label.setAttribute('x', seat.x);
    label.setAttribute('y', seat.y - 5);
    label.textContent = seat.label;
    g.appendChild(label);

    // Caption: "×4" / "×1 · face A" / "×1 · opposite"
    if (seat.caption) {
      const cap = document.createElementNS(NS, 'text');
      cap.setAttribute('class', 'placement-note');
      cap.setAttribute('x', rightConn ? seat.x - 6 : seat.x + seat.w + 6);
      cap.setAttribute('y', seat.y + seat.h / 2 + 2);
      if (rightConn) cap.setAttribute('text-anchor', 'end');
      cap.textContent = seat.caption;
      g.appendChild(cap);
    }

    // Subtle airflow hypothesis (below seat)
    if (seat.note) {
      const note = document.createElementNS(NS, 'text');
      note.setAttribute('class', 'placement-note');
      note.setAttribute('x', seat.x);
      note.setAttribute('y', seat.y + seat.h + 11);
      note.setAttribute('style', 'font-size:5.5px');
      note.textContent = seat.note;
      g.appendChild(note);
    }

    const serial = document.createElementNS(NS, 'text');
    serial.setAttribute('class', 'slot-serial');
    serial.setAttribute('data-serial', '1');
    serial.setAttribute('x', rightConn ? seat.x + 8 : seat.x + cw + 6);
    serial.setAttribute('y', seat.y + seat.h / 2 + 3);
    serial.textContent = '';
    g.appendChild(serial);

    const temp = document.createElementNS(NS, 'text');
    temp.setAttribute('class', 'slot-temp');
    temp.setAttribute('data-temp', '1');
    temp.setAttribute('x', rightConn ? seat.x + 4 : seat.x + seat.w - 4);
    temp.setAttribute('y', seat.y + seat.h + (seat.note ? 20 : 12));
    temp.setAttribute('text-anchor', rightConn ? 'start' : 'end');
    temp.textContent = '';
    g.appendChild(temp);

    return g;
  }

  /**
   * Update seat visuals from normalized sample + serial mode.
   * @param {object} sample normalized
   * @param {'hide'|'last4'|'full'} serialMode
   */
  function updateBoard(sample, serialMode) {
    const byRole = {};
    (sample.drives || []).forEach(function (d) {
      byRole[d.role] = d;
    });

    const activeTemps = (sample.drives || [])
      .filter(function (d) { return d.active && !Number.isNaN(d.tempC); })
      .map(function (d) { return d.tempC; });
    const peerMax = activeTemps.length ? Math.max.apply(null, activeTemps) : 0;

    Object.keys(SEATS).forEach(function (role) {
      const g = document.getElementById('seat-' + role);
      if (!g) return;
      const d = byRole[role];
      const active = d && d.active;
      g.classList.toggle('active', !!active);
      g.classList.toggle('inactive', !active);

      const heat = g.querySelector('.slot-heat');
      const serialEl = g.querySelector('[data-serial]');
      const tempEl = g.querySelector('[data-temp]');

      if (active && d) {
        const col = heatColor(d.tempC);
        if (heat) {
          heat.setAttribute('fill', col);
          const hotBoost = peerMax > 0 && d.tempC >= peerMax - 0.5 ? 0.55 : 0.35;
          heat.setAttribute('opacity', String(hotBoost));
        }
        if (tempEl) {
          tempEl.textContent = Number.isFinite(d.tempC) ? d.tempC.toFixed(1) + '°C' : '—';
          tempEl.setAttribute('fill', col);
        }
        if (serialEl) {
          serialEl.textContent = formatSerial(d, serialMode);
        }
      } else {
        if (heat) {
          heat.setAttribute('fill', '#1a2228');
          heat.setAttribute('opacity', '0.15');
        }
        if (tempEl) tempEl.textContent = '';
        if (serialEl) serialEl.textContent = '';
      }
    });
  }

  function formatSerial(d, mode) {
    if (mode === 'hide') return '';
    const suf = d.serialSuffix || d.label || '';
    // SN1.. labels from by-id short tags — show as-is (no fake ellipsis)
    const isSnLabel = /^SN\d+$/i.test(String(suf)) || suf === 'OS' || suf === 'OSDISK';
    if (mode === 'full') {
      return d.serialFull || (isSnLabel ? String(suf) : ('…' + suf));
    }
    if (isSnLabel) return String(suf);
    return '…' + (suf || '????');
  }

  global.N5Board = {
    SEATS: SEATS,
    buildBoardSVG: buildBoardSVG,
    updateBoard: updateBoard,
    heatColor: heatColor,
    formatSerial: formatSerial,
  };
})(typeof window !== 'undefined' ? window : globalThis);
