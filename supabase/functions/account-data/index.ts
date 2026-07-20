import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET" && req.method !== "DELETE") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return jsonResponse(
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
      return jsonResponse({ error: "Unauthorized" }, 401);
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
      ]);

      if (shop.error) {
        return jsonResponse(
          { error: `Shop data export failed: ${shop.error.message}` },
          500,
        );
      }

      return jsonResponse({
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
      });
    }

    // DELETE — require explicit confirmation string; user id from JWT only.
    let confirm = "";
    try {
      const body = await req.json();
      if (body && typeof body.confirm === "string") confirm = body.confirm.trim();
    } catch {
      /* empty */
    }
    if (confirm.toUpperCase() !== "DELETE") {
      return jsonResponse(
        { error: "Confirmation required. Send { \"confirm\": \"DELETE\" }." },
        400,
      );
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ ok: true, deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
