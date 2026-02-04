# Ashta Chakkan (Chowka Bhara)

Online multiplayer prototype of the classic Ashta Chakkan / Chowka Bhara game with cowrie rolls, safe crosses, and outer-to-inner movement.

## Features
- Multiplayer rooms (host creates, share link, up to 4 players)
- Cowrie roll logic (1–3 by count, 4 all down, 8 all up)
- Safe squares with diagonal cross
- Tokens start on safe squares and open on 4/8

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm run dev
   ```
3. Open:
   - `http://localhost:3000`

## Project Structure
- `server.js` — Express + Socket.IO server
- `public/index.html` — Game client UI + logic

## Rules (Snapshot)
- Cowrie roll values: 1–3 by count of down-facing shells, 4 when all down, 8 when all up
- On 4 or 8: either open a closed token (move 1 out of the safe square) or move an open token by 4/8
- Move anticlockwise on the outer ring, then clockwise on the inner ring, and finish at the center
- Safe squares (crossed) cannot be captured

## Deploy (Render)
1. Create a new **Web Service** and connect the GitHub repo. ([Render docs](https://render.com/docs/deploy-node-express-app?utm_source=openai))
2. Set **Build Command** to `npm install`.
3. Set **Start Command** to `node server.js`.
4. Deploy and use the public Render URL.

## Notes
- Intended as a prototype; the server keeps room state in memory.
- For public deployment, use a Node-friendly platform (Render, Railway, Fly.io).
