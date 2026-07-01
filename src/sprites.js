/* ============================================================
   Aracnário — sprites.js  (v2, ground-up rewrite)
   Painterly, family-accurate procedural spider renderer.

   Look: a naturalist field-guide plate — DORSAL habitus (viewed from above),
   soft gradient shading with a light from the upper-left, a fine stipple
   texture, a soft cast shadow.  Geometry is driven by the `art` descriptor
   from adapt.js so the silhouette (abdomen shape, leg stance, eye pattern)
   genuinely reads as the family.

   API:  AracnarioSprites.render(art, opts) -> "<svg …>…</svg>"
         opts = { mode: 'full'|'tile'|'silhouette', size, uid }
   ============================================================ */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;
  let _uid = 0;

  // small seeded PRNG so stipple/texture is stable per sprite
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shade(hex, dl) {
    const h = (hex || '#000').replace('#', '');
    let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const t = dl < 0 ? 0 : 255, k = Math.abs(dl);
    r = Math.round(r + (t - r) * k); g = Math.round(g + (t - g) * k); b = Math.round(b + (t - b) * k);
    const to = v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }

  /* ---- leg stance tables: per leg (front->back) angle°, length×, arch× ----
     angle: 0 = straight out to the side, + = tilted toward the head (up).   */
  const STANCE = {
    arch:   { ang: [58, 26, -8, -42],  len: [0.95, 1.06, 1.0, 0.9],  arch: 0.52, w: 3.0 },
    lat:    { ang: [72, 50, -32, -52],  len: [1.28, 1.42, 0.9, 0.82], arch: 0.16, w: 3.0 },
    long:   { ang: [52, 22, -10, -38],  len: [2.15, 2.4, 2.2, 1.95], arch: 0.30, w: 1.7 },
    robust: { ang: [54, 24, -10, -44],  len: [0.96, 1.02, 0.98, 0.9], arch: 0.42, w: 3.8 },
    sleek:  { ang: [48, 18, -14, -46],  len: [0.9, 0.96, 0.92, 0.84], arch: 0.30, w: 2.6 },
  };

  /* ---- abdomen silhouette: returns an SVG path centred on (cx,cy) --------- */
  function abdomenPath(shape, cx, cy, rx, ry) {
    const P = (x, y) => `${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`;
    switch (shape) {
      case 'sphere': return ellip(cx, cy, rx * 0.98, ry * 0.98);
      case 'globe':  return ellip(cx, cy + ry * 0.06, rx * 1.06, ry * 1.04);
      case 'oval':   return ellip(cx, cy, rx * 0.9, ry * 1.05);
      case 'ovalS':  return ellip(cx, cy, rx * 0.78, ry * 0.9);
      case 'ovalL':  return ellip(cx, cy + ry * 0.12, rx * 0.74, ry * 1.28);
      case 'pill':   return ellip(cx, cy + ry * 0.18, rx * 0.6, ry * 1.5);
      case 'dome':   return `M ${P(-rx, -ry * 0.2)} Q ${P(-rx * 1.05, ry * 1.1)} ${P(0, ry * 1.15)} Q ${P(rx * 1.05, ry * 1.1)} ${P(rx, -ry * 0.2)} Q ${P(rx * 0.5, -ry)} ${P(0, -ry)} Q ${P(-rx * 0.5, -ry)} ${P(-rx, -ry * 0.2)} Z`;
      case 'point':  return `M ${P(-rx, -ry * 0.4)} Q ${P(-rx, ry * 0.5)} ${P(0, ry * 1.35)} Q ${P(rx, ry * 0.5)} ${P(rx, -ry * 0.4)} Q ${P(rx * 0.6, -ry)} ${P(0, -ry)} Q ${P(-rx * 0.6, -ry)} ${P(-rx, -ry * 0.4)} Z`;
      case 'flat':   return ellip(cx, cy, rx * 1.28, ry * 0.72);
      case 'trapz':  return `M ${P(-rx * 0.7, -ry)} Q ${P(-rx * 1.15, -ry * 0.1)} ${P(-rx * 1.15, ry * 0.5)} Q ${P(-rx, ry * 1.05)} ${P(0, ry * 1.05)} Q ${P(rx, ry * 1.05)} ${P(rx * 1.15, ry * 0.5)} Q ${P(rx * 1.15, -ry * 0.1)} ${P(rx * 0.7, -ry)} Q ${P(0, -ry * 1.12)} ${P(-rx * 0.7, -ry)} Z`;
      case 'humpk':  return `M ${P(-rx, 0)} Q ${P(-rx, -ry * 1.15)} ${P(-rx * 0.45, -ry * 0.92)} Q ${P(-rx * 0.2, -ry * 1.2)} ${P(0, -ry * 0.9)} Q ${P(rx * 0.2, -ry * 1.2)} ${P(rx * 0.45, -ry * 0.92)} Q ${P(rx, -ry * 1.15)} ${P(rx, 0)} Q ${P(rx, ry * 1.1)} ${P(0, ry * 1.1)} Q ${P(-rx, ry * 1.1)} ${P(-rx, 0)} Z`;
      case 'round':  default: return ellip(cx, cy, rx, ry);
    }
  }
  function ellip(cx, cy, rx, ry) {
    return `M ${(cx - rx).toFixed(1)},${cy.toFixed(1)} a ${rx.toFixed(1)},${ry.toFixed(1)} 0 1,0 ${(2 * rx).toFixed(1)},0 a ${rx.toFixed(1)},${ry.toFixed(1)} 0 1,0 ${(-2 * rx).toFixed(1)},0 Z`;
  }

  /* ---- eye clusters (dorsal, at the front of the cephalothorax) ----------- */
  function eyes(kind, cx, cy, s, dark) {
    const dot = (x, y, r, c) => `<circle cx="${(cx + x).toFixed(1)}" cy="${(cy + y).toFixed(1)}" r="${(r).toFixed(1)}" fill="${c}"/>`;
    const glint = (x, y, r) => `<circle cx="${(cx + x - r * 0.3).toFixed(1)}" cy="${(cy + y - r * 0.3).toFixed(1)}" r="${(r * 0.34).toFixed(1)}" fill="#ffffff" opacity="0.85"/>`;
    let o = '';
    const B = dark, W = '#0b0b0d';
    switch (kind) {
      case 'jump2big': {  // salticid: 2 huge AME + 2 small ALE + row behind
        const R = 3.2 * s;
        o += dot(-3.1 * s, 0, R, '#12100e') + dot(3.1 * s, 0, R, '#12100e');
        o += `<circle cx="${(cx - 3.1 * s).toFixed(1)}" cy="${cy.toFixed(1)}" r="${(R * 0.62).toFixed(1)}" fill="#2a6f9e"/>`;
        o += `<circle cx="${(cx + 3.1 * s).toFixed(1)}" cy="${cy.toFixed(1)}" r="${(R * 0.62).toFixed(1)}" fill="#2a6f9e"/>`;
        o += glint(-3.1 * s, 0, R) + glint(3.1 * s, 0, R);
        o += dot(-6.4 * s, -1.2 * s, 1.1 * s, W) + dot(6.4 * s, -1.2 * s, 1.1 * s, W);
        o += dot(-3.4 * s, -3.0 * s, 0.8 * s, W) + dot(3.4 * s, -3.0 * s, 0.8 * s, W);
        break;
      }
      case 'wolf3row': {  // 4 tiny front, 2 big middle, 2 top
        for (let i = -1.5; i <= 1.5; i++) o += dot(i * 1.7 * s, 2.1 * s, 0.7 * s, W);
        o += dot(-2.0 * s, -0.2 * s, 1.7 * s, W) + dot(2.0 * s, -0.2 * s, 1.7 * s, W);
        o += glint(-2.0 * s, -0.2 * s, 1.7 * s) + glint(2.0 * s, -0.2 * s, 1.7 * s);
        o += dot(-2.6 * s, -3.0 * s, 1.0 * s, W) + dot(2.6 * s, -3.0 * s, 1.0 * s, W);
        break;
      }
      case 'lynx': {  // oxyopid hexagon of 6 raised eyes
        const pts = [[-1.8, -2.4], [1.8, -2.4], [-2.6, 0], [2.6, 0], [-1.2, 2.2], [1.2, 2.2]];
        pts.forEach(p => { o += dot(p[0] * s, p[1] * s, 1.0 * s, W) + glint(p[0] * s, p[1] * s, 1.0 * s); });
        break;
      }
      case 'six': {  // recluse/dysderid: 3 pairs
        const pr = [[-2.4, 0.4], [2.4, 0.4], [-1.1, -1.2], [1.1, -1.2], [-1.5, 1.9], [1.5, 1.9]];
        pr.forEach(p => { o += dot(p[0] * s, p[1] * s, 1.05 * s, W); });
        break;
      }
      case 'crabrow': {  // thomisid: small eyes, front two on low tubercles
        for (let i = -1.5; i <= 1.5; i++) o += dot(i * 1.7 * s, -0.4 * s, 0.75 * s, W);
        o += dot(-2.6 * s, 1.6 * s, 0.85 * s, W) + dot(2.6 * s, 1.6 * s, 0.85 * s, W);
        break;
      }
      case 'huntrow': {  // sparassid: two gentle rows of 4
        for (let i = -1.5; i <= 1.5; i++) { o += dot(i * 1.9 * s, -1.2 * s, 0.9 * s, W); o += dot(i * 2.1 * s, 1.4 * s, 0.9 * s, W); }
        break;
      }
      case 'clump': {  // small tight cluster (mygalomorph / nocturnal)
        const pr = [[-1.0, -1.0], [1.0, -1.0], [-1.6, 0.4], [1.6, 0.4], [-0.6, 1.2], [0.6, 1.2], [-2.0, -0.4], [2.0, -0.4]];
        pr.forEach(p => { o += dot(p[0] * s, p[1] * s, 0.7 * s, W); });
        break;
      }
      case 'orb2row':
      default: {  // 8 small eyes, two rows, central box
        for (let i = -1.5; i <= 1.5; i++) o += dot(i * 1.5 * s, -1.4 * s, 0.8 * s, W);
        for (let i = -1.5; i <= 1.5; i++) o += dot(i * 1.7 * s, 1.4 * s, 0.8 * s, W);
        break;
      }
    }
    return o;
  }

  /* ---- abdomen pattern overlays (drawn over the abdomen fill) ------------- */
  function pattern(kind, cx, cy, rx, ry, art, r) {
    const acc = art.accent, lite = shade(art.abdCol, 0.5), dark = shade(art.abdCol, -0.4);
    const P = (x, y) => `${(cx + x).toFixed(1)} ${(cy + y).toFixed(1)}`;
    let o = '';
    switch (kind) {
      case 'cross':
        o += `<path d="M ${P(0, -ry * 0.7)} L ${P(0, ry * 0.55)} M ${P(-rx * 0.55, -ry * 0.15)} L ${P(rx * 0.55, -ry * 0.15)}" stroke="${lite}" stroke-width="${(rx * 0.16).toFixed(1)}" stroke-linecap="round" fill="none" opacity="0.9"/>`;
        for (let i = 0; i < 5; i++) { const a = i / 4 * Math.PI - Math.PI / 2; o += `<circle cx="${(cx + Math.cos(a) * rx * 0.5).toFixed(1)}" cy="${(cy + Math.sin(a) * ry * 0.5 - ry * 0.1).toFixed(1)}" r="${(rx * 0.09).toFixed(1)}" fill="${lite}"/>`; }
        break;
      case 'folium':  // leaf/oak-leaf outline down the midline
        o += `<path d="M ${P(0, -ry * 0.72)} C ${P(rx * 0.62, -ry * 0.4)} ${P(rx * 0.5, ry * 0.4)} ${P(0, ry * 0.72)} C ${P(-rx * 0.5, ry * 0.4)} ${P(-rx * 0.62, -ry * 0.4)} ${P(0, -ry * 0.72)} Z" fill="${dark}" opacity="0.42"/>`;
        o += `<path d="M ${P(0, -ry * 0.5)} L ${P(0, ry * 0.5)}" stroke="${lite}" stroke-width="${(rx * 0.06).toFixed(1)}" opacity="0.5"/>`;
        break;
      case 'bands':
        for (let i = -1; i <= 1; i++) o += `<path d="M ${P(-rx * 0.92, i * ry * 0.42)} Q ${P(0, i * ry * 0.42 + ry * 0.12)} ${P(rx * 0.92, i * ry * 0.42)}" stroke="${i % 2 ? acc : dark}" stroke-width="${(ry * 0.2).toFixed(1)}" fill="none" opacity="0.72" stroke-linecap="round"/>`;
        break;
      case 'stripe':
        o += `<path d="M ${P(0, -ry * 0.85)} L ${P(0, ry * 0.85)}" stroke="${lite}" stroke-width="${(rx * 0.34).toFixed(1)}" opacity="0.55" stroke-linecap="round"/>`;
        o += `<path d="M ${P(0, -ry * 0.7)} L ${P(0, ry * 0.7)}" stroke="${dark}" stroke-width="${(rx * 0.12).toFixed(1)}" opacity="0.5"/>`;
        break;
      case 'chevrons':
        for (let i = -1; i <= 2; i++) o += `<path d="M ${P(-rx * 0.5, i * ry * 0.34 - ry * 0.1)} L ${P(0, i * ry * 0.34 + ry * 0.05)} L ${P(rx * 0.5, i * ry * 0.34 - ry * 0.1)}" stroke="${dark}" stroke-width="${(ry * 0.08).toFixed(1)}" fill="none" opacity="0.6"/>`;
        break;
      case 'spots':
        for (let i = 0; i < 6; i++) { const x = (r() - 0.5) * rx * 1.2, y = (r() - 0.5) * ry * 1.3; o += `<circle cx="${(cx + x).toFixed(1)}" cy="${(cy + y).toFixed(1)}" r="${(rx * (0.08 + r() * 0.08)).toFixed(1)}" fill="${dark}" opacity="0.55"/>`; }
        break;
      case 'shoulders':  // two pale humps toward the front
        o += `<circle cx="${(cx - rx * 0.42).toFixed(1)}" cy="${(cy - ry * 0.42).toFixed(1)}" r="${(rx * 0.3).toFixed(1)}" fill="${lite}" opacity="0.6"/>`;
        o += `<circle cx="${(cx + rx * 0.42).toFixed(1)}" cy="${(cy - ry * 0.42).toFixed(1)}" r="${(rx * 0.3).toFixed(1)}" fill="${lite}" opacity="0.6"/>`;
        break;
      case 'lobes':  // scalloped silvery edge
        o += `<ellipse cx="${cx}" cy="${cy}" rx="${(rx * 0.62).toFixed(1)}" ry="${(ry * 0.62).toFixed(1)}" fill="${lite}" opacity="0.5"/>`;
        for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * Math.PI; o += `<circle cx="${(cx + Math.cos(a) * rx * 0.92).toFixed(1)}" cy="${(cy + Math.sin(a) * ry * 0.92).toFixed(1)}" r="${(rx * 0.16).toFixed(1)}" fill="${shade(art.abdCol, 0.2)}" opacity="0.8"/>`; }
        break;
      case 'cap':
        o += `<path d="M ${P(-rx * 0.9, -ry * 0.3)} Q ${P(0, -ry * 1.05)} ${P(rx * 0.9, -ry * 0.3)} Q ${P(0, 0)} ${P(-rx * 0.9, -ry * 0.3)} Z" fill="${dark}" opacity="0.7"/>`;
        break;
      case 'violin':  // on cephalothorax — handled separately, faint here
        o += `<circle cx="${cx}" cy="${cy}" r="${(rx * 0.2).toFixed(1)}" fill="${dark}" opacity="0.3"/>`;
        break;
      case 'silver':
        o += `<ellipse cx="${(cx - rx * 0.2).toFixed(1)}" cy="${(cy - ry * 0.2).toFixed(1)}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.6).toFixed(1)}" fill="#e9edf0" opacity="0.5"/>`;
        break;
      case 'ladybird':
        o += `<circle cx="${cx}" cy="${cy}" r="${(rx * 0.86).toFixed(1)}" fill="${art.accent}" opacity="0.92"/>`;
        [[-0.4, -0.35], [0.4, -0.35], [-0.45, 0.25], [0.45, 0.25], [0, 0.55]].forEach(p =>
          o += `<circle cx="${(cx + p[0] * rx).toFixed(1)}" cy="${(cy + p[1] * ry).toFixed(1)}" r="${(rx * 0.16).toFixed(1)}" fill="#111"/>`);
        break;
      case 'speck':
      case 'mottle':
        for (let i = 0; i < 12; i++) { const x = (r() - 0.5) * rx * 1.5, y = (r() - 0.5) * ry * 1.6; o += `<circle cx="${(cx + x).toFixed(1)}" cy="${(cy + y).toFixed(1)}" r="${(rx * (0.04 + r() * 0.05)).toFixed(1)}" fill="${dark}" opacity="0.4"/>`; }
        break;
      default: break;
    }
    return o;
  }

  /* ---- main render -------------------------------------------------------- */
  function render(art, opts) {
    opts = opts || {};
    const mode = opts.mode || 'full';
    const sil = mode === 'silhouette';
    const uid = 'sp' + (opts.uid != null ? opts.uid : (_uid++));
    const r = rng(hashStr((art && art.body || '') + (art && art.pattern || '') + uid));

    const VB = 120;                       // viewBox is VB x VB
    const cx = 60;
    const sc = 0.62 * (art.scale || 1);   // overall body scale
    const st = STANCE[art.stance] || STANCE.arch;

    // anchor points
    const cephY = 52, cephRx = 12 * sc, cephRy = 15 * sc;
    const abdRx = 17 * sc, abdRy = 19 * sc;
    const abdY = cephY + cephRy + abdRy * 0.72;
    const L = 34 * sc * (art.legLen || 1);  // base leg length

    const SIL = 'var(--sil,#2b2f36)';
    const bodyCol = sil ? SIL : art.body;
    const abdCol  = sil ? SIL : art.abdCol;
    const legCol  = sil ? SIL : art.leg;
    const outline = sil ? SIL : shade(art.leg || art.body, -0.55);

    // ---- defs: gradients + soft shadow (skipped for silhouette) ----
    let defs = '';
    if (!sil) {
      defs += `<radialGradient id="${uid}a" cx="38%" cy="30%" r="78%">`
        + `<stop offset="0%" stop-color="${shade(abdCol, 0.42)}"/>`
        + `<stop offset="55%" stop-color="${abdCol}"/>`
        + `<stop offset="100%" stop-color="${shade(abdCol, -0.34)}"/></radialGradient>`;
      defs += `<radialGradient id="${uid}c" cx="40%" cy="32%" r="80%">`
        + `<stop offset="0%" stop-color="${shade(bodyCol, 0.4)}"/>`
        + `<stop offset="70%" stop-color="${bodyCol}"/>`
        + `<stop offset="100%" stop-color="${shade(bodyCol, -0.4)}"/></radialGradient>`;
      defs += `<linearGradient id="${uid}l" x1="0" y1="0" x2="0" y2="1">`
        + `<stop offset="0%" stop-color="${shade(legCol, 0.25)}"/>`
        + `<stop offset="100%" stop-color="${shade(legCol, -0.2)}"/></linearGradient>`;
    }
    defs += `<filter id="${uid}s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.4" flood-color="#000" flood-opacity="0.28"/></filter>`;
    const abdFill = sil ? SIL : `url(#${uid}a)`;
    const cephFill = sil ? SIL : `url(#${uid}c)`;
    const legFill = sil ? SIL : `url(#${uid}l)`;

    // ---- legs (draw behind the body) ----
    let legsBack = '', legsFront = '', spines = '';
    const lw = st.w * sc * (art.stance === 'long' ? 1 : 1);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const ax = cx + side * cephRx * 0.85;
        const ay = cephY - cephRy * 0.4 + i * (cephRy * 0.7);
        const ang = st.ang[i] * DEG;
        const len = L * st.len[i];
        // foot: out to the side, tilted by angle
        const fx = ax + side * Math.cos(ang) * len;
        const fy = ay - Math.sin(ang) * len + (i > 1 ? len * 0.12 : -len * 0.04);
        // knee: midpoint raised perpendicular (painterly bend)
        const mx = (ax + fx) / 2, my = (ay + fy) / 2;
        const kx = mx + side * (fy - ay) * 0 + (my - ay) * 0;  // keep simple
        const ky = my - Math.abs(len) * st.arch * 0.4;
        const path = `M ${ax.toFixed(1)},${ay.toFixed(1)} Q ${(mx).toFixed(1)},${ky.toFixed(1)} ${fx.toFixed(1)},${fy.toFixed(1)}`;
        const seg = `<path d="${path}" fill="none" stroke="${outline}" stroke-width="${(lw + 1.4).toFixed(1)}" stroke-linecap="round"/>`
          + `<path d="${path}" fill="none" stroke="${legFill}" stroke-width="${lw.toFixed(1)}" stroke-linecap="round"/>`;
        // legs I,II in front of body for laterigrade; else all behind
        if (art.stance === 'lat' && i < 2) legsFront += seg; else legsBack += seg;
        if (art.legSpine && !sil && mode !== 'tile') {
          for (let t = 0.35; t < 0.9; t += 0.28) {
            const px = ax + (fx - ax) * t, py = ay + (ky - ay) * (1 - Math.abs(t - 0.5) * 1.2) + (fy - ay) * t * 0.4;
            spines += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${(px + side * 2.2).toFixed(1)}" y2="${(py - 2.4).toFixed(1)}" stroke="${outline}" stroke-width="0.7" opacity="0.7"/>`;
          }
        }
      }
    }

    // ---- pedipalps + chelicerae hint at the head front ----
    const headY = cephY - cephRy * 0.92;
    let head = '';
    if (!sil) {
      head += `<ellipse cx="${(cx - cephRx * 0.5).toFixed(1)}" cy="${headY.toFixed(1)}" rx="${(2.2 * sc).toFixed(1)}" ry="${(3.4 * sc).toFixed(1)}" fill="${shade(bodyCol, -0.15)}"/>`;
      head += `<ellipse cx="${(cx + cephRx * 0.5).toFixed(1)}" cy="${headY.toFixed(1)}" rx="${(2.2 * sc).toFixed(1)}" ry="${(3.4 * sc).toFixed(1)}" fill="${shade(bodyCol, -0.15)}"/>`;
      if (art.fang) {  // downward fangs for mygalomorphs / dysderids
        head += `<path d="M ${(cx - 3 * sc).toFixed(1)},${headY.toFixed(1)} q ${(-1 * sc).toFixed(1)},${(6 * sc).toFixed(1)} ${(1.5 * sc).toFixed(1)},${(8 * sc).toFixed(1)}" stroke="${shade(bodyCol, -0.5)}" stroke-width="${(2 * sc).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
        head += `<path d="M ${(cx + 3 * sc).toFixed(1)},${headY.toFixed(1)} q ${(1 * sc).toFixed(1)},${(6 * sc).toFixed(1)} ${(-1.5 * sc).toFixed(1)},${(8 * sc).toFixed(1)}" stroke="${shade(bodyCol, -0.5)}" stroke-width="${(2 * sc).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
      }
    }

    // ---- spinnerets at the rear ----
    let spin = '';
    if (art.spin && !sil) {
      const syb = abdY + abdRy * 0.92, n = art.spin;
      const w2 = art.spin === 2 ? 5 : 2.6;
      spin += `<path d="M ${(cx - w2 * sc).toFixed(1)},${syb.toFixed(1)} q 0,${(9 * sc * n).toFixed(1)} ${(w2 * 0.6 * sc).toFixed(1)},${(11 * sc * n).toFixed(1)}" stroke="${shade(abdCol, -0.3)}" stroke-width="${(2 * sc).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
      spin += `<path d="M ${(cx + w2 * sc).toFixed(1)},${syb.toFixed(1)} q 0,${(9 * sc * n).toFixed(1)} ${(-w2 * 0.6 * sc).toFixed(1)},${(11 * sc * n).toFixed(1)}" stroke="${shade(abdCol, -0.3)}" stroke-width="${(2 * sc).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
    }

    // ---- abdomen body ----
    const abdD = abdomenPath(art.abd, cx, abdY, abdRx, abdRy);
    let abdomen = `<path d="${abdD}" fill="${abdFill}" stroke="${outline}" stroke-width="1.1"/>`;
    if (!sil) {
      abdomen += pattern(art.pattern, cx, abdY, abdRx, abdRy, art, r);
      // painterly top-left highlight
      abdomen += `<ellipse cx="${(cx - abdRx * 0.34).toFixed(1)}" cy="${(abdY - abdRy * 0.36).toFixed(1)}" rx="${(abdRx * 0.4).toFixed(1)}" ry="${(abdRy * 0.34).toFixed(1)}" fill="#fff" opacity="0.12"/>`;
    }

    // ---- cephalothorax ----
    let ceph = `<ellipse cx="${cx}" cy="${cephY}" rx="${cephRx.toFixed(1)}" ry="${cephRy.toFixed(1)}" fill="${cephFill}" stroke="${outline}" stroke-width="1.1"/>`;
    if (!sil && art.pattern === 'violin') {
      ceph += `<path d="M ${(cx - 2 * sc)},${(cephY - cephRy * 0.5)} L ${(cx + 2 * sc)},${(cephY - cephRy * 0.5)} L ${(cx + 1.2 * sc)},${(cephY + cephRy * 0.7)} L ${(cx - 1.2 * sc)},${(cephY + cephRy * 0.7)} Z" fill="${shade(bodyCol, -0.5)}" opacity="0.75"/>`;
    }
    // eyes
    const eyeSet = sil ? '' : eyes(art.eyes, cx, cephY - cephRy * 0.45, sc, outline);

    // ---- stipple texture (painterly grain), light for tile mode ----
    let stipple = '';
    if (!sil && mode !== 'tile') {
      const n = 16;
      for (let i = 0; i < n; i++) {
        const ang = r() * 2 * Math.PI, rad = Math.sqrt(r()) * abdRx * 0.92;
        const x = cx + Math.cos(ang) * rad, y = abdY + Math.sin(ang) * rad * (abdRy / abdRx);
        stipple += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.5 + r() * 0.6).toFixed(1)}" fill="${r() > 0.5 ? '#fff' : '#000'}" opacity="0.06"/>`;
      }
    }

    const bg = mode === 'full' ? `<ellipse cx="${cx}" cy="106" rx="34" ry="6" fill="#000" opacity="0.10"/>` : '';

    return `<svg viewBox="0 0 ${VB} ${VB}" xmlns="http://www.w3.org/2000/svg" role="img" class="spr spr-${art.bau}">`
      + `<defs>${defs}</defs>`
      + bg
      + `<g filter="url(#${uid}s)">`
      + legsBack
      + head + spin
      + abdomen
      + ceph + eyeSet
      + legsFront + spines
      + stipple
      + `</g></svg>`;
  }

  // convenience: build art + render in one call
  function forSpecies(sp, opts) {
    const art = (global.AracnarioAdapt ? global.AracnarioAdapt.artFor(sp) : null);
    if (!art) return '';
    return render(art, opts);
  }

  global.AracnarioSprites = { render: render, forSpecies: forSpecies, STANCE: STANCE };
})(window);
