/* Aracnário adapter — Phase 2.
   Turns a live iNaturalist catalogue (from AracnarioINat) into the rich species
   objects the existing UI/render path expects. Exposed as window.AracnarioAdapt.

   Curated-only fields the old static data had (web type, sprite art, day/night,
   medical notes, prose) don't exist in iNat, so we DERIVE them:
     - type / sprite style / body shape  <- spider FAMILY
     - colours                           <- deterministic hash of the taxon id (stable per species)
     - medical level                     <- a small, honest SAFETY overlay (see below)

   SAFETY: we never fabricate medical claims. Only a short, curated set of genuinely
   medically-relevant genera are flagged; every other species is 'unknown' (not
   "harmless"), so the app can never imply a recluse or widow is safe.
*/
(function () {
  // family -> rendering profile. type ∈ TYPES keys; style ∈ LEGS keys; abd ∈ ABD keys.
  const FAM = {
    Araneidae:        { type:'orb',     style:'orb',     abd:'round', mark:'humps', noct:false },
    Tetragnathidae:   { type:'orb',     style:'long',    abd:'elong', mark:'none',  noct:true  },
    Uloboridae:       { type:'orb',     style:'orb',     abd:'elong', mark:'none',  noct:false },
    Theridiidae:      { type:'tangle',  style:'compact', abd:'globe', mark:'none',  noct:true  }, // round widows
    Linyphiidae:      { type:'tangle',  style:'micro',   abd:'round', mark:'none',  noct:false },
    Pholcidae:        { type:'tangle',  style:'long',    abd:'elong', mark:'none',  noct:true  },
    Agelenidae:       { type:'funnel',  style:'funnel',  abd:'oval',  mark:'none',  noct:true  },
    Nemesiidae:       { type:'funnel',  style:'funnel',  abd:'oval',  mark:'none',  noct:true  },
    Macrothelidae:    { type:'funnel',  style:'funnel',  abd:'oval',  mark:'none',  noct:true  },
    Segestriidae:     { type:'tube',    style:'tube',    abd:'elong', mark:'none',  noct:true,  eyes:6 },
    Filistatidae:     { type:'tube',    style:'tube',    abd:'oval',  mark:'none',  noct:true  },
    Salticidae:       { type:'jumper',  style:'jumper',  abd:'egg',   mark:'none',  noct:false, eyes:'big' }, // big head, small body
    Thomisidae:       { type:'crab',    style:'crab',    abd:'flat',  mark:'none',  noct:false }, // laterigrade
    Philodromidae:    { type:'crab',    style:'crab',    abd:'flat',  mark:'none',  noct:false },
    Sparassidae:      { type:'huntsman',style:'huntsman',abd:'flat',  mark:'none',  noct:true  }, // wide sprawl
    Lycosidae:        { type:'wolf',    style:'wolf',    abd:'oval',  mark:'bands', noct:false },
    Pisauridae:       { type:'wolf',    style:'wolf',    abd:'oval',  mark:'none',  noct:false },
    Oxyopidae:        { type:'wolf',    style:'wolf',    abd:'teardrop', mark:'none', noct:false }, // pointed lynx abdomen
    Zoropsidae:       { type:'wolf',    style:'wolf',    abd:'oval',  mark:'none',  noct:true  },
    Gnaphosidae:      { type:'specialist', style:'ground', abd:'elong', mark:'none', noct:true  }, // slim ground spiders
    Sicariidae:       { type:'recluse', style:'recluse', abd:'oval',  mark:'violin',noct:true,  eyes:6 },
    Dysderidae:       { type:'specialist', style:'recluse', abd:'elong', mark:'none', noct:true, eyes:6 },
    Scytodidae:       { type:'specialist', style:'compact', abd:'round', mark:'none', noct:true, eyes:6 }, // domed
    Eresidae:         { type:'specialist', style:'ground', abd:'globe', mark:'none', noct:false }, // squat, round
    Oecobiidae:       { type:'specialist', style:'micro', abd:'flat',  mark:'none', noct:false },
    Eutichuridae:     { type:'specialist', style:'compact', abd:'oval', mark:'none', noct:true  },
    Cheiracanthiidae: { type:'specialist', style:'compact', abd:'oval', mark:'none', noct:true  },
    Symphytognathidae:{ type:'specialist', style:'micro', abd:'round', mark:'none', noct:true,  eyes:null },
  };
  const DEFAULT_FAM = { type:'specialist', style:'compact', abd:'oval', mark:'none', noct:false };

  /* Per-family abdomen variety (chosen per species by hash), where a family naturally
     spans more than one body shape. Falls back to FAM[fam].abd otherwise. */
  const ABDS = {
    Araneidae:   ['bulb', 'teardrop', 'bulb'],     // bulbous belly vs pointed (Argiope/Mangora)
    Theridiidae: ['globe', 'oval'],
    Salticidae:  ['egg', 'egg', 'oval'],
    Lycosidae:   ['oval', 'elong'],
    Thomisidae:  ['flat', 'flat', 'round'],
  };

  const TYPE_WEB = {
    orb:'Builds a vertical orb web', tangle:'Builds a tangled cobweb', funnel:'Sheet web with a funnel retreat',
    tube:'Lives in a silk tube', jumper:'No snare web — hunts by sight', crab:'No web — ambushes on flowers/foliage',
    huntsman:'No web — a free-running hunter', wolf:'No snare web — a ground hunter',
    recluse:'Irregular threads near a retreat', specialist:'Specialised silk use',
  };

  /* Family-level habitat & diet — general, well-established natural-history facts for the
     FAMILY (iNat doesn't give us per-species curated text, so this is the honest level of
     detail we can offer for the live 400; never presented as species-specific). */
  const FAM_HABITAT = {
    Araneidae:'Webs spun between vegetation, fences and structures, usually head-height or above',
    Tetragnathidae:'Stretched-out on webs over water, reeds and tall grass',
    Uloboridae:'Fine orb or ladder webs in vegetation and on structures',
    Theridiidae:'Tangled webs in sheltered corners — vegetation, walls, under stones',
    Linyphiidae:'Low vegetation and leaf litter, under small sheet webs',
    Pholcidae:'Indoors and sheltered cavities — cellars, corners, under furniture',
    Agelenidae:'Sheet webs in vegetation, walls and crevices, with a funnel retreat',
    Nemesiidae:'Silk-lined burrows in soil banks, often with a camouflaged lid',
    Macrothelidae:'Burrows in soil, under stones or logs',
    Segestriidae:'Silk-lined tubes in wall crevices, bark and rock cracks',
    Filistatidae:'Crevices and corners behind a tangled silk collar',
    Salticidae:'Sunny walls, foliage and tree trunks',
    Thomisidae:'Flowers and foliage, sitting motionless in wait',
    Philodromidae:'Bark, walls and foliage',
    Sparassidae:'Walls, tree trunks and indoors',
    Lycosidae:'Ground level, among grass, stones and leaf litter',
    Pisauridae:'Vegetation near water or damp ground',
    Oxyopidae:'Low, sunny vegetation and scrub',
    Zoropsidae:'Walls and crevices around buildings',
    Gnaphosidae:'Under stones, bark and leaf litter',
    Sicariidae:'Dark, undisturbed places, often near or inside buildings',
    Dysderidae:'Under stones, bark and logs',
    Scytodidae:'Walls and dark corners, indoors and out',
    Eresidae:'Burrows in dry, open ground behind a silk collar',
    Oecobiidae:'Flat wall surfaces, under bark or stones',
    Eutichuridae:'Foliage and grass',
    Cheiracanthiidae:'Rolled leaves and grass stems, inside a silk sac retreat',
    Symphytognathidae:'Leaf litter and low, damp vegetation',
    Phonognathidae:'Small orb webs slung in vegetation',
    Palpimanidae:'Leaf litter and soil surface',
    Phrurolithidae:'Leaf litter and low vegetation',
    Dictynidae:'Small meshwork webs on vegetation, bark or walls',
    Halonoproctidae:'Silk-lined burrows with a camouflaged trapdoor lid',
    Atypidae:'A silk tube up a tree trunk or low plant, mostly underground',
    Anyphaenidae:'Foliage and bark',
    Corinnidae:'Ground litter and low vegetation, often mimicking ants',
    Zodariidae:'Open, dry ground',
    Prodidomidae:'Soil surface and leaf litter',
    Clubionidae:'Leaf litter and bark, inside a silk sac retreat',
    Liocranidae:'Ground litter and low vegetation',
    Amaurobiidae:'Bark, walls and rock crevices, behind a lacy blue-white web',
    Miturgidae:'Vegetation and leaf litter',
    Titanoecidae:'Rock crevices and walls, under irregular silk',
    Mimetidae:'Vegetation, often inside another spider’s web',
    Cithaeronidae:'Ground level, under stones and litter',
    Nesticidae:'Caves, cellars and other dark, damp places, behind a tangled web',
    Selenopidae:'Flattened against bark or walls, fast-running',
    Oonopidae:'Leaf litter and soil, very small-bodied',
    Lathyidae:'Low vegetation and leaf litter',
    Hersiliidae:'Flattened against tree bark',
  };
  const FAM_DIET = {
    Araneidae:'Flying insects caught in the web',
    Tetragnathidae:'Small flying insects, especially near water',
    Uloboridae:'Small insects snared in the web',
    Theridiidae:'Insects and other small arthropods entangled in the web',
    Linyphiidae:'Tiny insects that fall onto or fly into the sheet web',
    Pholcidae:'Insects and other spiders caught in loose web',
    Agelenidae:'Insects that wander onto the sheet web',
    Nemesiidae:'Insects and other invertebrates ambushed at the burrow entrance',
    Macrothelidae:'Large insects and other invertebrates',
    Segestriidae:'Insects that trip the tripwire threads radiating from the tube',
    Filistatidae:'Small insects',
    Salticidae:'Small insects, stalked and pounced on',
    Thomisidae:'Pollinating insects ambushed at flowers',
    Philodromidae:'Small insects caught by ambush',
    Sparassidae:'Insects and other invertebrates, run down on foot',
    Lycosidae:'Insects chased down or ambushed on the ground',
    Pisauridae:'Insects, and occasionally small aquatic prey, caught by ambush',
    Oxyopidae:'Insects stalked and pounced on using sharp eyesight',
    Zoropsidae:'Insects caught by active hunting at night',
    Gnaphosidae:'Ground-dwelling insects and other invertebrates',
    Sicariidae:'Small insects',
    Dysderidae:'Woodlice and other ground invertebrates',
    Scytodidae:'Small insects, immobilised with a spat sticky gum',
    Eresidae:'Insects, including ants, trapped near the burrow',
    Oecobiidae:'Tiny insects, especially ants',
    Eutichuridae:'Small insects',
    Cheiracanthiidae:'Small insects, hunted at night',
    Symphytognathidae:'Minute invertebrates caught in a tiny web',
    Phonognathidae:'Small flying insects caught in the web',
    Palpimanidae:'Other spiders, hunted on foot',
    Phrurolithidae:'Small insects hunted on foot',
    Dictynidae:'Small insects snared in the mesh web',
    Halonoproctidae:'Ground insects ambushed at the trapdoor',
    Atypidae:'Insects that land on or walk over the silk tube',
    Anyphaenidae:'Small insects, hunted at night',
    Corinnidae:'Ants and other small insects',
    Zodariidae:'Ants, often specialised hunters of a particular species',
    Prodidomidae:'Small ground-dwelling invertebrates',
    Clubionidae:'Small insects, hunted at night',
    Liocranidae:'Small insects',
    Amaurobiidae:'Insects trapped in the lace-like web',
    Miturgidae:'Small insects, hunted at night',
    Titanoecidae:'Small insects',
    Mimetidae:'Other spiders, including the host of the web it invades',
    Cithaeronidae:'Small ground invertebrates',
    Nesticidae:'Small insects entangled in the web',
    Selenopidae:'Insects ambushed on bark or walls',
    Oonopidae:'Minute invertebrates',
    Lathyidae:'Small insects',
    Hersiliidae:'Insects ambushed on the bark surface',
  };

  /* Honest medical overlay, matched by genus (first word of the scientific name).
     Sources: well-documented Iberian/Mediterranean medically-relevant taxa. */
  const SAFETY = {
    Loxosceles:    { level:'significant', text:'Recluse spider. Bites are rare but can cause a slow-healing wound; if bitten, keep the area clean and seek medical advice.' },
    Latrodectus:   { level:'significant', text:'A true widow. Bites are uncommon but venom is neurotoxic and can cause systemic symptoms; seek medical advice if bitten.' },
    Cheiracanthium:{ level:'minor',       text:'Sac spider. Can deliver a locally painful bite, but it is not considered dangerous.' },
    Macrothele:    { level:'minor',       text:'Large mygalomorph with sizeable fangs; defensive if cornered. Protected species — do not handle.' },
    Steatoda:      { level:'minor',       text:'False widow. May give a painful bite if pressed against skin, but it is not medically dangerous.' },
    Zoropsis:      { level:'minor',       text:'Can bite if handled; effect is mild and short-lived.' },
  };
  const DEFAULT_MED = {
    level:'unknown',
    text:'No curated medical information for this species. Aracnário is a learning aid, not a medical or identification guide — never rely on it to assess a bite.',
  };

  // deterministic hash of a taxon id, for stable per-species variation
  function hashId(n) { let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h; }
  function hsl2hex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }

  /* Per-family colour themes — naturalistic hue/saturation/lightness ranges that read as
     that family, with a per-species point chosen by the id hash so no two look identical.
     acc = how the marking accent is derived. */
  const THEME = {
    Araneidae:        { h:[20,40],  s:[30,55], l:[30,52], acc:'cream'  }, // rust/brown orb-weavers
    Tetragnathidae:   { h:[36,54],  s:[18,40], l:[42,60], acc:'dark'   }, // long-jawed, greenish tan
    Uloboridae:       { h:[24,40],  s:[14,32], l:[40,58], acc:'dark'   },
    Theridiidae:      { h:[18,34],  s:[10,40], l:[12,28], acc:'red'    }, // dark cobweb / widows
    Linyphiidae:      { h:[20,34],  s:[10,28], l:[26,44], acc:'dark'   },
    Pholcidae:        { h:[30,46],  s:[8,20],  l:[56,72], acc:'dark'   }, // pale translucent cellar
    Agelenidae:       { h:[22,38],  s:[24,44], l:[28,45], acc:'cream'  },
    Nemesiidae:       { h:[18,30],  s:[20,40], l:[18,32], acc:'dark'   },
    Macrothelidae:    { h:[0,18],   s:[4,18],  l:[8,18],  acc:'dark'   }, // glossy black mygalomorph
    Segestriidae:     { h:[16,30],  s:[20,44], l:[16,30], acc:'dark'   },
    Filistatidae:     { h:[20,32],  s:[16,34], l:[26,42], acc:'dark'   },
    Salticidae:       { h:[0,32],   s:[10,46], l:[16,40], acc:'light'  }, // dark jumpers, white/red
    Thomisidae:       { h:[42,150], s:[24,56], l:[60,82], acc:'red'    }, // pastel crab spiders
    Philodromidae:    { h:[25,45],  s:[12,30], l:[46,62], acc:'dark'   },
    Sparassidae:      { h:[28,42],  s:[14,34], l:[42,58], acc:'dark'   }, // tan/grey huntsman
    Lycosidae:        { h:[24,38],  s:[22,42], l:[26,44], acc:'cream'  }, // striped wolf spiders
    Pisauridae:       { h:[26,40],  s:[22,42], l:[32,50], acc:'cream'  },
    Oxyopidae:        { h:[60,110], s:[24,50], l:[40,60], acc:'dark'   }, // green lynx
    Zoropsidae:       { h:[22,36],  s:[12,30], l:[30,48], acc:'dark'   }, // mottled grey-brown
    Gnaphosidae:      { h:[0,30],   s:[5,20],  l:[12,28], acc:'dark'   }, // dark ground spiders
    Sicariidae:       { h:[22,34],  s:[26,46], l:[36,52], acc:'dark'   }, // tan recluse
    Dysderidae:       { h:[8,20],   s:[36,60], l:[30,46], acc:'orange' }, // reddish woodlouse hunters
    Scytodidae:       { h:[40,52],  s:[20,40], l:[56,70], acc:'dark'   }, // pale spitting spiders
    Eresidae:         { h:[0,10],   s:[14,40], l:[10,24], acc:'red'    }, // black "ladybird" spider
    Oecobiidae:       { h:[24,40],  s:[12,28], l:[40,58], acc:'dark'   },
    Eutichuridae:     { h:[36,50],  s:[20,40], l:[46,62], acc:'dark'   },
    Cheiracanthiidae: { h:[38,52],  s:[22,42], l:[50,66], acc:'dark'   }, // pale sac spiders
    Symphytognathidae:{ h:[24,38],  s:[10,25], l:[34,50], acc:'dark'   },
  };
  const DEFAULT_THEME = { h:[22,40], s:[18,38], l:[30,48], acc:'dark' };

  const pick = (seed, lo, hi) => lo + (seed % 997) / 997 * (hi - lo);
  function colorFor(tid, family) {
    const t = THEME[family] || DEFAULT_THEME;
    const hue = pick(hashId(tid), t.h[0], t.h[1]);
    const sat = pick(hashId(tid * 2 + 1), t.s[0], t.s[1]);
    const lig = pick(hashId(tid * 3 + 7), t.l[0], t.l[1]);
    const body = hsl2hex(hue, sat, lig);
    const leg = hsl2hex(hue, sat, Math.max(12, lig - 12));
    let accent;
    if (t.acc === 'red') accent = hsl2hex(2, 68, 46);
    else if (t.acc === 'orange') accent = hsl2hex(22, 72, 46);
    else if (t.acc === 'cream') accent = hsl2hex(42, 30, 82);
    else if (t.acc === 'light') accent = hsl2hex(40, 12, 87);
    else accent = hsl2hex(hue, Math.min(60, sat + 10), Math.max(8, lig - 26)); // 'dark'
    return { body, leg, accent };
  }

  /* Per-family marking repertoires (vocabulary the renderer understands), one chosen
     per species by the id hash so a family shows variety rather than one look. */
  const MARKINGS = {
    Araneidae:   ['cross', 'humps', 'cap', 'none'],
    Theridiidae: ['none', 'spots13', 'none'],
    Salticidae:  ['none', 'maleStripe', 'fourspots', 'none'],
    Thomisidae:  ['none', 'humps', 'none'],
    Lycosidae:   ['bands', 'maleStripe', 'none'],
    Pisauridae:  ['maleStripe', 'bands', 'none'],
    Agelenidae:  ['bands', 'cream', 'none'],
    Sicariidae:  ['violin'],
    Eresidae:    ['fourspots', 'spots13'],
    Segestriidae:['none', 'maleStripe'],
  };

  // months (1..12) with notable activity, from an iNat month-of-year histogram
  function activeMonths(mo) {
    if (!mo || !mo.length) return [];
    const mx = Math.max.apply(null, mo); if (!mx) return [];
    const out = [];
    mo.forEach((c, i) => { if (c >= mx * 0.4) out.push(i + 1); });
    return out;
  }

  function adaptOne(live, indexForNum) {
    const fam = live.fam || '';
    const prof = FAM[fam] || DEFAULT_FAM;
    const col = colorFor(live.tid, fam);
    const genus = (live.sci || '').split(' ')[0];
    const med = SAFETY[genus] || DEFAULT_MED;
    const eyes = ('eyes' in prof) ? prof.eyes : 8;
    const markSet = MARKINGS[fam];
    const marking = markSet ? markSet[hashId(live.tid * 5 + 3) % markSet.length] : prof.mark;
    const abdSet = ABDS[fam];
    const abd = abdSet ? abdSet[hashId(live.tid * 7 + 11) % abdSet.length] : prof.abd;
    const art = {
      body: col.body, leg: col.leg, accent: col.accent,
      style: prof.style, abd: abd, marking: marking,
      eyes: eyes === 'big' ? 'big' : (eyes === null ? 'none' : eyes),
    };
    const isGenus = live.rank && live.rank !== 'species';
    return {
      id: live.tid,
      num: String(indexForNum + 1).padStart(3, '0'),
      en: live.en || live.sci || 'Unknown spider',
      pt: live.pt || '',                   // Portuguese common name (via enrichPortuguese)
      sci: live.sci + (isGenus ? ' spp.' : ''),
      fam: fam || '—',
      type: prof.type,
      habitatTag: '',
      rarity: live.rarity || 'uncommon',
      noct: !!prof.noct,
      // narrative: mostly derived; desc upgraded lazily from Wikipedia in the modal
      size: '', active: prof.noct ? 'Mostly at night' : 'Day-active',
      web: TYPE_WEB[prof.type] || '',
      habitat: FAM_HABITAT[fam] || '', diet: FAM_DIET[fam] || '',
      region: live.count > 0
        ? (live.count.toLocaleString('en-GB') + ' research-grade record' + (live.count === 1 ? '' : 's') + ' in Portugal (iNaturalist)')
        : 'No research-grade records in Portugal yet',
      desc: (live.en || live.sci) + ' is a spider in the family ' + (fam || 'unknown') + '.',
      medical: { level: med.level, text: med.text },
      fact: '',
      eyes: eyes,                          // separate from art.eyes; shown in modal "Eyes" row
      mm: null, months: [], lifespan: '', etym: '', idTip: '', similar: '', endemic: '',
      art: art,
      // iNat block consumed by inatImg / inatStat / inatSeason
      inat: {
        n: live.count || 0, t: live.tid,
        p: live.photo || '',               // already medium_url; '' when license withheld -> sprite shows
        l: live.license || '', by: live.attribution || '',
        g: isGenus ? 1 : 0, mo: [],        // monthly histogram filled lazily in the modal
      },
    };
  }

  function liveToSpecies(catalog) {
    const list = (catalog && catalog.species) || [];
    return list.map((s, i) => adaptOne(s, i));
  }

  window.AracnarioAdapt = { liveToSpecies, adaptOne, activeMonths, FAM, SAFETY };
})();
