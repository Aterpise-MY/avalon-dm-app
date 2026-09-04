import express from "express";
import { initDb, pool, withTransaction } from "./db.js";

const app = express();
const port = Number(process.env.API_PORT || 3001);

app.use(express.json({ limit: "12mb" }));

const route = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

function normalizedPlayers(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("players must be a non-empty array");
  return value.map((player, seat) => {
    if (!player?.id || !String(player.name || "").trim()) throw new Error(`invalid player at seat ${seat + 1}`);
    return {
      id: String(player.id),
      name: String(player.name).trim(),
      photo: player.photo || null,
      role: player.role || null,
      seat,
    };
  });
}

async function upsertPlayers(client, players) {
  for (const player of players) {
    await client.query(
      `INSERT INTO players (id, name, photo)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, photo = EXCLUDED.photo, updated_at = NOW()`,
      [player.id, player.name, player.photo],
    );
  }
}

app.get("/api/health", route(async (_req, res) => {
  const { rows } = await pool.query("SELECT current_database() AS database, NOW() AS time");
  res.json({ ok: true, ...rows[0] });
}));

app.get("/api/players/recent", route(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.photo
     FROM roster_players rp
     JOIN players p ON p.id = rp.player_id
     WHERE rp.roster_id = (SELECT id FROM roster_snapshots ORDER BY created_at DESC, id DESC LIMIT 1)
     ORDER BY rp.seat`,
  );
  res.json({ players: rows });
}));

app.post("/api/players/sync", route(async (req, res) => {
  const players = normalizedPlayers(req.body.players);
  const rosterId = await withTransaction(async (client) => {
    await upsertPlayers(client, players);
    const roster = await client.query("INSERT INTO roster_snapshots DEFAULT VALUES RETURNING id");
    for (const player of players) {
      await client.query(
        "INSERT INTO roster_players (roster_id, player_id, seat) VALUES ($1, $2, $3)",
        [roster.rows[0].id, player.id, player.seat],
      );
    }
    return roster.rows[0].id;
  });
  res.status(201).json({ rosterId, players: players.length });
}));

app.post("/api/games", route(async (req, res) => {
  const players = normalizedPlayers(req.body.players);
  if (players.some((player) => !player.role)) throw new Error("every game player must have a role");
  if (!['auto', 'manual'].includes(req.body.dealMode)) throw new Error("invalid dealMode");

  const gameId = await withTransaction(async (client) => {
    await upsertPlayers(client, players);
    const game = await client.query(
      `INSERT INTO games (player_count, deal_mode, options)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [players.length, req.body.dealMode, JSON.stringify(req.body.options || {})],
    );
    for (const player of players) {
      await client.query(
        `INSERT INTO game_players (game_id, player_id, seat, role)
         VALUES ($1, $2, $3, $4)`,
        [game.rows[0].id, player.id, player.seat, player.role],
      );
    }
    return game.rows[0].id;
  });
  res.status(201).json({ id: gameId });
}));

app.post("/api/games/:id/proposals", route(async (req, res) => {
  const result = await pool.query(
    `INSERT INTO proposals
       (game_id, round_number, attempt_number, leader_player_id, team_player_ids, votes, approved)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
     ON CONFLICT (game_id, round_number, attempt_number) DO UPDATE
     SET leader_player_id = EXCLUDED.leader_player_id,
         team_player_ids = EXCLUDED.team_player_ids,
         votes = EXCLUDED.votes,
         approved = EXCLUDED.approved
     RETURNING id`,
    [req.params.id, req.body.roundNumber, req.body.attemptNumber, req.body.leaderPlayerId,
      JSON.stringify(req.body.teamPlayerIds || []), JSON.stringify(req.body.votes || {}), Boolean(req.body.approved)],
  );
  res.status(201).json({ id: result.rows[0].id });
}));

app.post("/api/games/:id/rounds", route(async (req, res) => {
  const result = await pool.query(
    `INSERT INTO mission_rounds
       (game_id, round_number, leader_player_id, team_player_ids, fails, succeeded)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (game_id, round_number) DO UPDATE
     SET leader_player_id = EXCLUDED.leader_player_id,
         team_player_ids = EXCLUDED.team_player_ids,
         fails = EXCLUDED.fails,
         succeeded = EXCLUDED.succeeded
     RETURNING id`,
    [req.params.id, req.body.roundNumber, req.body.leaderPlayerId,
      JSON.stringify(req.body.teamPlayerIds || []), req.body.fails, Boolean(req.body.succeeded)],
  );
  res.status(201).json({ id: result.rows[0].id });
}));

app.patch("/api/games/:id/finish", route(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE games
     SET status = 'finished', winner = $2, killed_player_id = $3, ended_at = NOW()
     WHERE id = $1
     RETURNING id, status, winner, ended_at`,
    [req.params.id, req.body.winner, req.body.killedPlayerId || null],
  );
  if (!rows[0]) return res.status(404).json({ error: "game not found" });
  res.json(rows[0]);
}));

app.get("/api/games", route(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const { rows } = await pool.query(
    `SELECT g.*,
       COALESCE(jsonb_agg(jsonb_build_object(
         'id', p.id, 'name', p.name, 'seat', gp.seat, 'role', gp.role
       ) ORDER BY gp.seat) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS players
     FROM games g
     LEFT JOIN game_players gp ON gp.game_id = g.id
     LEFT JOIN players p ON p.id = gp.player_id
     GROUP BY g.id
     ORDER BY g.started_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json({ games: rows });
}));

app.get("/api/games/:id", route(async (req, res) => {
  const game = await pool.query("SELECT * FROM games WHERE id = $1", [req.params.id]);
  if (!game.rows[0]) return res.status(404).json({ error: "game not found" });
  const [players, proposals, rounds] = await Promise.all([
    pool.query(
      `SELECT p.id, p.name, p.photo, gp.seat, gp.role
       FROM game_players gp JOIN players p ON p.id = gp.player_id
       WHERE gp.game_id = $1 ORDER BY gp.seat`, [req.params.id],
    ),
    pool.query("SELECT * FROM proposals WHERE game_id = $1 ORDER BY round_number, attempt_number", [req.params.id]),
    pool.query("SELECT * FROM mission_rounds WHERE game_id = $1 ORDER BY round_number", [req.params.id]),
  ]);
  res.json({ ...game.rows[0], players: players.rows, proposals: proposals.rows, rounds: rounds.rows });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "request failed" });
});

await initDb();
app.listen(port, "127.0.0.1", () => {
  console.log(`Avalon DM API ready at http://127.0.0.1:${port}`);
});
