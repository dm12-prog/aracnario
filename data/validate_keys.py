#!/usr/bin/env python3
"""Validate data/keys.json against the 45 personally-found species + print depth scorecard.
Runnable check left behind for the keys.json artifact (ponytail: one check per non-trivial build).
"""
import json
from collections import Counter

DATA = "."


def load(name):
    with open(f"{DATA}/{name}") as f:
        return json.load(f)


def main():
    keys = load("keys.json")
    skeleton = load("layer1_skeleton.json")
    found = load("../inat_data.json")
    found.pop("_meta", None)

    sci_to_family = {e["sci"]: e["family"] for e in skeleton["species"]}
    genus_to_family = {e["genus"]: e["family"] for e in skeleton["species"]}

    assert len(keys["families"]) == 57, f"expected 57 families, got {len(keys['families'])}"

    found_families = set()
    missing_species = []
    for v in found.values():
        fam = sci_to_family.get(v["sci"])
        if not fam and v.get("genus"):
            # genus-level found entry (e.g. "Eratigena spp.") — resolve via genus, not exact sci match
            genus_name = v["sci"].split()[0]
            fam = genus_to_family.get(genus_name)
        if not fam:
            missing_species.append(v["sci"])
            continue
        found_families.add(fam)
        if fam not in keys["families"]:
            raise SystemExit(f"found species {v['sci']} routes to family {fam}, missing from keys.json")

    assert not missing_species, f"found species not in skeleton: {missing_species}"

    not_routed = set(keys["family_routing"]["not_separately_routed"])
    routed_terminal = set()
    for c in keys["family_routing"]["couplets"]:
        for o in c["options"]:
            if not str(o["leads_to"]).startswith("step"):
                routed_terminal.add(o["leads_to"])

    unroutable_found = found_families & not_routed
    routable_found = found_families - not_routed
    not_in_routing = routable_found - routed_terminal
    assert not not_in_routing, f"found families missing from family_routing terminals: {not_in_routing}"

    depth = Counter(rec["deeper_key"]["level"] for rec in keys["families"].values())

    no_found_check = [
        fam for fam, rec in keys["families"].items()
        if fam in found_families and not rec.get("found_check")
    ]

    print(f"57/57 families present.")
    print(f"{len(found)} found species -> {len(found_families)} distinct families, all present in keys.json.")
    if unroutable_found:
        print(f"  (of those, {len(unroutable_found)} family(ies) are honestly-flagged not-separately-routed: {sorted(unroutable_found)})")
    print(f"All {len(routable_found)} routable found-families resolve to a family_routing terminal.")
    print("Depth scorecard (57 families):", dict(depth))
    if no_found_check:
        print(f"WARNING: {len(no_found_check)} found-families missing found_check: {no_found_check}")
    else:
        print("Every found-family has a found_check note.")


if __name__ == "__main__":
    main()
