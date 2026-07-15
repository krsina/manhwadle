#!/usr/bin/env python3
"""
Fill AniList placeholder character portraits from MyAnimeList (via Jikan, with MAL HTML fallback).

Finds catalog characters whose image is missing or AniList default.jpg, then for each
linked manhwa with an idMal:

  1. Try Jikan: GET /v4/manga/{idMal}/characters
  2. On failure/empty: scrape MAL .../manga/{idMal}/.../characters HTML

Matches by normalized name (AniList "First Last" ↔ MAL "Last, First" + alternatives).
Only confident unique matches are applied. Characters still lacking a real image
should be dropped later by sync-game-data / merge scrub.

Usage:
  python scripts/enrich_character_images.py
  python scripts/enrich_character_images.py --catalog manhwadle-etl/output/catalog.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CATALOG_NAME = "catalog.json"
PLACEHOLDER_IMAGE_RE = re.compile(r"/character/(?:large|medium)/default\.jpg(?:\?|$)", re.I)
MAL_THUMB_RE = re.compile(r"/r/\d+x\d+/")
MAL_QUESTION_RE = re.compile(r"/images/questionmark_|\?s=question", re.I)
JIKAN_BASE = "https://api.jikan.moe/v4"
UA = "manhwadle-enrich-character-images/1.0 (+https://github.com/local)"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    last_err: Exception | None = None
    for attempt in range(8):
        try:
            os.replace(tmp, path)
            return
        except PermissionError as err:
            last_err = err
            time.sleep(0.25 * (attempt + 1))
    if last_err:
        raise last_err


def resolve_catalog(value: str | None) -> Path:
    candidates: list[Path] = []
    if value:
        path = Path(value)
        if path.is_absolute():
            return path
        candidates.extend([Path.cwd() / path, SCRIPT_DIR / path])
    else:
        candidates.extend(
            [
                Path.cwd() / DEFAULT_CATALOG_NAME,
                SCRIPT_DIR / DEFAULT_CATALOG_NAME,
                Path.cwd() / "manhwadle-etl" / "output" / DEFAULT_CATALOG_NAME,
                SCRIPT_DIR.parent / "manhwadle-etl" / "output" / DEFAULT_CATALOG_NAME,
            ]
        )
    for c in candidates:
        if c.exists():
            return c.resolve()
    return (candidates[0] if candidates else Path.cwd() / DEFAULT_CATALOG_NAME).resolve()


def has_real_character_image(char: dict[str, Any] | None) -> bool:
    if not char:
        return False
    image = char.get("image") or {}
    large = image.get("large") or ""
    medium = image.get("medium") or ""
    if not large and not medium:
        return False
    if PLACEHOLDER_IMAGE_RE.search(large) or PLACEHOLDER_IMAGE_RE.search(medium):
        return False
    return True


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    text = unescape(str(value)).lower().strip()
    text = text.replace("·", " ").replace("•", " ")
    # MAL "Last, First" → "first last"
    if "," in text:
        parts = [p.strip() for p in text.split(",") if p.strip()]
        if len(parts) >= 2:
            text = " ".join(parts[1:] + parts[:1])
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def name_keys_for_anilist(char: dict[str, Any]) -> set[str]:
    name = char.get("name") or {}
    keys: set[str] = set()
    for raw in [
        name.get("full"),
        name.get("native"),
        *(name.get("alternative") or []),
    ]:
        key = normalize_name(raw)
        if key:
            keys.add(key)
            # also add token-sorted form for order-insensitive equality
            tokens = sorted(key.split())
            if tokens:
                keys.add(" ".join(tokens))
    return keys


def name_keys_for_mal(display_name: str) -> set[str]:
    keys: set[str] = set()
    key = normalize_name(display_name)
    if key:
        keys.add(key)
        tokens = sorted(key.split())
        if tokens:
            keys.add(" ".join(tokens))
    return keys


def upgrade_mal_image_url(url: str | None) -> str | None:
    if not url:
        return None
    if MAL_QUESTION_RE.search(url):
        return None
    # Strip resize prefix: /r/42x62/images/... → /images/...
    upgraded = MAL_THUMB_RE.sub("/", url)
    # Drop cache bust query for cleaner URLs
    upgraded = upgraded.split("?", 1)[0]
    if "/images/characters/" not in upgraded:
        return None
    return upgraded


def encode_url(url: str) -> str:
    """Percent-encode path so non-ASCII MAL slugs don't crash urllib."""
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(parts.path, safe="/:@!$&'()*+,;=-._~")
    query = urllib.parse.quote(parts.query, safe="=&%+@!$&'()*+,;=-._~")
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def http_get(url: str, *, accept: str = "application/json", max_retries: int = 5) -> tuple[int, str, str]:
    """Return (status, final_url, body_text). Raises on exhausted retries for network errors."""
    attempt = 0
    request_url = encode_url(url)
    while True:
        attempt += 1
        req = urllib.request.Request(
            request_url,
            headers={
                "User-Agent": UA,
                "Accept": accept,
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                return resp.status, resp.geturl(), body
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", errors="replace") if err.fp else ""
            if err.code in (429, 500, 502, 503, 504) and attempt <= max_retries:
                retry_after = err.headers.get("Retry-After") if err.headers else None
                pause = float(retry_after) if retry_after and str(retry_after).isdigit() else min(60.0, 2.0 * attempt)
                print(f"  [http] {err.code} for {url}; retry in {pause:.0f}s", flush=True)
                time.sleep(pause)
                continue
            return err.code, url, body
        except urllib.error.URLError as err:
            if attempt > max_retries:
                raise
            pause = min(60.0, 2.0 * attempt)
            print(f"  [http] network error for {url}; retry in {pause:.0f}s: {err}", flush=True)
            time.sleep(pause)


def fetch_jikan_characters(id_mal: int) -> list[dict[str, Any]]:
    url = f"{JIKAN_BASE}/manga/{id_mal}/characters"
    # Keep retries low — Jikan often 504s; MAL HTML is the reliable fallback.
    status, _, body = http_get(url, accept="application/json", max_retries=1)
    if status != 200:
        print(f"  [jikan] HTTP {status} for idMal={id_mal}", flush=True)
        return []
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return []
    rows: list[dict[str, Any]] = []
    for row in payload.get("data") or []:
        ch = row.get("character") or {}
        name = ch.get("name") or ""
        images = ch.get("images") or {}
        jpg = images.get("jpg") or {}
        webp = images.get("webp") or {}
        image_url = upgrade_mal_image_url(jpg.get("image_url") or webp.get("image_url"))
        if not name or not image_url:
            continue
        rows.append(
            {
                "malId": ch.get("mal_id"),
                "name": name,
                "image": image_url,
                "role": row.get("role"),
                "keys": name_keys_for_mal(name),
            }
        )
    return rows


def fetch_mal_html_characters(id_mal: int) -> list[dict[str, Any]]:
    # Resolve slug from manga page (MAL often does not HTTP-redirect /manga/{id})
    status, _, manga_html = http_get(
        f"https://myanimelist.net/manga/{id_mal}",
        accept="text/html",
    )
    if status != 200:
        print(f"  [mal] manga page HTTP {status} for idMal={id_mal}", flush=True)
        return []

    canonical = None
    canon_m = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',
        manga_html,
        flags=re.I,
    )
    if not canon_m:
        canon_m = re.search(
            r'<meta[^>]+property=["\']og:url["\'][^>]+content=["\']([^"\']+)["\']',
            manga_html,
            flags=re.I,
        )
    if canon_m:
        canonical = canon_m.group(1).strip()
    if not canonical:
        # Fallback: first /manga/{id}/Slug link on the page
        slug_m = re.search(
            rf'https://myanimelist\.net/manga/{id_mal}/([A-Za-z0-9_+\-]+)',
            manga_html,
        )
        if slug_m:
            canonical = f"https://myanimelist.net/manga/{id_mal}/{slug_m.group(1)}"

    if not canonical:
        print(f"  [mal] could not resolve slug for idMal={id_mal}", flush=True)
        return []

    base = canonical.split("?", 1)[0].rstrip("/")
    if base.endswith("/characters"):
        chars_url = base
    else:
        # Drop trailing section if present (e.g. /reviews)
        parts = base.split("/")
        # expect .../manga/{id}/{slug}
        if len(parts) >= 6 and parts[-3] == "manga":
            chars_url = "/".join(parts[:6]) + "/characters"
        else:
            chars_url = f"{base}/characters"

    time.sleep(0.75)
    status, _, html = http_get(chars_url, accept="text/html")
    if status != 200:
        print(f"  [mal] characters page HTTP {status} for {chars_url}", flush=True)
        return []

    rows: list[dict[str, Any]] = []
    # Parse each character name heading; image sits in the preceding ~800 chars
    for name_m in re.finditer(
        r'<h3[^>]*class="[^"]*h3_character_name[^"]*"[^>]*>(.*?)</h3>',
        html,
        flags=re.I | re.S,
    ):
        name = unescape(re.sub(r"<[^>]+>", "", name_m.group(1))).strip()
        window = html[max(0, name_m.start() - 900) : name_m.end()]
        img_m = re.search(
            r'data-src="(https://cdn\.myanimelist\.net/[^"]+)"',
            window,
            flags=re.I,
        )
        if not img_m:
            img_m = re.search(
                r'src="(https://cdn\.myanimelist\.net/images/characters/[^"]+)"',
                window,
                flags=re.I,
            )
        if not img_m:
            continue
        image_url = upgrade_mal_image_url(img_m.group(1))
        if not name or not image_url:
            continue
        mal_id_m = re.search(r"/character/(\d+)/", window)
        rows.append(
            {
                "malId": int(mal_id_m.group(1)) if mal_id_m else None,
                "name": name,
                "image": image_url,
                "role": None,
                "keys": name_keys_for_mal(name),
            }
        )
    return rows


def load_mal_cast(
    id_mal: int,
    cache: dict[int, list[dict[str, Any]]],
    *,
    skip_jikan: bool = False,
) -> list[dict[str, Any]]:
    if id_mal in cache:
        return cache[id_mal]

    cast: list[dict[str, Any]] = []
    if not skip_jikan:
        print(f"  [fetch] idMal={id_mal} via Jikan...", flush=True)
        cast = fetch_jikan_characters(id_mal)
        time.sleep(0.85)
    if not cast:
        print(f"  [fetch] idMal={id_mal} Jikan empty/failed -> MAL HTML...", flush=True)
        cast = fetch_mal_html_characters(id_mal)
        time.sleep(0.85)

    # Dedupe by image+name
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for row in cast:
        key = f"{row.get('name')}|{row.get('image')}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)

    cache[id_mal] = unique
    print(f"  [fetch] idMal={id_mal} -> {len(unique)} cast with images", flush=True)
    return unique


def match_character(
    anilist_char: dict[str, Any],
    cast: list[dict[str, Any]],
) -> dict[str, Any] | None:
    keys = name_keys_for_anilist(anilist_char)
    if not keys or not cast:
        return None

    exact: list[dict[str, Any]] = []
    for row in cast:
        if keys & row["keys"]:
            exact.append(row)

    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        # Ambiguous exact match — skip
        return None

    # Soft: token overlap — only if a single candidate clearly wins
    best: list[tuple[float, dict[str, Any]]] = []
    for row in cast:
        row_tokens = set()
        for k in row["keys"]:
            row_tokens.update(k.split())
        scores = []
        for key in keys:
            q_tokens = set(key.split())
            if not q_tokens or not row_tokens:
                continue
            overlap = len(q_tokens & row_tokens) / max(len(q_tokens), len(row_tokens))
            scores.append(overlap)
        if scores:
            best.append((max(scores), row))

    best.sort(key=lambda t: t[0], reverse=True)
    if not best:
        return None
    top_score, top_row = best[0]
    if top_score < 0.85:
        return None
    if len(best) > 1 and best[1][0] >= top_score - 0.05:
        return None  # ambiguous
    return top_row


def collect_needs(
    catalog: dict[str, Any],
) -> tuple[dict[int, dict[str, Any]], dict[int, list[dict[str, Any]]], dict[int, int | None]]:
    """
    Returns:
      characters_needing_image by id
      needs_by_id_mal: idMal → list of character dicts needing images
      manhwa_id_mal: manhwaId → idMal
    """
    characters = {int(c["id"]): c for c in catalog.get("characters") or []}
    manhwa = {int(m["id"]): m for m in catalog.get("manhwa") or []}
    manhwa_id_mal = {mid: (m.get("idMal") if m.get("idMal") is not None else None) for mid, m in manhwa.items()}

    needing = {cid: c for cid, c in characters.items() if not has_real_character_image(c)}

    # Map character → possible idMal via appearances
    by_mal: dict[int, dict[int, dict[str, Any]]] = {}
    no_mal: set[int] = set()

    for app in catalog.get("appearances") or []:
        cid = int(app["characterId"])
        if cid not in needing:
            continue
        mid = int(app["manhwaId"])
        id_mal = manhwa_id_mal.get(mid)
        if not id_mal:
            no_mal.add(cid)
            continue
        by_mal.setdefault(int(id_mal), {})[cid] = needing[cid]

    # Characters with no appearance / no idMal still counted as unmatched later
    return needing, {k: list(v.values()) for k, v in by_mal.items()}, manhwa_id_mal


def enrich(catalog_path: Path, *, reset: bool = False, skip_jikan: bool = False) -> None:
    catalog = load_json(catalog_path)
    checkpoint_path = catalog_path.with_name(catalog_path.stem + ".enrich-images.checkpoint.json")

    needing, by_mal, _ = collect_needs(catalog)
    print(
        f"[plan] {len(needing)} characters need images; "
        f"{len(by_mal)} MAL titles to query",
        flush=True,
    )

    if checkpoint_path.exists() and not reset:
        checkpoint = load_json(checkpoint_path)
        print(f"[resume] {checkpoint_path}", flush=True)
    else:
        checkpoint = {
            "version": 1,
            "filled": {},  # characterId str → {image, source, malName, idMal}
            "unmatched": {},  # characterId str → reason
            "fetchedMalIds": [],
            "updatedAt": None,
        }

    filled: dict[str, Any] = dict(checkpoint.get("filled") or {})
    unmatched: dict[str, str] = dict(checkpoint.get("unmatched") or {})
    cast_cache: dict[int, list[dict[str, Any]]] = {}

    # Apply previously filled into working catalog copy
    characters_by_id = {int(c["id"]): c for c in catalog.get("characters") or []}
    for cid_str, info in filled.items():
        cid = int(cid_str)
        ch = characters_by_id.get(cid)
        if not ch:
            continue
        img = info.get("image")
        if img:
            ch.setdefault("image", {})
            ch["image"]["large"] = img
            ch["image"]["medium"] = img

    pending_mal_ids = sorted(by_mal.keys())
    resolved_ids = {int(k) for k in filled} | {int(k) for k in unmatched}
    for i, id_mal in enumerate(pending_mal_ids, start=1):
        chars = by_mal[id_mal]
        still_need = [
            c
            for c in chars
            if int(c["id"]) not in resolved_ids
            and not has_real_character_image(characters_by_id.get(int(c["id"])))
        ]
        if not still_need:
            continue

        print(f"[{i}/{len(pending_mal_ids)}] idMal={id_mal} ({len(still_need)} need images)", flush=True)
        try:
            cast = load_mal_cast(id_mal, cast_cache, skip_jikan=skip_jikan)
        except Exception as err:
            print(f"  [error] idMal={id_mal}: {err}", flush=True)
            for ch in still_need:
                cid = int(ch["id"])
                unmatched[str(cid)] = f"fetch_error:{err}"
                resolved_ids.add(cid)
            checkpoint = {
                "version": 1,
                "filled": filled,
                "unmatched": unmatched,
                "fetchedMalIds": sorted(set(checkpoint.get("fetchedMalIds") or []) | set(cast_cache.keys())),
                "updatedAt": utc_now(),
            }
            write_json_atomic(checkpoint_path, checkpoint)
            continue

        for ch in still_need:
            cid = int(ch["id"])
            cid_str = str(cid)
            if cid_str in filled:
                continue
            live = characters_by_id.get(cid) or ch
            match = match_character(live, cast)
            if not match:
                unmatched[cid_str] = "no_confident_mal_match"
                resolved_ids.add(cid)
                label = (live.get("name") or {}).get("full") or cid
                print(f"    [miss] {cid} {label!r}", flush=True)
                continue
            image = match["image"]
            live.setdefault("image", {})
            live["image"]["large"] = image
            live["image"]["medium"] = image
            filled[cid_str] = {
                "image": image,
                "source": "mal",
                "malName": match.get("name"),
                "malId": match.get("malId"),
                "idMal": id_mal,
            }
            unmatched.pop(cid_str, None)
            resolved_ids.add(cid)
            print(f"    [hit] {cid} -> {match.get('name')!r}", flush=True)

        checkpoint = {
            "version": 1,
            "filled": filled,
            "unmatched": unmatched,
            "fetchedMalIds": sorted(set(checkpoint.get("fetchedMalIds") or []) | set(cast_cache.keys())),
            "updatedAt": utc_now(),
        }
        write_json_atomic(checkpoint_path, checkpoint)

    # Characters needing images with no idMal path
    covered_ids = {int(c["id"]) for chars in by_mal.values() for c in chars}
    for cid, ch in needing.items():
        if cid in covered_ids:
            continue
        if has_real_character_image(characters_by_id.get(cid)):
            continue
        unmatched[str(cid)] = "no_idMal_or_appearance"
        label = (ch.get("name") or {}).get("full") or cid
        print(f"  [skip] {cid} {label!r} (no idMal link)", flush=True)

    # Write catalog
    catalog["characters"] = sorted(characters_by_id.values(), key=lambda c: int(c["id"]))
    if "meta" not in catalog:
        catalog["meta"] = {}
    catalog["meta"]["characterImageEnrichment"] = {
        "at": utc_now(),
        "filled": len(filled),
        "unmatched": len(unmatched),
        "source": "jikan+mal-html",
    }
    write_json_atomic(catalog_path, catalog)
    write_json_atomic(
        checkpoint_path,
        {
            "version": 1,
            "filled": filled,
            "unmatched": unmatched,
            "fetchedMalIds": sorted(cast_cache.keys()),
            "updatedAt": utc_now(),
        },
    )

    still_bad = sum(1 for c in catalog["characters"] if not has_real_character_image(c))
    print(
        f"[done] filled={len(filled)} unmatched={len(unmatched)} "
        f"still_placeholder_or_missing={still_bad} -> {catalog_path}",
        flush=True,
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Enrich placeholder character images from MAL")
    parser.add_argument(
        "--catalog",
        default=None,
        help="Path to catalog.json (default: cwd / scripts / manhwadle-etl/output)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Ignore enrichment checkpoint and start fresh",
    )
    parser.add_argument(
        "--skip-jikan",
        action="store_true",
        help="Skip Jikan and scrape MAL HTML directly (faster when Jikan is down)",
    )
    args = parser.parse_args(argv)
    catalog_path = resolve_catalog(args.catalog)
    if not catalog_path.exists():
        raise SystemExit(
            f"Catalog not found: {catalog_path}\n"
            f"Pass --catalog PATH or place {DEFAULT_CATALOG_NAME} next to this script."
        )
    print(f"[catalog] {catalog_path}", flush=True)
    enrich(catalog_path, reset=args.reset, skip_jikan=args.skip_jikan)


if __name__ == "__main__":
    main()
