import { createClient } from "@supabase/supabase-js";

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
    .select("id, name, photo")
    .in("id", seats.map(({ player_id }) => player_id));
  throwIfError(playersError);

  const byId = new Map((players || []).map((player) => [player.id, player]));
  return { players: seats.map(({ player_id }) => byId.get(player_id)).filter(Boolean) };
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
    ? await client.from("players").select("id, name, photo").in("id", ids)
    : { data: [], error: null };
  throwIfError(rosterResult.error);
  const byId = new Map((rosterResult.data || []).map((player) => [player.id, player]));

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

  const finishMatch = path.match(/^\/games\/(\d+)\/finish$/);
  if (method === "PATCH" && finishMatch) {
    const { data, error } = await client
      .from("games")
      .update({
        status: "finished",
        winner: body.winner,
        killed_player_id: body.killedPlayerId || null,
        ended_at: new Date().toISOString(),
      })
      .eq("id", Number(finishMatch[1]))
      .select("id, status, winner, ended_at")
      .single();
    throwIfError(error);
    return data;
  }

  if (method === "GET" && path.startsWith("/games?")) {
    const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
    return listGames(client, query.get("limit"));
  }
  if (method === "GET" && path === "/games") return listGames(client);

  const gameMatch = path.match(/^\/games\/(\d+)$/);
  if (method === "GET" && gameMatch) return gameDetails(client, Number(gameMatch[1]));

  throw new Error(`不支持的数据操作：${method} ${path}`);
}
