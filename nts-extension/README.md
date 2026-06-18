# Tuner (NTS-compatible, unofficial)

Unofficial Chrome (MV3) extension for NTS Radio's live channels and Infinite
Mixtapes. Not affiliated with NTS.

## Load it

`chrome://extensions` → enable Developer mode → "Load unpacked" → select this
directory.

## ⚠️ Verify before relying on this

This build was written without network access to `nts.live` (the dev
environment had no egress to that host), so the API client in `lib/api.js`
and the stream URLs in the same file are **unverified**. Before trusting this
beyond local testing:

1. Open `https://www.nts.live` and `https://www.nts.live/search` with devtools
   network tab open, and confirm:
   - `GET /api/v2/live` response shape matches `parseLiveChannel` in
     `lib/api.js` (now/next field names, artwork location).
   - `GET /api/v2/mixtapes` response shape matches `parseMixtape`.
   - The exact path/params of the search endpoint (currently guessed as
     `GET /api/v2/search?q=...&types[]=show&types[]=episode`).
2. Confirm the live stream URLs still resolve:
   - `https://stream-relay-geo.ntslive.net/stream`
   - `https://stream-relay-geo.ntslive.net/stream2`
   If they 404, pull the current URLs from the `<audio>`/player config on
   nts.live and update `LIVE_STREAMS` in `lib/api.js`.
3. Each `fetch*`/`search` function already falls back across a few plausible
   field-name variants and is wrapped in try/catch by its caller, so minor
   drift shouldn't crash the popup — but verify the UI actually shows real
   titles/artwork, not blanks.

## Architecture

- `background.js` — service worker; coordinates the offscreen doc, polls
  `/live` via `chrome.alarms` (only while a live channel is playing), badge.
- `offscreen.js` / `offscreen.html` — owns the single `<audio>` element and
  the Media Session API handlers. Created lazily on first play.
- `popup.js` / `popup.html` / `popup.css` — UI only, no audio. Talks to
  `background.js` via `chrome.runtime.sendMessage`.
- `lib/api.js` — NTS API client, defensive parsing (see warning above).
- `lib/state.js` — `chrome.storage.local` helpers (current source, volume,
  favorites, history).
- `lib/messages.js` — message-type constants shared by all three contexts.

## Known limitations (by design)

- No inline playback of archived episodes — they deep-link to NTS /
  Mixcloud / SoundCloud instead, per Mixcloud/SoundCloud API restrictions.
- No NTS account login/sync. Favorites/history are local-only.
