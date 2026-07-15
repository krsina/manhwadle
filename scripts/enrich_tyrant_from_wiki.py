#!/usr/bin/env python3
"""Fetch Tyrant of the Tower Defense Game character images from the Fandom wiki."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "manhwadle-etl" / "output" / "catalog.json"
CHECKPOINT = CATALOG.with_name("catalog.enrich-images.checkpoint.json")
API = "https://i-became-the-tyrant-of-the-defense-tower-game.fandom.com/api.php"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# AniList characterId -> wiki page title (omit Crown)
WIKI_PAGES = {
    319501: 'Fernandes "Amberkiefer" Everblack',
    319502: "Damian",
    319504: "Charles Cross",
    319505: "Saintess Margherita",
    319507: "Eider",  # AniList: Aider
    319509: "Godhand",
    319510: "Body Bag",
    319511: "Old Girl",
    319512: "Burnout",
    319513: "Skull",
}

CROWN_ID = 319508


def fetch_page_images(titles: list[str]) -> dict[str, str]:
    """Return {title: image_url} via MediaWiki pageimages API."""
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "prop": "pageimages",
            "piprop": "original|thumbnail",
            "pithumbsize": "800",
            "titles": "|".join(titles),
        }
    )
    req = urllib.request.Request(
        API + "?" + q,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    out: dict[str, str] = {}
    for page in (data.get("query") or {}).get("pages", {}).values():
        title = page.get("title")
        if not title or page.get("missing"):
            continue
        orig = (page.get("original") or {}).get("source")
        thumb = (page.get("thumbnail") or {}).get("source")
        url = orig or thumb
        if url:
            out[title] = clean_wiki_url(url)
    return out


def clean_wiki_url(url: str) -> str:
    url = url.replace("&amp;", "&")
    # Drop scale-to-width thumbnails when present
    if "/revision/latest/scale-to-width" in url:
        base, _, rest = url.partition("/revision/latest")
        cb = ""
        if "cb=" in rest:
            cb = "?" + rest.split("?", 1)[-1]
        return f"{base}/revision/latest{cb}"
    return url


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    chars = {int(c["id"]): c for c in catalog.get("characters") or []}
    ck = (
        json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        if CHECKPOINT.exists()
        else {
            "version": 1,
            "filled": {},
            "unmatched": {},
            "manualAllowlist": {},
        }
    )
    filled = dict(ck.get("filled") or {})
    unmatched = dict(ck.get("unmatched") or {})

    titles = list(WIKI_PAGES.values())
    print(f"[api] fetching {len(titles)} wiki page images …", flush=True)
    images = fetch_page_images(titles)
    print(f"[api] got {len(images)} images", flush=True)

    results: list[tuple[int, str | None, str]] = []
    for cid, title in WIKI_PAGES.items():
        image = images.get(title)
        if not image:
            print(f"  [miss] {cid} {title}", flush=True)
            results.append((cid, None, "no_image"))
            continue

        ch = chars.get(cid)
        if ch:
            ch["image"] = {"large": image, "medium": image}
        filled[str(cid)] = {
            "image": image,
            "source": "fandom-wiki",
            "malName": None,
            "malId": None,
            "idMal": None,
            "manual": True,
            "wikiPage": title,
        }
        unmatched.pop(str(cid), None)
        print(f"  [hit] {cid} {title}", flush=True)
        results.append((cid, image, "ok"))

    # Drop Crown from appearances / characterIds / manual list
    dropped_crown = 0
    if CROWN_ID in chars or any(
        int(a["characterId"]) == CROWN_ID for a in catalog.get("appearances") or []
    ):
        before = len(catalog.get("appearances") or [])
        catalog["appearances"] = [
            a for a in catalog.get("appearances") or [] if int(a["characterId"]) != CROWN_ID
        ]
        dropped_crown = before - len(catalog["appearances"])
        for m in catalog.get("manhwa") or []:
            ids = m.get("characterIds") or []
            if CROWN_ID in ids or str(CROWN_ID) in [str(i) for i in ids]:
                m["characterIds"] = [i for i in ids if int(i) != CROWN_ID]
        filled.pop(str(CROWN_ID), None)
        unmatched.pop(str(CROWN_ID), None)
        chars.pop(CROWN_ID, None)
        print(f"[omit] Crown #{CROWN_ID} removed ({dropped_crown} appearances)", flush=True)

    referenced = {int(a["characterId"]) for a in catalog.get("appearances") or []}
    catalog["characters"] = [
        c for c in sorted(chars.values(), key=lambda c: int(c["id"])) if int(c["id"]) in referenced
    ]

    allow = ck.get("manualAllowlist") or {
        "manhwaId": 153513,
        "title": "Tyrant of the Tower Defense Game",
        "characterIds": [],
    }
    still_need = [
        cid
        for cid in WIKI_PAGES
        if str(cid) not in filled or not (filled.get(str(cid)) or {}).get("image")
    ]
    allow["characterIds"] = still_need
    ck["filled"] = filled
    ck["unmatched"] = {
        **{k: v for k, v in unmatched.items() if int(k) != CROWN_ID},
        **{str(cid): "manual_tyrant" for cid in still_need},
    }
    ck["manualAllowlist"] = allow
    ck["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    tmp = CATALOG.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(CATALOG)
    tmp_ck = CHECKPOINT.with_suffix(CHECKPOINT.suffix + ".tmp")
    tmp_ck.write_text(json.dumps(ck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_ck.replace(CHECKPOINT)

    ok = sum(1 for _, img, st in results if st == "ok")
    print(
        json.dumps(
            {
                "filled": ok,
                "attempted": len(results),
                "stillNeed": still_need,
                "crownDropped": dropped_crown,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
