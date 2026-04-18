const express = require('express');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, safeUser } = require('./auth');

const router = express.Router();

// RPC provider — uses public Ethereum mainnet (or testnet via env)
const RPC_URL = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';
const NETWORK  = process.env.ETH_NETWORK || 'mainnet';

// ── GET OR CREATE DEPOSIT ADDRESS ────────────────────────────────────────────
// Each user gets their own Ethereum address. Funds sent here get credited.
router.get('/deposit-address', requireAuth, (req, res) => {
  try {
    let row = db.prepare('SELECT * FROM deposit_addresses WHERE user_id = ?').get(req.user.id);
    if (!row) {
      const wallet = ethers.Wallet.createRandom();
      row = {
        id:          uuidv4(),
        user_id:     req.user.id,
        address:     wallet.address,
        private_key: wallet.privateKey,
      };
      db.prepare('INSERT INTO deposit_addresses (id, user_id, address, private_key) VALUES (?,?,?,?)')
        .run(row.id, row.user_id, row.address, row.private_key);
    }
    // Never send private key to frontend
    res.json({ address: row.address, network: NETWORK });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── CHECK TX + CREDIT (user submits tx hash after sending) ───────────────────
router.post('/deposit/verify', requireAuth, async (req, res) => {
  try {
    const { tx_hash } = req.body;
    if (!tx_hash) return res.status(400).json({ error: 'tx_hash required' });

    // Check if already processed
    const existing = db.prepare('SELECT * FROM deposits WHERE tx_hash = ?').get(tx_hash);
    if (existing) {
      if (existing.status === 'confirmed')
        return res.status(409).json({ error: 'Transaction already credited' });
    }

    // Verify on-chain
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let tx;
    try {
      tx = await provider.getTransaction(tx_hash);
    } catch {
      return res.status(400).json({ error: 'Could not fetch transaction. Try again in a moment.' });
    }
    if (!tx) return res.status(404).json({ error: 'Transaction not found on chain' });

    // Check it was sent to the user's deposit address
    const depRow = db.prepare('SELECT * FROM deposit_addresses WHERE user_id = ?').get(req.user.id);
    if (!depRow) return res.status(400).json({ error: 'No deposit address. Generate one first.' });

    const toAddr = tx.to?.toLowerCase();
    const depAddr = depRow.address.toLowerCase();
    if (toAddr !== depAddr)
      return res.status(400).json({ error: `Transaction not sent to your deposit address (${depRow.address})` });

    // Wait for 1 confirmation
    const receipt = await provider.getTransactionReceipt(tx_hash);
    if (!receipt || receipt.status === 0)
      return res.status(400).json({ error: 'Transaction not confirmed yet or failed. Please wait.' });

    const amountEth = parseFloat(ethers.formatEther(tx.value));
    if (amountEth < 0.001)
      return res.status(400).json({ error: 'Minimum deposit is 0.001 ETH' });

    // Credit the account
    const depositId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT OR REPLACE INTO deposits (id, user_id, tx_hash, amount_eth, status, confirmed_at) VALUES (?,?,?,?,'confirmed',?)`).run(depositId, req.user.id, tx_hash, amountEth, now);
    db.prepare('UPDATE users SET balance_eth = balance_eth + ? WHERE id = ?').run(amountEth, req.user.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, amount: amountEth, balance: user.balance_eth, user: safeUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ── WITHDRAW ─────────────────────────────────────────────────────────────────
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const { to_address, amount_eth } = req.body;
    if (!to_address || !amount_eth)
      return res.status(400).json({ error: 'to_address and amount_eth required' });

    const amt = parseFloat(amount_eth);
    if (amt < 0.005) return res.status(400).json({ error: 'Minimum withdrawal is 0.005 ETH' });
    if (amt > req.user.balance_eth)
      return res.status(400).json({ error: 'Insufficient balance' });

    if (!ethers.isAddress(to_address))
      return res.status(400).json({ error: 'Invalid Ethereum address' });

    // Deduct balance and create pending withdrawal
    db.prepare('UPDATE users SET balance_eth = balance_eth - ? WHERE id = ?').run(amt, req.user.id);
    const wid = uuidv4();
    db.prepare('INSERT INTO withdrawals (id, user_id, to_address, amount_eth, status) VALUES (?,?,?,?,?)')
      .run(wid, req.user.id, to_address, amt, 'pending');

    // In production: process via hot wallet. For now, mark as pending for manual processing.
    // TODO: integrate hot wallet for automatic payouts
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({
      success: true,
      withdrawal_id: wid,
      status: 'pending',
      message: 'Withdrawal submitted. Processed within 24h.',
      new_balance: user.balance_eth,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── BALANCE ───────────────────────────────────────────────────────────────────
router.get('/balance', requireAuth, (req, res) => {
  res.json({
    balance_eth: req.user.balance_eth,
    demo_bal:    req.user.demo_bal,
  });
});

// ── DEPOSIT HISTORY ───────────────────────────────────────────────────────────
router.get('/deposits', requireAuth, (req, res) => {
  const deposits = db.prepare(`
    SELECT id, amount_eth, status, created_at, confirmed_at, tx_hash
    FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.user.id);
  res.json({ deposits });
});

// ── WITHDRAW HISTORY ──────────────────────────────────────────────────────────
router.get('/withdrawals', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, to_address, amount_eth, status, tx_hash, created_at
    FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.user.id);
  res.json({ withdrawals: rows });
});

module.exports = router;
