const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rizk_dev_secret_change_in_prod';

function makeToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}
function safeUser(u) {
  return { id:u.id, email:u.email, username:u.username, balance_eth:u.balance_eth,
    demo_bal:u.demo_bal, vip_level:u.vip_level, total_wagered:u.total_wagered,
    total_wins:u.total_wins, total_bets:u.total_bets, created_at:u.created_at };
}

router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username 3-20 chars' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, _ only' });
    const existing = await db.get_p('SELECT id FROM users WHERE email=? OR username=?', [email.toLowerCase(), username]);
    if (existing) return res.status(409).json({ error: 'Email or username taken' });
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await db.run_p('INSERT INTO users (id,email,username,password,balance_eth,demo_bal) VALUES (?,?,?,?,0,1.0)',
      [id, email.toLowerCase(), username, hashed]);
    const user = await db.get_p('SELECT * FROM users WHERE id=?', [id]);
    res.json({ token: makeToken(id), user: safeUser(user) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Login and password required' });
    const user = await db.get_p('SELECT * FROM users WHERE email=? OR username=?', [login.toLowerCase(), login]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    const { userId } = jwt.verify(header.replace('Bearer ',''), JWT_SECRET);
    const user = await db.get_p('SELECT * FROM users WHERE id=?', [userId]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.safeUser = safeUser;
