#!/usr/bin/env python3
"""
Clean character image enrichment:

1. Revert websearch fills (no MAL character id) back to AniList default.jpg
2. Keep MAL enrichments that have a real malId
3. Drop placeholder / unmatched characters from appearances + characterIds
   EXCEPT characters belonging to Tyrant of the Tower Defense Game (kept for manual URL entry)

Usage:
  python scripts/cleanup_non_mal_character_images.py
  python scripts/generate_character_image_report.py
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "manhwadle-etl" / "output" / "catalog.json"
MAL_CK = CATALOG.with_name("catalog.enrich-images.checkpoint.json")
WEB_CK = CATALOG.with_name("catalog.enrich-websearch.checkpoint.json")

TYRANT_MANHWA_ID = 153513  # Tyrant of the Tower Defense Game
PLACEHOLDER = {
    "large": "https://s4.anilist.co/file/anilistcdn/character/large/default.jpg",
    "medium": "https://s4.anilist.co/file/anilistcdn/character/medium/default.jpg",
}
PLACEHOLDER_RE = re.compile(r"/character/(?:large|medium)/default\.jpg(?:\?|$)", re.I)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def is_placeholder(char: dict[str, Any] | None) -> bool:
    if not char:
        return True
    image = char.get("image") or {}
    large = image.get("large") or ""
    medium = image.get("medium") or ""
    if not large and not medium:
        return True
    return bool(PLACEHOLDER_RE.search(large) or PLACEHOLDER_RE.search(medium))


def write_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    mal_ck = json.loads(MAL_CK.read_text(encoding="utf-8")) if MAL_CK.exists() else {"filled": {}, "unmatched": {}}
    web_ck = json.loads(WEB_CK.read_text(encoding="utf-8")) if WEB_CK.exists() else {"filled": {}, "failed": {}}

    chars_by_id = {int(c["id"]): c for c in catalog.get("characters") or []}
    manhwa_by_id = {int(m["id"]): m for m in catalog.get("manhwa") or []}

    # MAL keeps: must have malId
    mal_keep: dict[str, Any] = {}
    for cid_str, info in (mal_ck.get("filled") or {}).items():
        if info.get("malId"):
            mal_keep[cid_str] = info

    web_ids = {int(k) for k in (web_ck.get("filled") or {})}
    # Also treat mal_ck entries without malId as websearch pollution
    polluted = set(web_ids)
    for cid_str, info in (mal_ck.get("filled") or {}).items():
        if not info.get("malId"):
            polluted.add(int(cid_str))

    reverted = 0
    for cid in polluted:
        ch = chars_by_id.get(cid)
        if not ch:
            continue
        # Don't revert if also a real MAL keep
        if str(cid) in mal_keep:
            info = mal_keep[str(cid)]
            ch.setdefault("image", {})
            ch["image"]["large"] = info["image"]
            ch["image"]["medium"] = info["image"]
            continue
        ch["image"] = dict(PLACEHOLDER)
        reverted += 1

    # Re-apply MAL keep images (in case merge/websearch overwrote)
    for cid_str, info in mal_keep.items():
        ch = chars_by_id.get(int(cid_str))
        if not ch or not info.get("image"):
            continue
        ch.setdefault("image", {})
        ch["image"]["large"] = info["image"]
        ch["image"]["medium"] = info["image"]

    # Tyrant character ids (keep even if placeholder)
    tyrant_char_ids = {
        int(a["characterId"])
        for a in catalog.get("appearances") or []
        if int(a["manhwaId"]) == TYRANT_MANHWA_ID
    }

    # Drop appearances for placeholder chars that aren't Tyrant and aren't MAL-kept
    mal_keep_ids = {int(k) for k in mal_keep}
    kept_apps: list[dict[str, Any]] = []
    dropped_apps = 0
    for app in catalog.get("appearances") or []:
        cid = int(app["characterId"])
        ch = chars_by_id.get(cid)
        if cid in tyrant_char_ids:
            kept_apps.append(app)
            continue
        if cid in mal_keep_ids:
            kept_apps.append(app)
            continue
        if ch and not is_placeholder(ch):
            # Real AniList portrait already
            kept_apps.append(app)
            continue
        dropped_apps += 1

    # Rebuild characterIds per manhwa from kept appearances
    ids_by_manhwa: dict[int, list[int]] = {}
    for app in kept_apps:
        mid = int(app["manhwaId"])
        cid = int(app["characterId"])
        ids_by_manhwa.setdefault(mid, [])
        if cid not in ids_by_manhwa[mid]:
            ids_by_manhwa[mid].append(cid)

    for mid, m in manhwa_by_id.items():
        if mid in ids_by_manhwa:
            m["characterIds"] = ids_by_manhwa[mid]
        elif mid == TYRANT_MANHWA_ID:
            m["characterIds"] = sorted(tyrant_char_ids)
        else:
            # Keep existing only if they still have real images / mal keep
            old = list(m.get("characterIds") or [])
            m["characterIds"] = [
                cid
                for cid in old
                if cid in mal_keep_ids
                or cid in tyrant_char_ids
                or (chars_by_id.get(cid) and not is_placeholder(chars_by_id.get(cid)))
            ]

    referenced = {int(a["characterId"]) for a in kept_apps}
    # Keep unreferenced characters that still have real images? Prune unused placeholders.
    catalog["appearances"] = sorted(
        kept_apps, key=lambda a: (int(a["manhwaId"]), int(a["characterId"]))
    )
    catalog["characters"] = [
        c
        for c in sorted(chars_by_id.values(), key=lambda c: int(c["id"]))
        if int(c["id"]) in referenced
    ]
    catalog["manhwa"] = sorted(manhwa_by_id.values(), key=lambda m: int(m["id"]))

    if "meta" not in catalog:
        catalog["meta"] = {}
    catalog["meta"]["characterImageCleanup"] = {
        "at": utc_now(),
        "revertedWebsearch": reverted,
        "keptMalWithId": len(mal_keep),
        "droppedAppearances": dropped_apps,
        "keptTyrantCharacters": len(tyrant_char_ids),
        "tyrantManhwaId": TYRANT_MANHWA_ID,
    }
    catalog["meta"]["counts"] = {
        "manhwa": len(catalog["manhwa"]),
        "characters": len(catalog["characters"]),
        "appearances": len(catalog["appearances"]),
    }

    write_json(CATALOG, catalog)

    # Rewrite MAL checkpoint: only malId fills; Tyrant placeholders listed for manual
    tyrant_manual = []
    for cid in sorted(tyrant_char_ids):
        ch = chars_by_id.get(cid)
        if not ch:
            continue
        if is_placeholder(ch) or str(cid) in {str(x) for x in polluted if str(x) not in mal_keep}:
            # After revert, tyrant polluted ones are placeholders
            if is_placeholder(chars_by_id.get(cid)):
                tyrant_manual.append(cid)

    # Re-read image state after mutations
    tyrant_manual = [
        cid for cid in sorted(tyrant_char_ids) if is_placeholder(chars_by_id.get(cid))
    ]

    write_json(
        MAL_CK,
        {
            "version": 1,
            "filled": mal_keep,
            "unmatched": {
                str(cid): "manual_tyrant"
                for cid in tyrant_manual
            },
            "manualAllowlist": {
                "manhwaId": TYRANT_MANHWA_ID,
                "title": "Tyrant of the Tower Defense Game",
                "characterIds": tyrant_manual,
            },
            "updatedAt": utc_now(),
        },
    )

    # Clear websearch filled (keep failed log optional)
    if WEB_CK.exists():
        write_json(
            WEB_CK,
            {
                "version": 1,
                "filled": {},
                "failed": web_ck.get("failed") or {},
                "clearedAt": utc_now(),
                "note": "Websearch fills cleared; only MAL malId matches retained",
            },
        )

    print(
        json.dumps(
            {
                "revertedWebsearch": reverted,
                "keptMalWithId": len(mal_keep),
                "droppedAppearances": dropped_apps,
                "tyrantKept": len(tyrant_char_ids),
                "tyrantNeedingManual": len(tyrant_manual),
                "tyrantManualIds": tyrant_manual,
                "catalogCharacters": len(catalog["characters"]),
                "catalogAppearances": len(catalog["appearances"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
