/**
 * Origin allowlist for browser-invoked Edge Functions.
 *
 * Hosted: set secret/env `CORS_ALLOWED_ORIGINS` to a comma-separated list
 * (exact origins and optional single-label wildcards like `https://*.pages.dev`).
 * Unset / empty → local Vite defaults only (does not use `*`).
 */

export const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type";

export function parseAllowedOrigins(
  raw: string | undefined | null,
): string[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [...LOCAL_DEV_ORIGINS];
  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Exact match, or one `*` label (e.g. `https://*.pages.dev`). */
export function isOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[],
): boolean {
  for (const entry of allowedOrigins) {
    if (entry === origin) return true;
    if (!entry.includes("*")) continue;
    // Escape regex metacharacters, then turn each `*` into one hostname label.
    const escaped = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `^${escaped.replace(/\*/g, "[^./]+")}$`;
    if (new RegExp(pattern, "i").test(origin)) return true;
  }
  return false;
}

export function resolveAllowOrigin(
  requestOrigin: string | null,
  allowedOrigins: readonly string[],
): string | null {
  if (!requestOrigin) return null;
  return isOriginAllowed(requestOrigin, allowedOrigins) ? requestOrigin : null;
}

export function buildCorsHeaders(options: {
  requestOrigin: string | null;
  allowedOriginsEnv?: string | null;
  methods: string;
  allowHeaders?: string;
}): Record<string, string> {
  const allowed = parseAllowedOrigins(options.allowedOriginsEnv);
  const allowOrigin = resolveAllowOrigin(options.requestOrigin, allowed);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      options.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": options.methods,
    Vary: "Origin",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}
