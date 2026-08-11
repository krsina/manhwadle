import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  findSpoofedCallerIdKey,
  spoofedCallerIdErrorMessage,
} from "../_shared/callerIds.ts";

const ALLOW_METHODS = "GET, DELETE, OPTIONS";

function corsFor(req: Request): Record<string, string> {
  return buildCorsHeaders({
    requestOrigin: req.headers.get("Origin"),
    allowedOriginsEnv: Deno.env.get("CORS_ALLOWED_ORIGINS"),
    methods: ALLOW_METHODS,
  });
}

function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsFor(req) });
  }

  try {
    if (req.method !== "GET" && req.method !== "DELETE") {
      return jsonResponse(req, { error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return jsonResponse(
        req,
        { error: "Server credentials are not configured" },
        500,
      );
    }

    // Verify the caller JWT; never trust a client-supplied user id.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(jwt);
    if (userError || !user) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }
    const userId = user.id;

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (req.method === "GET") {
      const [
        profile,
        settings,
        playerStats,
        dayProgress,
        dailyCompletions,
        shop,
        savedLists,
      ] = await Promise.all([
        admin
          .from("public_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        admin
          .from("user_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        admin.from("player_stats").select("*").eq("user_id", userId),
        admin.from("day_progress").select("*").eq("user_id", userId),
        admin.from("daily_completions").select("*").eq("user_id", userId),
        admin.rpc("export_shop_account", { p_user_id: userId }),
        admin.rpc("export_saved_lists_account", { p_user_id: userId }),
      ]);

      if (shop.error) {
        return jsonResponse(
          req,
          { error: `Shop data export failed: ${shop.error.message}` },
          500,
        );
      }
      if (savedLists.error) {
        return jsonResponse(
          req,
          { error: `Saved-list export failed: ${savedLists.error.message}` },
          500,
        );
      }

      return jsonResponse(req, {
        exportedAt: new Date().toISOString(),
        user: { id: userId, email: user.email ?? null },
        profile: profile.data ?? null,
        settings: settings.data ?? null,
        playerStats: playerStats.data ?? [],
        dayProgress: dayProgress.data ?? [],
        dailyCompletions: dailyCompletions.data ?? [],
        shop: shop.data ?? {
          wallet: null,
          entitlements: [],
          avatar_profile: null,
          avatar_loadout: null,
          point_transactions: [],
        },
        savedLists: savedLists.data ?? [],
      });
    }

    // DELETE — require explicit confirmation; user id from JWT only.
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      /* empty body */
    }

    const spoofedKey = findSpoofedCallerIdKey(body);
    if (spoofedKey) {
      return jsonResponse(
        req,
        { error: spoofedCallerIdErrorMessage(spoofedKey) },
        400,
      );
    }

    const confirm =
      typeof body.confirm === "string" ? body.confirm.trim() : "";
    if (confirm.toUpperCase() !== "DELETE") {
      return jsonResponse(
        req,
        { error: 'Confirmation required. Send { "confirm": "DELETE" }.' },
        400,
      );
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return jsonResponse(req, { error: deleteError.message }, 500);
    }

    return jsonResponse(req, { ok: true, deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse(req, { error: message }, 500);
  }
});
