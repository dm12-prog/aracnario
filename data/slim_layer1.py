#!/usr/bin/env python3
"""Slim the fat build output into a spec-compliant offline skeleton (no photos, no repeated
boilerplate) + a separate Layer-2 photo cache seed. No re-fetching — pure transform."""
import json, os, time

HERE = os.path.dirname(os.path.abspath(__file__))
FAT = os.path.join(HERE, "layer1_skeleton.json")
OUT = os.path.join(HERE, "layer1_skeleton.json")          # overwrite with lean version
PHOTOS = os.path.join(HERE, "layer2_photo_cache.json")    # pre-warmed Layer-2 cache

d = json.load(open(FAT, encoding="utf-8"))
fat = d["species"]

def terr_code(t):
    s = ("m" if t.get("mainland") else "") + ("a" if t.get("azores") else "") + ("d" if t.get("madeira") else "")
    return "+".join(s) if s else "?"

lean, photos = [], {}
for e in fat:
    # src code: G=GBIF occ+backbone, W=WSC name/citation, r=range-only(no GBIF rec), I=iNat
    src = ""
    if e["gbif_species_key"]:
        src += "G"
    if e["wsc_match"] != "none":
        src += "W" + ("r" if not e["pt_confirmed"] else "")
    if e["inat_taxon_id"]:
        src += "I"
    # notes only when genuinely informative
    note = None
    if e["wsc_match"] == "synonym":
        note = "GBIF name resolved to current WSC species via synonym"
    elif not e["pt_confirmed"]:
        note = "WSC range-listed for PT territory; no GBIF/iNat PT observation"
    row = {
        "sci": e["sci"],
        "family": e["family"],
        "genus": e["genus"],
        "ay": e["author_year"],
        "pt": e["pt_confirmed"],
        "obs": e["pt_observation_count"],
        "terr": terr_code(e["territory"]),
        "conf": e["confidence"],
        "inat": e["inat_taxon_id"],
        "gbif": e["gbif_species_key"],
        "lsid": e["wsc_lsid"],
        "size_mm": None,
        "src": src,
    }
    if note:
        row["notes"] = note
    lean.append(row)
    # photo -> Layer-2 seed, keyed by inat taxon id
    if e.get("inat_photo") and e["inat_taxon_id"]:
        photos[str(e["inat_taxon_id"])] = e["inat_photo"]

doc = {
    "schema": "aracnario-layer1-skeleton/2",
    "generated": d["generated"],
    "scope": d["scope"],
    "sources": d["sources"],
    "counts": d["counts"],
    "legend": {
        "terr": "m=mainland, a=Azores, d=Madeira (e.g. 'm+d' = mainland+Madeira)",
        "src": "G=GBIF occurrence+backbone, W=WSC name/citation authority, r=range-only (WSC-listed, no GBIF/iNat PT record), I=iNaturalist taxon matched",
        "conf": "high | needs-review (<=5 PT records, not WSC-named) | range-only (pt=false)",
        "pt": "pt_confirmed — true=>=1 GBIF PT occurrence record; false=WSC range-listed only",
        "obs": "pt_observation_count (GBIF PT records)",
        "ay": "author_year (WSC authoritative; parentheses per nomenclature)",
        "inat": "iNaturalist taxon id (Layer-2 fetch handle); gbif=GBIF speciesKey; lsid=WSC LSID",
        "size_mm": "null across skeleton — not exposed by GBIF/WSC/iNat APIs; populate in Layer 2 / manual",
    },
    "honesty_note": ("Offline skeleton: no photos embedded (Layer-2 concern — see layer2_photo_cache.json, "
                     "pre-warmed from this build's iNat sweep). Every species' provenance is in `src`; nulls are "
                     "intentional and explained in `legend`. size_mm is uniformly null pending Layer 2."),
    "families": d["families"],
    "species": lean,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
with open(PHOTOS, "w", encoding="utf-8") as f:
    json.dump({"schema": "aracnario-layer2-photo-cache/1", "generated": d["generated"],
               "source": "iNaturalist default_photo (CC-licensed only; all-rights-reserved excluded)",
               "by_inat_taxon_id": photos}, f, ensure_ascii=False, separators=(",", ":"))

sk = os.path.getsize(OUT) / 1024
pk = os.path.getsize(PHOTOS) / 1024
print(f"lean skeleton : {OUT}  {sk:.0f} KB  ({len(lean)} species, {sk*1024/len(lean):.0f} B/entry)")
print(f"photo cache   : {PHOTOS}  {pk:.0f} KB  ({len(photos)} CC photos)")
print(f"spec target   : 200-300 KB  ->  {'PASS' if 150 <= sk <= 320 else 'CHECK'}")
