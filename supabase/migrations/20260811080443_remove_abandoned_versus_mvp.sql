-- Remove the abandoned 1v1 Versus prototype.
--
-- This intentionally removes the complete prototype surface so a future
-- multiplayer implementation can start from a fresh, group-capable model.
-- Applied migration history remains intact; this is the forward rollback.

do $$
declare
  v_function record;
begin
  for v_function in
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'app_private')
      and procedure.proname like 'versus\_%' escape '\'
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  end loop;
end;
$$;

drop table if exists app_private.versus_round_attempts cascade;
drop table if exists app_private.versus_rounds cascade;
drop table if exists public.versus_players cascade;
drop table if exists public.versus_rooms cascade;
