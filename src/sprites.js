/* Aracnário — spiderMon procedural sprite renderer (shared by the app, the
   sprite lab, and the in-chat tuner).  Pokémon gen-1/2 "creature" look:
   front 3/4 view, dorsal family markings facing us, glinted eyes, 8 arched
   legs, bold outline + cel-shading, a dark body rim, centred-square viewBox.

   Data-driven from the per-family art object that src/adapt.js produces:
     art = { style, abd, marking, eyes, body, leg, accent }

   The three tuning tables (AB/FAN/CFG) are the ONLY magic numbers — they are
   exported as `AracnarioSprites.defaults` so the lab/tuner can clone + tweak
   them with sliders and pass the result back via spiderMon(art, mode, opts).
   ============================================================ */
(function (global) {
  'use strict';

  // self-contained colour shade (so this module has no external deps)
  function shade(hex, pct) {
    if (!hex || hex[0] !== '#') return hex;
    let h = hex.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(v + (255 * pct / 100))));
    return `#${[f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  // abdomen by art.abd -> [dy (above attach), rx, ry, pointedRear]
  const MON_AB = {
    round: [-18, 13, 14, 0], bulb: [-20, 16, 17, 0], globe: [-19, 15, 15, 0], oval: [-17, 12, 14, 0],
    elong: [-18, 9, 16, 0], flat: [-12, 17, 10, 0], teardrop: [-19, 12, 16, 1], egg: [-15, 9, 11, 0],
  };
  // leg fan as fractions of the half-width W, front->back
  const MON_FAN = {
    arch: { foot: [0.42, 0.60, 0.76, 0.90], knee: [0.40, 0.52, 0.64, 0.76] },
    lat: { foot: [0.74, 0.92, 0.66, 0.50], knee: [0.46, 0.56, 0.42, 0.34] },   // laterigrade (crab/huntsman)
    long: { foot: [0.52, 0.70, 0.86, 0.98], knee: [0.56, 0.71, 0.85, 0.97] },   // daddy-long-legs: low, wide-fanned knees
  };
  // per leg-style: cephalothorax radii, leg width, half-width reach, knee rise, foot drop, fan category
  const MON_CFG = {
    orb: { cR: [10, 9], legW: 3, W: 24, rise: 17, drop: 15, cat: 'arch' }, wolf: { cR: [11, 10], legW: 3, W: 25, rise: 15, drop: 16, cat: 'arch' },
    jumper: { cR: [13, 11], legW: 4, W: 18, rise: 9, drop: 13, cat: 'arch' }, ground: { cR: [10, 9], legW: 2, W: 24, rise: 13, drop: 16, cat: 'arch' },
    crab: { cR: [10, 8], legW: 3, W: 30, rise: 6, drop: 7, cat: 'lat' }, huntsman: { cR: [11, 9], legW: 3, W: 32, rise: 7, drop: 7, cat: 'lat' },
    funnel: { cR: [11, 10], legW: 3, W: 25, rise: 14, drop: 19, cat: 'arch' }, tube: { cR: [10, 11], legW: 3, W: 23, rise: 15, drop: 15, cat: 'arch' },
    recluse: { cR: [9, 8], legW: 2, W: 27, rise: 16, drop: 17, cat: 'arch' }, long: { cR: [7, 7], legW: 2, W: 31, rise: 11, drop: 20, cat: 'long' },
    compact: { cR: [9, 8], legW: 2, W: 22, rise: 15, drop: 16, cat: 'arch' }, micro: { cR: [7, 7], legW: 2, W: 15, rise: 9, drop: 12, cat: 'arch' },
  };

  // opts (optional) lets the lab/tuner override the tables: { cfg, ab, fan }
  function spiderMon(art, mode, opts) {
    opts = opts || {};
    const CFG = opts.cfg || MON_CFG, AB = opts.ab || MON_AB, FAN = opts.fan || MON_FAN;
    const sil = mode === 'silhouette';
    const C = 2, COLS = 72, ROWS = 72, cx = 36, attachY = 40;
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    const inB = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS, set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (inB(x, y)) grid[y][x] = c; };
    const fillRect = (x0, y0, w, h, c) => { for (let q = 0; q < h; q++)for (let p = 0; p < w; p++)set(x0 + p, y0 + q, c); };
    const SIL = 'var(--sil)';
    const bodyCol = sil ? SIL : (art.body || '#8a6a4a'), legCol = sil ? SIL : (art.leg || shade(art.body || '#8a6a4a', -10)), acc = sil ? SIL : (art.accent || shade(art.body || '#8a6a4a', -34));
    const OUT = sil ? SIL : shade(art.leg || art.body || '#8a6a4a', -58);
    const RIM = sil ? SIL : shade(art.body || '#8a6a4a', -52);   // dark rim that lifts the body off the legs
    // cel-shaded ellipse: 4 flat tone regions, light from upper-left; optional pointed rear
    function blob(ux, uy, rx, ry, base, opt) {
      opt = opt || {};
      const hi = sil ? base : shade(base, opt.hi || 34), sh = sil ? base : shade(base, opt.sh || -20), deep = sil ? base : shade(base, opt.deep || -40);
      for (let y = Math.floor(uy - ry); y <= Math.ceil(uy + ry); y++)for (let x = Math.floor(ux - rx); x <= Math.ceil(ux + rx); x++) {
        let ny = (y - uy) / ry, rxE = rx; if (opt.point && ny > 0) rxE = rx * (1 - 0.6 * ny); if (rxE < 0.5) continue;
        const nx = (x - ux) / rxE; if (nx * nx + ny * ny > 1) continue;
        const d = nx * 0.66 + ny * 0.72; let c = base; if (!sil) { if (d < -0.5) c = hi; else if (d > 0.55) c = deep; else if (d > 0.12) c = sh; }
        set(x, y, c);
      }
    }
    function blobSolid(ux, uy, rx, ry, col, point) {   // flat ellipse, used to lay the body rim
      for (let y = Math.floor(uy - ry); y <= Math.ceil(uy + ry); y++)for (let x = Math.floor(ux - rx); x <= Math.ceil(ux + rx); x++) {
        let ny = (y - uy) / ry, rxE = rx; if (point && ny > 0) rxE = rx * (1 - 0.6 * ny); if (rxE < 0.5) continue;
        const nx = (x - ux) / rxE; if (nx * nx + ny * ny > 1) continue; set(x, y, col);
      }
    }
    function legSeg(x0, y0, x1, y1, w) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, n = Math.max(4, Math.round(L)), px = -dy / L, py = dx / L;
      for (let i = 0; i <= n; i++) {
        const t = i / n, ux = x0 + dx * t, uy = y0 + dy * t, half = Math.floor(w / 2);
        for (let s = -half; s <= half; s++) set(ux + px * s, uy + py * s, legCol);
        if (!sil && w > 1) set(ux + px * half, uy + py * half, shade(legCol, 18));
      }
    }
    const c = CFG[art.style] || CFG.orb, ab = AB[art.abd] || AB.oval, fan = FAN[c.cat];
    // legs first (body draws over their roots); staggered attach points -> 8 distinct arches
    for (let i = 0; i < 4; i++) {
      const footX = c.W * fan.foot[i], kneeX = Math.max(ab[1] + 3, c.W * fan.knee[i]);
      const footY = c.drop + (c.cat === 'lat' ? (i < 2 ? -3 : 9) + 4 * (i / 3) : 2 * i), kneeY = -c.rise * (c.cat === 'lat' ? 1 : (1 - 0.10 * i));
      [-1, 1].forEach(sgn => {
        const ax = cx + sgn * c.cR[0] * 0.5, ay = attachY - c.cR[1] * 0.45 + i * (c.cR[1] * 0.42);
        const KX = cx + kneeX * sgn, KY = attachY + kneeY, FX = cx + footX * sgn, FY = attachY + footY;
        legSeg(ax, ay, KX, KY, c.legW); legSeg(KX, KY, FX, FY, Math.max(2, c.legW - 1));
        if (!sil) { set(KX, KY, shade(legCol, -32)); set(FX, FY, shade(legCol, -32)); set(FX + sgn, FY, shade(legCol, -32)); }
      });
    }
    // abdomen then cephalothorax, each over a 1px dark rim so the body reads
    // clearly against the legs and the head separates from the abdomen
    const aby = attachY + ab[0];
    if (!sil) blobSolid(cx, aby, ab[1] + 1, ab[2] + 1, RIM, ab[3]);
    blob(cx, aby, ab[1], ab[2], bodyCol, { point: ab[3] });
    if (!sil) blobSolid(cx, attachY, c.cR[0] + 1, c.cR[1] + 1, RIM);
    blob(cx, attachY, c.cR[0], c.cR[1], sil ? bodyCol : shade(bodyCol, -4));
    if (!sil) {
      const axx = cx, ayy = aby, arx = ab[1], ary = ab[2], m = art.marking;
      if (m === 'cross') { fillRect(axx - 1, ayy - ary + 3, 3, ary * 2 - 7, acc); fillRect(axx - Math.round(arx * 0.55), ayy - 2, Math.round(arx * 1.1), 3, acc); }
      else if (m === 'maleStripe') { fillRect(axx - 1, ayy - ary + 3, 3, ary * 2 - 7, acc); }
      else if (m === 'bands') { [-Math.round(ary * 0.5), 0, Math.round(ary * 0.5)].forEach(dy => fillRect(axx - arx + 3, ayy + dy, arx * 2 - 6, 2, acc)); }
      else if (m === 'cap') { for (let r = 0; r < Math.ceil(ary * 0.7); r++) { const w = Math.max(2, arx - 1 - Math.floor(r * 0.5)); fillRect(axx - w, ayy - ary + 2 + r, w * 2, 1, acc); } }
      else if (m === 'cream') { for (let r = 2; r < ary * 1.4; r++) { const w = Math.max(1, Math.round((arx - 2) * (1 - r / (ary * 1.6)))); fillRect(axx - w, ayy - ary + 3 + r, w * 2, 1, acc); } }
      else if (m === 'humps') { fillRect(axx - arx + 3, ayy - ary + 3, 3, 3, acc); fillRect(axx + arx - 5, ayy - ary + 3, 3, 3, acc); }
      else if (m === 'spots13') { [[0, -ary * 0.55], [-arx * 0.5, -ary * 0.1], [arx * 0.5, -ary * 0.1], [0, ary * 0.2], [-arx * 0.4, ary * 0.55], [arx * 0.4, ary * 0.55]].forEach(([dx, dy]) => fillRect(Math.round(axx + dx - 1), Math.round(ayy + dy - 1), 2, 2, acc)); }
      else if (m === 'fourspots') { [[-arx * 0.45, -ary * 0.3], [arx * 0.45, -ary * 0.3], [-arx * 0.45, ary * 0.4], [arx * 0.45, ary * 0.4]].forEach(([dx, dy]) => fillRect(Math.round(axx + dx - 1), Math.round(ayy + dy - 1), 3, 3, acc)); }
      else if (m === 'hourglass') { const cc = '#c33524'; for (let r = -4; r <= 4; r++) { const w = Math.max(1, 4 - Math.abs(r)); fillRect(axx - w, ayy + r, w * 2 + 1, 1, cc); } }
      else if (m === 'violin') { fillRect(cx - 1, attachY - 4, 3, 7, shade(bodyCol, -40)); }
      // eyes — a dark brow + glinted lenses so the face reads on any body colour
      const ey = attachY + c.cR[1] - 4, eyes = art.eyes, DK = '#0a0d12', GL = '#cfe9fb';
      fillRect(cx - 5, ey - 2, 11, 1, shade(bodyCol, -30));   // brow shadow band
      if (eyes === 'big') { [-4, 4].forEach(dx => { blob(cx + dx, ey, 3.6, 3.6, DK, { hi: 30, sh: -10, deep: -20 }); fillRect(cx + dx - 1, ey - 1, 2, 2, GL); }); [-6, -2, 2, 6].forEach(dx => set(cx + dx, ey - 6, DK)); }
      else if (eyes === 6) { [-3, 0, 3].forEach(dx => fillRect(cx + dx - 1, ey - 1, 2, 2, DK)); [-3, 3].forEach(dx => set(cx + dx - 1, ey - 1, GL)); }
      else if (eyes === 'none') { }
      else { [-4, 4].forEach(dx => { fillRect(cx + dx - 1, ey - 1, 3, 3, DK); set(cx + dx - 1, ey - 1, GL); }); [-2, 0, 2].forEach(dx => set(cx + dx, ey - 2, DK)); }   // two main glinting eyes + small cluster
      fillRect(cx - 2, ey + 4, 5, 2, shade(bodyCol, -28)); set(cx - 3, ey + 6, acc); set(cx + 3, ey + 6, acc);   // chelicerae
    }
    // bold outline (silhouette of the union)
    const edges = [];
    for (let y = 0; y < ROWS; y++)for (let x = 0; x < COLS; x++) {
      if (grid[y][x] != null) continue;
      if ((y > 0 && grid[y - 1][x] != null) || (y < ROWS - 1 && grid[y + 1][x] != null) || (x > 0 && grid[y][x - 1] != null) || (x < COLS - 1 && grid[y][x + 1] != null)) edges.push([x, y]);
    }
    if (!sil) edges.forEach(([x, y]) => grid[y][x] = OUT);
    // centred SQUARE viewBox on the content centre
    let minX = COLS, maxX = 0, minY = ROWS, maxY = 0;
    for (let y = 0; y < ROWS; y++)for (let x = 0; x < COLS; x++) if (grid[y][x] != null) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const ccx = (minX + maxX + 1) / 2, ccy = (minY + maxY + 1) / 2, half = Math.max(maxX - minX, maxY - minY) / 2 + 1.5;
    let rects = '';
    for (let y = 0; y < ROWS; y++) { let x = 0; while (x < COLS) { const c2 = grid[y][x]; if (c2 == null) { x++; continue; } const x0 = x; while (x < COLS && grid[y][x] === c2) x++; rects += `<rect x="${x0 * C}" y="${y * C}" width="${(x - x0) * C}" height="${C}" fill="${c2}"/>`; } }
    return `<svg viewBox="${(ccx - half) * C} ${(ccy - half) * C} ${half * 2 * C} ${half * 2 * C}" xmlns="http://www.w3.org/2000/svg" role="img" shape-rendering="crispEdges">${rects}</svg>`;
  }

  global.AracnarioSprites = {
    spiderMon: spiderMon,
    shade: shade,
    defaults: { AB: MON_AB, FAN: MON_FAN, CFG: MON_CFG },
    clone: o => JSON.parse(JSON.stringify(o)),
    STYLES: Object.keys(MON_CFG),
    ABDS: Object.keys(MON_AB),
    MARKINGS: ['none', 'cross', 'maleStripe', 'bands', 'cap', 'cream', 'humps', 'spots13', 'fourspots', 'hourglass', 'violin'],
    EYES: [8, 6, 'big', 'none'],
  };
})(window);
