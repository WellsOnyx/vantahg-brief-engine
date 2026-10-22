#!/usr/bin/env python3
"""Download CMS Federal IDR public files, record checksums, and derive rates.

Raw workbooks and zips are stored under data/cms-idr/raw and are gitignored.
The committed artifacts are this script, the manifest (URLs, dates, checksums),
and the compact derived rate table.
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catalog import CATALOG_VERSION, SOURCES
from derive_public_idr import MANIFEST, RAW, derive_from_catalog, round_numbers

ROOT_OUT = Path(__file__).resolve().parents[2] / "data" / "cms-idr" / "derived" / "feature-rates.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, dest: Path):
    print(f"download {url}", file=sys.stderr, flush=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    request = urllib.request.Request(url, headers={"User-Agent": "VantaUM-cms-idr-fetch/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, tmp.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    tmp.replace(dest)


def build_manifest() -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    files = []
    for source in SOURCES:
        dest = RAW / source["filename"]
        if not dest.exists() or dest.stat().st_size == 0:
            download(source["url"], dest)
        digest = sha256_file(dest)
        files.append({
            **source,
            "sha256": digest,
            "bytes": dest.stat().st_size,
        })
        print(f"  {source['id']} {digest} {dest.stat().st_size}", file=sys.stderr)
    manifest = {
        "catalog_version": CATALOG_VERSION,
        "data_source": "CMS public IDR PUF",
        "page": "https://www.cms.gov/nosurprises/policies-and-resources/reports",
        "files": files,
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    manifest = build_manifest()
    payload = derive_from_catalog(manifest)
    ROOT_OUT.parent.mkdir(parents=True, exist_ok=True)
    ROOT_OUT.write_text(json.dumps(round_numbers(payload), indent=2) + "\n")
    print(f"wrote {ROOT_OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
