-- 房间存档：让 DM 误刷新后还能回到进行中的那一局。
-- games 已经有 authenticated 的 select/insert/update 授权和 auth.uid() = user_id 策略，
-- 新增一列自动继承，不需要额外的 grant 或 policy。

alter table public.games
  add column if not exists state jsonb;

comment on column public.games.state is
  '进行中对局的可恢复快照（含秘密身份）。仅本 DM 的 auth.uid() 可读；对局结束或作废时置为 null。';

-- status 需要多一个 'abandoned'。原约束是列内联写法，名字由 Postgres 生成，
-- 这里按定义去找而不是猜名字——猜错的话 drop 会静默跳过，旧约束继续拦着新值。
do $$
declare
  existing_name text;
begin
  select con.conname
    into existing_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'games'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%status%'
   limit 1;

  if existing_name is not null then
    execute format('alter table public.games drop constraint %I', existing_name);
  end if;
end
$$;

alter table public.games
  add constraint games_status_check
  check (status in ('active', 'finished', 'abandoned'));

-- 快照的形状底线：够挡住写坏的客户端，又不至于把校验逻辑重复实现一遍
alter table public.games
  drop constraint if exists games_state_check;

alter table public.games
  add constraint games_state_check
  check (
    state is null
    or (
      jsonb_typeof(state) = 'object'
      and state ? 'version'
      and state ? 'savedAt'
      and jsonb_typeof(state -> 'players') = 'array'
      and jsonb_array_length(state -> 'players') between 5 and 10
    )
  );

-- 开局时找「还开着的房间」走这个索引
create index if not exists games_user_active_idx
  on public.games (user_id, started_at desc)
  where status = 'active';
