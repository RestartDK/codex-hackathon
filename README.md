# Voice Chess Companion

A voice-first chess game for blind and low-vision players. The website opens directly on a playable board with no account or login. A player can make moves, inspect the position, hear game events, and request a Stockfish hint through speech or the typed-command fallback.

This is an early implementation. It needs testing with blind and low-vision players before anyone should claim that it is fully accessible.

## What works

- Complete legal chess state and move validation with `chess.js`
- Computer opponent using the Stockfish 19 lite single-threaded Web Worker
- Play as White or Black; Easy, Medium, and Hard levels
- GPT-Live WebRTC voice connection through a server route; the API key never reaches the browser
- Authoritative tools for positions, squares, pieces, legal moves, board reading, history, hints, and move proposals
- Separate move confirmation with stale-position protection
- Automatic move narration, captions, keyboard board navigation, screen-reader live-region mode, and typed commands
- Local game persistence, undo, resignation, review, visual themes, and sound controls

The full product and engineering plan is in [`../plan.md`](../plan.md). Upstream attribution is in [`UPSTREAM.md`](UPSTREAM.md).

## Requirements

- Node.js `^22.18.0`, `^24.11.0`, or `>=26` (required by the bundled Vite+ test runner)
- npm
- Current desktop Chrome for the primary voice test path
- An OpenAI project key with access to the configured GPT-Live and delegation models

## Run locally on Windows PowerShell

```powershell
cd .\chess-companion
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `OPENAI_API_KEY`. Then run:

```powershell
npm run dev
```

Open the URL printed by Vite+, normally `http://localhost:3000`. The board and typed controls work without an OpenAI key; only live voice requires it. The first voice activation triggers the browser's microphone permission prompt.

`postinstall` copies the matching Stockfish JavaScript and WASM files from the npm package into `public/stockfish`. Do not mix files from different Stockfish builds.

## Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Server-only project key; required for live voice |
| `OPENAI_VOICE_MODEL` | Voice model, default `gpt-live-1` |
| `OPENAI_DELEGATION_MODEL` | Tool-reasoning model, default `gpt-6-luna` |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed to create sessions |

Never expose the key through a `VITE_` variable. Audio and raw conversation transcripts are not saved to local storage.

## Useful commands

```powershell
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
npx playwright install chromium
npm run test:e2e
```

The automated suites use no paid API calls. Browser tests cover saved-game gating, confirmations, pause/resume, keyboard board navigation, Stockfish replies, terminal-state persistence, and corrupt storage recovery. Manual testing is still required for real audio, microphone permission, and NVDA behavior.

## Voice and typed examples

- “Move e2 to e4”
- “Move my knight to f3”
- “What is on d5?”
- “Where are my pawns?”
- “Read rank four”
- “What can the bishop on c1 do?”
- “What did the computer play?”
- “Give me a hint”
- “Choose a move for me”
- “Undo”, “resign”, or “start a new game”

Moves are proposals by default. The player must then say “yes” or use the Confirm button. New game, undo, and resignation always use a proposal/confirmation flow when invoked by voice.

## Architecture

- `src/hooks/useChessGame.ts`: authoritative chess state and operations
- `src/voice/chessTools.ts`: bounded tool adapter; model output cannot directly replace game state
- `src/voice/useVoiceCompanion.ts`: browser WebRTC/media and tool-event handling
- `server/routes/api/voice/session.post.ts`: server-owned GPT-Live session configuration
- `src/chess/stockfish.ts`: local UCI worker wrapper
- `scripts/copy-stockfish.mjs`: deployment asset preparation

Every proposed move is resolved against current legal moves. Confirmation checks the position again, and late or duplicate model calls cannot mutate a changed position.

## Current limitations

- Real microphone behavior, audio interruption, and NVDA output still require hands-on testing; automated tests intentionally do not create paid GPT-Live sessions.
- Move explanations report verified effects (capture, promotion, castling, check, or checkmate) but do not claim a strategic motive.
- Voice-session throttling is in-memory and suitable for this demo, not a distributed production deployment. A public no-login deployment still needs provider budgets and centralized abuse monitoring.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`docs/MANUAL_ACCESSIBILITY_TESTS.md`](docs/MANUAL_ACCESSIBILITY_TESTS.md) before a demo.

## License

The application retains the upstream MIT license. Stockfish is GPLv3; preserve its license and corresponding-source information when distributing the worker assets.
