#!/usr/bin/env python3
"""
Fetch AniList characters for a shard of manhwa (for multi-machine scraping).

Matches manhwadle-etl policy:
  - MAIN → SUPPORTING → BACKGROUND
  - max 100 characters per manhwa
  - polite rate limiting + Retry-After on 429

Portable setup (put these next to the script):
  fetch_characters_shard.py
  top-1000.json

Then on each machine:

  python fetch_characters_shard.py --shard 0
  python fetch_characters_shard.py --shard 1
  …

Outputs land in the same folder:
  characters-shard-{N}.json
  characters-shard-{N}.checkpoint.json   (resume-safe)

After all shards finish, merge into the ETL catalog:

  python fetch_characters_shard.py merge \\
    --catalog catalog.json \\
    --shards characters-shard-*.json

Then re-export top-N and sync game data as usual.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ENDPOINT = "https://graphql.anilist.co"
CHAR_PER_PAGE = 25
MAX_CHARACTERS_PER_MANHWA = 100
ROLE_ORDER = ("MAIN", "SUPPORTING", "BACKGROUND")
DEFAULT_MIN_INTERVAL_MS = 750
DEFAULT_INPUT_NAME = "top-1000.json"
# AniList returns this URL when a character has no real portrait.
PLACEHOLDER_IMAGE_RE = re.compile(r"/character/(?:large|medium)/default\.jpg(?:\?|$)", re.I)

CHAR_NODE_FIELDS = """
  id
  name {
    full
    native
    alternative
  }
  description(asHtml: false)
  image {
    large
    medium
  }
  siteUrl
  favourites
"""

CHAR_PAGE_QUERY = f"""
query ($id: Int, $page: Int, $perPage: Int, $role: CharacterRole) {{
  Media(id: $id, type: MANGA) {{
    id
    characters(page: $page, perPage: $perPage, role: $role, sort: [RELEVANCE, ID]) {{
      pageInfo {{
        hasNextPage
      }}
      edges {{
        role
        node {{
          {CHAR_NODE_FIELDS}
        }}
      }}
    }}
  }}
}}
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def strip_html(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = re.sub(r"<[^>]+>", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def prefer_description(existing: str | None, incoming: str | None) -> str | None:
    if incoming:
        return incoming
    return existing


def has_real_character_image(char_or_node: dict[str, Any] | None) -> bool:
    if not char_or_node:
        return False
    image = char_or_node.get("image") or {}
    large = image.get("large") or ""
    medium = image.get("medium") or ""
    if not large and not medium:
        return False
    if PLACEHOLDER_IMAGE_RE.search(large) or PLACEHOLDER_IMAGE_RE.search(medium):
        return False
    return True


def map_character_node(node: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not node or node.get("id") is None:
        return None
    alt = node.get("name", {}) or {}
    alternatives = alt.get("alternative") or []
    if not isinstance(alternatives, list):
        alternatives = []
    alternatives = [str(a).strip() for a in alternatives if a and str(a).strip()]
    if not alternatives and existing:
        alternatives = list(existing.get("name", {}).get("alternative") or [])

    incoming_desc = strip_html(node.get("description"))
    existing_desc = (existing or {}).get("description")

    incoming_image = {
        "large": (node.get("image") or {}).get("large"),
        "medium": (node.get("image") or {}).get("medium"),
    }
    existing_image = (existing or {}).get("image") or {}
    # Prefer a real portrait over AniList default.jpg / empty
    if has_real_character_image({"image": incoming_image}):
        image = {
            "large": incoming_image.get("large") or existing_image.get("large"),
            "medium": incoming_image.get("medium") or existing_image.get("medium"),
        }
    elif has_real_character_image(existing):
        image = {
            "large": existing_image.get("large"),
            "medium": existing_image.get("medium"),
        }
    else:
        image = {
            "large": incoming_image.get("large") or existing_image.get("large"),
            "medium": incoming_image.get("medium") or existing_image.get("medium"),
        }

    return {
        "id": int(node["id"]),
        "name": {
            "full": (alt.get("full") or "").strip() or (existing or {}).get("name", {}).get("full"),
            "native": (alt.get("native") or "").strip() or (existing or {}).get("name", {}).get("native"),
            "alternative": alternatives,
        },
        "description": prefer_description(existing_desc, incoming_desc),
        "image": image,
        "siteUrl": node.get("siteUrl") or (existing or {}).get("siteUrl"),
        "favourites": node.get("favourites")
        if node.get("favourites") is not None
        else (existing or {}).get("favourites"),
    }


class AniListClient:
    def __init__(self, min_interval_ms: int = DEFAULT_MIN_INTERVAL_MS, label: str = "anilist"):
        self.min_interval_ms = min_interval_ms
        self.label = label
        self._next_allowed_at = 0.0
        self.request_count = 0

    def request(self, query: str, variables: dict[str, Any] | None = None, max_retries: int = 8) -> Any:
        variables = variables or {}
        attempt = 0
        body = json.dumps({"query": query, "variables": variables}).encode("utf-8")

        while True:
            attempt += 1
            wait = self._next_allowed_at - time.time()
            if wait > 0:
                time.sleep(wait)

            req = urllib.request.Request(
                ENDPOINT,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "manhwadle-character-shard/1.0",
                },
                method="POST",
            )

            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    status = resp.status
                    headers = {k.lower(): v for k, v in resp.headers.items()}
                    payload = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as err:
                status = err.code
                headers = {k.lower(): v for k, v in (err.headers.items() if err.headers else [])}
                raw = err.read().decode("utf-8", errors="replace") if err.fp else ""
                try:
                    payload = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    payload = {"errors": [{"message": raw or err.reason}]}
            except urllib.error.URLError as err:
                if attempt > max_retries:
                    raise
                backoff = min(60.0, 1.0 * (2 ** (attempt - 1)))
                print(f"[{self.label}] network error; retry in {backoff:.0f}s: {err}", flush=True)
                time.sleep(backoff)
                continue

            limit = int(headers.get("x-ratelimit-limit") or 0)
            remaining = int(headers.get("x-ratelimit-remaining") or 0)
            retry_after = int(headers.get("retry-after") or 0)

            spacing = self.min_interval_ms / 1000.0
            if limit > 0:
                target_per_min = max(10, int(limit * 0.8))
                spacing = max(spacing, 60.0 / target_per_min)
            if remaining > 0 and remaining <= 3:
                spacing = max(spacing, 15.0)
            self._next_allowed_at = time.time() + spacing

            if status == 429:
                pause = max(retry_after, 60)
                print(
                    f"[{self.label}] 429 rate limited (limit={limit or '?'}, remaining={remaining}). "
                    f"Waiting {pause}s",
                    flush=True,
                )
                self._next_allowed_at = time.time() + pause
                if attempt > max_retries:
                    raise RuntimeError("AniList rate limit exceeded; max retries reached")
                time.sleep(pause)
                continue

            if status >= 500:
                if attempt <= max_retries:
                    backoff = min(60.0, 2.0 * attempt)
                    print(f"[{self.label}] HTTP {status}; retry in {backoff:.0f}s", flush=True)
                    time.sleep(backoff)
                    continue
                raise RuntimeError(f"AniList HTTP {status}")

            if status < 200 or status >= 300:
                message = (payload.get("errors") or [{}])[0].get("message") or f"HTTP {status}"
                raise RuntimeError(f"AniList HTTP {status}: {message}")

            errors = payload.get("errors") or []
            if errors:
                message = "; ".join(e.get("message", str(e)) for e in errors)
                if re.search(r"too many requests", message, re.I):
                    pause = max(retry_after, 60)
                    self._next_allowed_at = time.time() + pause
                    time.sleep(pause)
                    continue
                raise RuntimeError(f"AniList GraphQL error: {message}")

            self.request_count += 1
            return payload.get("data")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_path(value: str | Path | None, *, default_name: str | None = None) -> Path:
    """Resolve a path relative to cwd, falling back to the script directory."""
    if value:
        path = Path(value)
        if path.is_absolute():
            return path
        cwd_path = Path.cwd() / path
        if cwd_path.exists():
            return cwd_path.resolve()
        script_path = SCRIPT_DIR / path
        if script_path.exists():
            return script_path.resolve()
        return cwd_path.resolve()

    if not default_name:
        raise ValueError("resolve_path needs a value or default_name")

    for candidate in (Path.cwd() / default_name, SCRIPT_DIR / default_name):
        if candidate.exists():
            return candidate.resolve()
    return (Path.cwd() / default_name).resolve()


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def select_shard_titles(
    manhwa: list[dict[str, Any]],
    *,
    rank_start: int,
    rank_end: int,
    shard: int,
    shards: int,
) -> list[dict[str, Any]]:
    ranked = [m for m in manhwa if isinstance(m.get("rank"), int)]
    if ranked:
        pool = [m for m in ranked if rank_start <= m["rank"] <= rank_end]
        pool.sort(key=lambda m: m["rank"])
    else:
        # Fallback: treat list order as rank 1..N
        pool = manhwa[rank_start - 1 : rank_end]

    if shards < 1:
        raise SystemExit("--shards must be >= 1")
    if shard < 0 or shard >= shards:
        raise SystemExit(f"--shard must be in 0..{shards - 1}")

    n = len(pool)
    base = n // shards
    rem = n % shards
    # First `rem` shards get one extra title so leftovers are covered.
    start = shard * base + min(shard, rem)
    size = base + (1 if shard < rem else 0)
    end = start + size
    return pool[start:end]


def appearance_key(manhwa_id: int, character_id: int, role: str) -> str:
    return f"{manhwa_id}:{character_id}:{role}"


def fetch_characters_for_manhwa(
    client: AniListClient,
    manhwa_id: int,
    *,
    max_chars: int = MAX_CHARACTERS_PER_MANHWA,
) -> tuple[list[int], dict[int, dict[str, Any]], list[dict[str, Any]]]:
    """Return (characterIds, characters_by_id, appearances) for one title."""
    character_ids: list[int] = []
    seen: set[int] = set()
    characters: dict[int, dict[str, Any]] = {}
    appearances: list[dict[str, Any]] = []

    for role in ROLE_ORDER:
        if len(seen) >= max_chars:
            break
        page = 1
        while len(seen) < max_chars:
            data = client.request(
                CHAR_PAGE_QUERY,
                {
                    "id": manhwa_id,
                    "page": page,
                    "perPage": CHAR_PER_PAGE,
                    "role": role,
                },
            )
            media = (data or {}).get("Media") or {}
            block = media.get("characters") or {}
            edges = block.get("edges") or []
            has_next = bool((block.get("pageInfo") or {}).get("hasNextPage"))

            for edge in edges:
                if len(seen) >= max_chars:
                    break
                node = edge.get("node") or {}
                mapped = map_character_node(node, characters.get(node.get("id")))
                if not mapped:
                    continue
                cid = mapped["id"]
                characters[cid] = mapped
                if cid in seen:
                    continue
                seen.add(cid)
                character_ids.append(cid)
                appearances.append(
                    {
                        "manhwaId": manhwa_id,
                        "characterId": cid,
                        "role": edge.get("role") or role,
                    }
                )

            if not has_next or not edges:
                break
            page += 1

    return character_ids, characters, appearances


def build_empty_checkpoint(titles: list[dict[str, Any]], meta: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": 1,
        "meta": meta,
        "queue": [
            {
                "id": int(m["id"]),
                "rank": m.get("rank"),
                "title": m.get("title"),
                "status": "pending",
            }
            for m in titles
        ],
        "done": {},  # manhwaId str -> {characterIds, appearances, characters}
        "updatedAt": None,
    }


def run_shard(args: argparse.Namespace) -> None:
    input_path = resolve_path(args.input, default_name=DEFAULT_INPUT_NAME)
    if not input_path.exists():
        raise SystemExit(
            f"Input not found: {input_path}\n"
            f"Put {DEFAULT_INPUT_NAME} next to this script (or in the current folder), "
            f"or pass --input PATH"
        )

    if args.out_dir:
        out_dir = Path(args.out_dir)
        if not out_dir.is_absolute():
            out_dir = (Path.cwd() / out_dir).resolve()
    else:
        out_dir = SCRIPT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    shard_path = out_dir / f"characters-shard-{args.shard}.json"
    checkpoint_path = out_dir / f"characters-shard-{args.shard}.checkpoint.json"

    doc = load_json(input_path)
    manhwa = doc.get("manhwa") if isinstance(doc, dict) else doc
    if not isinstance(manhwa, list):
        raise SystemExit(f"Expected manhwa list in {input_path}")

    titles = select_shard_titles(
        manhwa,
        rank_start=args.rank_start,
        rank_end=args.rank_end,
        shard=args.shard,
        shards=args.shards,
    )
    if not titles:
        raise SystemExit("Shard is empty — check rank range / shard index")

    meta = {
        "shard": args.shard,
        "shards": args.shards,
        "rankStart": args.rank_start,
        "rankEnd": args.rank_end,
        "input": str(input_path),
        "maxCharacters": args.max_chars,
        "roleOrder": list(ROLE_ORDER),
        "manhwaIds": [int(m["id"]) for m in titles],
        "manhwaCount": len(titles),
    }

    if checkpoint_path.exists() and not args.reset:
        checkpoint = load_json(checkpoint_path)
        print(f"[resume] {checkpoint_path}", flush=True)
    else:
        checkpoint = build_empty_checkpoint(titles, meta)
        write_json_atomic(checkpoint_path, checkpoint)
        print(f"[start] shard={args.shard}/{args.shards} titles={len(titles)} -> {shard_path}", flush=True)

    # Reconcile queue ids with current shard selection
    expected_ids = {int(m["id"]) for m in titles}
    queue_ids = {int(q["id"]) for q in checkpoint.get("queue", [])}
    if queue_ids != expected_ids:
        print("[warn] checkpoint queue ≠ current shard selection; rebuilding pending entries", flush=True)
        done = checkpoint.get("done") or {}
        checkpoint = build_empty_checkpoint(titles, meta)
        checkpoint["done"] = {k: v for k, v in done.items() if int(k) in expected_ids}
        for q in checkpoint["queue"]:
            if str(q["id"]) in checkpoint["done"]:
                q["status"] = "done"

    client = AniListClient(min_interval_ms=args.min_interval_ms, label=f"shard-{args.shard}")
    pending = [q for q in checkpoint["queue"] if q.get("status") != "done"]
    print(
        f"[plan] {len(pending)} remaining / {len(titles)} total "
        f"(ranks {titles[0].get('rank')}–{titles[-1].get('rank')})",
        flush=True,
    )

    for i, job in enumerate(checkpoint["queue"], start=1):
        mid = int(job["id"])
        if job.get("status") == "done" and str(mid) in checkpoint.get("done", {}):
            continue

        label = job.get("title") or mid
        print(
            f"[{i}/{len(titles)}] rank={job.get('rank')} id={mid} {label!r} ...",
            flush=True,
        )
        try:
            character_ids, characters, appearances = fetch_characters_for_manhwa(
                client, mid, max_chars=args.max_chars
            )
        except Exception as err:
            print(f"[error] id={mid}: {err}", flush=True)
            write_json_atomic(checkpoint_path, checkpoint)
            raise

        checkpoint.setdefault("done", {})[str(mid)] = {
            "characterIds": character_ids,
            "appearances": appearances,
            "characters": list(characters.values()),
        }
        job["status"] = "done"
        job["characterCount"] = len(character_ids)
        checkpoint["updatedAt"] = utc_now()
        checkpoint["meta"] = meta
        write_json_atomic(checkpoint_path, checkpoint)
        print(f"  -> {len(character_ids)} characters (requests={client.request_count})", flush=True)

        if args.save_every > 0 and i % args.save_every == 0:
            write_shard_output(shard_path, checkpoint, meta)

    write_shard_output(shard_path, checkpoint, meta)
    print(
        f"[done] wrote {shard_path} "
        f"({len(checkpoint.get('done', {}))} manhwa, {client.request_count} API requests)",
        flush=True,
    )


def write_shard_output(path: Path, checkpoint: dict[str, Any], meta: dict[str, Any]) -> None:
    characters: dict[int, dict[str, Any]] = {}
    appearances: list[dict[str, Any]] = []
    manhwa_rows: list[dict[str, Any]] = []

    title_by_id = {int(q["id"]): q for q in checkpoint.get("queue", [])}
    for mid_str, payload in sorted(checkpoint.get("done", {}).items(), key=lambda kv: int(kv[0])):
        mid = int(mid_str)
        job = title_by_id.get(mid, {})
        manhwa_rows.append(
            {
                "id": mid,
                "rank": job.get("rank"),
                "title": job.get("title"),
                "characterIds": list(payload.get("characterIds") or []),
            }
        )
        for app in payload.get("appearances") or []:
            appearances.append(app)
        for ch in payload.get("characters") or []:
            existing = characters.get(ch["id"])
            characters[ch["id"]] = map_character_node(
                {
                    "id": ch["id"],
                    "name": ch.get("name") or {},
                    "description": ch.get("description"),
                    "image": ch.get("image") or {},
                    "siteUrl": ch.get("siteUrl"),
                    "favourites": ch.get("favourites"),
                },
                existing,
            ) or ch

    doc = {
        "meta": {
            **meta,
            "fetchedAt": utc_now(),
            "counts": {
                "manhwa": len(manhwa_rows),
                "characters": len(characters),
                "appearances": len(appearances),
            },
        },
        "manhwa": manhwa_rows,
        "characters": [characters[k] for k in sorted(characters)],
        "appearances": appearances,
    }
    write_json_atomic(path, doc)


def merge_shards(args: argparse.Namespace) -> None:
    catalog_path = Path(args.catalog)
    out_path = Path(args.out or args.catalog)
    shard_paths: list[Path] = []
    for pattern in args.shards:
        matches = sorted(Path(p) for p in glob.glob(pattern))
        if not matches and Path(pattern).exists():
            matches = [Path(pattern)]
        shard_paths.extend(matches)

    seen_paths: set[str] = set()
    unique_shards: list[Path] = []
    for p in shard_paths:
        name = p.name.lower()
        if "checkpoint" in name or name.endswith(".tmp"):
            continue
        key = str(p.resolve())
        if key not in seen_paths:
            seen_paths.add(key)
            unique_shards.append(p)

    if not unique_shards:
        raise SystemExit("No shard files matched")

    catalog = load_json(catalog_path)
    manhwa_by_id = {int(m["id"]): m for m in catalog.get("manhwa", [])}
    character_by_id = {int(c["id"]): c for c in catalog.get("characters", [])}

    touched_manhwa: set[int] = set()
    from_shards: list[dict[str, Any]] = []
    seen_app: set[str] = set()

    for shard_path in unique_shards:
        shard = load_json(shard_path)
        print(f"[merge] {shard_path}", flush=True)

        for row in shard.get("manhwa") or []:
            mid = int(row["id"])
            touched_manhwa.add(mid)
            if mid not in manhwa_by_id:
                print(f"  [warn] manhwa id={mid} not in catalog; still merging appearances", flush=True)

        for ch in shard.get("characters") or []:
            cid = int(ch["id"])
            mapped = map_character_node(
                {
                    "id": cid,
                    "name": ch.get("name") or {},
                    "description": ch.get("description"),
                    "image": ch.get("image") or {},
                    "siteUrl": ch.get("siteUrl"),
                    "favourites": ch.get("favourites"),
                },
                character_by_id.get(cid),
            ) or ch
            character_by_id[cid] = mapped

        for app in shard.get("appearances") or []:
            mid = int(app["manhwaId"])
            cid = int(app["characterId"])
            role = app.get("role") or "BACKGROUND"
            key = appearance_key(mid, cid, role)
            if key in seen_app:
                continue
            seen_app.add(key)
            from_shards.append(
                {
                    "manhwaId": mid,
                    "characterId": cid,
                    "role": role,
                }
            )

    # Keep appearances for manhwa this merge did not touch (placeholders stay so
    # enrich_character_images.py can fill them; sync-game-data drops leftovers).
    kept = [a for a in catalog.get("appearances") or [] if int(a["manhwaId"]) not in touched_manhwa]

    # Cap per manhwa MAIN → SUPPORTING → BACKGROUND
    by_manhwa: dict[int, list[dict[str, Any]]] = {}
    for app in from_shards:
        by_manhwa.setdefault(int(app["manhwaId"]), []).append(app)

    role_rank = {r: i for i, r in enumerate(ROLE_ORDER)}
    trimmed_apps: list[dict[str, Any]] = []

    for mid, apps in by_manhwa.items():
        apps.sort(
            key=lambda a: (
                role_rank.get(a.get("role") or "BACKGROUND", len(ROLE_ORDER)),
                int(a["characterId"]),
            )
        )
        kept_apps = apps[: args.max_chars]
        ids = list(dict.fromkeys(int(a["characterId"]) for a in kept_apps))
        trimmed_apps.extend(kept_apps)
        if mid in manhwa_by_id:
            manhwa_by_id[mid]["characterIds"] = ids

    final_appearances = kept + trimmed_apps
    final_appearances.sort(key=lambda a: (int(a["manhwaId"]), int(a["characterId"])))
    referenced = {int(a["characterId"]) for a in final_appearances}

    catalog["manhwa"] = sorted(manhwa_by_id.values(), key=lambda m: int(m["id"]))
    catalog["characters"] = [
        c for c in sorted(character_by_id.values(), key=lambda c: int(c["id"])) if int(c["id"]) in referenced
    ]
    catalog["appearances"] = final_appearances

    if "meta" not in catalog:
        catalog["meta"] = {}
    catalog["meta"]["fetchedAt"] = utc_now()
    catalog["meta"]["counts"] = {
        "manhwa": len(catalog["manhwa"]),
        "characters": len(catalog["characters"]),
        "appearances": len(catalog["appearances"]),
    }

    write_json_atomic(out_path, catalog)
    print(
        f"[done] merged {len(unique_shards)} shard(s), touched {len(touched_manhwa)} manhwa -> {out_path}",
        flush=True,
    )
    print(
        f"       catalog now: manhwa={catalog['meta']['counts']['manhwa']} "
        f"characters={catalog['meta']['counts']['characters']} "
        f"appearances={catalog['meta']['counts']['appearances']}",
        flush=True,
    )


def build_run_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Fetch AniList characters for one shard (multi-machine)",
    )
    p.add_argument(
        "--input",
        default=None,
        help=f"top-N JSON (default: {DEFAULT_INPUT_NAME} in cwd or next to this script)",
    )
    p.add_argument("--rank-start", type=int, default=501)
    p.add_argument("--rank-end", type=int, default=1000)
    p.add_argument("--shard", type=int, default=0, help="This machine's shard index (0-based)")
    p.add_argument("--shards", type=int, default=5, help="Total number of machines/shards")
    p.add_argument(
        "--out-dir",
        default=None,
        help="Directory for shard + checkpoint JSON (default: same folder as this script)",
    )
    p.add_argument("--max-chars", type=int, default=MAX_CHARACTERS_PER_MANHWA)
    p.add_argument(
        "--min-interval-ms",
        type=int,
        default=DEFAULT_MIN_INTERVAL_MS,
        help="Minimum delay between API calls (default 750)",
    )
    p.add_argument(
        "--save-every",
        type=int,
        default=5,
        help="Also rewrite shard JSON every N manhwa (0=only at end + checkpoint always)",
    )
    p.add_argument(
        "--reset",
        action="store_true",
        help="Ignore existing checkpoint and start this shard fresh",
    )
    return p


def build_merge_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Merge character shard JSON into catalog.json")
    p.add_argument(
        "--catalog",
        required=True,
        help="Path to manhwadle-etl/output/catalog.json",
    )
    p.add_argument(
        "--shards",
        nargs="+",
        required=True,
        help="Shard JSON paths or globs (e.g. scripts/character-shards/characters-shard-*.json)",
    )
    p.add_argument("--out", help="Output catalog path (default: overwrite --catalog)")
    p.add_argument(
        "--max-chars",
        type=int,
        default=MAX_CHARACTERS_PER_MANHWA,
        help="Per-manhwa cap when merging (default 100)",
    )
    return p


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)

    if argv and argv[0] == "merge":
        args = build_merge_parser().parse_args(argv[1:])
        merge_shards(args)
        return

    if argv and argv[0] == "run":
        argv = argv[1:]

    args = build_run_parser().parse_args(argv)
    run_shard(args)


if __name__ == "__main__":
    main()
