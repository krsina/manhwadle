#!/usr/bin/env python3
"""
Fill unmatched character portraits via web image search (Bing via ddgs).

Google Images scraping is blocked; this uses the same style of query:
  "{manhwa title}" "{character name}" manhwa character

Only touches characters that:
  - still have AniList default.jpg / missing image
  - are linked to at least one top-1000 manhwa

Usage:
  pip install ddgs
  python scripts/enrich_character_images_websearch.py
  python scripts/enrich_character_images_websearch.py --limit 20   # smoke test
  python scripts/generate_character_image_report.py
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "manhwadle-etl" / "output" / "catalog.json"
DEFAULT_TOP = ROOT / "manhwadle-etl" / "output" / "top-1000.json"
PLACEHOLDER_RE = re.compile(r"/character/(?:large|medium)/default\.jpg(?:\?|$)", re.I)

# Prefer hosts that usually serve actual character art (still verify by URL shape).
PREFERRED_HOST_HINTS = (
    "anilistcdn",
    "myanimelist.net",
    "cdn.myanimelist",
    "mangadex",
    "asurascans",
    "webtoons",
    "naver",
    "kakao",
    "namu.wiki",
    "fandom.com",
    "wikia",
    "imgur",
    "pinterest",
    "pinimg",
    "reddit",
    "redd.it",
)

SKIP_HOST_HINTS = (
    "logo",
    "sprite",
    "emoji",
    "icon",
    "avatar-default",
    "placeholder",
    "1x1",
    "pixel",
)

UA = "manhwadle-websearch-enrich/1.0"


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


def title_of(m: dict[str, Any]) -> str:
    if isinstance(m.get("title"), str) and m["title"].strip():
        return m["title"].strip()
    t = m.get("titles") or {}
    return t.get("english") or t.get("romaji") or t.get("native") or f"#{m.get('id')}"


def char_name(c: dict[str, Any]) -> str:
    n = c.get("name") or {}
    return n.get("full") or n.get("native") or f"#{c.get('id')}"


def write_json_atomic(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def collect_targets(catalog: dict[str, Any], top_path: Path) -> list[dict[str, Any]]:
    top = json.loads(top_path.read_text(encoding="utf-8"))
    top_by_id = {int(m["id"]): m for m in top.get("manhwa") or []}
    apps_by_char: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for a in catalog.get("appearances") or []:
        apps_by_char[int(a["characterId"])].append(a)

    rows: list[dict[str, Any]] = []
    for c in catalog.get("characters") or []:
        if not is_placeholder(c):
            continue
        cid = int(c["id"])
        linked = []
        for app in apps_by_char.get(cid, []):
            mid = int(app["manhwaId"])
            m = top_by_id.get(mid)
            if not m:
                continue
            linked.append(
                {
                    "manhwaId": mid,
                    "title": title_of(m),
                    "rank": m.get("rank"),
                    "role": app.get("role") or "BACKGROUND",
                }
            )
        if not linked:
            continue
        linked.sort(key=lambda x: (x["rank"] is None, x["rank"] or 99999))
        best = linked[0]
        rows.append(
            {
                "character": c,
                "characterId": cid,
                "characterName": char_name(c),
                "manhwaTitle": best["title"],
                "rank": best["rank"],
                "role": best["role"],
                "manhwaId": best["manhwaId"],
            }
        )
    rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 99999, r["characterName"].lower()))
    return rows


def score_result(item: dict[str, Any], character_name: str, manhwa_title: str) -> float:
    image = (item.get("image") or "").strip()
    if not image.startswith("http"):
        return -1.0
    host = urlparse(image).netloc.lower()
    path = urlparse(image).path.lower()
    blob = f"{image} {item.get('title') or ''} {item.get('url') or ''}".lower()
    if any(s in blob for s in SKIP_HOST_HINTS):
        return -1.0
    if image.endswith(".svg"):
        return -1.0

    score = 0.0
    if any(h in host for h in PREFERRED_HOST_HINTS):
        score += 2.0
    # Prefer larger-looking assets
    if any(x in path for x in ("/originals/", "/large/", "736x", "1200", "1080")):
        score += 1.0
    if path.endswith((".jpg", ".jpeg", ".png", ".webp")):
        score += 0.5

    name_tokens = [t for t in re.split(r"\W+", character_name.lower()) if len(t) > 1]
    title_tokens = [t for t in re.split(r"\W+", manhwa_title.lower()) if len(t) > 2]
    hit_name = sum(1 for t in name_tokens if t in blob)
    hit_title = sum(1 for t in title_tokens if t in blob)
    if name_tokens:
        score += 2.0 * (hit_name / len(name_tokens))
    if title_tokens:
        score += 1.5 * (hit_title / len(title_tokens))
    if hit_name == 0 and hit_title == 0:
        score -= 1.0
    return score


def pick_image(results: list[dict[str, Any]], character_name: str, manhwa_title: str) -> dict[str, Any] | None:
    scored = []
    for item in results:
        s = score_result(item, character_name, manhwa_title)
        if s < 0.5:
            continue
        scored.append((s, item))
    if not scored:
        return None
    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best = scored[0]
    # Require at least a weak name or title hit for confidence
    blob = f"{best.get('title') or ''} {best.get('url') or ''} {best.get('image') or ''}".lower()
    name_tokens = [t for t in re.split(r"\W+", character_name.lower()) if len(t) > 1]
    if name_tokens and not any(t in blob for t in name_tokens):
        if best_score < 2.5:
            return None
    return {
        "image": best.get("image"),
        "title": best.get("title"),
        "pageUrl": best.get("url"),
        "score": best_score,
        "thumbnail": best.get("thumbnail"),
    }


def head_looks_like_image(url: str, timeout: float = 12.0) -> bool:
    req = urllib.request.Request(
        url,
        method="HEAD",
        headers={"User-Agent": UA, "Accept": "image/*,*/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            return ctype.startswith("image/") or "octet-stream" in ctype
    except Exception:
        # Some CDNs reject HEAD; try a tiny ranged GET
        try:
            req2 = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "image/*,*/*",
                    "Range": "bytes=0-64",
                },
            )
            with urllib.request.urlopen(req2, timeout=timeout) as resp:
                ctype = (resp.headers.get("Content-Type") or "").lower()
                data = resp.read(16)
                if ctype.startswith("image/"):
                    return True
                # magic bytes
                if data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG") or data.startswith(b"RIFF"):
                    return True
                if data.startswith(b"GIF8") or b"webp" in data[:16].lower():
                    return True
        except Exception:
            return False
    return False


def search_images(query: str, max_results: int = 8) -> list[dict[str, Any]]:
    from ddgs import DDGS

    with DDGS() as ddgs:
        return list(ddgs.images(query, max_results=max_results))


def enrich(
    catalog_path: Path,
    top_path: Path,
    *,
    limit: int | None,
    delay_s: float,
    reset: bool,
    max_rank: int | None,
) -> None:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    checkpoint_path = catalog_path.with_name(catalog_path.stem + ".enrich-websearch.checkpoint.json")
    mal_ckpt_path = catalog_path.with_name(catalog_path.stem + ".enrich-images.checkpoint.json")

    if checkpoint_path.exists() and not reset:
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        print(f"[resume] {checkpoint_path}", flush=True)
    else:
        checkpoint = {"version": 1, "filled": {}, "failed": {}, "updatedAt": None}

    filled: dict[str, Any] = dict(checkpoint.get("filled") or {})
    failed: dict[str, str] = dict(checkpoint.get("failed") or {})

    chars_by_id = {int(c["id"]): c for c in catalog.get("characters") or []}
    # Apply previous websearch fills
    for cid_str, info in filled.items():
        ch = chars_by_id.get(int(cid_str))
        if not ch or not info.get("image"):
            continue
        ch.setdefault("image", {})
        ch["image"]["large"] = info["image"]
        ch["image"]["medium"] = info["image"]

    targets = collect_targets(catalog, top_path)
    if max_rank is not None:
        targets = [t for t in targets if isinstance(t["rank"], int) and t["rank"] <= max_rank]

    pending = [
        t
        for t in targets
        if str(t["characterId"]) not in filled
        and str(t["characterId"]) not in failed
        and is_placeholder(chars_by_id.get(t["characterId"]))
    ]
    if limit is not None:
        pending = pending[:limit]

    print(
        f"[plan] targets_in_top1000={len(targets)} pending={len(pending)} "
        f"(already filled={len(filled)} failed={len(failed)})",
        flush=True,
    )

    for i, row in enumerate(pending, start=1):
        cid = row["characterId"]
        name = row["characterName"]
        title = row["manhwaTitle"]
        query = f'"{title}" "{name}" manhwa character'
        print(f"[{i}/{len(pending)}] #{row['rank']} {title} | {name} …", flush=True)
        try:
            results = search_images(query, max_results=8)
        except Exception as err:
            failed[str(cid)] = f"search_error:{err}"
            print(f"  [miss] search error: {err}", flush=True)
            write_json_atomic(
                checkpoint_path,
                {"version": 1, "filled": filled, "failed": failed, "updatedAt": utc_now()},
            )
            time.sleep(delay_s)
            continue

        pick = pick_image(results, name, title)
        if not pick or not pick.get("image"):
            failed[str(cid)] = "no_confident_result"
            print("  [miss] no confident result", flush=True)
        elif not head_looks_like_image(pick["image"]):
            failed[str(cid)] = "url_not_image"
            print(f"  [miss] url not image: {pick['image'][:80]}", flush=True)
        else:
            url = pick["image"]
            ch = chars_by_id[cid]
            ch.setdefault("image", {})
            ch["image"]["large"] = url
            ch["image"]["medium"] = url
            filled[str(cid)] = {
                "image": url,
                "source": "websearch-ddgs",
                "query": query,
                "resultTitle": pick.get("title"),
                "pageUrl": pick.get("pageUrl"),
                "score": pick.get("score"),
                "manhwaId": row["manhwaId"],
                "manhwaTitle": title,
                "rank": row["rank"],
            }
            failed.pop(str(cid), None)
            print(f"  [hit] score={pick.get('score'):.2f} {url[:90]}", flush=True)

        write_json_atomic(
            checkpoint_path,
            {"version": 1, "filled": filled, "failed": failed, "updatedAt": utc_now()},
        )
        time.sleep(delay_s)

    catalog["characters"] = sorted(chars_by_id.values(), key=lambda c: int(c["id"]))
    if "meta" not in catalog:
        catalog["meta"] = {}
    catalog["meta"]["characterImageWebSearch"] = {
        "at": utc_now(),
        "filled": len(filled),
        "failed": len(failed),
        "source": "ddgs-images",
    }
    write_json_atomic(catalog_path, catalog)

    # Also merge websearch fills into MAL enrich checkpoint so the verify page "Changed" tab includes them
    if mal_ckpt_path.exists():
        mal_ck = json.loads(mal_ckpt_path.read_text(encoding="utf-8"))
    else:
        mal_ck = {"version": 1, "filled": {}, "unmatched": {}}
    mal_filled = dict(mal_ck.get("filled") or {})
    for cid_str, info in filled.items():
        mal_filled[cid_str] = {
            "image": info["image"],
            "source": info.get("source") or "websearch-ddgs",
            "malName": info.get("resultTitle") or info.get("query"),
            "malId": None,
            "idMal": None,
            "websearch": True,
            "query": info.get("query"),
            "pageUrl": info.get("pageUrl"),
            "rank": info.get("rank"),
            "manhwaTitle": info.get("manhwaTitle"),
        }
        # remove from unmatched if present
        if "unmatched" in mal_ck and cid_str in mal_ck["unmatched"]:
            del mal_ck["unmatched"][cid_str]
    mal_ck["filled"] = mal_filled
    mal_ck["updatedAt"] = utc_now()
    write_json_atomic(mal_ckpt_path, mal_ck)

    still = sum(1 for c in catalog["characters"] if is_placeholder(c))
    print(
        f"[done] websearch filled={len(filled)} failed={len(failed)} "
        f"still_placeholder_or_missing={still} -> {catalog_path}",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich character images via web image search")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--top", type=Path, default=DEFAULT_TOP)
    parser.add_argument("--limit", type=int, default=None, help="Only process N characters (for testing)")
    parser.add_argument("--delay", type=float, default=1.25, help="Seconds between searches")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument(
        "--max-rank",
        type=int,
        default=None,
        help="Only characters whose best manhwa rank is <= this (e.g. 500)",
    )
    args = parser.parse_args()
    if not args.catalog.exists():
        raise SystemExit(f"Catalog not found: {args.catalog}")
    if not args.top.exists():
        raise SystemExit(f"top-N export not found: {args.top}")
    enrich(
        args.catalog,
        args.top,
        limit=args.limit,
        delay_s=args.delay,
        reset=args.reset,
        max_rank=args.max_rank,
    )


if __name__ == "__main__":
    main()
