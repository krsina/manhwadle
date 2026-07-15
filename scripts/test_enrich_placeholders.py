#!/usr/bin/env python3
"""Smoke-test MAL image enrichment + placeholder drop filter."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
CATALOG = ROOT / "manhwadle-etl" / "output" / "catalog.json"
SHARD_DIR = SCRIPTS / "character-shards"
PLACEHOLDER_RE = re.compile(r"/character/(?:large|medium)/default\.jpg(?:\?|$)", re.I)
FIXTURE_ID = 900001
ANTAGONISTS_PET_ID = 111105


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def is_placeholder(char: dict) -> bool:
    image = char.get("image") or {}
    large = image.get("large") or ""
    medium = image.get("medium") or ""
    if not large and not medium:
        return True
    return bool(PLACEHOLDER_RE.search(large) or PLACEHOLDER_RE.search(medium))


def build_mini_catalog_from_shards() -> dict:
    """Pull placeholder characters + their manhwa/idMal from shards + real catalog."""
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    manhwa_by_id = {int(m["id"]): m for m in catalog.get("manhwa") or []}

    chars: dict[int, dict] = {}
    apps: list[dict] = []
    manhwa_ids: set[int] = set()

    for path in sorted(SHARD_DIR.glob("characters-shard-*.json")):
        if "checkpoint" in path.name:
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        shard_chars = {int(c["id"]): c for c in doc.get("characters") or []}
        for app in doc.get("appearances") or []:
            cid = int(app["characterId"])
            ch = shard_chars.get(cid)
            if not ch or not is_placeholder(ch):
                continue
            mid = int(app["manhwaId"])
            if mid not in manhwa_by_id or not manhwa_by_id[mid].get("idMal"):
                continue
            chars[cid] = ch
            manhwa_ids.add(mid)
            apps.append(
                {
                    "manhwaId": mid,
                    "characterId": cid,
                    "role": app.get("role") or "BACKGROUND",
                }
            )

    selected_manhwa: list[int] = []
    if ANTAGONISTS_PET_ID in manhwa_by_id and manhwa_by_id[ANTAGONISTS_PET_ID].get("idMal"):
        selected_manhwa.append(ANTAGONISTS_PET_ID)
    for mid in sorted(manhwa_ids):
        if mid not in selected_manhwa:
            selected_manhwa.append(mid)
        if len(selected_manhwa) >= 4:
            break

    selected = set(selected_manhwa)
    apps = [a for a in apps if a["manhwaId"] in selected]
    char_ids = {a["characterId"] for a in apps}
    chars = {cid: ch for cid, ch in chars.items() if cid in char_ids}

    # Guaranteed fillable fixture: Sasha Tartt (present on MAL for this title)
    if ANTAGONISTS_PET_ID in selected:
        chars[FIXTURE_ID] = {
            "id": FIXTURE_ID,
            "name": {"full": "Sasha Tartt", "native": None, "alternative": []},
            "description": None,
            "image": {
                "large": "https://s4.anilist.co/file/anilistcdn/character/large/default.jpg",
                "medium": "https://s4.anilist.co/file/anilistcdn/character/medium/default.jpg",
            },
            "siteUrl": None,
            "favourites": 0,
        }
        apps.append(
            {
                "manhwaId": ANTAGONISTS_PET_ID,
                "characterId": FIXTURE_ID,
                "role": "MAIN",
            }
        )

    return {
        "meta": {"test": True, "source": "mini-placeholder-sample"},
        "manhwa": [manhwa_by_id[mid] for mid in selected_manhwa],
        "characters": list(chars.values()),
        "appearances": apps,
    }


def main() -> int:
    if not CATALOG.exists():
        print("FAIL: catalog.json missing", file=sys.stderr)
        return 1
    if not any(SHARD_DIR.glob("characters-shard-*.json")):
        print("FAIL: no shard JSON in scripts/character-shards", file=sys.stderr)
        return 1

    enrich = load_module("enrich_character_images", SCRIPTS / "enrich_character_images.py")

    mini = build_mini_catalog_from_shards()
    before = sum(1 for c in mini["characters"] if is_placeholder(c))
    print(
        f"[setup] mini catalog: manhwa={len(mini['manhwa'])} "
        f"characters={len(mini['characters'])} placeholders={before}"
    )
    if before == 0:
        print("FAIL: expected placeholders in sample", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        catalog_path = Path(tmp) / "catalog.json"
        catalog_path.write_text(json.dumps(mini, indent=2) + "\n", encoding="utf-8")
        enrich.enrich(catalog_path, reset=True, skip_jikan=True)
        after_doc = json.loads(catalog_path.read_text(encoding="utf-8"))

    after_placeholders = [c for c in after_doc["characters"] if is_placeholder(c)]
    filled = [c for c in after_doc["characters"] if not is_placeholder(c)]
    print(f"[enrich] filled={len(filled)} still_placeholder={len(after_placeholders)}")

    fixture = next((c for c in after_doc["characters"] if int(c["id"]) == FIXTURE_ID), None)
    if not fixture:
        print("FAIL: fixture Sasha Tartt missing from result", file=sys.stderr)
        return 1
    if is_placeholder(fixture):
        print(
            f"FAIL: fixture Sasha Tartt still placeholder: {fixture.get('image')}",
            file=sys.stderr,
        )
        return 1
    if "cdn.myanimelist.net/images/characters/" not in (fixture.get("image") or {}).get("large", ""):
        print(f"FAIL: fixture image not from MAL CDN: {fixture.get('image')}", file=sys.stderr)
        return 1
    print(f"[ok] fixture Sasha Tartt filled -> {fixture['image']['large']}")

    if len(filled) == 0:
        print("FAIL: enrichment filled 0 characters", file=sys.stderr)
        return 1

    # Simulate sync-game-data drop
    kept = [c for c in after_doc["characters"] if enrich.has_real_character_image(c)]
    dropped = len(after_doc["characters"]) - len(kept)
    remaining_placeholders = sum(1 for c in kept if is_placeholder(c))
    print(
        f"[sync-filter] kept={len(kept)} dropped={dropped} "
        f"placeholders_in_kept={remaining_placeholders}"
    )

    if remaining_placeholders != 0:
        print("FAIL: sync filter left placeholders", file=sys.stderr)
        return 1
    if dropped != len(after_placeholders):
        print(
            f"FAIL: expected to drop {len(after_placeholders)} leftovers, dropped={dropped}",
            file=sys.stderr,
        )
        return 1

    print("[ok] enrichment fills MAL matches; leftover placeholders are fully dropped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
