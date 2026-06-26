#!/usr/bin/env python3
"""
Quick lookup CLI for the Aracnário Layer-1 phone book + Layer-2 photo cache.
For Claude (or the user) to fast-check "is this spider confirmed in Portugal?"
without loading the whole 1,128-entry skeleton into context.

Usage:
  python3 lookup.py name "Agelena"            # substring match on sci name
  python3 lookup.py family Araneidae          # all species in a family
  python3 lookup.py genus Argiope             # all species in a genus
  python3 lookup.py territory azores          # mainland | azores | madeira
  python3 lookup.py unconfirmed               # pt_confirmed=false (range-only)
  python3 lookup.py needs-review              # low-confidence / vagrant tail
  python3 lookup.py photo "Argiope bruennichi" # photo url+attribution if cached
"""
import json, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SKELETON = os.path.join(HERE, "layer1_skeleton.json")
PHOTOS = os.path.join(HERE, "layer2_photo_cache.json")

def load():
    d = json.load(open(SKELETON, encoding="utf-8"))
    return d["species"], d["legend"]

def fmt(e):
    bits = [e["sci"], f"[{e['family']}]", e["ay"] or "", f"pt={e['pt']}", f"obs={e['obs']}",
            f"terr={e['terr']}", f"conf={e['conf']}"]
    if e.get("inat"):
        bits.append(f"inat={e['inat']}")
    if e.get("notes"):
        bits.append(f"note: {e['notes']}")
    return "  ".join(str(b) for b in bits if b != "")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    species, legend = load()

    if cmd == "name" and len(sys.argv) > 2:
        q = sys.argv[2].lower()
        hits = [e for e in species if q in e["sci"].lower()]
    elif cmd == "family" and len(sys.argv) > 2:
        q = sys.argv[2].lower()
        hits = [e for e in species if (e["family"] or "").lower() == q]
    elif cmd == "genus" and len(sys.argv) > 2:
        q = sys.argv[2].lower()
        hits = [e for e in species if (e["genus"] or "").lower() == q]
    elif cmd == "territory" and len(sys.argv) > 2:
        code = {"mainland": "m", "azores": "a", "madeira": "d"}[sys.argv[2].lower()]
        hits = [e for e in species if code in e["terr"]]
    elif cmd == "unconfirmed":
        hits = [e for e in species if not e["pt"]]
    elif cmd == "needs-review":
        hits = [e for e in species if e["conf"] == "needs-review"]
    elif cmd == "photo" and len(sys.argv) > 2:
        sci = sys.argv[2]
        sp = next((e for e in species if e["sci"].lower() == sci.lower()), None)
        if not sp or not sp.get("inat"):
            print(f"no iNat taxon id for '{sci}'")
            return
        cache = json.load(open(PHOTOS, encoding="utf-8"))["by_inat_taxon_id"]
        photo = cache.get(str(sp["inat"]))
        print(json.dumps(photo, indent=1) if photo else f"no cached photo for taxon {sp['inat']} (fetch live: https://api.inaturalist.org/v1/taxa/{sp['inat']})")
        return
    else:
        print(__doc__)
        return

    print(f"{len(hits)} match(es):")
    for e in sorted(hits, key=lambda x: (-x["obs"], x["sci"]))[:50]:
        print(" ", fmt(e))
    if len(hits) > 50:
        print(f"  ... and {len(hits)-50} more")

if __name__ == "__main__":
    main()
