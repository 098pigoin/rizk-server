const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'rizk.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    balance_eth REAL NOT NULL DEFAULT 0,
    demo_bal    REAL NOT NULL DEFAULT 1.0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    vip_level   TEXT NOT NULL DEFAULT 'Bronze',
    total_wagered REAL NOT NULL DEFAULT 0,
    total_wins  REAL NOT NULL DEFAULT 0,
    total_bets  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS deposit_addresses (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    address     TEXT NOT NULL UNIQUE,
    private_key TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    tx_hash     TEXT UNIQUE,
    amount_eth  REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    confirmed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    to_address  TEXT NOT NULL,
    amount_eth  REAL NOT NULL,
    tx_hash     TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS game_history (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    game        TEXT NOT NULL,
    bet_amount  REAL NOT NULL,
    multiplier  REAL,
    pnl         REAL NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    token       TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_user  ON game_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_time  ON game_history(created_at DESC);
`);

module.exports = db;
