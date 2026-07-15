#!/usr/bin/env python3
"""
Local verify server for character image manual edits.

Serves public/character-image-verify.html and accepts POST /__character-images/save
so Save works without Vite.

Usage:
  python scripts/serve_character_image_verify.py
  # open http://127.0.0.1:8765/
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "public" / "character-image-verify.html"
CATALOG_PATH = ROOT / "manhwadle-etl" / "output" / "catalog.json"
CHECKPOINT_PATH = CATALOG_PATH.with_name("catalog.enrich-images.checkpoint.json")
HOST = "127.0.0.1"
PORT = 8765
PLACEHOLDER = {
    "large": "https://s4.anilist.co/file/anilistcdn/character/large/default.jpg",
    "medium": "https://s4.anilist.co/file/anilistcdn/character/medium/default.jpg",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_image_url(url: str) -> str:
    url = url.strip()
    # Wikia/Fandom: prefer the stable /revision/latest form without junk
    if "static.wikia.nocookie.net" in url or "vignette.wikia.nocookie.net" in url:
        # Keep as-is if already valid http(s)
        return url
    return url


def save_character_image(character_id: int, image_url: str) -> dict:
    if not CATALOG_PATH.exists():
        raise FileNotFoundError(f"Missing catalog: {CATALOG_PATH}")

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    character = next((c for c in catalog.get("characters") or [] if int(c["id"]) == character_id), None)
    if not character:
        raise KeyError(f"Character {character_id} not in catalog")

    if image_url:
        image_url = normalize_image_url(image_url)
        character["image"] = {"large": image_url, "medium": image_url}
    else:
        character["image"] = dict(PLACEHOLDER)

    tmp = CATALOG_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(CATALOG_PATH)

    if CHECKPOINT_PATH.exists():
        ck = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
    else:
        ck = {"version": 1, "filled": {}, "unmatched": {}, "manualAllowlist": {}}

    ck.setdefault("filled", {})
    ck.setdefault("unmatched", {})
    if image_url:
        ck["filled"][str(character_id)] = {
            "image": image_url,
            "source": "manual",
            "malName": None,
            "malId": None,
            "idMal": None,
            "manual": True,
        }
        ck["unmatched"].pop(str(character_id), None)
        allow = ck.get("manualAllowlist") or {}
        ids = [int(x) for x in (allow.get("characterIds") or [])]
        allow["characterIds"] = [i for i in ids if i != character_id]
        ck["manualAllowlist"] = allow
    else:
        ck["filled"].pop(str(character_id), None)
        ck["unmatched"][str(character_id)] = "manual_tyrant"

    ck["updatedAt"] = utc_now()
    tmp_ck = CHECKPOINT_PATH.with_suffix(CHECKPOINT_PATH.suffix + ".tmp")
    tmp_ck.write_text(json.dumps(ck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_ck.replace(CHECKPOINT_PATH)

    return {"ok": True, "characterId": character_id, "imageUrl": image_url or None}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[verify-server] {self.address_string()} {fmt % args}", flush=True)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/", "/character-image-verify.html", "/index.html"):
            if not HTML_PATH.exists():
                self.send_error(404, "character-image-verify.html missing — run generate_character_image_report.py")
                return
            data = HTML_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_error(404, "Not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/__character-images/save":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
            character_id = int(body.get("characterId"))
            image_url = str(body.get("imageUrl") or "").strip()
            if image_url and not re.match(r"^https?://", image_url, re.I):
                raise ValueError("imageUrl must be http(s)")
            result = save_character_image(character_id, image_url)
            payload = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self._cors()
            self.end_headers()
            self.wfile.write(payload)
        except Exception as err:
            payload = json.dumps({"ok": False, "error": str(err)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self._cors()
            self.end_headers()
            self.wfile.write(payload)


def main() -> None:
    if not HTML_PATH.exists():
        raise SystemExit(
            f"Missing {HTML_PATH}\nRun: python scripts/generate_character_image_report.py"
        )
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Character image verify server")
    print(f"  Open: http://{HOST}:{PORT}/")
    print(f"  HTML: {HTML_PATH}")
    print(f"  Save endpoint: POST /__character-images/save")
    print("Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    main()
