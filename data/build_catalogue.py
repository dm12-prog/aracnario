#!/usr/bin/env python3
"""
build_catalogue.py — merge every data source into ONE embedded, offline catalogue.

Output: ../catalogue.js  (assigns window.ARACNARIO_CATALOGUE = {meta, species:[...]})
Loaded by index.html via <script src="catalogue.js"> — no runtime fetch(), so it
works on file://, installed, and fully offline. Photos remain remote URLs.

Sources (read-only inputs):
  data/layer1_skeleton.json     — 1128 PT species backbone (sci/family/genus/ay/obs/terr/inat/size)
  data/species_enrichment.json  — by_inat: common name, description, best CC photo
  data/curated45.json           — the 45 hand-authored "featured" species (lore, hand rarity, art)
  inat_data.json                — the 45 curated species' inat id, obs count, photo, monthly phenology

Re-runnable + idempotent. Run from the project root:  python3 data/build_catalogue.py
"""
import json, os, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

skeleton = load(os.path.join(DATA, "layer1_skeleton.json"))
enrich   = load(os.path.join(DATA, "species_enrichment.json"))["by_inat"]
curated  = load(os.path.join(DATA, "curated45.json"))
inatd    = load(os.path.join(ROOT, "inat_data.json"))

# --- index the curated 45 by scientific name, pulling in inat_data (obs/photo/months) ----
inat_by_sci = {v["sci"]: v for k, v in inatd.items() if k != "_meta"}
curated_by_sci = {c["sci"]: c for c in curated}

# Derived rarity is assigned by RANK among all PT species by observation count, so it
# forms a believable collectible pyramid (few legendaries) instead of tracking the raw
# long tail of barely-recorded species. Thresholds are cumulative fractions, rarest first.
RARITY_PYRAMID = [
    (0.03, "mythic"),     # rarest 3%
    (0.15, "legendary"),  # next 12%
    (0.40, "veryrare"),   # next 25%
    (0.65, "rare"),       # next 25%
    (0.85, "uncommon"),   # next 20%
    (1.00, "common"),     # most-observed 15%
]

def build_rarity_ranker(all_species):
    """Return f(record) -> rarity tier, ranked by obs (ties broken by name for stability)."""
    order = sorted(all_species, key=lambda r: (r.get("obs") or 0, r["sci"]))
    tier_of = {}
    n = len(order)
    for i, r in enumerate(order):
        frac = (i + 1) / n
        for cut, name in RARITY_PYRAMID:
            if frac <= cut:
                tier_of[id(r)] = name
                break
    return lambda r: tier_of.get(id(r), "common")

def clip(text, n=280):
    if not text: return None
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n: return text
    return text[:n].rsplit(" ", 1)[0].rstrip(".,;:") + "…"

def best_photo(enr, curated_row):
    """Prefer the curated hand-picked photo, else the enrichment CC photo."""
    if curated_row:
        sci = curated_row["sci"]
        cin = inat_by_sci.get(sci)
        if cin and cin.get("photo"):
            return {"u": cin["photo"], "by": cin.get("creator"), "lic": cin.get("license")}
    if enr and enr.get("photo"):
        p = enr["photo"]
        return {"u": p.get("url"), "by": p.get("by"), "lic": p.get("lic")}
    return None

species = []
seen_sci = set()
featured_num = 0

for s in skeleton["species"]:
    sci = s["sci"]
    seen_sci.add(sci)
    inat = s.get("inat")
    enr = enrich.get(str(inat)) if inat else None
    cur = curated_by_sci.get(sci)

    rec = {
        "sci": sci,
        "fam": s["family"],
        "gen": s["genus"],
        "ay":  s.get("ay"),
        "obs": s.get("obs"),
        "terr": s.get("terr"),
        "inat": inat,
    }
    # common name: curated PT + English, else enrichment English
    if cur:
        rec["en"] = cur.get("en")
        rec["pt"] = cur.get("pt")
    elif enr and enr.get("common"):
        rec["en"] = enr["common"]

    # description
    if cur and cur.get("desc"):
        rec["desc"] = cur["desc"]                 # full curated prose
    elif enr and enr.get("desc"):
        rec["desc"] = clip(enr["desc"])           # trimmed wiki blurb

    # photo
    ph = best_photo(enr, cur)
    if ph: rec["photo"] = ph

    if cur:
        featured_num += 1
        rec["feat"] = 1
        rec["num"]  = cur.get("num")
        rec["rarity"] = cur.get("rarity")
        rec["size"] = cur.get("size")
        # rich lore fields
        for k_src, k_dst in [("fact","fact"),("web","web"),("habitat","habitat"),
                             ("diet","diet"),("region","region"),("active","active"),
                             ("type","type"),("habitatTag","htag")]:
            if cur.get(k_src): rec[k_dst] = cur[k_src]
        if cur.get("noct") is not None: rec["noct"] = 1 if cur["noct"] else 0
        if cur.get("medical"): rec["med"] = cur["medical"]      # {level,text}
        if cur.get("art"): rec["art"] = cur["art"]              # hand-picked colours/marking
        cin = inat_by_sci.get(sci)
        if cin and cin.get("months"): rec["months"] = cin["months"]
    # non-featured rarity assigned in a second pass (rank-based) below

    species.append(rec)

# --- curated species whose sci isn't a skeleton entry (e.g. "Eratigena spp.") -----------
for cur in curated:
    if cur["sci"] in seen_sci: continue
    sci = cur["sci"]
    cin = inat_by_sci.get(sci)
    featured_num += 1
    rec = {
        "sci": sci, "fam": cur.get("fam"), "gen": sci.split(" ")[0],
        "ay": None, "obs": (cin or {}).get("count"), "terr": None,
        "inat": (cin or {}).get("inat"),
        "en": cur.get("en"), "pt": cur.get("pt"),
        "desc": cur.get("desc"), "feat": 1, "num": cur.get("num"),
        "rarity": cur.get("rarity"), "size": cur.get("size"),
    }
    if cin and cin.get("photo"):
        rec["photo"] = {"u": cin["photo"], "by": cin.get("creator"), "lic": cin.get("license")}
    for k_src, k_dst in [("fact","fact"),("web","web"),("habitat","habitat"),
                         ("diet","diet"),("region","region"),("active","active"),
                         ("type","type"),("habitatTag","htag")]:
        if cur.get(k_src): rec[k_dst] = cur[k_src]
    if cur.get("noct") is not None: rec["noct"] = 1 if cur["noct"] else 0
    if cur.get("medical"): rec["med"] = cur["medical"]
    if cur.get("art"): rec["art"] = cur["art"]
    if cin and cin.get("months"): rec["months"] = cin["months"]
    species.append(rec)

# --- assign derived rarity to non-featured species by observation rank (pyramid) --------
rank_rarity = build_rarity_ranker(species)
for r in species:
    if not r.get("feat"):
        r["rarity"] = rank_rarity(r)

# --- sort: featured (by dex num) first, then the rest by observation count desc ----------
def sort_key(r):
    if r.get("feat"):
        return (0, int(r.get("num") or 999), "")
    return (1, -(r.get("obs") or 0), r["sci"])
species.sort(key=sort_key)

# --- assemble + write ------------------------------------------------------------------
meta = {
    "generated_from": "build_catalogue.py",
    "scope": "All spider species with a Portuguese record (mainland + Azores + Madeira)",
    "total": len(species),
    "featured": featured_num,
    "sources": "GBIF + World Spider Catalog + iNaturalist (skeleton); iNaturalist v1 (enrichment); hand-authored lore for the featured 45",
    "photo_note": "Photos are remote CC-licensed iNaturalist URLs — they display when online; all other data is embedded and offline.",
    "families": sorted({r["fam"] for r in species if r.get("fam")}),
}

blob = json.dumps({"meta": meta, "species": species}, ensure_ascii=False, separators=(",", ":"))
out_path = os.path.join(ROOT, "catalogue.js")
with open(out_path, "w", encoding="utf-8") as f:
    f.write("/* GENERATED by data/build_catalogue.py — do not edit by hand. */\n")
    f.write("window.ARACNARIO_CATALOGUE=" + blob + ";\n")

# --- scorecard + assertions ------------------------------------------------------------
n = len(species)
photos = sum(1 for r in species if r.get("photo"))
descs  = sum(1 for r in species if r.get("desc"))
coms   = sum(1 for r in species if r.get("en"))
buckets = {}
for r in species:
    buckets[r["rarity"]] = buckets.get(r["rarity"], 0) + 1

assert n == 1128 or n >= 1128, f"expected >=1128 species, got {n}"
assert all(r.get("sci") and r.get("fam") for r in species), "every record needs sci + family"
assert featured_num == 45, f"expected 45 featured, got {featured_num}"

kb = round(len(blob.encode("utf-8")) / 1024)
print(f"✓ catalogue.js written: {n} species, {kb} KB embedded")
print(f"  featured (hand-authored): {featured_num}")
print(f"  families: {len(meta['families'])}")
print(f"  coverage — photos {photos}/{n} · descriptions {descs}/{n} · common names {coms}/{n}")
print(f"  rarity buckets: " + " · ".join(f"{k} {v}" for k, v in sorted(buckets.items())))
