#!/usr/bin/env python3
"""Build the compact public feature table from downloaded CMS files or a fixture CSV.

Raw PUF files stay in data/cms-idr/raw (not committed). This writes the derived
rate table only. Dispute numbers and certified IDR entity names are not written.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from aggregate_public import (
    Accumulator,
    consume_rows,
    consume_xlsx,
    consume_zip,
    merge_supplemental,
    parse_supplemental,
    snapshot,
)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "cms-idr" / "raw"
DERIVED = ROOT / "data" / "cms-idr" / "derived" / "feature-rates.json"
MANIFEST = ROOT / "data" / "cms-idr" / "manifest.json"


def round_numbers(value):
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {key: round_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [round_numbers(item) for item in value]
    return value


def derive_from_catalog(manifest: dict) -> dict:
    acc = Accumulator()
    offer_unit = "pct"
    for source in manifest["files"]:
        if source["role"] != "puf":
            continue
        path = RAW / source["filename"]
        if not path.exists():
            raise SystemExit(f"Missing {path}. Run scripts/cms-idr/fetch_public_idr.py first.")
        track = source["id"] == "puf-2025-q4"
        print(f"aggregating {source['id']}", file=sys.stderr, flush=True)
        if path.suffix == ".zip":
            offer_unit = consume_zip(acc, str(path), track)
        else:
            offer_unit = consume_xlsx(acc, str(path), track)
        print(f"  line items so far {acc.line_items}", file=sys.stderr, flush=True)
    rates = snapshot(acc, offer_unit)
    supplemental_parts = []
    for source in manifest["files"]:
        if source["role"] != "supplemental":
            continue
        path = RAW / source["filename"]
        print(f"supplemental {source['id']}", file=sys.stderr, flush=True)
        supplemental_parts.append(parse_supplemental(str(path), source["period"]))
    rates["supplemental"] = merge_supplemental(supplemental_parts)
    rates["files"] = [
        {
            "id": source["id"],
            "role": source["role"],
            "period": source["period"],
            "published_as_of": source["published_as_of"],
            "portal_generated": source["portal_generated"],
            "url": source["url"],
            "sha256": source["sha256"],
            "bytes": source["bytes"],
        }
        for source in manifest["files"]
    ]
    rates["catalog_version"] = manifest["catalog_version"]
    # Drop any accidental name-bearing keys before write.
    blob = json.dumps(round_numbers(rates))
    forbidden = ("iMPROve", "Certified IDR Entity", "Dispute Number", "@")
    for token in forbidden:
        if token in blob:
            raise SystemExit(f"Derived table contains forbidden token {token!r}")
    return json.loads(blob)


def derive_fixture(csv_path: Path, min_entity_n: int) -> dict:
    acc = Accumulator(min_entity_n=min_entity_n)
    with csv_path.open(newline="", encoding="utf-8") as handle:
        unit = consume_rows(acc, csv.DictReader(handle), "oon", track_dispersion=True)
    rates = snapshot(acc, unit)
    rates["files"] = []
    rates["supplemental"] = {
        "periods": [],
        "initiated_by_party_type": {},
        "state_initiations": {},
        "state_initiation_share": {},
        "payment_outcomes": {},
        "qpa_cost_bands": [],
        "specialties": [],
    }
    return round_numbers(rates)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--stdout", action="store_true")
    parser.add_argument("--min-entity-n", type=int, default=25)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--out", type=Path, default=DERIVED)
    args = parser.parse_args()
    if args.fixture:
        payload = derive_fixture(args.fixture, args.min_entity_n)
    else:
        manifest = json.loads(args.manifest.read_text())
        payload = derive_from_catalog(manifest)
    text = json.dumps(payload, indent=2) + "\n"
    if args.stdout:
        sys.stdout.write(text)
        return
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text)
    print(f"wrote {args.out} line_items={payload['line_items']}", file=sys.stderr)


if __name__ == "__main__":
    main()
