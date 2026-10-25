# Green Truth — Render-ready multiplayer game

## Deploy on Render

1. Create a GitHub repository named `green-truth`.
2. Upload every file/folder in this project, preserving the `public/index.html` path.
3. In Render, choose **New → Web Service**.
4. Connect your GitHub account and select the `green-truth` repository.
5. Runtime: **Node**.
6. Build Command: `npm install`
7. Start Command: `npm start`
8. Instance type: **Free**.
9. Click **Create Web Service**.
10. Render will provide a public `onrender.com` URL.

The application uses WebSockets for real-time room synchronization. Rooms are held in server memory for this free play-test build; a later production version can add Redis/Postgres or Cloudflare Durable Objects/D1.

## Test
Open the public URL on two devices. Device 1 creates a room. Device 2 enters the room code. Add more devices to test up to 8 players.
