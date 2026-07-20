-- Harden app_private ledger + helper ACLs (defense-in-depth).
-- Live posture already lacks USAGE for anon/auth on app_private; keep that
-- invariant in migrations and enable RLS on point_transactions (policy-free).

-- ---------------------------------------------------------------------------
-- Schema least privilege
-- ---------------------------------------------------------------------------

revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;
grant usage on schema app_private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- point_transactions: RLS on, no policies, no client DML
-- ---------------------------------------------------------------------------

alter table app_private.point_transactions enable row level security;

revoke all on table app_private.point_transactions
  from public, anon, authenticated;
grant all on table app_private.point_transactions to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Trigger / helper EXECUTE: never callable by Data API roles
-- ---------------------------------------------------------------------------

revoke all on function app_private.after_username_change_award_secret()
  from public, anon, authenticated;
grant execute on function app_private.after_username_change_award_secret()
  to postgres, service_role;

-- Reassert common private helpers (safe if already revoked).
revoke all on function app_private.try_award_secret(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.try_award_secret(uuid, text)
  to postgres, service_role;

revoke all on function app_private.bump_secret_counter(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function app_private.bump_secret_counter(uuid, text, integer)
  to postgres, service_role;

revoke all on function app_private.consume_rpc_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function app_private.consume_rpc_rate_limit(uuid, text, integer, integer)
  to postgres, service_role;

revoke all on function app_private.apply_point_transaction(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function app_private.apply_point_transaction(uuid, integer, text, text, jsonb)
  to postgres, service_role;

revoke all on function app_private.apply_play_point_transaction(
  uuid, integer, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function app_private.apply_play_point_transaction(
  uuid, integer, text, text, text, jsonb
) to postgres, service_role;

revoke all on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function app_private.award_daily_completion_points(
  uuid, text, text, text, integer, integer, boolean
) to postgres, service_role;

revoke all on function app_private.award_bonus_name_points(uuid, text, text)
  from public, anon, authenticated;
grant execute on function app_private.award_bonus_name_points(uuid, text, text)
  to postgres, service_role;

revoke all on function app_private.on_daily_completion_insert()
  from public, anon, authenticated;
grant execute on function app_private.on_daily_completion_insert()
  to postgres, service_role;

comment on table app_private.point_transactions is
  'Private point ledger. RLS enabled with zero policies; access only via SECURITY DEFINER helpers / service_role.';
