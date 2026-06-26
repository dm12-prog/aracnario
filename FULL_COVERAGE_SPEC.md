# Aracnário: Full Portuguese Spider Coverage — Three-Layer Architecture Spec

**Session date:** June 21, 2026
**Supersedes:** RESUMABLE_SETUP.md (the 45→90 species expansion plan). That doc is now a subset of this one — ranks 1–90 become the best-documented slice of the full skeleton below.
**Status:** Phase 1 (Layer-1 skeleton) DONE — 2026-06-21. Phase 2 (enrichment) bulk-pull DONE — 2026-06-22. Phase 3 (ID keys) DONE — 2026-06-26. `data/keys.json` assembled (57/57 family records + 65-couplet family routing key), validated against all 45 found species, `keys.html` UI built and cross-linked from `aracnario.html`. See "PHASE 3 COMPLETE" below. Phase 4 (vision-ID + full Aracnário integration) is next, not started.

## ▶ PHASE 3 COMPLETE — 2026-06-26

All 57 PT family ID-key records finished across 4 sessions (limit cutoffs handled via the durable `resumeFromRunId: "wf_d0ac83f1-c28"` resume recipe — never a lost session's work). Depth scorecard: **3 species / 47 genus / 7 family-only**.

**Artifacts:**
- `data/keys.json` — final artifact. `family_routing` (65 couplets, transcribed from the static `araneae.nmbe.ch/key` HTML) + `families` (57 records: characters/field_questions/lookalikes/deeper_key/confidence/found_check/sources_consulted).
- `data/family_routing_couplets.json` — raw couplet transcription (intermediate, kept for traceability).
- `data/assemble_keys.py` — rebuilds `keys.json` from `keys_partial.json` + the couplets file. Re-run if any family record changes.
- `data/validate_keys.py` — the runnable check: confirms 57/57, all 45 found species' families present and routable, prints depth scorecard. `python3 data/validate_keys.py` from `data/`.
- `keys.html` — standalone UI consumer (family browser + field-question filter + step-through routing key). Reads `data/keys.json` + `data/species_enrichment.json` via `fetch()` — **must be served over HTTP**, not opened via `file://` (browsers block local fetch). `python3 -m http.server` from the project root for local testing.
- Cross-link added: `aracnario.html` header → `keys.html`.

**Honest gaps (by design, not bugs):**
- Argyronetidae, Halonoproctidae, Lathyidae aren't separately routed by this edition of the araneae family key (newer taxonomic splits) — noted in `keys.json._meta.honesty_note` and `family_routing.not_separately_routed`.
- The European key's terminal families include 9 non-PT families (Anapidae, Ctenizidae, Cyrtaucheniidae, Desidae, Dolomedidae, Phyxelididae, Pimoidae, Telemidae, Theraphosidae) — `keys.html` shows an explicit "not one of PT's 57" message rather than crashing if a user routes into one.
- 8/57 families have no representative photo (no CC iNat photos available for those families' PT species) — `keys.html` omits the photo block gracefully.

**Next (Phase 4, not started):** vision-ID engine (reuse `spider-id.html` logic) pointed at the full skeleton instead of 45/90; deeper per-species size/character scraping of `araneae.nmbe.ch/data/{id}` if wanted later.

---

## ▶ RESUME CHECKPOINT — 2026-06-22 (session 2: appearances + ID keys)

**This session's goal:** build the identification artifact — plain-language appearance data + the deepest available decision key per family, covering all ~1128 PT species via their 57 families. Uneven depth is intended and OK (some families → species, some → family-only). Then later merge into the app.

**Source of truth:** [araneae.nmbe.ch](https://araneae.nmbe.ch/) — *Spiders of Europe* (Nentwig, Blick, Bosmans, Kropf & Stäubli). Family-level key = `/key` (static, ~65 couplets, citable). Per-family genus key = `/genkey/{id}/{Family}` — 54/57 PT families have one; **no online genus key** for Argyronetidae(95), Halonoproctidae(84), Lathyidae(96) → those default family-only. Per-species pages = `/data/{id}`. iNat API confirmed CORS-open + batchable (30 ids/call).

**DONE this session:**
- **Track 2 — per-species data:** `data/species_enrichment.json` (702 KB). Bulk iNat pull for all 1056 species that have an inat id. Coverage: photo 587, description 412, common-name 217, obs/conservation ~all. `size_mm` null (no API exposes body size — comes by family from Track 1). 72 no-inat species = labeled stubs. Built by re-runnable `data/build_enrichment.py`; wiki_urls normalized (https + underscores).

**IN FLIGHT (recover if session ended mid-run):**
- **Track 1 — family ID-key research workflow** `aracnario-family-keys`.
  - Run ID `wf_d0ac83f1-c28` · background task `wpk193i6n`.
  - Script: `…/workflows/scripts/aracnario-family-keys-wf_a11a786e-931.js` (GOTCHA: `args` arrives as a string → `const FAMS = Array.isArray(args)?args:JSON.parse(args)`).
  - Transcripts: `…/subagents/workflows/wf_d0ac83f1-c28/agent-*.jsonl`.
  - Produces 57 records (FAM_SCHEMA): `characters{web,eyes,body_shape,legs,colour,behaviour_habitat}` + `field_questions` + `lookalikes` + `deeper_key{level: species|genus|family-only, source, optional couplets[], honest notes}` + `_verify{citations_real, characters_accuracy, recommended_confidence}`.
  - **Resume same session:** `Workflow({scriptPath, resumeFromRunId:"wf_d0ac83f1-c28"})` — finished agents return cached.
  - **Resume cross-session:** parse the agent-*.jsonl final messages (research = FAM_SCHEMA JSON, verify = VERIFY_SCHEMA), OR just re-run the workflow fresh (idempotent web research).

**TRACK 1 PARTIAL RESULT — hit usage limit ~12:10, resets 17:10 Europe/Lisbon:**
- **29/57** family records banked → `data/keys_partial.json` (258 KB), all reached genus-level depth. Raw run output preserved → `data/keys_workflow_raw_wf_d0ac83f1-c28.json`.
- **Verify stage CUT (ponytail)** — every record cites its araneae.nmbe.ch source URL, so verification is a click, not a second LLM pass that doubled cost. Hand-check ~5 families at finalize instead. Characters are source-cited drafts; fine to promote to `keys.json` after a spot-check.
- **24 of 25 found-species families done**; only Symphytognathidae (your *Anapistula ataecina*) is still pending.
- **28 families still need research:** Anyphaenidae, Argyronetidae, Atypidae, Cicurinidae, Cithaeronidae, Clubionidae, Corinnidae, Cybaeidae, Hahniidae, Halonoproctidae, Hersiliidae, Lathyidae, Leptonetidae, Mimetidae, Miturgidae, Mysmenidae, Nemesiidae, Nesticidae, Oonopidae, Palpimanidae, Phrurolithidae, Prodidomidae, Selenopidae, Symphytognathidae, Synaphridae, Theridiosomatidae, Titanoecidae, Trachelidae.
- **LESSON LEARNED (2026-06-23 session 3):** a background task id (e.g. `wy9s3ctl8`) dies with the session/process — a fresh session cannot recover it, `TaskOutput` 404s. The ONLY durable handle is `resumeFromRunId` (`wf_d0ac83f1-c28`) — it's an on-disk cache keyed by (prompt, opts), survives across sessions. **Never rely on a task id in this checkpoint going forward — always re-launch via scriptPath + resumeFromRunId.**

**Gotcha confirmed (2026-06-23):** resuming with NO `args` throws `JSON Parse error: Unexpected identifier "undefined"` — Workflow does not auto-restore the original args, you must pass them again explicitly (cache is keyed on the literal agent prompt text, which is built from args, so passing the SAME family objects is what makes the cache hit).

**Family `id`/`found` reconstruction (already done, saved to disk so it's never redone):** `data/fams_missing_args.json` holds the exact 28-family args array (family + araneae.nmbe.ch genkey id + pt_species_count from `layer1_skeleton.json` + found-species cross-ref from `inat_data.json` + genkey true/false). IDs were scraped from `curl -s https://araneae.nmbe.ch/key | grep -oE 'genkey/[0-9]+/[A-Za-z]+'`. Only 3 PT families genuinely have no online genkey: Argyronetidae(95), Halonoproctidae(84), Lathyidae(96) — confirmed again this session.

**RESUME RECIPE (durable across session-limit cutoffs):**
```
Workflow({
  scriptPath: "/Users/diogomontenegro/.claude/projects/-Users-diogomontenegro-Claude-Projects-Aracnario/706f4e88-adce-4ccb-ad41-670fac27b806/workflows/scripts/aracnario-family-keys-wf_a11a786e-931.js",
  resumeFromRunId: "wf_d0ac83f1-c28",
  args: <contents of data/fams_missing_args.json>
})
```
Already-completed families (any of the 57, from either the original 29 or this round) return from cache instantly; only genuinely unfinished families re-run live. Keep re-issuing this exact call across as many session boundaries as needed — it's idempotent and cumulative. Once `agent()` count for missing families hits 0 (check via the returned `records` length, or just re-run and see `Done: 57/57`), move to NEXT STEPS below.

Launched 2026-06-23 ~23:xx as background task `w77e7xsam` (session-bound, same durability caveat as above — if this session ends before it completes, do NOT chase that task id, just re-issue the RESUME RECIPE).

**SESSION 4 (2026-06-25) progress:**
- **39/57** family records banked in `data/keys_partial.json` (depth: 1 species / 34 genus / 4 family-only). 18 still missing (Halonoproctidae, Lathyidae, Leptonetidae, Mimetidae, Miturgidae, Mysmenidae, Nemesiidae, Nesticidae, Oonopidae, Palpimanidae, Phrurolithidae, Prodidomidae, Selenopidae, Symphytognathidae, Synaphridae, Theridiosomatidae, Titanoecidae, Trachelidae) — exact resume args saved to `data/fams_missing_args.json`.
- **Workflow script now pins research agents to `model:'sonnet'`** (cheaper on the session cap, same grounded quality as the 39 done; the agent() call carries `model:'sonnet'`). Resume recipe unchanged otherwise.
- **STEP 2 DONE (family routing key):** `data/family_key.json` — the full araneae `/key` transcribed verbatim, 65 couplets (step 20 is a 3-way and step 65 a 4-way polytomy in the source, preserved as-is), 63 terminal families, cited. The only 3 PT families NOT direct terminals: Argyronetidae/Halonoproctidae/Lathyidae (recent splits the European key predates → handled family-only). Do NOT re-parse; re-parser lives at `/tmp/parse_key.py` if ever needed.
- **REMAINING after the 18 land:** assemble `data/keys.json` (= `_meta` scorecard + `family_routing` from family_key.json + 57 cleaned records), `data/validate_keys.py` (assert 45 found species route to present families + depth scorecard), then `keys.html` minimal UI. Full step list = the approved plan at `~/.claude/plans/plan-the-next-steps-whimsical-dongarra.md`.

**NEXT STEPS when Track 1 finishes:**
1. Assemble verified records → `data/keys.json`: top = family-level dichotomous routing (from araneae `/key`); per family = plain characters + field_questions + lookalikes + deeper_key (with citation + confidence). Keep honesty flags (family-only where true).
2. Validate against the 45 found species (span 25 families) — each must route to the correct family; deeper depth sane.
3. Depth scorecard: # families reaching species vs genus vs family-only.
4. (Later, not this phase) wire `keys.json` + `species_enrichment.json` into a UI page; cross-link "identified → add to Aracnário catalogue".
5. (Optional deepest tier) per-species size + distinguishing characters by scraping araneae `/data/{id}` — heavy, partial; deferred to a focused follow-up.

---

## The Goal

A spider identification system covering **all Portuguese spider species** (~1000, per World Spider Catalog), with three layers:

1. **Offline Skeleton** — every species, basic data, works with zero internet
2. **Online Enrichment** — richer data (photos, maps, recent sightings) fetched on demand, cached after first fetch
3. **Identification Keys** — citation-backed dichotomous keys for manual ID, offline, honest about coverage gaps

This is a **separate system from Aracnário's 45-species personal catalogue**. Aracnário stays your "species I've found" Pokédex. This new system is the "any spider in Portugal" reference + ID tool. They can cross-link (a Layer-1 species you've found gets added to Aracnário), but they're different tools with different scopes.

---

## Layer 1: Offline Skeleton

### Data source hierarchy
1. **World Spider Catalog (WSC)** — authoritative species list, author/year citations, family/genus structure. Primary backbone.
2. **GBIF Portugal occurrences** — cross-reference to flag which WSC species have *confirmed* PT records vs. species that are only plausible/regional-range matches with no logged observation.
3. **iNaturalist taxon API** — taxon IDs where they exist (needed for Layer 2 fetching later).

### Per-species fields (skeleton — no photos, no rich text)
```json
{
  "sci": "Philodromus dispar",
  "family": "Philodromidae",
  "genus": "Philodromus",
  "author_year": "Walckenaer, 1826",
  "pt_confirmed": true,
  "pt_observation_count": 12,
  "inat_taxon_id": 84812,
  "size_mm": {"male": [4,5], "female": [5,7]},
  "source": "WSC + GBIF dataset 50c9509d-...",
  "notes": null
}
```

For species with **no PT-confirmed records** (range-plausible but unobserved):
```json
{
  "sci": "Example species",
  "family": "...",
  "genus": "...",
  "author_year": "...",
  "pt_confirmed": false,
  "pt_observation_count": 0,
  "inat_taxon_id": null,
  "size_mm": null,
  "source": "WSC (range data only, no PT GBIF/iNat records)",
  "notes": "Listed in WSC for Iberian range; no confirmed Portuguese observation found"
}
```

**Honesty principle carried over from existing work:** every entry says where its data came from and flags what's missing. No silent gaps.

### Estimated size
- ~1000 species × ~250 bytes/entry (no photos) ≈ **200–300 KB** uncompressed
- Embeds cleanly in single-file HTML, loads instantly, fully offline

### What Layer 1 alone can do
- Full-text/family/genus browsing of all PT spiders
- Vision ID cross-check against the *complete* list (not just 90)
- Feed the dichotomous keys (Layer 3)
- Flag "this is outside the documented 45/90 you've personally catalogued" vs Aracnário

---

## Layer 2: Online Enrichment

### What it fetches (only when internet available)
- iNaturalist representative photos (CC-licensed) + creator/license for attribution
- Observation count trends, seasonal activity (the `months` array pattern already used in inat_data.json)
- Distribution data (which PT districts/regions have records)
- Possibly: recent observations (last 30 days) for "spiders being seen near you right now"

### Caching behavior
- First fetch for a species → store result in localStorage keyed by `inat_taxon_id`
- Subsequent views → read from cache, no refetch unless explicitly refreshed
- Once cached, that species' enrichment becomes available offline too — the skeleton "grows" the more you use it with internet on
- Cache should have a manual "refresh" option per species (data can go stale) and an age indicator ("fetched 3 months ago")

### Architecture
- A thin fetch layer that, given an `inat_taxon_id`, calls iNaturalist's public API
- Pure client-side `fetch()` calls — no backend needed, since iNat's API is public and CORS-friendly for read requests (needs verification at build time)
- Failure mode: if offline or fetch fails, show skeleton data only with a "connect to internet for photos" prompt — never block core functionality

### Open technical question for next session
Verify iNaturalist API CORS policy allows direct browser fetch from a `file://` or arbitrary origin HTML file. If not, may need a tiny proxy (same consideration as the vision ID proxy question from earlier). **Action item: test this early in Phase 2**, since it determines whether Layer 2 is trivial or needs infrastructure.

---

## Layer 3: Identification Keys

### Realistic scope (stated plainly, not oversold)
- **Family-level key:** covers all ~40 Portuguese families. This is achievable — family-level couplets (eye arrangement, leg spination patterns, web type, body shape) are well documented in general arachnology references and don't require rare specialist literature.
- **Genus/species-level keys:** only for families with a **published, citable key** covering Iberian or Portuguese fauna. Realistically this means a subset of families — likely the well-studied groups (e.g., Araneidae, Salticidae, Thomisidae, Lycosidae) where revisions or regional keys exist. Estimate: 10–15 families with deeper keys, the rest stop at family or genus level.
- **No fabricated couplets.** If no published key exists below family level for a group, the tool says so explicitly: *"No published species-level key exists for this family in the Iberian region — refer to iNaturalist community ID or a specialist."* This is a feature, not a gap to paper over: false-confidence keys are worse than admitted limits.

### Citation format
Each couplet (the "if A go to step 3, if B go to step 5" decision point) carries:
```json
{
  "step": 7,
  "character": "Eyes in two rows, posterior row strongly curved",
  "options": [
    {"text": "Yes — anterior median eyes largest", "goto": 12},
    {"text": "No — eyes subequal in size", "goto": 9}
  ],
  "citation": {
    "author": "Author, Year",
    "title": "Publication title",
    "source": "Journal/Book, pages or figure ref",
    "doi_or_url": "if available"
  }
}
```
Where couplet-level citation isn't feasible (derived from a checklist rather than a taxonomic key paper), fall back to:
```json
"citation": {"source": "World Spider Catalog, accessed 2026", "note": "checklist-derived, not from a dichotomous key publication"}
```

### Key sourcing — where to look (for next session)
1. **Iberian/Portuguese specific:**
   - Cardoso, P. et al. — Portuguese spider checklist papers (good for confirming family/genus presence)
   - Morano & Bonal, or similar Iberian arachnology groups — check for published regional keys
2. **Family-level general references:**
   - Roberts, M.J. — "Spiders of Britain and Northern Europe" (Collins Field Guide) — overlapping families, usable for family-level couplets with citation
   - World Spider Catalog family pages — diagnostic notes, citable
3. **Genus/species keys (where they exist):**
   - Search per-family: "[family name] key Iberian Peninsula" / "[family name] revision Portugal Spain"
   - Many will not have a clean key — expect to mark these as "family/genus level only" honestly

**This sourcing work is research-heavy and should be done incrementally, family by family, not all at once.** Suggest starting with the families you actually encounter most (cross-reference against your 45 already-found species) so the keys are useful immediately rather than complete-but-untested.

---

## Build Sequencing (Recommended Order)

### Phase 1: Layer 1 Skeleton — Full Species List ✅ DONE (2026-06-21)
- [x] Pull World Spider Catalog Portugal species list — WSC has NO country-filter API; used the keyless daily CSV export (`https://wsc.nmbe.ch/resources/species_export_YYYYMMDD.csv`) instead. WSC ended up as the name/citation authority, not the enumerator (its free-text distribution field undercounts badly — only 337/503 species explicitly name Portugal/Madeira/Azores).
- [x] Cross-reference against GBIF PT occurrence data to mark `pt_confirmed` — GBIF is the actual backbone: 1,043 distinct accepted species with ≥1 PT occurrence record (country=PT, order Araneae taxonKey 1496).
- [x] Cross-reference against iNaturalist taxon API for `inat_taxon_id` — 93% matched (1,056/1,128); bulk species_counts sweep + throttled per-name gap-fill.
- [x] Build the skeleton JSON — **1,128 entries**: 1,043 `pt_confirmed:true` (GBIF) + 85 `pt_confirmed:false` range-only (WSC-named, no GBIF/iNat PT record — the spec's second JSON shape).
- [x] Validate: every entry has source field, no silent nulls — confirmed, 0 entries missing source.
- [x] Target file size check — first build was 1,025 KB (FAILED, because photos got embedded against the "no photos in skeleton" rule). Fixed: photos moved to a separate Layer-2 cache seed; final skeleton = **273 KB**, within the 200–300 KB target.

**Actual species count: confirms the ~1000 estimate.** GBIF=1,043 (whole country) sits right between the published mainland-only checklist (Branco et al. 2019 = 825) and that figure plus Azores/Madeira archipelago endemics (~1,000–1,150 combined). Ship the headline as "~1,000 species."

**Bonus — Phase 2's flagged open question answered early:** iNaturalist API confirmed CORS-open (`Access-Control-Allow-Origin: *` on GET + OPTIONS). A static/PWA page can fetch iNat directly at runtime. No proxy infrastructure needed for Layer 2.

**Files produced** (`~/Claude/Projects/Aracnario/data/`):
- `layer1_skeleton.json` (273 KB) — the offline skeleton, schema v2, minified. Fields: `sci, family, genus, ay, pt, obs, terr, conf, inat, gbif, lsid, size_mm, src, notes`. See the doc's own `legend` key for field codes (terr = m/a/d territory codes, src = G/W/r/I provenance codes, conf = high/needs-review/range-only).
- `layer2_photo_cache.json` (120 KB) — 588 CC-licensed iNat photos pre-seeded, keyed by `inat_taxon_id`.
- `build_layer1.py` — full build pipeline (GBIF facets → enrich → WSC validate → iNat match). Re-running needs a fresh WSC CSV download (the script currently points at `/tmp/wsc_test.csv` from this session — update that path or re-add the download step before rerunning).
- `slim_layer1.py` — fat→lean transform (strips photos/boilerplate to hit the size target).
- `lookup.py` — **quick-ID CLI**, query the skeleton without loading all 1,128 entries into a Claude conversation: `python3 lookup.py name "<text>"`, `family <Family>`, `genus <Genus>`, `territory mainland|azores|madeira`, `unconfirmed`, `needs-review`, `photo "<sci name>"`.

**Known gaps / honest caveats carried forward:**
- `size_mm` is uniformly `null` — no source API (GBIF/WSC/iNat) exposes body size. Needs Layer 2 enrichment from another source or manual entry.
- 294 species flagged `needs-review` (≤5 PT records, not WSC-named) — likely vagrants/misIDs/rare introductions; kept in the skeleton, not dropped.
- `aracnario.html`/`index.html` do NOT yet reference `data/layer1_skeleton.json` — it exists on disk but isn't wired into any app UI yet. Wiring it in is part of Phase 2/4, not done.

### Phase 2: Layer 2 Enrichment Fetch Layer
- [ ] Test iNaturalist API CORS behavior from a static HTML file (the open question above)
- [ ] Build fetch + cache logic (localStorage keyed by taxon ID)
- [ ] Build UI: tap species → "fetching..." → photo/data appears → cached indicator
- [ ] Test offline fallback (airplane mode test)

### Phase 3: Layer 3 Keys — Family Level First
- [ ] Build family-level dichotomous key (all ~40 families), citation-backed
- [ ] Validate against your 45 already-found species — does the key correctly route to the right family each time?
- [ ] Pick 3–5 of your most-found families, research if published genus/species keys exist
- [ ] Build those deeper keys incrementally

### Phase 4: Integration
- [ ] Decide: standalone tool, or merged into spider-id.html, or a third file entirely?
- [ ] Cross-link: species found via this tool → option to add to Aracnário's personal catalogue
- [ ] Vision ID engine (existing spider-id.html logic) cross-checks against full 1000-species skeleton instead of just 45/90

---

## What This Replaces / How It Relates to Existing Work

| Existing artifact | Role going forward |
|---|---|
| `aracnario.html` | Unchanged — your personal "found species" catalogue, 45 species, sightings, journal, vivarium |
| `inat_data.json` (45 species) | Becomes a subset/cross-reference inside the new Layer 1 skeleton — not replaced, but no longer the ceiling |
| `spider-id.html` | Vision engine logic gets reused, but its catalogue-matching now points at the full skeleton (Phase 4) instead of 45/90 species |
| `RESUMABLE_SETUP.md` (90-species plan) | Superseded — ranks 46–90 are just the next slice of GBIF-confirmed species inside the full skeleton, no separate work needed |

---

## Honest Scope Warnings (Read Before Starting Phase 1)

1. **WSC export format is unknown until checked.** It may require scraping rather than a clean API/export. First task in Phase 1 is just figuring out *how* to get the list, before any data processing.
2. **Family-level key is achievable; full species-level key everywhere is not.** Stated plainly so expectations stay calibrated as this builds out.
3. **~1000 species is an estimate.** The actual WSC-confirmed Portuguese count needs verification — could be 700, could be 1100. Phase 1's first deliverable is the real number.
4. **Vision ID accuracy on rare/undocumented species will likely be worse than on the common 45–90.** Less training signal exists for rare Iberian endemics. This should be tested, not assumed.

---

## Next Session: Start Here

Phase 1 is done (see checklist above). Pick one of these to resume:

1. **Phase 2 — Enrichment UI.** Build the tap-a-species → photo/data UI in the app, reading `data/layer1_skeleton.json` + `data/layer2_photo_cache.json`. CORS is already confirmed open, so live iNat fetch + cache-refresh logic can be built directly, no proxy. Decide first: standalone page, or a new tab inside `index.html`?
2. **Phase 3 — Family-level ID key.** Start the ~40-family dichotomous key. Validate against the 45 species in your personal catalogue first (`inat_data.json`) since those are guaranteed real test cases.
3. **Phase 4 — Integration / wiring.** Even before 2 or 3 are fully built, you could wire `layer1_skeleton.json` into `aracnario.html`/`index.html` now just for browsing/search (the `lookup.py` CLI already proves the data is queryable) — decide where this full-coverage tool lives relative to the existing 45-species catalogue.
4. **Data maintenance note:** `build_layer1.py` currently reads the WSC CSV from a session tmp file — if rerunning the full build later, re-add the `curl` download step (recipe is in the script's docstring/comments) before running.
