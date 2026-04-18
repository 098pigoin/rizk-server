# RIZK Casino — Full Stack

## Structure
```
rizk-app/     → React frontend (Vite)
rizk-server/  → Node.js backend (Express + SQLite)
```

## Run Locally (Both at once)

### Terminal 1 — Backend
```bash
cd rizk-server
npm install
npm start
# Runs on http://localhost:3001
```

### Terminal 2 — Frontend
```bash
cd rizk-app
npm install
npm run dev
# Runs on http://localhost:5173
```

Open http://localhost:5173

---

## How Accounts Work

1. Click "Log In / Sign Up" in the header
2. Register with email + username + password
3. Your account has:
   - **Demo balance**: 1 ETH free to play with (no real money)
   - **Real balance**: 0 ETH — deposit real ETH to play for real

## How Real Money Deposits Work

1. Create an account and log in
2. Click your username → "Deposit" button
3. You get a unique Ethereum deposit address
4. Send ETH from MetaMask or any wallet to that address
5. Paste the transaction hash → click Verify
6. Balance is credited after 1 confirmation (~15 seconds)

## How Withdrawals Work

1. Go to Wallet → Withdraw
2. Enter your Ethereum address + amount
3. Submit (min 0.005 ETH)
4. Processed within 24h

---

## Deploy to Production

### Frontend → Vercel
```bash
cd rizk-app
# Push to GitHub, then import on vercel.com
# Set VITE_API_URL=https://your-backend-url.com in Vercel env vars
```

### Backend → Railway
1. Go to railway.app → New Project → Deploy from GitHub
2. Point to rizk-server/
3. Set environment variables:
   - JWT_SECRET=your_long_random_secret
   - ETH_RPC_URL=https://eth.llamarpc.com
4. Done — Railway gives you a URL like https://rizk-server.up.railway.app

### Backend → Render
1. render.com → New Web Service → connect repo
2. Build: `npm install`
3. Start: `npm start`
4. Same env vars as Railway

---

## Environment Variables

### rizk-server/.env
```
PORT=3001
JWT_SECRET=change_this_to_long_random_string
FRONTEND_URL=http://localhost:5173
ETH_RPC_URL=https://eth.llamarpc.com
ETH_NETWORK=mainnet
```

### rizk-app/.env (create this file)
```
VITE_API_URL=http://localhost:3001
```

---

## Games (12 total)
🚀 Crash · 💣 Mines · 🌙 Limbo · 🎯 Plinko · 🎲 Dice · 🗼 Towers · 🎱 Keno · 🎰 Slots · 🃏 Hi-Lo · 🎡 Wheel · ♠️ Blackjack · ⚫ Roulette
