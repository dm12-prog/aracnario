#!/usr/bin/env python3
"""Assemble data/keys.json from keys_partial.json (57 family records) +
family_routing_couplets.json (araneae.nmbe.ch /key, 65 couplets).
Run after the family-research workflow reaches 57/57.
"""
import json

DATA = "."

def load(name):
    with open(f"{DATA}/{name}") as f:
        return json.load(f)


def main():
    partial = load("keys_partial.json")
    records = partial["records"]
    couplets = load("family_routing_couplets.json")

    fam_names = sorted(r["family"] for r in records)
    if len(fam_names) != 57:
        raise SystemExit(f"expected 57 family records, got {len(fam_names)}: missing pieces in keys_partial.json")

    # families not separately routed by this edition of the araneae key
    # (newer taxonomic splits) — honest gap, not a bug.
    not_routed = {"Argyronetidae", "Halonoproctidae", "Lathyidae"}
    routed_terminal = set()
    for c in couplets:
        for o in c["options"]:
            if not str(o["leads_to"]).startswith("step"):
                routed_terminal.add(o["leads_to"])
    missing_from_routing = sorted(set(fam_names) - routed_terminal)
    assert set(missing_from_routing) == not_routed, (
        f"unexpected routing gap, re-check: {missing_from_routing}"
    )

    families = {}
    depth_counts = {"species": 0, "genus": 0, "family-only": 0}
    for r in records:
        clean = {
            "common_group": r["common_group"],
            "size_mm_typical": r["size_mm_typical"],
            "characters": r["characters"],
            "field_questions": r["field_questions"],
            "lookalikes": r["lookalikes"],
            "deeper_key": r["deeper_key"],
            "confidence": r["confidence"],
            "found_check": r.get("found_check"),
            "sources_consulted": r["sources_consulted"],
        }
        families[r["family"]] = clean
        depth_counts[r["deeper_key"]["level"]] = depth_counts.get(r["deeper_key"]["level"], 0) + 1

    out = {
        "schema": "aracnario-keys-v1",
        "generated": "2026-06-25",
        "scope": "All 57 Portuguese spider families (Layer 3 / Phase 3 of FULL_COVERAGE_SPEC.md)",
        "honesty_note": (
            "Every family record cites the real araneae.nmbe.ch (and other) URLs consulted. "
            "deeper_key.level is honest about how deep an ID can go: species, genus, or "
            "family-only where no published key exists below that level. "
            f"family_routing covers {len(routed_terminal)} terminal families from the static "
            "araneae.nmbe.ch /key page; it does NOT separately route "
            f"{', '.join(sorted(not_routed))} — these are taxonomic splits newer than this "
            "edition of the key. Their closest routed relatives are noted in those families' "
            "own lookalikes/characters records instead."
        ),
        "depth_scorecard": depth_counts,
        "family_routing": {
            "source": {
                "title": "Spiders of Europe — family-level key",
                "authors": "Nentwig, Blick, Bosmans, Gloor, Hänggi & Kropf",
                "url": "https://araneae.nmbe.ch/key",
                "accessed": "2026-06-25",
            },
            "not_separately_routed": sorted(not_routed),
            "couplets": couplets,
        },
        "families": families,
    }

    with open(f"{DATA}/keys.json", "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)

    print(f"Wrote keys.json: {len(families)} families, {len(couplets)} couplets")
    print("Depth scorecard:", depth_counts)


if __name__ == "__main__":
    main()
