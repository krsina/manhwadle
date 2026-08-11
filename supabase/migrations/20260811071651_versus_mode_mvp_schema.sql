-- Versus mode MVP schema part 1
create or replace function app_private.versus_round_time_limit_ms()
returns integer language sql immutable parallel safe set search_path to 'pg_catalog'
as $$ select 180000; $$;
create or replace function app_private.versus_countdown_ms()
returns integer language sql immutable parallel safe set search_path to 'pg_catalog'
as $$ select 3000; $$;
create or replace function app_private.versus_guess_mult(p_guess_count integer)
returns numeric language sql immutable parallel safe set search_path to 'pg_catalog'
as $$ select case p_guess_count when 1 then 1.0 when 2 then 0.85 when 3 then 0.70 when 4 then 0.55 when 5 then 0.40 when 6 then 0.25 else 0 end::numeric; $$;
create or replace function app_private.versus_speed_mult(p_elapsed_ms integer)
returns numeric language sql immutable parallel safe set search_path to 'pg_catalog'
as $$ select case when p_elapsed_ms is null or p_elapsed_ms < 0 then 0.7 when p_elapsed_ms <= 30000 then 1.5 when p_elapsed_ms <= 60000 then 1.25 when p_elapsed_ms <= 120000 then 1.0 when p_elapsed_ms <= 180000 then 0.85 else 0.7 end::numeric; $$;
create or replace function app_private.versus_round_score(p_won boolean, p_guess_count integer, p_elapsed_ms integer)
returns integer language sql immutable parallel safe set search_path to 'pg_catalog'
as $$ select case when not coalesce(p_won, false) then 0 else greatest(0, round(1000 * app_private.versus_guess_mult(p_guess_count) * app_private.versus_speed_mult(p_elapsed_ms))::integer) end; $$;
revoke all on function app_private.versus_round_time_limit_ms() from public, anon, authenticated;
revoke all on function app_private.versus_countdown_ms() from public, anon, authenticated;
revoke all on function app_private.versus_guess_mult(integer) from public, anon, authenticated;
revoke all on function app_private.versus_speed_mult(integer) from public, anon, authenticated;
revoke all on function app_private.versus_round_score(boolean, integer, integer) from public, anon, authenticated;
grant execute on function app_private.versus_round_time_limit_ms() to postgres, service_role;
grant execute on function app_private.versus_countdown_ms() to postgres, service_role;
grant execute on function app_private.versus_guess_mult(integer) to postgres, service_role;
grant execute on function app_private.versus_speed_mult(integer) to postgres, service_role;
grant execute on function app_private.versus_round_score(boolean, integer, integer) to postgres, service_role;

create table if not exists public.versus_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'countdown', 'in_round', 'between_rounds', 'finished', 'cancelled')),
  mode_rounds jsonb not null default '{}'::jsonb,
  taste text not null check (taste in ('action', 'romance', 'both')),
  current_round_index integer not null default 0 check (current_round_index >= 0),
  winner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '2 hours'),
  constraint versus_rooms_code_format check (code ~ '^[A-Z0-9]{6}$'),
  constraint versus_rooms_mode_rounds_object check (jsonb_typeof(mode_rounds) = 'object')
);
create unique index if not exists versus_rooms_code_uidx on public.versus_rooms (code);
create index if not exists versus_rooms_host_idx on public.versus_rooms (host_id);
create index if not exists versus_rooms_status_idx on public.versus_rooms (status);

create table if not exists public.versus_players (
  room_id uuid not null references public.versus_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot in (0, 1)),
  ready boolean not null default false,
  total_score integer not null default 0 check (total_score >= 0),
  total_guesses integer not null default 0 check (total_guesses >= 0),
  total_elapsed_ms bigint not null default 0 check (total_elapsed_ms >= 0),
  username text,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id),
  unique (room_id, slot)
);

create table if not exists app_private.versus_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.versus_rooms (id) on delete cascade,
  round_index integer not null check (round_index >= 0),
  mode text not null check (mode in ('summary', 'character', 'cover', 'heardle')),
  answer_id integer not null check (answer_id > 0),
  character_id integer,
  puzzle_meta jsonb,
  status text not null default 'pending' check (status in ('pending', 'countdown', 'active', 'complete')),
  play_starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, round_index)
);
create index if not exists versus_rounds_room_idx on app_private.versus_rounds (room_id);

create table if not exists app_private.versus_round_attempts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references app_private.versus_rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  guess_ids integer[] not null default '{}'::integer[],
  max_guesses integer not null default 6 check (max_guesses = 6),
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'surrendered', 'timeout')),
  guess_count integer not null default 0 check (guess_count >= 0),
  elapsed_ms integer,
  round_score integer not null default 0 check (round_score >= 0),
  guess_mult numeric,
  speed_mult numeric,
  finalized_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (round_id, user_id)
);
create index if not exists versus_round_attempts_round_idx on app_private.versus_round_attempts (round_id);

alter table public.versus_rooms enable row level security;
alter table public.versus_players enable row level security;
alter table app_private.versus_rounds enable row level security;
alter table app_private.versus_round_attempts enable row level security;
revoke all on table public.versus_rooms from public, anon, authenticated;
revoke all on table public.versus_players from public, anon, authenticated;
revoke all on table app_private.versus_rounds from public, anon, authenticated;
revoke all on table app_private.versus_round_attempts from public, anon, authenticated;
grant select on table public.versus_rooms to authenticated;
grant select on table public.versus_players to authenticated;
drop policy if exists versus_rooms_participant_select on public.versus_rooms;
create policy versus_rooms_participant_select on public.versus_rooms for select to authenticated using (exists (select 1 from public.versus_players vp where vp.room_id = versus_rooms.id and vp.user_id = auth.uid()));
drop policy if exists versus_players_participant_select on public.versus_players;
create policy versus_players_participant_select on public.versus_players for select to authenticated using (exists (select 1 from public.versus_players self where self.room_id = versus_players.room_id and self.user_id = auth.uid()));
do $$ begin begin alter publication supabase_realtime add table public.versus_rooms; exception when duplicate_object then null; end; begin alter publication supabase_realtime add table public.versus_players; exception when duplicate_object then null; end; end; $$;