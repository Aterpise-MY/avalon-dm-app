CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roster_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roster_players (
  roster_id BIGINT NOT NULL REFERENCES roster_snapshots(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  seat SMALLINT NOT NULL,
  PRIMARY KEY (roster_id, player_id),
  UNIQUE (roster_id, seat)
);

CREATE TABLE IF NOT EXISTS games (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_count SMALLINT NOT NULL CHECK (player_count BETWEEN 5 AND 10),
  deal_mode TEXT NOT NULL CHECK (deal_mode IN ('auto', 'manual')),
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  winner TEXT,
  killed_player_id TEXT REFERENCES players(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  seat SMALLINT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (game_id, player_id),
  UNIQUE (game_id, seat)
);

CREATE TABLE IF NOT EXISTS proposals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL CHECK (round_number BETWEEN 1 AND 5),
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
  leader_player_id TEXT NOT NULL REFERENCES players(id),
  team_player_ids JSONB NOT NULL,
  votes JSONB NOT NULL,
  approved BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, round_number, attempt_number)
);

CREATE TABLE IF NOT EXISTS mission_rounds (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL CHECK (round_number BETWEEN 1 AND 5),
  leader_player_id TEXT NOT NULL REFERENCES players(id),
  team_player_ids JSONB NOT NULL,
  fails SMALLINT NOT NULL CHECK (fails >= 0),
  succeeded BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, round_number)
);

CREATE INDEX IF NOT EXISTS games_started_at_idx ON games (started_at DESC);
CREATE INDEX IF NOT EXISTS proposals_game_idx ON proposals (game_id, round_number, attempt_number);
CREATE INDEX IF NOT EXISTS mission_rounds_game_idx ON mission_rounds (game_id, round_number);
