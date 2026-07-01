/* ============================================================
   Aracnário — adapt.js  (v2, ground-up rewrite)
   Turns a catalogue species record into an `art` descriptor that
   the painterly sprite engine (sprites.js) consumes.

   Two responsibilities:
     1) FAMILY morphology — map each of Portugal's 57 spider families to a
        real "bauplan" (body plan): leg stance, abdomen shape, eye pattern,
        pattern motif, and a family-typical palette range.  Informed by the
        per-family character notes in data/keys.json (eyes / body / legs).
     2) Per-species variation — a deterministic palette + pattern seeded from
        the iNaturalist taxon id, so species inside a family differ while
        staying recognisably on-family.  Hand-authored "featured" species keep
        their curated colours/markings.

   Exposes: window.AracnarioAdapt.artFor(species)  ->  art object
   ============================================================ */
(function (global) {
  'use strict';

  /* ---- deterministic PRNG seeded from a species (taxon id or name) -------- */
  function seedOf(sp) {
    let h = 2166136261;
    const s = String(sp.inat || sp.sci || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {                      // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- HSL -> hex --------------------------------------------------------- */
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }

  /* ---- bauplan defaults: leg stance, abdomen, eye pattern ----------------
     stance:  arch (upright hunters/orb) · lat (laterigrade crab/huntsman)
              long (pholcid) · robust (wolf/mygalomorph) · sleek (ground)
     Each family below can override abd / eyes / pattern / hairy / scale.    */
  const BAUPLAN = {
    orb:     { stance: 'arch',   abd: 'globe',  eyes: 'orb2row',  legLen: 1.0,  legSpine: 1, hairy: 0 },
    tangle:  { stance: 'arch',   abd: 'sphere', eyes: 'orb2row',  legLen: 1.05, legSpine: 0, hairy: 0 },
    crab:    { stance: 'lat',    abd: 'trapz',  eyes: 'crabrow',  legLen: 0.9,  legSpine: 0, hairy: 0 },
    huntsman:{ stance: 'lat',    abd: 'oval',   eyes: 'huntrow',  legLen: 1.35, legSpine: 0, hairy: 1 },
    wolf:    { stance: 'robust', abd: 'oval',   eyes: 'wolf3row', legLen: 1.0,  legSpine: 1, hairy: 1 },
    jumper:  { stance: 'arch',   abd: 'ovalS',  eyes: 'jump2big', legLen: 0.72, legSpine: 0, hairy: 1 },
    funnel:  { stance: 'arch',   abd: 'oval',   eyes: 'orb2row',  legLen: 1.1,  legSpine: 1, hairy: 0, spin: 1 },
    pholcid: { stance: 'long',   abd: 'pill',   eyes: 'clump',    legLen: 2.1,  legSpine: 0, hairy: 0 },
    ground:  { stance: 'sleek',  abd: 'ovalL',  eyes: 'orb2row',  legLen: 0.95, legSpine: 0, hairy: 0 },
    sixeye:  { stance: 'sleek',  abd: 'pill',   eyes: 'six',      legLen: 1.05, legSpine: 0, hairy: 0 },
    mygal:   { stance: 'robust', abd: 'oval',   eyes: 'clump',    legLen: 0.95, legSpine: 0, hairy: 1, fang: 1, scale: 1.1 },
    velvet:  { stance: 'robust', abd: 'round',  eyes: 'clump',    legLen: 0.8,  legSpine: 0, hairy: 1, scale: 0.95 },
    crevice: { stance: 'sleek',  abd: 'oval',   eyes: 'clump',    legLen: 1.0,  legSpine: 0, hairy: 1 },
    micro:   { stance: 'arch',   abd: 'sphere', eyes: 'clump',    legLen: 0.9,  legSpine: 0, hairy: 0, scale: 0.7 },
  };

  /* ---- the 57 Portuguese families -> bauplan + palette range + motif ------
     hue:[base,spread]  · sat:[lo,hi]  · light:[lo,hi]  · pat: default pattern
     acc: optional accent hue (e.g. red widow marks). Overrides on abd/eyes
     express the family-diagnostic silhouette where it differs from the base. */
  const FAM = {
    // — orb-weavers & kin (plump, spiny, small 2-row eyes) —
    Araneidae:        { bau: 'orb', hue: [28, 70], sat: [20, 55], light: [30, 62], pat: 'folium' },
    Tetragnathidae:   { bau: 'orb', abd: 'pill', legLen: 1.5, hue: [45, 40], sat: [18, 40], light: [40, 66], pat: 'silver' },
    Uloboridae:       { bau: 'orb', abd: 'humpk', hue: [30, 30], sat: [12, 30], light: [45, 68], pat: 'mottle', legSpine: 1 },
    Theridiosomatidae:{ bau: 'micro', hue: [30, 40], sat: [15, 40], light: [40, 65], pat: 'mottle' },
    Mysmenidae:       { bau: 'micro', hue: [20, 30], sat: [15, 35], light: [35, 60], pat: 'plain' },
    Symphytognathidae:{ bau: 'micro', hue: [30, 30], sat: [15, 35], light: [40, 62], pat: 'plain', scale: 0.6 },
    Synaphridae:      { bau: 'micro', hue: [35, 30], sat: [12, 30], light: [45, 65], pat: 'plain' },
    Mimetidae:        { bau: 'orb', abd: 'humpk', hue: [30, 60], sat: [22, 48], light: [42, 66], pat: 'spots', legSpine: 1 },

    // — cobweb / sheet (globular, thin legs) —
    Theridiidae:      { bau: 'tangle', hue: [24, 40], sat: [10, 45], light: [18, 45], pat: 'spots', acc: 356 },
    Nesticidae:       { bau: 'tangle', hue: [30, 30], sat: [12, 32], light: [40, 62], pat: 'chevrons' },
    Linyphiidae:      { bau: 'tangle', abd: 'ovalS', hue: [26, 40], sat: [10, 35], light: [20, 48], pat: 'plain', scale: 0.7 },

    // — crab spiders (laterigrade, long forelegs) —
    Thomisidae:       { bau: 'crab', hue: [50, 120], sat: [25, 70], light: [55, 82], pat: 'shoulders' },
    Philodromidae:    { bau: 'crab', abd: 'ovalL', hue: [35, 40], sat: [12, 38], light: [45, 70], pat: 'mottle', legLen: 1.05 },

    // — huntsman / flat wall-runners —
    Sparassidae:      { bau: 'huntsman', hue: [40, 90], sat: [15, 55], light: [40, 68], pat: 'plain' },
    Selenopidae:      { bau: 'huntsman', abd: 'flat', hue: [30, 30], sat: [10, 30], light: [45, 68], pat: 'mottle' },
    Hersiliidae:      { bau: 'huntsman', abd: 'flat', hue: [32, 30], sat: [10, 32], light: [48, 70], pat: 'mottle', spin: 2 },

    // — wolf & wandering hunters (robust, 3-row / big PME eyes) —
    Lycosidae:        { bau: 'wolf', hue: [26, 26], sat: [15, 45], light: [22, 48], pat: 'stripe' },
    Pisauridae:       { bau: 'wolf', hue: [30, 30], sat: [15, 42], light: [30, 55], pat: 'stripe' },
    Oxyopidae:        { bau: 'wolf', abd: 'point', eyes: 'lynx', hue: [50, 60], sat: [30, 60], light: [45, 70], pat: 'chevrons', legSpine: 1 },
    Zoropsidae:       { bau: 'wolf', hue: [28, 24], sat: [16, 42], light: [30, 52], pat: 'folium' },
    Miturgidae:       { bau: 'ground', hue: [34, 26], sat: [16, 40], light: [40, 62], pat: 'stripe' },

    // — jumping spiders (compact, huge front eyes) —
    Salticidae:       { bau: 'jumper', hue: [0, 360], sat: [18, 60], light: [22, 55], pat: 'bands' },

    // — funnel-web / sheet-with-tube (long spinnerets) —
    Agelenidae:       { bau: 'funnel', hue: [28, 26], sat: [16, 42], light: [26, 50], pat: 'stripe' },
    Hahniidae:        { bau: 'funnel', abd: 'ovalS', hue: [28, 26], sat: [14, 36], light: [30, 52], pat: 'chevrons', scale: 0.7 },
    Cybaeidae:        { bau: 'funnel', hue: [28, 24], sat: [14, 36], light: [28, 50], pat: 'plain' },
    Cicurinidae:      { bau: 'funnel', hue: [30, 24], sat: [12, 32], light: [34, 56], pat: 'plain' },
    Argyronetidae:    { bau: 'funnel', hue: [30, 24], sat: [14, 34], light: [34, 56], pat: 'plain' },

    // — daddy-long-legs —
    Pholcidae:        { bau: 'pholcid', hue: [40, 30], sat: [8, 26], light: [55, 78], pat: 'plain' },

    // — ground / sac / ant-hunters (sleek nocturnal) —
    Gnaphosidae:      { bau: 'ground', hue: [26, 30], sat: [8, 35], light: [16, 40], pat: 'plain' },
    Clubionidae:      { bau: 'ground', hue: [34, 26], sat: [16, 40], light: [45, 68], pat: 'plain' },
    Cheiracanthiidae: { bau: 'ground', hue: [46, 26], sat: [18, 42], light: [55, 78], pat: 'plain' },
    Anyphaenidae:     { bau: 'ground', hue: [42, 30], sat: [16, 40], light: [48, 70], pat: 'spots' },
    Corinnidae:       { bau: 'ground', hue: [24, 26], sat: [14, 42], light: [22, 46], pat: 'bands' },
    Liocranidae:      { bau: 'ground', hue: [30, 26], sat: [14, 38], light: [34, 56], pat: 'chevrons' },
    Trachelidae:      { bau: 'ground', hue: [18, 30], sat: [24, 50], light: [30, 52], pat: 'plain' },
    Phrurolithidae:   { bau: 'ground', abd: 'ovalS', hue: [26, 26], sat: [16, 40], light: [30, 52], pat: 'bands', scale: 0.75 },
    Prodidomidae:     { bau: 'ground', hue: [26, 24], sat: [10, 32], light: [26, 48], pat: 'plain' },
    Cithaeronidae:    { bau: 'ground', hue: [34, 24], sat: [12, 34], light: [40, 62], pat: 'plain' },
    Zodariidae:       { bau: 'ground', abd: 'ovalS', eyes: 'clump', hue: [24, 30], sat: [18, 48], light: [26, 50], pat: 'spots', scale: 0.85 },

    // — six-eyed lineages (recluse / spitting / woodlouse / tube) —
    Sicariidae:       { bau: 'sixeye', hue: [26, 20], sat: [26, 48], light: [42, 62], pat: 'violin' },
    Scytodidae:       { bau: 'sixeye', abd: 'dome', hue: [46, 30], sat: [22, 46], light: [60, 80], pat: 'speck' },
    Dysderidae:       { bau: 'sixeye', abd: 'pill', hue: [8, 16], sat: [30, 55], light: [34, 54], pat: 'plain', fang: 1 },
    Segestriidae:     { bau: 'sixeye', abd: 'pill', hue: [24, 20], sat: [12, 34], light: [24, 46], pat: 'plain', fwd3: 1 },
    Oonopidae:        { bau: 'sixeye', abd: 'sphere', hue: [18, 30], sat: [34, 58], light: [50, 70], pat: 'plain', scale: 0.6 },
    Leptonetidae:     { bau: 'sixeye', hue: [40, 30], sat: [12, 30], light: [56, 76], pat: 'plain', scale: 0.7 },
    Lathyidae:        { bau: 'sixeye', abd: 'pill', hue: [26, 20], sat: [16, 36], light: [34, 54], pat: 'plain', scale: 0.7 },

    // — mygalomorphs (stout, downward fangs) —
    Nemesiidae:       { bau: 'mygal', hue: [24, 18], sat: [12, 34], light: [18, 40], pat: 'plain' },
    Atypidae:         { bau: 'mygal', abd: 'ovalL', hue: [20, 16], sat: [14, 36], light: [16, 38], pat: 'plain', fang: 1 },
    Macrothelidae:    { bau: 'mygal', hue: [230, 18], sat: [10, 30], light: [12, 32], pat: 'plain', spin: 2 },
    Halonoproctidae:  { bau: 'mygal', abd: 'flat', hue: [24, 16], sat: [12, 32], light: [20, 40], pat: 'plain' },

    // — velvet spiders (squat, hairy; male ladybird) —
    Eresidae:         { bau: 'velvet', hue: [10, 20], sat: [10, 60], light: [16, 46], pat: 'ladybird', acc: 356 },

    // — cribellate crevice weavers & oddments —
    Filistatidae:     { bau: 'crevice', abd: 'oval', hue: [26, 24], sat: [12, 34], light: [24, 46], pat: 'plain' },
    Amaurobiidae:     { bau: 'crevice', hue: [26, 24], sat: [14, 38], light: [22, 44], pat: 'folium' },
    Titanoecidae:     { bau: 'crevice', hue: [26, 20], sat: [10, 30], light: [20, 42], pat: 'plain' },
    Dictynidae:       { bau: 'crevice', abd: 'ovalS', hue: [30, 26], sat: [12, 34], light: [30, 52], pat: 'chevrons', scale: 0.7 },
    Oecobiidae:       { bau: 'crevice', abd: 'flat', hue: [34, 26], sat: [10, 30], light: [42, 64], pat: 'speck', scale: 0.7 },
    Palpimanidae:     { bau: 'ground', hue: [8, 18], sat: [34, 56], light: [34, 52], pat: 'plain', bigpalp: 1 },
  };

  const FALLBACK = { bau: 'ground', hue: [30, 40], sat: [14, 40], light: [30, 55], pat: 'plain' };

  /* ---- curated (featured 45) marking + style -> new vocabulary ------------ */
  const STYLE2BAU = {
    orb: 'orb', tangle: 'tangle', funnel: 'funnel', tube: 'sixeye', wolf: 'wolf',
    crab: 'crab', huntsman: 'huntsman', jumper: 'jumper', compact: 'jumper',
    long: 'pholcid', recluse: 'sixeye', micro: 'micro', ground: 'ground',
  };
  const MARK2PAT = {
    cross: 'cross', bands: 'bands', humps: 'shoulders', lobes: 'lobes', cap: 'cap',
    violin: 'violin', cream: 'plain', fourspots: 'spots', maleStripe: 'stripe',
    spots13: 'spots', stripesBW: 'bands', none: 'plain',
  };

  /* ---- shade helper: mix a hex toward white (dl>0) or black (dl<0) -------- */
  function shade(hex, dl) {
    const h = hex.replace('#', '');
    let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const t = dl < 0 ? 0 : 255, k = Math.abs(dl);
    r = Math.round(r + (t - r) * k); g = Math.round(g + (t - g) * k); b = Math.round(b + (t - b) * k);
    const to = v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }

  // old curated abd names -> new abd silhouette names
  function mapAbd(a) {
    return ({ round: 'round', bulb: 'globe', globe: 'globe', oval: 'oval',
      elong: 'pill', flat: 'flat', teardrop: 'point', egg: 'ovalS' })[a];
  }

  /* ---- the public builder ------------------------------------------------- */
  function artFor(sp) {
    const fam = FAM[sp.fam] || FALLBACK;
    const base = BAUPLAN[fam.bau] || BAUPLAN.ground;
    const rand = rng(seedOf(sp));

    // palette: hue seeded within the family range, saturation/lightness jittered
    const hue = fam.hue[0] + rand() * fam.hue[1];
    const sat = fam.sat[0] + rand() * (fam.sat[1] - fam.sat[0]);
    const light = fam.light[0] + rand() * (fam.light[1] - fam.light[0]);
    let bodyCol = hsl(hue, sat, light);
    let abdCol = hsl(hue, sat * 0.9, light + 6);
    let legCol = shade(bodyCol, -0.22);
    let accent = fam.acc != null ? hsl(fam.acc, 62, 46) : shade(bodyCol, light > 50 ? -0.35 : 0.28);
    let belly = shade(bodyCol, 0.35);

    let pattern = fam.pat || base.pat || 'plain';
    let eyes = fam.eyes || base.eyes;
    let abd = fam.abd || base.abd;

    // featured species: honour the hand-authored colours + marking
    if (sp.feat && sp.art) {
      const a = sp.art;
      if (a.body) { bodyCol = a.body; abdCol = shade(a.body, 0.08); belly = shade(a.body, 0.34); accent = shade(a.body, light > 50 ? -0.4 : 0.3); }
      if (a.leg) legCol = a.leg;
      if (a.marking && MARK2PAT[a.marking]) pattern = MARK2PAT[a.marking];
      if (a.abd) abd = mapAbd(a.abd) || abd;
      if (a.eyes === 'big') eyes = 'jump2big';
      if (a.eyes === '6') eyes = 'six';
    }

    return {
      bau: fam.bau, stance: base.stance, abd, eyes, pattern,
      legLen: fam.legLen || base.legLen, legSpine: base.legSpine,
      hairy: base.hairy, scale: fam.scale || base.scale || 1,
      spin: fam.spin || base.spin || 0, fang: fam.fang || base.fang || 0,
      fwd3: fam.fwd3 || 0, bigpalp: fam.bigpalp || 0,
      body: bodyCol, abdCol: abdCol, leg: legCol, accent: accent, belly: belly,
      accHue: fam.acc,
    };
  }

  global.AracnarioAdapt = { artFor: artFor, FAM: FAM, BAUPLAN: BAUPLAN, hsl: hsl, shade: shade };
})(window);
