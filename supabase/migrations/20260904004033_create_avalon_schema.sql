create table public.players (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.roster_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.roster_players (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  roster_id bigint not null,
  player_id text not null,
  seat smallint not null check (seat between 0 and 9),
  primary key (user_id, roster_id, player_id),
  unique (user_id, roster_id, seat),
  constraint roster_players_roster_fkey
    foreign key (user_id, roster_id)
    references public.roster_snapshots(user_id, id) on delete cascade,
  constraint roster_players_player_fkey
    foreign key (user_id, player_id)
    references public.players(user_id, id) on delete cascade
);

create table public.games (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  player_count smallint not null check (player_count between 5 and 10),
  deal_mode text not null check (deal_mode in ('auto', 'manual')),
  options jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'finished')),
  winner text check (winner is null or winner in ('good', 'evil-assassin', 'evil-mission', 'evil-vote')),
  killed_player_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (user_id, id),
  constraint games_killed_player_fkey
    foreign key (user_id, killed_player_id)
    references public.players(user_id, id)
);

create table public.game_players (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id bigint not null,
  player_id text not null,
  seat smallint not null check (seat between 0 and 9),
  role text not null check (role in ('merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion')),
  primary key (user_id, game_id, player_id),
  unique (user_id, game_id, seat),
  constraint game_players_game_fkey
    foreign key (user_id, game_id)
    references public.games(user_id, id) on delete cascade,
  constraint game_players_player_fkey
    foreign key (user_id, player_id)
    references public.players(user_id, id)
);

create table public.proposals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id bigint not null,
  round_number smallint not null check (round_number between 1 and 5),
  attempt_number smallint not null check (attempt_number between 1 and 5),
  leader_player_id text not null,
  team_player_ids jsonb not null check (jsonb_typeof(team_player_ids) = 'array'),
  votes jsonb not null check (jsonb_typeof(votes) = 'object'),
  approved boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, game_id, round_number, attempt_number),
  constraint proposals_game_fkey
    foreign key (user_id, game_id)
    references public.games(user_id, id) on delete cascade,
  constraint proposals_leader_fkey
    foreign key (user_id, leader_player_id)
    references public.players(user_id, id)
);

create table public.mission_rounds (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id bigint not null,
  round_number smallint not null check (round_number between 1 and 5),
  leader_player_id text not null,
  team_player_ids jsonb not null check (jsonb_typeof(team_player_ids) = 'array'),
  fails smallint not null check (fails >= 0),
  succeeded boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, game_id, round_number),
  constraint mission_rounds_game_fkey
    foreign key (user_id, game_id)
    references public.games(user_id, id) on delete cascade,
  constraint mission_rounds_leader_fkey
    foreign key (user_id, leader_player_id)
    references public.players(user_id, id)
);

create index roster_snapshots_user_created_idx on public.roster_snapshots (user_id, created_at desc);
create index roster_players_player_idx on public.roster_players (user_id, player_id);
create index games_user_started_idx on public.games (user_id, started_at desc);
create index games_killed_player_idx on public.games (user_id, killed_player_id) where killed_player_id is not null;
create index game_players_player_idx on public.game_players (user_id, player_id);
create index proposals_leader_idx on public.proposals (user_id, leader_player_id);
create index mission_rounds_leader_idx on public.mission_rounds (user_id, leader_player_id);

alter table public.players enable row level security;
alter table public.roster_snapshots enable row level security;
alter table public.roster_players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.proposals enable row level security;
alter table public.mission_rounds enable row level security;

revoke all on table public.players, public.roster_snapshots, public.roster_players,
  public.games, public.game_players, public.proposals, public.mission_rounds
  from anon, authenticated;

grant select, insert, update on table public.players to authenticated;
grant select, insert on table public.roster_snapshots, public.roster_players, public.game_players to authenticated;
grant select, insert, update on table public.games, public.proposals, public.mission_rounds to authenticated;
grant usage, select on sequence public.roster_snapshots_id_seq, public.games_id_seq,
  public.proposals_id_seq, public.mission_rounds_id_seq to authenticated;

create policy players_select_own on public.players for select to authenticated
  using ((select auth.uid()) = user_id);
create policy players_insert_own on public.players for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy players_update_own on public.players for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy roster_snapshots_select_own on public.roster_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);
create policy roster_snapshots_insert_own on public.roster_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy roster_players_select_own on public.roster_players for select to authenticated
  using ((select auth.uid()) = user_id);
create policy roster_players_insert_own on public.roster_players for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy games_select_own on public.games for select to authenticated
  using ((select auth.uid()) = user_id);
create policy games_insert_own on public.games for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy games_update_own on public.games for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy game_players_select_own on public.game_players for select to authenticated
  using ((select auth.uid()) = user_id);
create policy game_players_insert_own on public.game_players for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy proposals_select_own on public.proposals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy proposals_insert_own on public.proposals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy proposals_update_own on public.proposals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy mission_rounds_select_own on public.mission_rounds for select to authenticated
  using ((select auth.uid()) = user_id);
create policy mission_rounds_insert_own on public.mission_rounds for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy mission_rounds_update_own on public.mission_rounds for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.sync_roster(p_players jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  roster_id bigint;
  player_record record;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'players must be an array of 1 to 10 entries';
  end if;

  for player_record in
    select value as player, ordinality - 1 as seat
    from jsonb_array_elements(p_players) with ordinality
  loop
    if coalesce(trim(player_record.player ->> 'id'), '') = ''
      or coalesce(trim(player_record.player ->> 'name'), '') = '' then
      raise exception using errcode = '22023', message = 'every player needs an id and name';
    end if;

    insert into public.players (user_id, id, name, photo)
    values (
      current_user_id,
      player_record.player ->> 'id',
      trim(player_record.player ->> 'name'),
      nullif(player_record.player ->> 'photo', '')
    )
    on conflict (user_id, id) do update
    set name = excluded.name,
        photo = excluded.photo,
        updated_at = now();
  end loop;

  insert into public.roster_snapshots (user_id)
  values (current_user_id)
  returning id into roster_id;

  insert into public.roster_players (user_id, roster_id, player_id, seat)
  select current_user_id, roster_id, value ->> 'id', (ordinality - 1)::smallint
  from jsonb_array_elements(p_players) with ordinality;

  return roster_id;
end;
$$;

create or replace function public.create_game(
  p_players jsonb,
  p_deal_mode text,
  p_options jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  game_id bigint;
  player_record record;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) not between 5 and 10 then
    raise exception using errcode = '22023', message = 'a game requires 5 to 10 players';
  end if;
  if p_deal_mode not in ('auto', 'manual') then
    raise exception using errcode = '22023', message = 'invalid deal mode';
  end if;

  for player_record in
    select value as player, ordinality - 1 as seat
    from jsonb_array_elements(p_players) with ordinality
  loop
    if coalesce(trim(player_record.player ->> 'id'), '') = ''
      or coalesce(trim(player_record.player ->> 'name'), '') = ''
      or coalesce(trim(player_record.player ->> 'role'), '') = '' then
      raise exception using errcode = '22023', message = 'every game player needs an id, name, and role';
    end if;

    insert into public.players (user_id, id, name, photo)
    values (
      current_user_id,
      player_record.player ->> 'id',
      trim(player_record.player ->> 'name'),
      nullif(player_record.player ->> 'photo', '')
    )
    on conflict (user_id, id) do update
    set name = excluded.name,
        photo = excluded.photo,
        updated_at = now();
  end loop;

  insert into public.games (user_id, player_count, deal_mode, options)
  values (current_user_id, jsonb_array_length(p_players), p_deal_mode, coalesce(p_options, '{}'::jsonb))
  returning id into game_id;

  insert into public.game_players (user_id, game_id, player_id, seat, role)
  select
    current_user_id,
    game_id,
    value ->> 'id',
    (ordinality - 1)::smallint,
    value ->> 'role'
  from jsonb_array_elements(p_players) with ordinality;

  return game_id;
end;
$$;

revoke all on function public.sync_roster(jsonb) from public, anon;
revoke all on function public.create_game(jsonb, text, jsonb) from public, anon;
grant execute on function public.sync_roster(jsonb) to authenticated;
grant execute on function public.create_game(jsonb, text, jsonb) to authenticated;
