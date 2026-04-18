const express = require('express');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, safeUser } = require('./auth');

const router = express.Router();
const RPC_URL = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';

router.get('/deposit-address', requireAuth, async (req, res) => {
  try {
    let row = await db.get_p('SELECT * FROM deposit_addresses WHERE user_id=?', [req.user.id]);
    if (!row) {
      const wallet = ethers.Wallet.createRandom();
      row = { id: uuidv4(), user_id: req.user.id, address: wallet.address, private_key: wallet.privateKey };
      await db.run_p('INSERT INTO deposit_addresses (id,user_id,address,private_key) VALUES (?,?,?,?)',
        [row.id, row.user_id, row.address, row.private_key]);
    }
    res.json({ address: row.address, network: process.env.ETH_NETWORK || 'mainnet' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/deposit/verify', requireAuth, async (req, res) => {
  try {
    const { tx_hash } = req.body;
    if (!tx_hash) return res.status(400).json({ error: 'tx_hash required' });
    const existing = await db.get_p('SELECT * FROM deposits WHERE tx_hash=?', [tx_hash]);
    if (existing?.status === 'confirmed') return res.status(409).json({ error: 'Already credited' });
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const tx = await provider.getTransaction(tx_hash).catch(() => null);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    const depRow = await db.get_p('SELECT * FROM deposit_addresses WHERE user_id=?', [req.user.id]);
    if (!depRow) return res.status(400).json({ error: 'No deposit address' });
    if (tx.to?.toLowerCase() !== depRow.address.toLowerCase())
      return res.status(400).json({ error: `Not sent to your deposit address (${depRow.address})` });
    const receipt = await provider.getTransactionReceipt(tx_hash).catch(() => null);
    if (!receipt || receipt.status === 0) return res.status(400).json({ error: 'Not confirmed yet' });
    const amountEth = parseFloat(ethers.formatEther(tx.value));
    if (amountEth < 0.001) return res.status(400).json({ error: 'Min deposit 0.001 ETH' });
    const now = Math.floor(Date.now()/1000);
    await db.run_p('INSERT OR REPLACE INTO deposits (id,user_id,tx_hash,amount_eth,status,confirmed_at) VALUES (?,?,?,?,?,?)',
      [uuidv4(), req.user.id, tx_hash, amountEth, 'confirmed', now]);
    await db.run_p('UPDATE users SET balance_eth=balance_eth+? WHERE id=?', [amountEth, req.user.id]);
    const user = await db.get_p('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, amount: amountEth, balance: user.balance_eth, user: safeUser(user) });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const { to_address, amount_eth } = req.body;
    const amt = parseFloat(amount_eth);
    if (!to_address || !amt) return res.status(400).json({ error: 'Address and amount required' });
    if (amt < 0.005) return res.status(400).json({ error: 'Min withdrawal 0.005 ETH' });
    if (amt > req.user.balance_eth) return res.status(400).json({ error: 'Insufficient balance' });
    if (!ethers.isAddress(to_address)) return res.status(400).json({ error: 'Invalid address' });
    await db.run_p('UPDATE users SET balance_eth=balance_eth-? WHERE id=?', [amt, req.user.id]);
    const wid = uuidv4();
    await db.run_p('INSERT INTO withdrawals (id,user_id,to_address,amount_eth,status) VALUES (?,?,?,?,?)',
      [wid, req.user.id, to_address, amt, 'pending']);
    const user = await db.get_p('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, withdrawal_id: wid, status: 'pending', new_balance: user.balance_eth });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/balance', requireAuth, (req, res) => {
  res.json({ balance_eth: req.user.balance_eth, demo_bal: req.user.demo_bal });
});

router.get('/deposits', requireAuth, async (req, res) => {
  const deposits = await db.all_p('SELECT id,amount_eth,status,created_at,confirmed_at,tx_hash FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [req.user.id]);
  res.json({ deposits });
});

module.exports = router;
