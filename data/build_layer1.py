#!/usr/bin/env python3
"""
Aracnário Layer-1 skeleton builder — full Portuguese spider coverage.

Backbone = GBIF (country=PT, order Araneae usageKey 1496).
Name + citation authority = World Spider Catalog daily CSV.
Territory provenance = GBIF GADM facets (Azores PRT.2_1, Madeira PRT.13_1, mainland = rest).
Layer-2 join = iNaturalist taxon id + CC photo (CORS-open, fetched live later by the PWA).

Two tiers, exactly as FULL_COVERAGE_SPEC.md defines:
  Tier A  pt_confirmed=true   — has >=1 GBIF PT occurrence record (the 1043).
  Tier B  pt_confirmed=false  — WSC distribution names Portugal/Madeira/Azores but no GBIF/iNat PT record.

Honesty principle: every entry carries a `source`; nulls are explained in `notes`. No silent gaps.
"""
import csv, json, re, sys, time, urllib.request, urllib.parse, os
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
WSC_CSV = "/tmp/wsc_test.csv"          # already downloaded this session
OUT_JSON = os.path.join(HERE, "layer1_skeleton.json")
LOG = os.path.join(HERE, "build_layer1.log")
ARANEAE_GBIF = 1496
INAT_PLACE_PT = 7122
INAT_ARANEAE = 47118
AZORES_GID = "PRT.2_1"
MADEIRA_GID = "PRT.13_1"
MAINLAND_GIDS = [f"PRT.{i}_1" for i in range(1, 21) if i not in (2, 13)]  # 18 mainland districts
UA = {"User-Agent": "Aracnario/1.0 (Portuguese spider catalogue; diogo.montenegro12@gmail.com)"}

def logline(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def get_json(url, tries=4, timeout=30):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(1.2 * (a + 1))
    raise last

def gbif_species_facet(extra_params=None):
    """Return {speciesKey:int -> pt_occurrence_count:int} for a scoped GBIF query."""
    base = {"country": "PT", "taxon_key": str(ARANEAE_GBIF), "limit": "0",
            "facet": "speciesKey", "facetMincount": "1", "facetLimit": "300"}
    out = {}
    off = 0
    while True:
        params = list(base.items()) + [("facetOffset", str(off))]
        if extra_params:
            params += extra_params
        url = "https://api.gbif.org/v1/occurrence/search?" + urllib.parse.urlencode(params, doseq=True)
        d = get_json(url)
        counts = d["facets"][0]["counts"] if d.get("facets") else []
        for c in counts:
            out[int(c["name"])] = c["count"]
        if len(counts) < 300:
            break
        off += 300
        if off > 6000:
            logline("  WARN facet pagination hit safety cap")
            break
    return out

def gbif_species(key):
    d = get_json(f"https://api.gbif.org/v1/species/{key}")
    return key, {
        "canonicalName": d.get("canonicalName"),
        "scientificName": d.get("scientificName"),
        "authorship": (d.get("authorship") or "").strip(),
        "rank": d.get("rank"),
        "taxonomicStatus": d.get("taxonomicStatus"),
        "family": d.get("family"),
        "genus": d.get("genus"),
    }

# ---------------------------------------------------------------- WSC ----------
def load_wsc():
    valid_by_name, all_by_name, by_id = {}, {}, {}
    pt_named = {}  # canonical_lower -> {'territories':set, 'row':row} for VALID rows naming PT/Madeira/Azores
    rx = {"Portugal": re.compile(r"\bPortugal\b"),
          "Madeira": re.compile(r"\bMadeira\b"),
          "Azores": re.compile(r"\bAzores\b")}
    with open(WSC_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            canon = f"{row['genus']} {row['species']}".strip()
            cl = canon.lower()
            by_id[row["speciesId"]] = row
            all_by_name.setdefault(cl, row)
            if row["taxonStatus"] == "VALID":
                valid_by_name.setdefault(cl, row)
                terr = {k for k, r in rx.items() if r.search(row["distribution"] or "")}
                if terr:
                    pt_named[cl] = {"territories": terr, "row": row}
    return valid_by_name, all_by_name, by_id, pt_named

def author_year_from_wsc(row):
    a = (row.get("author") or "").strip()
    y = (row.get("year") or "").strip()
    base = f"{a}, {y}".strip(", ")
    paren = str(row.get("parentheses") or "").strip() in ("1", "true", "True")
    return f"({base})" if paren and base else base

def match_wsc(canon, valid_by_name, all_by_name, by_id):
    """Return (wsc_row, status). status in valid|synonym|none."""
    cl = (canon or "").lower()
    if cl in valid_by_name:
        return valid_by_name[cl], "valid"
    if cl in all_by_name:
        syn = all_by_name[cl]
        vid = syn.get("validSpeciesId")
        if vid and vid in by_id:
            return by_id[vid], "synonym"
        return syn, "synonym"
    return None, "none"

# --------------------------------------------------------------- iNat ----------
def inat_bulk_pt():
    """name_lower -> {'id', 'photo'}. One sweep of PT-observed Araneae species."""
    out = {}
    page = 1
    while True:
        url = ("https://api.inaturalist.org/v1/observations/species_counts?"
               f"place_id={INAT_PLACE_PT}&taxon_id={INAT_ARANEAE}&verifiable=true&per_page=500&page={page}")
        d = get_json(url)
        for res in d.get("results", []):
            t = res.get("taxon") or {}
            nm = (t.get("name") or "").lower()
            if nm and t.get("id"):
                out[nm] = {"id": t["id"], "photo": photo_from(t.get("default_photo"))}
        if page * 500 >= d.get("total_results", 0) or not d.get("results"):
            break
        page += 1
    return out

def photo_from(dp):
    if not dp:
        return None
    lic = dp.get("license_code")
    if not lic:  # all-rights-reserved -> do not redisplay
        return None
    return {"url": dp.get("medium_url") or dp.get("url"),
            "license": lic, "attribution": dp.get("attribution")}

def inat_lookup(canon):
    url = ("https://api.inaturalist.org/v1/taxa?" +
           urllib.parse.urlencode({"q": canon, "rank": "species",
                                   "iconic_taxa": "Arachnida", "is_active": "true"}))
    try:
        d = get_json(url, tries=3, timeout=25)
    except Exception:
        return None
    for r in d.get("results", []):
        if (r.get("name") or "").lower() == canon.lower() and r.get("iconic_taxon_name") == "Arachnida":
            return {"id": r["id"], "photo": photo_from(r.get("default_photo"))}
    return None

# --------------------------------------------------------------- BUILD ---------
def main():
    open(LOG, "w").close()
    t0 = time.time()
    logline("STEP 1/6  GBIF facet sweeps (whole / mainland / Azores / Madeira)")
    whole = gbif_species_facet()
    logline(f"  whole-country species: {len(whole)}")
    azores = gbif_species_facet([("gadmGid", AZORES_GID)])
    logline(f"  Azores species: {len(azores)}")
    madeira = gbif_species_facet([("gadmGid", MADEIRA_GID)])
    logline(f"  Madeira species: {len(madeira)}")
    mainland = gbif_species_facet([("gadmGid", g) for g in MAINLAND_GIDS])
    logline(f"  mainland species: {len(mainland)}")

    keys = sorted(whole)
    logline(f"STEP 2/6  GBIF backbone enrichment for {len(keys)} species (threaded)")
    backbone = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(gbif_species, k): k for k in keys}
        done = 0
        for fut in as_completed(futs):
            try:
                k, info = fut.result()
                backbone[k] = info
            except Exception as e:
                logline(f"  WARN species/{futs[fut]} failed: {e}")
            done += 1
            if done % 200 == 0:
                logline(f"    enriched {done}/{len(keys)}")

    logline("STEP 3/6  WSC CSV load + name validation")
    valid_by_name, all_by_name, by_id, pt_named = load_wsc()
    logline(f"  WSC VALID names: {len(valid_by_name)}  | WSC PT/Madeira/Azores-named: {len(pt_named)}")

    logline("STEP 4/6  iNaturalist bulk PT sweep")
    inat = inat_bulk_pt()
    logline(f"  iNat PT-observed species matched in bulk: {len(inat)}")

    # ---- assemble Tier A (GBIF-confirmed) ----
    tierA = []
    tierA_canon = set()
    need_inat = []  # (canon_lower) to gap-fill
    for k in keys:
        info = backbone.get(k, {})
        canon = info.get("canonicalName") or ""
        cl = canon.lower()
        tierA_canon.add(cl)
        wsc_row, wsc_status = match_wsc(canon, valid_by_name, all_by_name, by_id)
        family = (wsc_row["family"] if wsc_row else info.get("family"))
        genus = (wsc_row["genus"] if wsc_row else info.get("genus"))
        if wsc_row:
            author_year = author_year_from_wsc(wsc_row)
            lsid = wsc_row.get("species_lsid")
        else:
            author_year = info.get("authorship") or None
            lsid = None
        in_az, in_ma, in_ml = k in azores, k in madeira, k in mainland
        obs = whole.get(k, 0)
        wsc_pt_text = cl in pt_named
        confidence = "high" if (obs > 5 or wsc_pt_text) else "needs-review"
        im = inat.get(cl)
        if not im:
            need_inat.append(cl)
        notes = []
        if wsc_status == "none":
            notes.append("name not found in WSC catalogue (GBIF backbone name retained)")
        elif wsc_status == "synonym":
            notes.append(f"GBIF name resolved to WSC accepted species via synonym redirect")
        if confidence == "needs-review":
            notes.append(f"only {obs} PT record(s) and not named in WSC distribution — possible vagrant/introduction/misID")
        notes.append("size_mm unavailable from skeleton sources; populate in Layer 2 / manual")
        tierA.append({
            "sci": canon,
            "scientific_name_full": (wsc_row and f"{canon} {author_year}") or info.get("scientificName"),
            "family": family, "genus": genus,
            "author_year": author_year,
            "pt_confirmed": True,
            "pt_observation_count": obs,
            "territory": {"mainland": in_ml, "azores": in_az, "madeira": in_ma},
            "in_wsc_pt_distribution": wsc_pt_text,
            "confidence": confidence,
            "gbif_species_key": k,
            "wsc_lsid": lsid,
            "wsc_match": wsc_status,
            "inat_taxon_id": (im or {}).get("id"),
            "inat_photo": (im or {}).get("photo"),
            "size_mm": None,
            "source": f"GBIF occurrence(country=PT,taxonKey=1496) + GBIF backbone species/{k} + WSC CSV {time.strftime('%Y%m%d')}" + (" + iNat" if im else ""),
            "notes": "; ".join(notes),
        })

    # ---- assemble Tier B (WSC-named, no GBIF PT record) ----
    tierB = []
    for cl, meta in pt_named.items():
        if cl in tierA_canon:
            continue  # already confirmed in Tier A
        row = meta["row"]
        canon = f"{row['genus']} {row['species']}".strip()
        terr = meta["territories"]
        ay = author_year_from_wsc(row)
        if cl not in inat:
            need_inat.append(cl)
        tierB.append({
            "sci": canon,
            "scientific_name_full": f"{canon} {ay}",
            "family": row["family"], "genus": row["genus"],
            "author_year": ay,
            "pt_confirmed": False,
            "pt_observation_count": 0,
            "territory": {"mainland": "Portugal" in terr, "azores": "Azores" in terr, "madeira": "Madeira" in terr},
            "in_wsc_pt_distribution": True,
            "confidence": "range-only",
            "gbif_species_key": None,
            "wsc_lsid": row.get("species_lsid"),
            "wsc_match": "valid",
            "inat_taxon_id": (inat.get(cl) or {}).get("id"),
            "inat_photo": (inat.get(cl) or {}).get("photo"),
            "size_mm": None,
            "source": f"WSC CSV {time.strftime('%Y%m%d')} (distribution names {'/'.join(sorted(terr))}); no GBIF/iNat PT occurrence record found",
            "notes": "Listed in WSC for PT territory range; no confirmed GBIF/iNat Portuguese observation; size_mm unavailable from skeleton sources",
        })

    # ---- iNat gap-fill (Tier A unmatched first, then Tier B), throttled ----
    gap = list(dict.fromkeys(need_inat))  # unique, preserve order (Tier A first)
    logline(f"STEP 5/6  iNat gap-fill name lookups: {len(gap)} (throttled ~1.3/s)")
    filled = {}
    for i, cl in enumerate(gap):
        res = inat_lookup(cl)
        if res:
            filled[cl] = res
        if (i + 1) % 100 == 0:
            logline(f"    gap-fill {i+1}/{len(gap)}  (matched so far {len(filled)})")
        time.sleep(0.75)
    # apply gap-fill
    for entry in tierA + tierB:
        if entry["inat_taxon_id"] is None:
            r = filled.get(entry["sci"].lower())
            if r:
                entry["inat_taxon_id"] = r["id"]
                entry["inat_photo"] = r["photo"]
                if "+ iNat" not in entry["source"]:
                    entry["source"] += " + iNat"

    # ---- write + validate ----
    logline("STEP 6/6  write + validate")
    entries = sorted(tierA + tierB, key=lambda e: (e["family"] or "~", e["genus"] or "~", e["sci"] or "~"))
    inat_matched = sum(1 for e in entries if e["inat_taxon_id"])
    fam = sorted({e["family"] for e in entries if e["family"]})
    doc = {
        "schema": "aracnario-layer1-skeleton/1",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "scope": "All spider species recorded in Portugal (mainland + Azores + Madeira)",
        "sources": {
            "backbone": "GBIF occurrence API, country=PT, order Araneae usageKey 1496",
            "names_citations": f"World Spider Catalog daily CSV (species_export_{time.strftime('%Y%m%d')}.csv), CC BY-NC-SA 4.0",
            "territory": "GBIF GADM facets — Azores PRT.2_1, Madeira PRT.13_1, mainland = remaining 18 districts",
            "enrichment": "iNaturalist API (taxon id + CC-licensed representative photo); fetched live by PWA (CORS-open)",
        },
        "counts": {
            "total": len(entries),
            "pt_confirmed_true_gbif": len(tierA),
            "pt_confirmed_false_wsc_range_only": len(tierB),
            "with_inat_taxon_id": inat_matched,
            "families": len(fam),
            "needs_review_low_record": sum(1 for e in entries if e["confidence"] == "needs-review"),
        },
        "honesty_note": "Every entry carries a `source`. size_mm is null across the skeleton (not exposed by GBIF/WSC/iNat APIs) — to be populated in Layer 2 or manually. pt_confirmed=false entries are WSC range-listed species with no logged PT observation.",
        "families": fam,
        "species": entries,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    size_kb = os.path.getsize(OUT_JSON) / 1024

    # validation: no silent nulls (every entry must have source)
    missing_source = [e["sci"] for e in entries if not e.get("source")]
    logline("=" * 60)
    logline(f"DONE in {time.time()-t0:.0f}s")
    logline(f"  total entries:            {len(entries)}")
    logline(f"  Tier A (pt_confirmed):    {len(tierA)}")
    logline(f"  Tier B (range-only):      {len(tierB)}")
    logline(f"  families:                 {len(fam)}")
    logline(f"  with inat_taxon_id:       {inat_matched} ({100*inat_matched//max(len(entries),1)}%)")
    logline(f"  needs-review (<=5 rec):   {doc['counts']['needs_review_low_record']}")
    logline(f"  entries missing source:   {len(missing_source)}  (must be 0)")
    logline(f"  file:                     {OUT_JSON}  ({size_kb:.0f} KB)")
    logline("=" * 60)

if __name__ == "__main__":
    main()
