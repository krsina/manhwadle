-- Player profile, stats, and daily progress sync (auth.users-backed).
-- Matches remote migration manhwadle_player_sync_schema on project snzhnkcccbxkwerbaido.

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reader_taste text
    check (
      reader_taste is null
      or reader_taste = any (array['action'::text, 'romance'::text, 'both'::text])
    ),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null
    check (mode = any (array['summary'::text, 'character'::text, 'cover'::text])),
  taste text not null
    check (taste = any (array['action'::text, 'romance'::text, 'both'::text])),
  played integer not null default 0 check (played >= 0),
  wins integer not null default 0 check (wins >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  max_streak integer not null default 0 check (max_streak >= 0),
  last_played_date_key text,
  guess_distribution integer[] not null default '{}'::integer[],
  bonus_attempts integer not null default 0 check (bonus_attempts >= 0),
  bonus_correct integer not null default 0 check (bonus_correct >= 0),
  double_solves integer not null default 0 check (double_solves >= 0),
  last_bonus_date_key text,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode, taste)
);

create table if not exists public.day_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null
    check (mode = any (array['summary'::text, 'character'::text, 'cover'::text])),
  taste text not null
    check (taste = any (array['action'::text, 'romance'::text, 'both'::text])),
  date_key text not null,
  guess_ids integer[] not null default '{}'::integer[],
  status text not null
    check (status = any (array['playing'::text, 'won'::text, 'lost'::text])),
  bonus_name_guess text,
  bonus_name_correct boolean,
  answer_id integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode, taste, date_key)
);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- updated_at triggers
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists player_stats_set_updated_at on public.player_stats;
create trigger player_stats_set_updated_at
  before update on public.player_stats
  for each row execute function public.set_updated_at();

drop trigger if exists day_progress_set_updated_at on public.day_progress;
create trigger day_progress_set_updated_at
  before update on public.day_progress
  for each row execute function public.set_updated_at();

-- signup → profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.day_progress enable row level security;

-- profiles policies
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- player_stats policies
drop policy if exists player_stats_select_own on public.player_stats;
create policy player_stats_select_own
  on public.player_stats for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists player_stats_insert_own on public.player_stats;
create policy player_stats_insert_own
  on public.player_stats for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists player_stats_update_own on public.player_stats;
create policy player_stats_update_own
  on public.player_stats for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- day_progress policies
drop policy if exists day_progress_select_own on public.day_progress;
create policy day_progress_select_own
  on public.day_progress for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists day_progress_insert_own on public.day_progress;
create policy day_progress_insert_own
  on public.day_progress for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists day_progress_update_own on public.day_progress;
create policy day_progress_update_own
  on public.day_progress for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grants (RLS still enforces ownership)
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.player_stats to authenticated;
grant select, insert, update, delete on public.day_progress to authenticated;
