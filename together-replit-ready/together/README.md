# Together — Watch Party starter

A cinematic dark web starter for shared video rooms. The Next.js UI and Socket.IO room server run in one Node.js process, which simplifies browser-based hosting such as Replit.

## What works in this starter

- Create/join a room by code (room state is in server memory).
- Real-time room participants and text chat over Socket.IO.
- Server-broadcast playback state for supported source URLs.
- Loads YouTube in an iframe and direct `.mp4`, `.webm`, `.ogg`, or `.m3u8` URLs in a video element.
- Browser screen-capture permission flow via `getDisplayMedia()`.

## What is deliberately NOT complete

This is a runnable starter, **not a production-ready fully-featured watch party yet**.

- Voice is not connected. Add LiveKit credentials and wire the LiveKit React components/SDK before claiming voice works.
- Screen capture currently starts locally in the initiating browser. It is **not broadcast to other users** until LiveKit track publishing and remote track rendering are implemented.
- YouTube iframe playback is displayed, but exact synchronized play/pause/seek needs the YouTube IFrame Player API adapter; the current server only syncs room playback state.
- Rooms and chat are held in memory and are lost when the API process restarts. There is no login, access control, database persistence, abuse prevention, or invitation authorization. Do not expose this API publicly as-is.
- “Any source” cannot be guaranteed. Third-party sites can disallow iframe embedding, CORS, cross-origin playback, or have DRM. Use only content you are allowed to access/share.
- The `muted` UI state is only a starter affordance and does not yet implement a full local audio mixer.

## Requirements

- Node.js 20.9+ (recommended)
- npm 10+ (or a recent pnpm)
- Internet connection for package install and Google Fonts
- Modern browser for screen capture

## Publish from a browser (Replit)

1. Open [Replit Import](https://replit.com/import) and choose ZIP import if available for your account.
2. Upload this project ZIP and let the workspace finish importing.
3. Ask Replit Agent: `Set up and run this existing Next.js + Socket.IO project. Keep the web app and Socket.IO on the same port/process. Do not replace the existing UI. Run npm install, verify npm run build, then configure publishing with build command npm run build and run command npm start. Fix only errors needed to make it run.`
4. Open the preview and test creating a room from two browser tabs.
5. Use Replit's Publish/Deploy control to publish and copy the public URL. Publishing options and pricing depend on the current Replit plan.

The project is designed to serve the website and room socket from the same public origin. This ZIP does not itself create a live URL; publishing must be completed in your hosting account.

## Run locally

1. Install Node.js.
2. Copy this folder and open a terminal in it.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env.local` (Next.js) and `.env` (API), or simply create both files with the variables below. For the basic starter, only `NEXT_PUBLIC_SOCKET_URL` is needed by the web client. `LIVEKIT_*` are placeholders until you wire up LiveKit.

   `.env.local`:
   ```dotenv
   NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
   ```

   `.env`:
   ```dotenv
   API_PORT=4000
   WEB_ORIGIN=http://localhost:3000
   ```

5. Start the web app and API together:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000 in two browser windows. Create a room in one, copy the invite link, then open it in the other window. Chat and room participant state should update in real time while the API is running.

7. Health check: open http://localhost:4000/health. Expected response: `{"ok":true,"service":"together-api","rooms":0}` (room count changes after use).

## Production prerequisites

Before publishing, implement these in order:

1. Persistent storage (PostgreSQL) for users, rooms, messages and playback.
2. Authentication and authorization for room membership and moderator actions.
3. Rate limiting, payload limits, origin allowlist, and invitation expiry.
4. LiveKit server-side token endpoint. Store `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` only on the server. Never expose the secret in `NEXT_PUBLIC_*`.
5. LiveKit client integration:
   - request a token from the authenticated API;
   - connect the browser to `LIVEKIT_URL`;
   - publish microphone and screen tracks;
   - render remote participant tracks;
   - handle disconnect, permission denied, and track ended events.
6. YouTube IFrame Player API adapter for authoritative player events and commands.
7. HTTPS, monitoring, error reporting, and tests across browsers.

## Architecture

- `app/`: Next.js routes and global styles
- `components/TogetherApp.tsx`: main room/home UI and client-side starter behavior
- `server/index.ts`: Socket.IO server and in-memory room state
- `package.json`: scripts and dependencies

## Notes on screen sharing

`getDisplayMedia()` requires a secure context (HTTPS, or localhost for development) and a user gesture. The browser may not provide a system-audio track for every selected source. Capturing locally does not broadcast it; media tracks need to be published over a media transport such as LiveKit/WebRTC.

## License

Private starter project. Add a license before distributing.
