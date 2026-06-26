/* Aracnário live data — Phase 2.
   A privacy-first iNaturalist client. Exposed as window.AracnarioINat.

   PRIVACY & SAFETY (deliberate, not incidental):
   - Location is OPTIONAL. The default scope is all of Portugal (place_id), no GPS needed.
   - When the user opts into "near me", we request LOW-accuracy location (no precise GPS) and
     COARSEN it to ~1 decimal (~11 km) before it ever leaves the device or hits the cache.
   - Only the single most-recent coarse area is cached (key 'nearby:last'); no location history.
   - quality_grade=research everywhere → only community-verified IDs, never an unconfirmed guess.
   - Only OPENLY-LICENSED photos are surfaced; all-rights-reserved photos are withheld and the
     app falls back to the procedural sprite. Attribution + license always travel with a photo.
   - All requests are HTTPS to api.inaturalist.org only. No third parties, no analytics.
   - Callers MUST escape API-derived strings before inserting into the DOM (the app's esc()).

   Network etiquette: the Portugal catalogue is one call, cached for days; detail/seasonality
   are lazy and cached per-taxon. We never fetch in a loop over the whole list at app start.
*/
(function () {
  const API = 'https://api.inaturalist.org/v1';
  const ARANEAE = 47118;        // order Araneae (spiders)
  const PORTUGAL = 7122;        // iNat place_id for Portugal
  const CATALOG_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Licenses we consider safe to display. Anything else (incl. null = all rights reserved)
  // is withheld and the caller should fall back to the sprite.
  const OPEN_LICENSES = new Set(['cc0', 'pd', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd']);
  const photoIsOpen = (code) => !!code && OPEN_LICENSES.has(String(code).toLowerCase());

  const db = () => window.AracnarioDB;

  /* ---- privacy helpers ---- */
  // Round to 1 decimal (~11 km) so we never transmit or store a precise position.
  const coarsen = (n) => Math.round(Number(n) * 10) / 10;

  function getCoarseLocation() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('Geolocation unavailable'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: coarsen(pos.coords.latitude), lng: coarsen(pos.coords.longitude) }),
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 } // low accuracy on purpose
      );
    });
  }

  /* ---- fetch helper ---- */
  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('iNaturalist ' + res.status + ' for ' + url);
    return res.json();
  }

  /* ---- normalization: iNat result -> neutral species record ---- */
  function normalize(result) {
    const t = result.taxon || {};
    const dp = t.default_photo || {};
    const open = photoIsOpen(dp.license_code);
    return {
      tid: t.id,                                   // stable identity = iNat taxon id
      sci: t.name || '',
      en: t.preferred_common_name || '',
      pt: '',                                       // Portuguese common name, filled by enrichPortuguese()
      rank: t.rank || '',
      count: result.count || 0,                    // count within the query scope
      rarity: null,                                // assigned by assignRarities() at build time
      photo: open ? (dp.medium_url || dp.url || '') : '',  // only if openly licensed
      square: open ? (dp.square_url || '') : '',
      license: open ? (dp.license_code || '') : '',
      attribution: open ? (dp.attribution || '') : '',
      ancestorIds: t.ancestor_ids || [],
      wikipedia: t.wikipedia_url || '',
      fam: '',                                      // filled lazily via family enrichment
    };
  }

  /* ---- rarity: percentile buckets over the national distribution ----
     The PT count distribution is extremely long-tailed (median ~7), so fixed count
     thresholds collapse almost everything into the rarest tier. Ranking by count and
     bucketing by percentile yields a balanced spread, and freezing the result into the
     cached catalogue keeps a species' tier stable until the next manual refresh. */
  const TIERS = ['common', 'uncommon', 'rare', 'veryrare', 'legendary'];
  const TIER_CUM = [0.12, 0.30, 0.55, 0.80, 1.0]; // cumulative share, commonest -> rarest
  function assignRarities(speciesDescByCount) {
    const n = speciesDescByCount.length || 1;
    speciesDescByCount.forEach((s, i) => {
      const frac = (i + 0.5) / n;
      let tier = TIERS[TIERS.length - 1];
      for (let k = 0; k < TIERS.length; k++) { if (frac <= TIER_CUM[k]) { tier = TIERS[k]; break; } }
      s.rarity = tier;
    });
    return speciesDescByCount;
  }

  /* ---- Portugal catalogue: one call, normalized, rarity-assigned, cached ---- */
  async function fetchPortugalCatalog(opts) {
    opts = opts || {};
    const KEY = 'catalog:pt';
    if (!opts.force && db()) {
      const cached = await db().get(KEY);
      if (cached && cached.pulled && (Date.now() - cached.pulled) < CATALOG_TTL) return cached;
    }
    const url = `${API}/observations/species_counts?taxon_id=${ARANEAE}&place_id=${PORTUGAL}`
      + `&quality_grade=research&per_page=500`;
    const data = await getJSON(url);
    let species = (data.results || []).map(normalize);
    species.sort((a, b) => b.count - a.count);
    assignRarities(species);
    const catalog = { pulled: Date.now(), placeId: PORTUGAL, total: data.total_results || species.length, species };
    if (db()) { try { await db().set(KEY, catalog); } catch (e) {} }
    return catalog;
  }

  /* ---- "Near me": coarse-location species slice (tid + local count) ----
     Returns lightweight rows joined against the catalogue for display. Only the most
     recent coarse area is cached. */
  async function fetchNearby(lat, lng, radiusKm, opts) {
    opts = opts || {};
    const clat = coarsen(lat), clng = coarsen(lng), r = radiusKm || 30;
    const url = `${API}/observations/species_counts?taxon_id=${ARANEAE}`
      + `&lat=${clat}&lng=${clng}&radius=${r}&quality_grade=research&per_page=500`;
    const data = await getJSON(url);
    const rows = (data.results || []).map((res) => ({ tid: res.taxon && res.taxon.id, count: res.count || 0 }));
    const slice = { pulled: Date.now(), lat: clat, lng: clng, radius: r, total: data.total_results || rows.length, rows };
    if (db()) { try { await db().set('nearby:last', slice); } catch (e) {} } // single, overwritten
    return slice;
  }

  /* ---- lazy per-taxon detail: family name, wikipedia, openly-licensed photos ---- */
  async function fetchTaxonDetail(tid, opts) {
    opts = opts || {};
    const KEY = 'taxon:' + tid;
    if (!opts.force && db()) { const c = await db().get(KEY); if (c) return c; }
    const data = await getJSON(`${API}/taxa/${tid}`);
    const t = (data.results && data.results[0]) || {};
    const famAnc = (t.ancestors || []).find((a) => a.rank === 'family');
    const photos = (t.taxon_photos || [])
      .map((tp) => tp.photo).filter((p) => p && photoIsOpen(p.license_code))
      .slice(0, 6)
      .map((p) => ({ url: p.medium_url || p.url, license: p.license_code, attribution: p.attribution || '' }));
    const detail = {
      tid,
      fam: famAnc ? famAnc.name : '',
      wikipedia: t.wikipedia_url || '',
      // Wikipedia summary contains HTML; strip tags (we render it as escaped text, never as HTML).
      summary: (t.wikipedia_summary || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      photos,
      pulled: Date.now(),
    };
    if (db()) { try { await db().set(KEY, detail); } catch (e) {} }
    return detail;
  }

  /* ---- seasonality: month-of-year histogram (lazy, cached in taxon detail) ---- */
  async function fetchSeasonality(tid) {
    const url = `${API}/observations/histogram?taxon_id=${tid}&place_id=${PORTUGAL}`
      + `&quality_grade=research&date_field=observed&interval=month_of_year`;
    const data = await getJSON(url);
    const h = (data.results && data.results.month_of_year) || {};
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(h[m] || 0);
    return months;
  }

  /* ---- batched family enrichment for the whole catalogue (manual/background) ----
     /v1/taxa accepts up to 30 ids and returns full ancestor objects (with names),
     so ~14 calls cover all 400 species. Run once after a catalogue refresh, cached. */
  async function enrichFamilies(species, onProgress) {
    const need = species.filter((s) => !s.fam && s.tid);
    for (let i = 0; i < need.length; i += 30) {
      const batch = need.slice(i, i + 30);
      const ids = batch.map((s) => s.tid).join(',');
      try {
        const data = await getJSON(`${API}/taxa/${ids}`);
        const byId = {};
        (data.results || []).forEach((t) => { byId[t.id] = t; });
        batch.forEach((s) => {
          const t = byId[s.tid];
          const fam = t && (t.ancestors || []).find((a) => a.rank === 'family');
          if (fam) s.fam = fam.name;
        });
      } catch (e) { /* leave fam empty on failure; non-fatal */ }
      if (onProgress) onProgress(Math.min(i + 30, need.length), need.length);
    }
    return species;
  }

  /* Fill Portuguese common names for the whole catalogue in one call (locale=pt). */
  async function enrichPortuguese(species) {
    const url = `${API}/observations/species_counts?taxon_id=${ARANEAE}&place_id=${PORTUGAL}`
      + `&quality_grade=research&per_page=500&locale=pt`;
    try {
      const data = await getJSON(url);
      const byId = {};
      (data.results || []).forEach((r) => { if (r.taxon) byId[r.taxon.id] = r.taxon.preferred_common_name || ''; });
      species.forEach((s) => { if (byId[s.tid]) s.pt = byId[s.tid]; });
    } catch (e) { /* non-fatal: leave pt empty */ }
    return species;
  }

  window.AracnarioINat = {
    ARANEAE, PORTUGAL, OPEN_LICENSES,
    photoIsOpen, coarsen, getCoarseLocation,
    normalize, assignRarities,
    fetchPortugalCatalog, fetchNearby, fetchTaxonDetail, fetchSeasonality, enrichFamilies, enrichPortuguese,
  };
})();
