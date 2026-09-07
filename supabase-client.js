import { createClient } from "@supabase/supabase-js";

const PLAYER_PHOTOS_BUCKET = "player-photos";
const PLAYER_PHOTO_TTL_SECONDS = 60 * 60 * 24;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function requireClient() {
  if (!supabase) throw new Error("Supabase 环境变量尚未配置");
  return supabase;
}

async function requireUser() {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("请先登录");
  return data.user;
}

function bodyOf(options) {
  if (!options?.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

function throwIfError(error) {
  if (error) throw error;
}

async function withSignedPlayerPhotos(client, players) {
  return Promise.all((players || []).map(async (player) => {
    const photoPath = player.photo_path || player.photoPath || null;
    if (!photoPath) {
      return { ...player, photoPath: null, photo: player.photo || null };
    }

    const { data, error } = await client.storage
      .from(PLAYER_PHOTOS_BUCKET)
      .createSignedUrl(photoPath, PLAYER_PHOTO_TTL_SECONDS);

    return {
      ...player,
      photoPath,
      photo: error ? null : data.signedUrl,
    };
  }));
}

/* 恢复房间时用：存档里只有 photoPath，签名 URL 得当场重新签发 */
export async function signPlayerPhotos(players) {
  return withSignedPlayerPhotos(requireClient(), players);
}

export async function uploadPlayerPhoto(playerId, jpegBlob) {
  const client = requireClient();
  const user = await requireUser();
  const safePlayerId = String(playerId).replace(/[^A-Za-z0-9_-]/g, "_");
  if (!safePlayerId || !jpegBlob) throw new Error("照片资料不完整");

  const path = `${user.id}/players/${safePlayerId}.jpg`;
  const { error: uploadError } = await client.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .upload(path, jpegBlob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  throwIfError(uploadError);

  const { data, error: signedUrlError } = await client.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .createSignedUrl(path, PLAYER_PHOTO_TTL_SECONDS);
  throwIfError(signedUrlError);

  return { path, signedUrl: data.signedUrl };
}

async function removePlayerPhotoObjects(client, userId, knownPaths = []) {
  const paths = new Set((knownPaths || []).filter(Boolean));
  const { data: files, error: listError } = await client.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .list(`${userId}/players`, { limit: 100 });
  throwIfError(listError);
  for (const file of files || []) paths.add(`${userId}/players/${file.name}`);

  if (!paths.size) return 0;
  const { error: removeError } = await client.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .remove([...paths]);
  throwIfError(removeError);
  return paths.size;
}

async function recentPlayers(client) {
  const { data: roster, error: rosterError } = await client
    .from("roster_snapshots")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(rosterError);
  if (!roster) return { players: [] };

  const { data: seats, error: seatsError } = await client
    .from("roster_players")
    .select("player_id, seat")
    .eq("roster_id", roster.id)
    .order("seat", { ascending: true });
  throwIfError(seatsError);
  if (!seats?.length) return { players: [] };

  const { data: players, error: playersError } = await client
    .from("players")
    .select("id, name, photo, photo_path")
    .in("id", seats.map(({ player_id }) => player_id));
  throwIfError(playersError);

  const byId = new Map((players || []).map((player) => [player.id, player]));
  const orderedPlayers = seats.map(({ player_id }) => byId.get(player_id)).filter(Boolean);
  return { players: await withSignedPlayerPhotos(client, orderedPlayers) };
}

async function listGames(client, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const { data: games, error } = await client
    .from("games")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(safeLimit);
  throwIfError(error);
  return { games: games || [] };
}

const ROOM_WINDOW_MS = 12 * 60 * 60 * 1000;

/*
 * 找出还开着的房间：最近一局 status='active' 且开局不到 12 小时的对局。
 * 顺手把超时的旧局标成 abandoned——这是一次读操作里带的写，但它幂等、
 * 只碰 RLS 限定的自己的行，而且省掉一次往返。
 */
async function activeGame(client) {
  const { data: games, error } = await client
    .from("games")
    .select("id, status, started_at, state")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(10);
  throwIfError(error);

  const cutoff = Date.now() - ROOM_WINDOW_MS;
  const rows = games || [];
  const stale = rows.filter((game) => Date.parse(game.started_at) < cutoff);
  const fresh = rows.find((game) => Date.parse(game.started_at) >= cutoff);

  if (stale.length) {
    const { error: abandonError } = await client
      .from("games")
      .update({ status: "abandoned", state: null, ended_at: new Date().toISOString() })
      .in("id", stale.map(({ id }) => id));
    throwIfError(abandonError);
  }

  if (!fresh?.state) return { game: null };
  return { game: { id: String(fresh.id), startedAt: fresh.started_at, state: fresh.state } };
}

async function gameDetails(client, gameId) {
  const [gameResult, playersResult, proposalsResult, roundsResult] = await Promise.all([
    client.from("games").select("*").eq("id", gameId).single(),
    client.from("game_players").select("player_id, seat, role").eq("game_id", gameId).order("seat"),
    client.from("proposals").select("*").eq("game_id", gameId).order("round_number").order("attempt_number"),
    client.from("mission_rounds").select("*").eq("game_id", gameId).order("round_number"),
  ]);
  throwIfError(gameResult.error);
  throwIfError(playersResult.error);
  throwIfError(proposalsResult.error);
  throwIfError(roundsResult.error);

  const ids = (playersResult.data || []).map(({ player_id }) => player_id);
  const rosterResult = ids.length
    ? await client.from("players").select("id, name, photo, photo_path").in("id", ids)
    : { data: [], error: null };
  throwIfError(rosterResult.error);
  const hydratedPlayers = await withSignedPlayerPhotos(client, rosterResult.data || []);
  const byId = new Map(hydratedPlayers.map((player) => [player.id, player]));

  return {
    ...gameResult.data,
    players: (playersResult.data || []).map((entry) => ({ ...byId.get(entry.player_id), ...entry })),
    proposals: proposalsResult.data || [],
    rounds: roundsResult.data || [],
  };
}

export async function apiRequest(path, options = {}) {
  const client = requireClient();
  const user = await requireUser();
  const method = (options.method || "GET").toUpperCase();
  const body = bodyOf(options);

  if (method === "GET" && path === "/players/recent") return recentPlayers(client);

  if (method === "POST" && path === "/players/sync") {
    const { data, error } = await client.rpc("sync_roster", { p_players: body.players });
    throwIfError(error);
    return { rosterId: data, players: body.players?.length || 0 };
  }

  if (method === "POST" && path === "/players/clear") {
    const { data: photoPaths, error } = await client.rpc("clear_player_profiles");
    throwIfError(error);
    try {
      const removedPhotos = await removePlayerPhotoObjects(client, user.id, photoPaths);
      return { cleared: true, removedPhotos };
    } catch (storageError) {
      return { cleared: true, removedPhotos: 0, storageWarning: storageError.message };
    }
  }

  if (method === "POST" && path === "/games") {
    const { data, error } = await client.rpc("create_game", {
      p_players: body.players,
      p_deal_mode: body.dealMode,
      p_options: body.options || {},
    });
    throwIfError(error);
    return { id: data };
  }

  const proposalMatch = path.match(/^\/games\/(\d+)\/proposals$/);
  if (method === "POST" && proposalMatch) {
    const gameId = Number(proposalMatch[1]);
    const { data, error } = await client
      .from("proposals")
      .upsert({
        user_id: user.id,
        game_id: gameId,
        round_number: body.roundNumber,
        attempt_number: body.attemptNumber,
        leader_player_id: body.leaderPlayerId,
        team_player_ids: body.teamPlayerIds || [],
        votes: body.votes || {},
        approved: Boolean(body.approved),
      }, { onConflict: "user_id,game_id,round_number,attempt_number" })
      .select("id")
      .single();
    throwIfError(error);
    return { id: data.id };
  }

  const roundMatch = path.match(/^\/games\/(\d+)\/rounds$/);
  if (method === "POST" && roundMatch) {
    const gameId = Number(roundMatch[1]);
    const { data, error } = await client
      .from("mission_rounds")
      .upsert({
        user_id: user.id,
        game_id: gameId,
        round_number: body.roundNumber,
        leader_player_id: body.leaderPlayerId,
        team_player_ids: body.teamPlayerIds || [],
        fails: body.fails,
        succeeded: Boolean(body.succeeded),
      }, { onConflict: "user_id,game_id,round_number" })
      .select("id")
      .single();
    throwIfError(error);
    return { id: data.id };
  }

  /* 存档写入：加 status 判断，免得一条迟到的写请求把已经结束的局又救活 */
  const stateMatch = path.match(/^\/games\/(\d+)\/state$/);
  if (method === "PATCH" && stateMatch) {
    const { data, error } = await client
      .from("games")
      .update({ state: body.state ?? null })
      .eq("id", Number(stateMatch[1]))
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    throwIfError(error);
    return { id: data?.id ?? null, saved: Boolean(data) };
  }

  const abandonMatch = path.match(/^\/games\/(\d+)\/abandon$/);
  if (method === "PATCH" && abandonMatch) {
    const { data, error } = await client
      .from("games")
      .update({ status: "abandoned", state: null, ended_at: new Date().toISOString() })
      .eq("id", Number(abandonMatch[1]))
      .eq("status", "active")
      .select("id, status")
      .maybeSingle();
    throwIfError(error);
    return data || { id: Number(abandonMatch[1]), status: "abandoned" };
  }

  const finishMatch = path.match(/^\/games\/(\d+)\/finish$/);
  if (method === "PATCH" && finishMatch) {
    const { data, error } = await client
      .from("games")
      .update({
        status: "finished",
        winner: body.winner,
        killed_player_id: body.killedPlayerId || null,
        state: null, /* 终局即清档：房间不该在结束后还能回去 */
        ended_at: new Date().toISOString(),
      })
      .eq("id", Number(finishMatch[1]))
      .select("id, status, winner, ended_at")
      .single();
    throwIfError(error);
    return data;
  }

  /* 必须排在 /games? 与 /games/:id 之前，否则会被它们截走 */
  if (method === "GET" && path === "/games/active") return activeGame(client);

  if (method === "GET" && path.startsWith("/games?")) {
    const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
    return listGames(client, query.get("limit"));
  }
  if (method === "GET" && path === "/games") return listGames(client);

  const gameMatch = path.match(/^\/games\/(\d+)$/);
  if (method === "GET" && gameMatch) return gameDetails(client, Number(gameMatch[1]));

  throw new Error(`不支持的数据操作：${method} ${path}`);
}
