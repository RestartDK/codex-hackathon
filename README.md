# Voice Game Companion

A voice-first game library for blind and low-vision players. The website opens on Chess, Ludo, Tic-Tac-Toe, and the interactive mystery The Intercept, with no account or login. A player can choose a game, resume its separate local save, hear its tutorial, and play through speech or the typed-command fallback.

This is an early implementation. It needs testing with blind and low-vision players before anyone should claim that it is fully accessible.

## What works

- Complete legal chess state and move validation with `chess.js`
- Computer opponent using the Stockfish 19 lite single-threaded Web Worker
- Play as White or Black; Easy, Medium, and Hard levels
- GPT-Live WebRTC voice connection through a server route; the API key never reaches the browser
- Authoritative tools for positions, squares, pieces, legal moves, board reading, history, hints, and move proposals
- Explicit moves play immediately; companion-selected moves can require confirmation
- Automatic move narration, captions, keyboard board navigation, screen-reader live-region mode, and typed commands
- Local game persistence, undo, resignation, review, visual themes, and sound controls
- Library-first routing at `/`, `/games/chess`, `/games/ludo`, `/games/intercept`, and `/games/tic-tac-toe`
- Two-player Ludo against the computer with numbered tokens, safe squares, captures, exact finishing, bonus rolls, third-six handling, suggested-move confirmation, and same-die correction before the next roll
- Shared game catalog/contracts and game-specific voice tools for future games
- The original MIT-licensed Intercept story running locally through a pinned InkJS runtime, with faithful passage narration, numbered choices, recap, repeat, one-step undo, and save/resume
- Accessible three-by-three Tic-Tac-Toe against Easy, Medium, or unbeatable Hard AI, with natural spoken square names, paced computer replies, full-turn undo, score, and save/resume

The chess plan is in [`plan.md`](plan.md), and the historical multi-game implementation plan is in [`game-library-plan.md`](game-library-plan.md). Later usability decisions are reflected in the current code and this README. Upstream attribution is in [`UPSTREAM.md`](UPSTREAM.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Requirements

- Node.js `^22.18.0`, `^24.11.0`, or `>=26` (required by the bundled Vite+ test runner)
- npm
- Current desktop Chrome for the primary voice test path
- An OpenAI project key with access to the configured GPT-Live and delegation models

## Run locally on Windows PowerShell

```powershell
cd .\codex-hackathon
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
npm run story:check
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
- “Roll”, “move token two”, or “choose a token for me” in Ludo
- “Play center”, “what is in bottom right?”, or “suggest a move” in Tic-Tac-Toe
- “Board configuration” in Chess or Ludo, and “describe the board” in Tic-Tac-Toe
- “Undo”, “resign”, or “start a new game”

Explicit chess moves and Ludo token choices play immediately. Companion-selected moves follow the suggested-move confirmation setting. Consequential actions such as discarding an unfinished game, chess undo, and resignation still ask for confirmation. Board descriptions and rules are available on request, without repeated tutorials during play.

Ludo rolls and moves have separate readable delays. When voice is active, the next computer step also waits for observed speech playback to go quiet. A bounded wait prevents a dropped voice response from freezing play. Corrections remain available until the next roll; the computer proceeds automatically after the correction window.

## Architecture

- `src/hooks/useChessGame.ts`: authoritative chess state and operations
- `src/games/ludo/ludo.ts`: pure versioned Ludo rules, dice boundary, serialization, and computer move selection
- `src/games/ludo/useLudoGame.ts`: Ludo session, persistence, correction checkpoint, and computer pacing
- `src/games/registry.ts`: trusted library metadata and per-game save keys
- `src/games/contracts.ts`: shared controller/event/snapshot boundary for future games
- `src/voice/chessTools.ts`: bounded tool adapter; model output cannot directly replace game state
- `src/games/ludo/ludoTools.ts`: bounded Ludo tool adapter
- `src/games/intercept/intercept.ts`: authoritative Ink story state, persistence, progression, and undo checkpoint
- `src/games/intercept/interceptTools.ts`: player-visible story tools with direct-choice and delegated-choice boundaries
- `src/games/tic-tac-toe/ticTacToe.ts`: pure rules, save validation, position language, and local AI
- `src/games/tic-tac-toe/ticTacToeTools.ts`: authoritative board-query and action boundary
- `src/voice/useVoiceCompanion.ts`: browser WebRTC/media and tool-event handling
- `server/routes/api/voice/session.post.ts`: server-owned GPT-Live session configuration
- `src/chess/stockfish.ts`: local UCI worker wrapper
- `scripts/copy-stockfish.mjs`: deployment asset preparation

Every proposed move is resolved against current legal moves. Confirmation checks the position again, and late or duplicate model calls cannot mutate a changed position.

## Current limitations

- Real microphone behavior, audio interruption, and NVDA output still require hands-on testing; automated tests intentionally do not create paid GPT-Live sessions.
- Ludo uses the documented two-player local ruleset and a classic cross-board presentation. Numbered token descriptions are the primary nonvisual interaction.
- Ludo exposes one in-progress local save per game. Cloud accounts and multiplayer are intentionally out of scope.
- The Intercept preserves its authored text and choices. It does not provide free-form world simulation or reveal unseen branches.
- Tic-Tac-Toe currently fixes the player as X and the computer as O; online and local two-player modes are out of scope.
- Move explanations report verified effects (capture, promotion, castling, check, or checkmate) but do not claim a strategic motive.
- Voice-session throttling is in-memory and suitable for this demo, not a distributed production deployment. A public no-login deployment still needs provider budgets and centralized abuse monitoring.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`docs/MANUAL_ACCESSIBILITY_TESTS.md`](docs/MANUAL_ACCESSIBILITY_TESTS.md) before a demo.

## License

The application retains the upstream MIT license. Stockfish is GPLv3; preserve its license and corresponding-source information when distributing the worker assets.
