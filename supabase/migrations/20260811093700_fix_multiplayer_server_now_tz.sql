-- Fix Versus timer drift: multiplayer_state used timezone('utc', now()) which is
-- timestamp-without-time-zone and JSON-serializes without an offset. Clients in
-- non-UTC zones then treat server_now as local and the countdown collapses to 0:00.

do $fix$
declare
  def text;
begin
  select pg_get_functiondef('app_private.multiplayer_state(uuid, uuid)'::regprocedure)
  into def;
  if def is null then
    raise notice 'app_private.multiplayer_state missing; skip server_now timezone fix';
    return;
  end if;

  if position($s$'server_now', timezone('utc', now())$s$ in def) = 0 then
    raise notice 'app_private.multiplayer_state already uses timezone-safe server_now';
    return;
  end if;

  def := replace(
    def,
    $s$'server_now', timezone('utc', now())$s$,
    $s$'server_now', now()$s$
  );
  execute def;
end;
$fix$;
