const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
const VIP = [{ l:'Platinum',min:10},{l:'Diamond',min:5},{l:'Gold',min:2},{l:'Silver',min:.5},{l:'Bronze',min:0}];
const calcVip = w => (VIP.find(v => w >= v.min) || VIP[4]).l;

router.post('/bet', requireAuth, async (req, res) => {
  try {
    const { game, amount, mode='real' } = req.body;
    const amt = parseFloat(amount);
    if (!game || !amt || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid bet' });
    const field = mode==='demo' ? 'demo_bal' : 'balance_eth';
    if (req.user[field] < amt) return res.status(400).json({ error: 'Insufficient balance' });
    await db.run_p(`UPDATE users SET ${field}=${field}-?, total_wagered=total_wagered+?, total_bets=total_bets+1 WHERE id=?`, [amt, amt, req.user.id]);
    const user = await db.get_p('SELECT * FROM users WHERE id=?', [req.user.id]);
    const newVip = calcVip(user.total_wagered);
    if (newVip !== user.vip_level) await db.run_p('UPDATE users SET vip_level=? WHERE id=?', [newVip, req.user.id]);
    res.json({ bet_id: uuidv4(), new_balance: user[field] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/resolve', requireAuth, async (req, res) => {
  try {
    const { game, bet_amount, multiplier, pnl, mode='real' } = req.body;
    const pnlAmt = parseFloat(pnl);
    const field = mode==='demo' ? 'demo_bal' : 'balance_eth';
    if (pnlAmt > 0) await db.run_p(`UPDATE users SET ${field}=${field}+?, total_wins=total_wins+? WHERE id=?`, [pnlAmt, pnlAmt, req.user.id]);
    await db.run_p('INSERT INTO game_history (id,user_id,game,bet_amount,multiplier,pnl) VALUES (?,?,?,?,?,?)',
      [uuidv4(), req.user.id, game, parseFloat(bet_amount||0), parseFloat(multiplier||0), pnlAmt]);
    const user = await db.get_p('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, new_balance: user[field] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/history', requireAuth, async (req, res) => {
  const rows = await db.all_p('SELECT game,bet_amount,multiplier,pnl,created_at FROM game_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [req.user.id]);
  res.json({ history: rows });
});

router.get('/leaderboard', async (req, res) => {
  const period = req.query.period || 'today';
  const now = Math.floor(Date.now()/1000);
  const since = period==='today' ? now-86400 : period==='week' ? now-604800 : 0;
  const rows = await db.all_p(`SELECT u.username,u.vip_level,SUM(CASE WHEN g.pnl>0 THEN g.pnl ELSE 0 END) as total_wins,SUM(g.bet_amount) as total_wagered,COUNT(*) as bets,MAX(g.multiplier) as best_mult FROM game_history g JOIN users u ON u.id=g.user_id WHERE g.created_at>=? GROUP BY g.user_id ORDER BY total_wins DESC LIMIT 20`, [since]);
  res.json({ leaderboard: rows, period });
});

router.get('/stats', requireAuth, async (req, res) => {
  const user = await db.get_p('SELECT * FROM users WHERE id=?', [req.user.id]);
  const bestWin = await db.get_p('SELECT MAX(pnl) as best FROM game_history WHERE user_id=? AND pnl>0', [req.user.id]);
  res.json({ total_wagered:user.total_wagered, total_wins:user.total_wins, total_bets:user.total_bets, net_pnl:user.total_wins-user.total_wagered, best_win:bestWin?.best||0, vip_level:user.vip_level });
});

module.exports = router;
