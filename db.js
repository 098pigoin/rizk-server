const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rizk.db');
const db = new sqlite3.Database(DB_PATH);

// Enable WAL mode
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// Promisify helpers
db.run_p = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err) { if(err) rej(err); else res(this); }));
db.get_p  = (sql, params=[]) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
db.all_p  = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

// Synchronous wrappers using better-sqlite3-like API for compatibility
db.prepare = function(sql) {
  return {
    run: (...params) => { db.run(sql, params.flat()); return {}; },
    get: (...params) => { let r; db.get(sql, params.flat(), (e,row) => r=row); return r; },
    all: (...params) => { let r=[]; db.all(sql, params.flat(), (e,rows) => r=rows||[]); return r; }
  };
};

// Create schema
const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, balance_eth REAL NOT NULL DEFAULT 0,
    demo_bal REAL NOT NULL DEFAULT 1.0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    vip_level TEXT NOT NULL DEFAULT 'Bronze', total_wagered REAL NOT NULL DEFAULT 0,
    total_wins REAL NOT NULL DEFAULT 0, total_bets INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS deposit_addresses (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, address TEXT NOT NULL UNIQUE,
    private_key TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tx_hash TEXT UNIQUE,
    amount_eth REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), confirmed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, to_address TEXT NOT NULL,
    amount_eth REAL NOT NULL, tx_hash TEXT, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS game_history (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game TEXT NOT NULL,
    bet_amount REAL NOT NULL, multiplier REAL, pnl REAL NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON game_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_time ON game_history(created_at DESC);
`;

schema.split(';').filter(s => s.trim()).forEach(s => db.run(s.trim()));

module.exports = db;
