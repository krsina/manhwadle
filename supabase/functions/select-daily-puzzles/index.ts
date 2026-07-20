import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Cron / service-only selector. Platform `verify_jwt` is intentionally false
 * in `supabase/config.toml` because callers authenticate with `CRON_SECRET`
 * (`x-cron-secret` or `Authorization: Bearer <CRON_SECRET>`) or the service
 * role key — not a user JWT. Do not expose this function to browsers.
 */

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!cronSecret) {
      return jsonResponse({ error: "CRON_SECRET is not configured" }, 500);
    }

    const header = req.headers.get("x-cron-secret");
    const auth = req.headers.get("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // Custom auth (not user JWT): cron secret header/bearer, or service role.
    const ok =
      header === cronSecret ||
      auth === `Bearer ${cronSecret}` ||
      (serviceKey.length > 0 && auth === `Bearer ${serviceKey}`);
    if (!ok) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    if (!url || !serviceKey) {
      return jsonResponse(
        { error: "Supabase service credentials are not configured" },
        500,
      );
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let dateKey: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.date_key === "string") {
          dateKey = body.date_key;
        }
      } catch {
        /* empty body ok */
      }
    } else {
      const fromQuery = new URL(req.url).searchParams.get("date_key");
      if (fromQuery) dateKey = fromQuery;
    }

    if (dateKey != null && !DATE_KEY_RE.test(dateKey)) {
      return jsonResponse(
        { error: "date_key must be YYYY-MM-DD" },
        400,
      );
    }

    const { data, error } = await supabase.rpc("ensure_daily_puzzles", {
      p_date_key: dateKey,
    });
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ inserted: data ?? 0, date_key: dateKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
