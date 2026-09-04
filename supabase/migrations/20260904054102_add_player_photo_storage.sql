alter table public.players
  add column if not exists photo_path text;

alter table public.players
  drop constraint if exists players_photo_path_check;

alter table public.players
  add constraint players_photo_path_check
  check (
    photo_path is null
    or (
      char_length(photo_path) between 1 and 512
      and position('..' in photo_path) = 0
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos',
  'player-photos',
  false,
  2097152,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy player_photos_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy player_photos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy player_photos_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy player_photos_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

grant delete on table public.players, public.roster_snapshots to authenticated;

create policy players_delete_own on public.players for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy roster_snapshots_delete_own on public.roster_snapshots for delete to authenticated
  using ((select auth.uid()) = user_id);

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
  next_photo_path text;
  legacy_photo text;
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

    next_photo_path := coalesce(
      nullif(player_record.player ->> 'photoPath', ''),
      nullif(player_record.player ->> 'photo_path', '')
    );
    legacy_photo := case
      when next_photo_path is null then nullif(player_record.player ->> 'photo', '')
      else null
    end;

    if next_photo_path is not null
      and next_photo_path !~ ('^' || current_user_id::text || '/players/[A-Za-z0-9_-]+[.]jpg$') then
      raise exception using errcode = '22023', message = 'invalid player photo path';
    end if;

    insert into public.players (user_id, id, name, photo, photo_path)
    values (
      current_user_id,
      player_record.player ->> 'id',
      trim(player_record.player ->> 'name'),
      legacy_photo,
      next_photo_path
    )
    on conflict (user_id, id) do update
    set name = excluded.name,
        photo = excluded.photo,
        photo_path = excluded.photo_path,
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
  next_photo_path text;
  legacy_photo text;
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

    next_photo_path := coalesce(
      nullif(player_record.player ->> 'photoPath', ''),
      nullif(player_record.player ->> 'photo_path', '')
    );
    legacy_photo := case
      when next_photo_path is null then nullif(player_record.player ->> 'photo', '')
      else null
    end;

    if next_photo_path is not null
      and next_photo_path !~ ('^' || current_user_id::text || '/players/[A-Za-z0-9_-]+[.]jpg$') then
      raise exception using errcode = '22023', message = 'invalid player photo path';
    end if;

    insert into public.players (user_id, id, name, photo, photo_path)
    values (
      current_user_id,
      player_record.player ->> 'id',
      trim(player_record.player ->> 'name'),
      legacy_photo,
      next_photo_path
    )
    on conflict (user_id, id) do update
    set name = excluded.name,
        photo = excluded.photo,
        photo_path = excluded.photo_path,
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

create or replace function public.clear_player_profiles()
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  photo_paths text[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select coalesce(array_agg(distinct photo_path) filter (where photo_path is not null), '{}'::text[])
  into photo_paths
  from public.players
  where user_id = current_user_id;

  delete from public.roster_snapshots
  where user_id = current_user_id;

  update public.players
  set photo = null,
      photo_path = null,
      updated_at = now()
  where user_id = current_user_id;

  delete from public.players as player
  where player.user_id = current_user_id
    and not exists (
      select 1
      from public.game_players as game_player
      where game_player.user_id = player.user_id
        and game_player.player_id = player.id
    );

  return photo_paths;
end;
$$;

revoke all on function public.clear_player_profiles() from public, anon;
grant execute on function public.clear_player_profiles() to authenticated;
