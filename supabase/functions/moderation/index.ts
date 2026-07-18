import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "lookup_username"
  | "list_reports"
  | "list_appeals"
  | "list_audit"
  | "set_report_status"
  | "set_appeal_status"
  | "force_username_change"
  | "issue_cloud_ban"
  | "issue_leaderboard_exclusion"
  | "revoke_restriction"
  | "grant_role"
  | "revoke_role"
  | "block_identity"
  | "get_site_status"
  | "set_site_status"
  | "set_mode_status"
  | "set_outage_exemption"
  | "set_account_flags";

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) return jsonResponse({ error: "Unauthorized" }, 401);

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
    const actorId = user.id;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = asString(body.action) as Action | null;
    if (!action) {
      return jsonResponse({ error: "action required" }, 400);
    }

    if ("actor_id" in body || "actorId" in body) {
      return jsonResponse({ error: "actor_id not allowed" }, 400);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    async function rpc(
      fn: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }> {
      return await admin.rpc(fn, args);
    }

    const reason = asString(body.reason) ?? asString(body.details) ?? "";
    const targetUserId = asString(body.target_user_id);
    const username = asString(body.username);

    switch (action) {
      case "lookup_username": {
        if (!username) {
          return jsonResponse({ error: "username required" }, 400);
        }
        const { data, error } = await rpc("moderation_find_user_by_username", {
          p_actor_id: actorId,
          p_username: username,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "list_reports": {
        const { data, error } = await rpc("moderation_list_reports", {
          p_actor_id: actorId,
          p_status: asString(body.status),
          p_limit: typeof body.limit === "number" ? body.limit : 50,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, reports: data });
      }

      case "list_appeals": {
        const { data, error } = await rpc("moderation_list_appeals", {
          p_actor_id: actorId,
          p_status: asString(body.status),
          p_limit: typeof body.limit === "number" ? body.limit : 50,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, appeals: data });
      }

      case "list_audit": {
        const { data, error } = await rpc("moderation_list_audit", {
          p_actor_id: actorId,
          p_target_user_id: targetUserId,
          p_limit: typeof body.limit === "number" ? body.limit : 50,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, actions: data });
      }

      case "set_report_status": {
        const reportId = body.report_id;
        if (typeof reportId !== "number" && typeof reportId !== "string") {
          return jsonResponse({ error: "report_id required" }, 400);
        }
        const { data, error } = await rpc("moderation_set_report_status", {
          p_actor_id: actorId,
          p_report_id: Number(reportId),
          p_status: asString(body.status),
          p_reason: reason,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "set_appeal_status": {
        const appealId = body.appeal_id;
        if (typeof appealId !== "number" && typeof appealId !== "string") {
          return jsonResponse({ error: "appeal_id required" }, 400);
        }
        const { data, error } = await rpc("moderation_set_appeal_status", {
          p_actor_id: actorId,
          p_appeal_id: Number(appealId),
          p_status: asString(body.status),
          p_reason: reason,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "force_username_change": {
        if (!targetUserId) {
          return jsonResponse({ error: "target_user_id required" }, 400);
        }
        if (reason.trim().length < 3) {
          return jsonResponse({ error: "reason required" }, 400);
        }
        const { data, error } = await rpc("moderation_issue_restriction", {
          p_actor_id: actorId,
          p_target_user_id: targetUserId,
          p_kind: "force_username_change",
          p_reason: reason,
          p_ends_at: null,
          p_permanent: false,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "issue_cloud_ban":
      case "issue_leaderboard_exclusion": {
        if (!targetUserId) {
          return jsonResponse({ error: "target_user_id required" }, 400);
        }
        if (reason.trim().length < 3) {
          return jsonResponse({ error: "reason required" }, 400);
        }
        const permanent = asBool(body.permanent);
        const endsAt = asString(body.ends_at);
        if (!permanent && !endsAt) {
          return jsonResponse(
            { error: "ends_at required for temporary actions" },
            400,
          );
        }
        const kind =
          action === "issue_cloud_ban" ? "cloud_ban" : "leaderboard_exclusion";
        const { data, error } = await rpc("moderation_issue_restriction", {
          p_actor_id: actorId,
          p_target_user_id: targetUserId,
          p_kind: kind,
          p_reason: reason,
          p_ends_at: permanent ? null : endsAt,
          p_permanent: permanent,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "revoke_restriction": {
        if (!targetUserId) {
          return jsonResponse({ error: "target_user_id required" }, 400);
        }
        const kind = asString(body.kind);
        if (!kind) return jsonResponse({ error: "kind required" }, 400);
        if (reason.trim().length < 3) {
          return jsonResponse({ error: "reason required" }, 400);
        }
        const { data, error } = await rpc("moderation_revoke_restriction", {
          p_actor_id: actorId,
          p_target_user_id: targetUserId,
          p_kind: kind,
          p_reason: reason,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "grant_role":
      case "revoke_role": {
        if (!targetUserId) {
          return jsonResponse({ error: "target_user_id required" }, 400);
        }
        const role = asString(body.role);
        if (!role) return jsonResponse({ error: "role required" }, 400);
        if (reason.trim().length < 3) {
          return jsonResponse({ error: "reason required" }, 400);
        }
        const fn =
          action === "grant_role"
            ? "moderation_grant_role"
            : "moderation_revoke_role";
        const { data, error } = await rpc(fn, {
          p_actor_id: actorId,
          p_target_user_id: targetUserId,
          p_role: role,
          p_reason: reason,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "block_identity": {
        const kind = asString(body.kind);
        const value = asString(body.value);
        if (!kind || !value) {
          return jsonResponse({ error: "kind and value required" }, 400);
        }
        if (reason.trim().length < 3) {
          return jsonResponse({ error: "reason required" }, 400);
        }
        const { data, error } = await rpc("moderation_block_identity", {
          p_actor_id: actorId,
          p_kind: kind,
          p_value: value,
          p_provider: asString(body.provider),
          p_reason: reason,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "get_site_status": {
        const { data, error } = await rpc("moderation_get_site_status", {
          p_actor_id: actorId,
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "set_site_status": {
        const { data, error } = await rpc("moderation_set_site_status", {
          p_actor_id: actorId,
          p_banner_message: asString(body.banner_message),
          p_banner_severity: asString(body.banner_severity),
          p_maintenance_active:
            typeof body.maintenance_active === "boolean"
              ? body.maintenance_active
              : null,
          p_leaderboard_epoch_date: asString(body.leaderboard_epoch_date),
          p_clear_banner: asBool(body.clear_banner),
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "set_mode_status": {
        const mode = asString(body.mode);
        if (!mode) return jsonResponse({ error: "mode required" }, 400);
        const { data, error } = await rpc("moderation_set_mode_status", {
          p_actor_id: actorId,
          p_mode: mode,
          p_available:
            typeof body.available === "boolean" ? body.available : null,
          p_message: asString(body.message),
          p_required_for_all_mode:
            typeof body.required_for_all_mode === "boolean"
              ? body.required_for_all_mode
              : null,
          p_clear_message: asBool(body.clear_message),
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "set_outage_exemption": {
        const dateKey = asString(body.date_key);
        const mode = asString(body.mode);
        if (!dateKey || !mode) {
          return jsonResponse({ error: "date_key and mode required" }, 400);
        }
        const { data, error } = await rpc("moderation_set_outage_exemption", {
          p_actor_id: actorId,
          p_date_key: dateKey,
          p_mode: mode,
          p_reason: reason,
          p_remove: asBool(body.remove),
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      case "set_account_flags": {
        if (!targetUserId) {
          return jsonResponse({ error: "target_user_id required" }, 400);
        }
        const { data, error } = await rpc("moderation_set_account_flags", {
          p_actor_id: actorId,
          p_target_user_id: targetUserId,
          p_is_test: typeof body.is_test === "boolean" ? body.is_test : null,
          p_is_suspicious:
            typeof body.is_suspicious === "boolean" ? body.is_suspicious : null,
          p_notes: asString(body.notes),
        });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, result: data });
      }

      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
