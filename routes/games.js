const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

const VIP_THRESHOLDS = [
  { level: 'Platinum', min: 10 },
  { level: 'Diamond',  min: 5  },
  { level: 'Gold',     min: 2  },
  { level: 'Silver',   min: 0.5},
  { level: 'Bronze',   min: 0  },
];

function calcVip(wagered) {
  for (const v of VIP_THRESHOLDS) if (wagered >= v.min) return v.level;
  return 'Bronze';
}

// ── PLACE BET (deduct balance) ─────────────────────────────────────────────
router.post('/bet', requireAuth, (req, res) => {
  try {
    const { game, amount, mode = 'real' } = req.body; // mode: real|demo
    if (!game || !amount) return res.status(400).json({ error: 'game and amount required' });
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const field = mode === 'demo' ? 'demo_bal' : 'balance_eth';
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (user[field] < amt) return res.status(400).json({ error: 'Insufficient balance' });

    // Deduct
    db.prepare(`UPDATE users SET ${field} = ${field} - ?, total_wagered = total_wagered + ?, total_bets = total_bets + 1 WHERE id = ?`)
      .run(amt, amt, user.id);

    // Update VIP
    const newWag = user.total_wagered + amt;
    const newVip = calcVip(newWag);
    if (newVip !== user.vip_level) db.prepare('UPDATE users SET vip_level = ? WHERE id = ?').run(newVip, user.id);

    const betId = uuidv4();
    res.json({ bet_id: betId, new_balance: user[field] - amt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── RESOLVE BET (add winnings) ────────────────────────────────────────────────
router.post('/resolve', requireAuth, (req, res) => {
  try {
    const { game, bet_amount, multiplier, pnl, mode = 'real' } = req.body;
    if (!game || bet_amount == null || pnl == null)
      return res.status(400).json({ error: 'game, bet_amount, pnl required' });

    const field = mode === 'demo' ? 'demo_bal' : 'balance_eth';
    const pnlAmt = parseFloat(pnl);

    // Credit winnings (if positive)
    if (pnlAmt > 0) {
      db.prepare(`UPDATE users SET ${field} = ${field} + ?, total_wins = total_wins + ? WHERE id = ?`)
        .run(pnlAmt, pnlAmt, req.user.id);
    }

    // Record history
    db.prepare(`INSERT INTO game_history (id, user_id, game, bet_amount, multiplier, pnl) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), req.user.id, game, parseFloat(bet_amount), parseFloat(multiplier || 0), pnlAmt);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, new_balance: user[field] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GAME HISTORY ──────────────────────────────────────────────────────────────
router.get('/history', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const rows  = db.prepare(`
    SELECT game, bet_amount, multiplier, pnl, created_at
    FROM game_history WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(req.user.id, limit);
  res.json({ history: rows });
});

// ── GLOBAL LEADERBOARD ────────────────────────────────────────────────────────
router.get('/leaderboard', (req, res) => {
  const period = req.query.period || 'today'; // today|week|alltime
  let since = 0;
  const now = Math.floor(Date.now() / 1000);
  if (period === 'today') since = now - 86400;
  else if (period === 'week') since = now - 604800;

  const rows = db.prepare(`
    SELECT u.username, u.vip_level,
           SUM(CASE WHEN g.pnl > 0 THEN g.pnl ELSE 0 END) as total_wins,
           SUM(g.bet_amount) as total_wagered,
           COUNT(*) as bets,
           MAX(g.multiplier) as best_mult
    FROM game_history g
    JOIN users u ON u.id = g.user_id
    WHERE g.created_at >= ?
    GROUP BY g.user_id
    ORDER BY total_wins DESC
    LIMIT 20
  `).all(since);
  res.json({ leaderboard: rows, period });
});

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const bestWin = db.prepare('SELECT MAX(pnl) as best FROM game_history WHERE user_id = ? AND pnl > 0').get(req.user.id);
  const bestMult = db.prepare('SELECT MAX(multiplier) as best FROM game_history WHERE user_id = ?').get(req.user.id);
  const favGame = db.prepare(`SELECT game, COUNT(*) as c FROM game_history WHERE user_id = ? GROUP BY game ORDER BY c DESC LIMIT 1`).get(req.user.id);
  res.json({
    total_wagered: user.total_wagered,
    total_wins:    user.total_wins,
    total_bets:    user.total_bets,
    net_pnl:       user.total_wins - user.total_wagered,
    best_win:      bestWin?.best || 0,
    best_mult:     bestMult?.best || 0,
    fav_game:      favGame?.game || '—',
    vip_level:     user.vip_level,
  });
});

module.exports = router;
