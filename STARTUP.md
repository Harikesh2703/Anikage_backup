# Anikage — Startup Guide

## Architecture

```
ani-cli/
├── server/index.mjs          ← Express API server (port 3001)
├── src/api/allanime.js       ← Core scraper (curl + AES decrypt)
└── frontend/emerald-stream-main/  ← React/Vite frontend (port 8080)
```

---

## Step 1 — Start the Backend API Server

Open a terminal and run:

```bash
cd ~/ani-cli
node server/index.mjs
```

You should see:
```
✓ Anikage API server running at http://localhost:3001
```

**Keep this terminal open.** The frontend depends on it.

---

## Step 2 — Start the Frontend

Open a **second terminal** and run:

```bash
cd ~/Desktop/ani-cli/emerald-stream-main
npm run dev
```

Then open your browser and go to:

```
http://localhost:8080
```

---

## API Endpoints (for testing)

```bash
# Search
curl "http://localhost:3001/api/search?q=naruto"

# Trending
curl "http://localhost:3001/api/trending?limit=10"

# Episode list for a show
curl "http://localhost:3001/api/episodes/cstcbG4EquLyDnAwN"

# Best stream link for an episode
curl "http://localhost:3001/api/sources/cstcbG4EquLyDnAwN/1"

# Direct browser redirect (used by Watch button)
# Open this URL in browser to play episode 1 of Naruto
http://localhost:3001/api/watch/cstcbG4EquLyDnAwN/1
```

---

## Playback — Pop-up Blocker Fix

When you click **Watch Now** or any anime card, a new tab must open.
If it doesn't, your browser is blocking pop-ups.

**Firefox:** Click the shield/lock icon in the address bar → Allow Pop-ups for localhost  
**Chrome:** Click the icon on the right side of the address bar → Always allow pop-ups

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Failed to connect to localhost port 3001` | Backend is not running. Do Step 1. |
| Frontend shows blank rows | Backend returned no data. Check backend terminal for errors. |
| New tab doesn't open when clicking Watch | Browser is blocking pop-ups. See above. |
| `NEED_CAPTCHA` error in terminal | The persisted query endpoint is being rate-limited. Wait a few minutes. |
| `Just a moment` Cloudflare page in logs | `apivtwo/clock.json` is blocked. This is expected — the scraper falls back to direct provider links. |
