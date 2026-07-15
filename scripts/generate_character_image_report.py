#!/usr/bin/env python3
"""
Build a local HTML report of character image enrichment results.

Reads:
  manhwadle-etl/output/catalog.json
  manhwadle-etl/output/catalog.enrich-images.checkpoint.json (optional)

Writes:
  public/character-image-verify.html
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import quote as urllib_quote
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "manhwadle-etl" / "output" / "catalog.json"
DEFAULT_OUT = ROOT / "public" / "character-image-verify.html"
PLACEHOLDER_RE = re.compile(r"/character/(?:large|medium)/default\.jpg(?:\?|$)", re.I)
PLACEHOLDER_URL = "https://s4.anilist.co/file/anilistcdn/character/large/default.jpg"


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


def image_url(char: dict[str, Any] | None) -> str | None:
    if not char:
        return None
    image = char.get("image") or {}
    return image.get("large") or image.get("medium") or None


def manhwa_title(m: dict[str, Any]) -> str:
    if isinstance(m.get("title"), str) and m["title"].strip():
        return m["title"].strip()
    titles = m.get("titles") or {}
    for key in ("english", "romaji", "native"):
        val = titles.get(key)
        if val:
            return str(val)
    return f"#{m.get('id')}"


def character_name(c: dict[str, Any]) -> str:
    name = c.get("name") or {}
    return name.get("full") or name.get("native") or f"#{c.get('id')}"


def manhwa_list_for_character(
    cid: int,
    appearances: list[dict[str, Any]],
    manhwa_by_id: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    seen: set[int] = set()
    rows: list[dict[str, Any]] = []
    for a in appearances:
        if int(a["characterId"]) != cid:
            continue
        mid = int(a["manhwaId"])
        if mid in seen:
            continue
        seen.add(mid)
        m = manhwa_by_id.get(mid)
        if not m:
            continue
        rows.append(
            {
                "id": mid,
                "title": manhwa_title(m),
                "role": a.get("role") or "BACKGROUND",
            }
        )
    rows.sort(key=lambda r: r["title"].lower())
    return rows


def build_report(catalog_path: Path, out_path: Path) -> dict[str, int]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    checkpoint_path = catalog_path.with_name(catalog_path.stem + ".enrich-images.checkpoint.json")
    checkpoint: dict[str, Any] = {}
    if checkpoint_path.exists():
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))

    manhwa_by_id = {int(m["id"]): m for m in catalog.get("manhwa") or []}
    chars_by_id = {int(c["id"]): c for c in catalog.get("characters") or []}
    appearances = catalog.get("appearances") or []

    filled_info = checkpoint.get("filled") or {}
    unmatched_info = checkpoint.get("unmatched") or {}

    changed_rows: list[dict[str, Any]] = []
    for cid_str, info in filled_info.items():
        # Only MAL matches with a real character id
        if not info.get("malId"):
            continue
        cid = int(cid_str)
        ch = chars_by_id.get(cid)
        if not ch:
            continue
        after = info.get("image") or image_url(ch)
        manhwa_rows = manhwa_list_for_character(cid, appearances, manhwa_by_id)
        primary = manhwa_rows[0] if manhwa_rows else None
        changed_rows.append(
            {
                "characterId": cid,
                "characterName": character_name(ch),
                "manhwaId": primary["id"] if primary else None,
                "manhwaTitle": primary["title"] if primary else "(unknown manhwa)",
                "manhwaList": manhwa_rows,
                "malName": info.get("malName"),
                "imageBefore": PLACEHOLDER_URL,
                "imageAfter": after,
                "image": after,
                "idMal": info.get("idMal"),
                "malId": info.get("malId"),
            }
        )
    changed_rows.sort(key=lambda r: (r["manhwaTitle"].lower(), r["characterName"].lower()))

    manual_allow = checkpoint.get("manualAllowlist") or {}
    manual_ids = [int(x) for x in (manual_allow.get("characterIds") or [])]
    manual_rows: list[dict[str, Any]] = []
    for cid in manual_ids:
        ch = chars_by_id.get(cid)
        if not ch:
            continue
        manhwa_rows = manhwa_list_for_character(cid, appearances, manhwa_by_id)
        primary = manhwa_rows[0] if manhwa_rows else None
        # Find role from appearances
        role = "BACKGROUND"
        for a in appearances:
            if int(a["characterId"]) == cid:
                role = a.get("role") or "BACKGROUND"
                break
        manual_rows.append(
            {
                "characterId": cid,
                "characterName": character_name(ch),
                "manhwaId": manual_allow.get("manhwaId") or (primary["id"] if primary else None),
                "manhwaTitle": manual_allow.get("title")
                or (primary["title"] if primary else "(unknown manhwa)"),
                "role": role,
                "image": image_url(ch),
                "anilistUrl": ch.get("siteUrl") or f"https://anilist.co/character/{cid}",
            }
        )
    manual_rows.sort(key=lambda r: (r["role"] != "MAIN", r["characterName"].lower()))

    remaining_rows: list[dict[str, Any]] = []
    filled_ids = {int(k) for k, v in filled_info.items() if v.get("malId")}
    manual_id_set = set(manual_ids)
    for cid, ch in chars_by_id.items():
        if cid in filled_ids or cid in manual_id_set:
            continue
        if not is_placeholder(ch):
            continue
        manhwa_rows = manhwa_list_for_character(cid, appearances, manhwa_by_id)
        primary = manhwa_rows[0] if manhwa_rows else None
        remaining_rows.append(
            {
                "characterId": cid,
                "characterName": character_name(ch),
                "manhwaId": primary["id"] if primary else None,
                "manhwaTitle": primary["title"] if primary else "(unknown manhwa)",
                "manhwaList": manhwa_rows,
                "reason": unmatched_info.get(str(cid), "still_placeholder"),
                "image": image_url(ch),
            }
        )
    remaining_rows.sort(key=lambda r: (r["manhwaTitle"].lower(), r["characterName"].lower()))

    payload = {
        "generatedAt": utc_now(),
        "catalog": str(catalog_path),
        "counts": {
            "changed": len(changed_rows),
            "manual": len(manual_rows),
            "remainingPlaceholders": len(remaining_rows),
            "checkpointFilled": len(filled_ids),
            "checkpointUnmatched": len(unmatched_info),
        },
        "changed": changed_rows,
        "manual": manual_rows,
        "manualTitle": manual_allow.get("title") or "Manual",
        "remaining": remaining_rows,
    }

    html = render_html(payload)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return payload["counts"]


def img_tag(url: str | None, *, label: str) -> str:
    if url:
        return (
            f'<img src="{escape(url)}" alt="{escape(label)}" loading="lazy" '
            f'referrerpolicy="no-referrer" />'
        )
    return f'<div class="missing">no image</div>'


def render_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    changed = payload["changed"]
    remaining = payload["remaining"]
    manual = payload.get("manual") or []
    manual_title = payload.get("manualTitle") or "Manual"

    def cards_changed(rows: list[dict[str, Any]]) -> str:
        parts = []
        for r in rows:
            manhwa_bits = escape(r["manhwaTitle"])
            extra = r.get("manhwaList") or []
            if len(extra) > 1:
                manhwa_bits += f' <span class="more">+{len(extra) - 1} more</span>'
            mal_link = ""
            if r.get("malId"):
                mal_link = (
                    f' · <a href="https://myanimelist.net/character/{int(r["malId"])}" '
                    f'target="_blank" rel="noreferrer">MAL #{int(r["malId"])}</a>'
                )
            parts.append(
                f"""
<article class="card ok" data-search="{escape((r['characterName'] + ' ' + r['manhwaTitle']).lower())}">
  <div class="thumbs">
    <figure>
      <figcaption>Before</figcaption>
      {img_tag(r.get('imageBefore'), label='before')}
    </figure>
    <figure>
      <figcaption>After (MAL)</figcaption>
      {img_tag(r.get('imageAfter') or r.get('image'), label='after')}
    </figure>
  </div>
  <div class="body">
    <h3>{escape(r['characterName'])}</h3>
    <p class="manhwa">{manhwa_bits}</p>
    <p class="meta">AniList #{r['characterId']} · matched {escape(str(r.get('malName') or '-'))}{mal_link}</p>
  </div>
</article>"""
            )
        return (
            "\n".join(parts)
            if parts
            else '<p class="empty">No MAL-matched enrichments.</p>'
        )

    def cards_manual(rows: list[dict[str, Any]]) -> str:
        if not rows:
            return '<p class="empty">No characters need manual images.</p>'
        gtitle = urllib_quote(f"{manual_title} character")
        parts = [
            f'<p class="note">Paste an image URL for each <strong>{escape(manual_title)}</strong> character, then Save. '
            f"Requires <code>npm run dev</code> (writes to catalog.json). "
            f'<a href="https://www.google.com/search?tbm=isch&amp;q={gtitle}" target="_blank" rel="noreferrer">Google Images</a></p>'
        ]
        for r in rows:
            gq = urllib_quote(f'{r["manhwaTitle"]} {r["characterName"]} manhwa')
            current = r.get("image") or ""
            show = current if current and "default.jpg" not in current else ""
            parts.append(
                f"""
<article class="card manual" data-character-id="{r['characterId']}" data-search="{escape((r['characterName'] + ' ' + r['manhwaTitle']).lower())}">
  <div class="thumb preview">
    {img_tag(show or None, label='preview')}
  </div>
  <div class="body">
    <h3>{escape(r['characterName'])} <span class="role">{escape(r.get('role') or '')}</span></h3>
    <p class="manhwa">{escape(r['manhwaTitle'])}</p>
    <p class="meta">AniList <a href="{escape(r.get('anilistUrl') or '#')}" target="_blank" rel="noreferrer">#{r['characterId']}</a>
      · <a href="https://www.google.com/search?tbm=isch&amp;q={gq}" target="_blank" rel="noreferrer">Search images</a>
    </p>
    <div class="url-row">
      <input type="url" class="image-url" placeholder="https://… image URL" value="{escape(show)}" />
      <button type="button" class="save-one">Save</button>
    </div>
    <p class="status" aria-live="polite"></p>
  </div>
</article>"""
            )
        return "\n".join(parts)

    def cards_remaining(rows: list[dict[str, Any]]) -> str:
        parts = []
        for r in rows:
            parts.append(
                f"""
<article class="card bad" data-search="{escape((r['characterName'] + ' ' + r['manhwaTitle']).lower())}">
  <div class="thumb">{img_tag(r.get('image'), label='placeholder')}</div>
  <div class="body">
    <h3>{escape(r['characterName'])}</h3>
    <p class="manhwa">{escape(r['manhwaTitle'])}</p>
    <p class="meta">AniList #{r['characterId']} · {escape(str(r.get('reason') or 'placeholder'))}</p>
  </div>
</article>"""
            )
        return (
            "\n".join(parts)
            if parts
            else '<p class="empty">No other placeholders left.</p>'
        )

    data_json = json.dumps(
        {
            "generatedAt": payload["generatedAt"],
            "counts": counts,
            "changed": changed,
            "manual": manual,
            "remaining": [
                {k: v for k, v in row.items() if k != "manhwaList"}
                for row in remaining
            ],
        },
        ensure_ascii=False,
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Character image enrichment verify</title>
  <style>
    :root {{
      --bg: #12141a;
      --panel: #1a1e27;
      --text: #e8eaef;
      --muted: #9aa3b2;
      --ok: #2f6f4e;
      --bad: #6f2f2f;
      --line: #2a3140;
      --accent: #6ea8fe;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 20% -10%, #243047, transparent), var(--bg);
      color: var(--text);
      line-height: 1.45;
    }}
    header {{
      padding: 2rem 1.25rem 1rem;
      max-width: 1200px;
      margin: 0 auto;
    }}
    h1 {{ margin: 0 0 0.35rem; font-size: 1.75rem; }}
    .sub {{ color: var(--muted); margin: 0; }}
    .stats {{
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1rem;
    }}
    .stat {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      min-width: 140px;
    }}
    .stat b {{ display: block; font-size: 1.4rem; }}
    .stat span {{ color: var(--muted); font-size: 0.85rem; }}
    nav {{
      display: flex;
      gap: 0.5rem;
      margin: 1.25rem 0 0;
      flex-wrap: wrap;
    }}
    nav button {{
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.45rem 0.9rem;
      cursor: pointer;
    }}
    nav button.active {{ border-color: var(--accent); }}
    main {{ max-width: 1200px; margin: 0 auto; padding: 0 1.25rem 3rem; }}
    section {{ display: none; }}
    section.active {{ display: block; }}
    .toolbar {{
      display: flex;
      gap: 0.75rem;
      margin: 1rem 0;
      flex-wrap: wrap;
      align-items: center;
    }}
    input[type="search"], input[type="url"], .image-url {{
      flex: 1;
      min-width: 220px;
      background: var(--panel);
      border: 1px solid var(--line);
      color: var(--text);
      border-radius: 8px;
      padding: 0.65rem 0.8rem;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 0.9rem;
    }}
    .card {{
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 0.75rem;
      align-items: start;
    }}
    .card.ok {{ border-color: color-mix(in srgb, var(--ok) 55%, var(--line)); }}
    .card.bad {{ border-color: color-mix(in srgb, var(--bad) 55%, var(--line)); }}
    .card.manual {{ border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }}
    .thumbs {{
      display: grid;
      grid-template-columns: 84px 84px;
      gap: 0.4rem;
    }}
    .thumbs figure, .thumb {{ margin: 0; }}
    .thumbs figcaption {{
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 0.25rem;
    }}
    .thumb img, .thumbs img, .thumb .missing, .thumbs .missing {{
      width: 84px;
      height: 120px;
      object-fit: cover;
      border-radius: 8px;
      background: #0d0f14;
      display: block;
      border: 1px solid var(--line);
    }}
    .thumb .missing, .thumbs .missing {{
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 0.75rem;
      text-align: center;
      padding: 0.4rem;
    }}
    .body h3 {{ margin: 0 0 0.25rem; font-size: 1rem; }}
    .role {{
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--muted);
      margin-left: 0.35rem;
      text-transform: uppercase;
    }}
    .manhwa {{ margin: 0 0 0.35rem; color: #c6d0e0; }}
    .more {{ color: var(--muted); font-size: 0.8rem; }}
    .meta {{ margin: 0 0 0.5rem; color: var(--muted); font-size: 0.8rem; }}
    .meta a {{ color: #8ec5ff; }}
    .url-row {{ display: flex; gap: 0.4rem; flex-wrap: wrap; }}
    .url-row button, .toolbar button {{
      background: var(--accent);
      color: #0b1220;
      border: 0;
      border-radius: 8px;
      padding: 0.55rem 0.85rem;
      font-weight: 650;
      cursor: pointer;
    }}
    .status {{ margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--muted); min-height: 1.1em; }}
    .status.ok {{ color: #86efac; }}
    .status.err {{ color: #fca5a5; }}
    .note {{
      grid-column: 1 / -1;
      margin: 0 0 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      background: #141924;
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.9rem;
    }}
    .note a {{ color: #8ec5ff; }}
    .empty {{ color: var(--muted); }}
    .hidden {{ display: none !important; }}
  </style>
</head>
<body>
  <header>
    <h1>Character image enrichment</h1>
    <p class="sub">Generated {escape(payload['generatedAt'])}. MAL-only fills kept. Tyrant placeholders are editable below.</p>
    <div class="stats">
      <div class="stat"><b>{counts['changed']}</b><span>MAL matched</span></div>
      <div class="stat"><b>{counts.get('manual', 0)}</b><span>manual (Tyrant)</span></div>
      <div class="stat"><b>{counts['remainingPlaceholders']}</b><span>other leftovers</span></div>
    </div>
    <nav>
      <button type="button" class="active" data-tab="manual">Manual Tyrant</button>
      <button type="button" data-tab="changed">MAL matched</button>
      <button type="button" data-tab="remaining">Other leftovers</button>
    </nav>
  </header>
  <main>
    <section id="manual" class="active">
      <div class="toolbar">
        <input type="search" id="search-manual" placeholder="Filter Tyrant characters..." />
        <button type="button" id="save-all-manual">Save all filled URLs</button>
      </div>
      <div class="grid" id="grid-manual">
        {cards_manual(manual)}
      </div>
    </section>
    <section id="changed">
      <div class="toolbar">
        <input type="search" id="search-changed" placeholder="Filter by manhwa or character..." />
      </div>
      <div class="grid" id="grid-changed">
        {cards_changed(changed)}
      </div>
    </section>
    <section id="remaining">
      <div class="toolbar">
        <input type="search" id="search-remaining" placeholder="Filter by manhwa or character..." />
      </div>
      <div class="grid" id="grid-remaining">
        {cards_remaining(remaining)}
      </div>
    </section>
  </main>
  <script type="application/json" id="report-data">{escape(data_json)}</script>
  <script>
    const buttons = document.querySelectorAll('nav button');
    const sections = document.querySelectorAll('main section');
    buttons.forEach((btn) => {{
      btn.addEventListener('click', () => {{
        buttons.forEach((b) => b.classList.remove('active'));
        sections.forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      }});
    }});
    function wireSearch(inputId, gridId) {{
      const input = document.getElementById(inputId);
      const grid = document.getElementById(gridId);
      if (!input || !grid) return;
      input.addEventListener('input', () => {{
        const q = input.value.trim().toLowerCase();
        grid.querySelectorAll('.card').forEach((card) => {{
          const text = (card.dataset.search || card.textContent).toLowerCase();
          card.classList.toggle('hidden', q && !text.includes(q));
        }});
      }});
    }}
    wireSearch('search-changed', 'grid-changed');
    wireSearch('search-remaining', 'grid-remaining');
    wireSearch('search-manual', 'grid-manual');

    function setPreview(card, url) {{
      const box = card.querySelector('.preview');
      if (!box) return;
      if (url) {{
        box.innerHTML = '<img src="' + url.replace(/"/g, '&quot;') + '" alt="preview" loading="lazy" referrerpolicy="no-referrer" />';
      }} else {{
        box.innerHTML = '<div class="missing">no image</div>';
      }}
    }}

    async function saveCharacter(card) {{
      const status = card.querySelector('.status');
      const input = card.querySelector('.image-url');
      const characterId = Number(card.dataset.characterId);
      const imageUrl = (input.value || '').trim();
      status.className = 'status';
      status.textContent = 'Saving…';
      try {{
        const res = await fetch('/__character-images/save', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ characterId, imageUrl }}),
        }});
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
        status.className = 'status ok';
        status.textContent = 'Saved';
        setPreview(card, imageUrl || null);
      }} catch (err) {{
        status.className = 'status err';
        status.textContent = (err && err.message) ? err.message : 'Save failed — run npm run dev';
      }}
    }}

    document.querySelectorAll('.card.manual').forEach((card) => {{
      const input = card.querySelector('.image-url');
      input.addEventListener('input', () => setPreview(card, input.value.trim() || null));
      card.querySelector('.save-one').addEventListener('click', () => saveCharacter(card));
    }});

    document.getElementById('save-all-manual')?.addEventListener('click', async () => {{
      const cards = [...document.querySelectorAll('.card.manual')].filter((c) => {{
        const v = c.querySelector('.image-url')?.value?.trim();
        return Boolean(v);
      }});
      for (const card of cards) {{
        await saveCharacter(card);
      }}
    }});
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate character image enrichment verify HTML")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    if not args.catalog.exists():
        raise SystemExit(f"Catalog not found: {args.catalog}")
    counts = build_report(args.catalog, args.out)
    print(
        f"[ok] wrote {args.out} "
        f"(changed={counts['changed']}, manual={counts.get('manual', 0)}, remaining={counts['remainingPlaceholders']})"
    )


if __name__ == "__main__":
    main()
