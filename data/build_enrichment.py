#!/usr/bin/env python3
"""Bulk per-species enrichment for ALL Portuguese spider species.

Pulls the data iNaturalist actually exposes per taxon (common name, Wikipedia
description, CC-licensed photos + attribution, observation count, conservation
status) for every skeleton species that has an inat_taxon_id (1,056 of 1,128).

Honest gaps: iNat does NOT expose body size -> size_mm stays null here (family
-typical size comes from the family-key layer). 72 species have no iNat id and
get a stub entry flagged 'no_inat'. Output: data/species_enrichment.json,
keyed by inat_taxon_id. CC-only photos stored (all-rights-reserved skipped).
Source: iNaturalist API v1, fetched 2026-06-22.
"""
import json, re, time, urllib.request, urllib.error, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKELETON = os.path.join(HERE, "layer1_skeleton.json")
OUT = os.path.join(HERE, "species_enrichment.json")
LOG = os.path.join(HERE, "build_enrichment.log")
UA = "Aracnario/1.0 (diogo.montenegro12@gmail.com)"
CC = {"cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nd",
      "cc-by-nc-sa", "cc-by-nc-nd"}
TAG = re.compile(r"<[^>]+>")

def log(m):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def clean(html):
    if not html:
        return None
    txt = TAG.sub("", html).strip()
    return txt or None

def fetch(ids, tries=3):
    url = "https://api.inaturalist.org/v1/taxa/" + ",".join(str(i) for i in ids)
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r).get("results", [])
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            log(f"  batch error (try {t+1}): {e}")
            time.sleep(2 * (t + 1))
    return None

def photo_obj(p):
    lic = p.get("license_code")
    if lic not in CC:
        return None
    return {
        "url": p.get("medium_url") or p.get("url"),
        "lic": lic,
        "by": p.get("attribution_name"),
        "attr": (p.get("attribution") or "")[:160],
    }

def main():
    open(LOG, "w").close()
    sk = json.load(open(SKELETON))["species"]
    with_inat = [s for s in sk if s.get("inat")]
    no_inat = [s for s in sk if not s.get("inat")]
    id2sci = {s["inat"]: s for s in with_inat}
    ids = list(id2sci.keys())
    log(f"species total={len(sk)}  with_inat={len(with_inat)}  no_inat={len(no_inat)}")

    out = {}
    BATCH = 30
    batches = [ids[i:i + BATCH] for i in range(0, len(ids), BATCH)]
    for bi, batch in enumerate(batches):
        res = fetch(batch)
        if res is None:
            log(f"batch {bi+1}/{len(batches)} FAILED permanently, skipping")
            continue
        for r in res:
            tid = r.get("id")
            sci = id2sci.get(tid)
            extra = []
            for tp in (r.get("taxon_photos") or [])[:4]:
                po = photo_obj(tp.get("photo") or {})
                if po and po["url"]:
                    extra.append(po)
            main_photo = photo_obj(r.get("default_photo") or {})
            cons = r.get("conservation_status") or {}
            out[str(tid)] = {
                "sci": r.get("name"),
                "family": sci["family"] if sci else None,
                "common": r.get("preferred_common_name"),
                "obs": r.get("observations_count"),
                "iconic": r.get("iconic_taxon_name"),
                "desc": clean(r.get("wikipedia_summary")),
                "wiki_url": r.get("wikipedia_url"),
                "photo": main_photo,
                "photos_extra": [p for p in extra if not main_photo or p["url"] != main_photo["url"]][:3],
                "conservation": cons.get("status"),
                "size_mm": None,
            }
        if (bi + 1) % 5 == 0 or bi + 1 == len(batches):
            log(f"batch {bi+1}/{len(batches)} done; collected {len(out)}")
        time.sleep(0.7)

    # stubs for the no-inat species so coverage is explicit, not silently absent
    stubs = {}
    for s in no_inat:
        stubs[s["sci"]] = {"sci": s["sci"], "family": s["family"], "no_inat": True}

    have_desc = sum(1 for v in out.values() if v.get("desc"))
    have_photo = sum(1 for v in out.values() if v.get("photo"))
    have_common = sum(1 for v in out.values() if v.get("common"))
    doc = {
        "_meta": {
            "source": "iNaturalist API v1 (/v1/taxa batch)",
            "fetched": "2026-06-22",
            "keyed_by": "inat_taxon_id (string)",
            "honesty": "size_mm null (iNat exposes no body size; use family-typical). "
                       "Photos are CC-licensed only, with attribution; all-rights-reserved skipped. "
                       "no_inat species (72) carry a stub keyed by sci name.",
            "counts": {
                "species_with_inat": len(with_inat),
                "enriched": len(out),
                "with_description": have_desc,
                "with_photo": have_photo,
                "with_common_name": have_common,
                "no_inat_stubs": len(stubs),
            },
        },
        "by_inat": out,
        "no_inat": stubs,
    }
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    sz = os.path.getsize(OUT) // 1024
    log(f"WROTE {OUT}  ({sz} KB)")
    log(f"COVERAGE: enriched={len(out)}/{len(with_inat)}  desc={have_desc}  "
        f"photo={have_photo}  common={have_common}  no_inat_stubs={len(stubs)}")

if __name__ == "__main__":
    main()
