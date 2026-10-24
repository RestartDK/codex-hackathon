# Play by Voice

A conversational gaming companion that lets blind and low-vision people play through speech, with as much guidance or delegated play as they choose. Chess is playable today. Loups-Garous is planned. The game picker also previews Tic-Tac-Toe.

## Problem

Blind and low-vision players struggle to enjoy many video games independently because navigation, objectives, and key events rely on visual information.

## Solution

We're building a conversational gaming companion that lets blind and low-vision people enjoy chess and Loups-Garous entirely through speech, handling game controls and providing as much guidance or delegated play as they choose.

## Intended experience

1. Hear a welcome and choose a game through speech.
2. Learn the objective and rules, and choose how much assistance you want.
3. Play by speaking. The companion handles controls, describes events, and helps or acts when asked.
4. Hear when the game ends and what the outcome is.

Browsers require an initial action and microphone permission before live voice can start. Select the companion orb to begin. The board, keyboard controls, and typed commands also work without an API key.

## Implemented

- [x] Imported visual direction from the DevDay Hackathon designs. Game cards, textured backgrounds, original chess-piece artwork, blue and green companion orbs, and matching page layouts.
- [x] Game picker, quarter-turn loading animation, chess board, move history, assistant actions, and leave-game confirmation.
- [x] Responsive layouts, horizontally scrollable game cards, a mobile companion dock, touch controls, and reduced-motion support.
- [x] Companion glow transitions from blue to green. The orb and glow move subtly during a connected voice session. Board contents and move history stay still.
- [x] Audio settings with working narrator volume, game sounds, screen-reader mode, and move-confirmation preferences. Chess preferences include opponent, side, difficulty, board colors, orientation, and piece style.
- [x] Help with spoken and typed examples, a quick guide, and keyboard instructions.
- [x] Legal chess through `chess.js`, a local Stockfish opponent, hints, and delegated move proposals.
- [x] Live OpenAI voice and tool reasoning through one server endpoint. The same connection stays alive across the game picker, board, settings, and help.
- [x] Voice navigation, square and piece inspection, board descriptions, move history, and move proposals.
- [x] Confirmations for spoken and typed moves by default, with a stale-position check. New game, undo, resignation, and leaving a game also need confirmation.
- [x] Saved games, pause and resume, undo, resignation, promotion, game results, and move review. Leaving a game saves and pauses it rather than discarding it.
- [x] Keyboard-operable board, labelled controls, captions, focus-managed dialogs, and optional screen-reader announcements.
- [x] One Vite+ build for the React frontend and Nitro API. No separate frontend and backend deployment is required.

Pointer and keyboard moves made directly on the board play immediately. The confirmation preference applies to companion commands. The computer responds after a committed player move. Hints describe a move without playing it. "Choose a move for me" creates a proposal that still needs confirmation.

## Missing-feature checklist

- [ ] Loups-Garous gameplay, roles, discussion, voting, rounds, and spoken results. Its card is a preview only.
- [ ] Tic-Tac-Toe gameplay. Its card is a preview only and is additional scope beyond the two-game product brief.
- [ ] A persistent assistance-level selector covering independent play, coaching, and automatic delegated play. Hints and delegation currently happen on request.
- [ ] Voice control of every preference, including narrator volume. Voice can open settings; the controls themselves use the screen or keyboard.
- [ ] A dedicated visual onboarding sequence and result screen supplied by the design source. The app currently uses a spoken guide and the existing game-result dialog.
- [ ] A hands-free cold start without browser activation or permission. Browser security prevents promising this on a first visit.
- [ ] Hands-on usability testing with blind and low-vision players, NVDA, and VoiceOver. Labelled controls and keyboard support are not an accessibility certification.
- [ ] Physical-device microphone, interruption, speaker routing, and background-tab checks on iOS Safari and Android Chrome. Synthetic speech can exercise the live integration but cannot prove device hardware behavior.
- [ ] Production protection for the public, no-login voice endpoint. The current in-memory session limit is a demo safeguard, not distributed abuse protection. Configure OpenAI project budgets and usage alerts before sharing a public deployment.
- [ ] A repeatable automated regression suite if this grows beyond the hackathon. Project-owned tests, browser-test configuration, and test scripts were intentionally removed for this version.

## Run locally

Use Bun and a current Node.js release. The checked-in Node version is `26.12.1`.

```sh
bun install
cp .env.example .env
```

Put your OpenAI project key in `.env` as `OPENAI_API_KEY`, then start the application.

```sh
bun run dev
```

Open the URL printed by Vite+. Select the orb, allow microphone access, and say "Play chess." A secure HTTPS origin or localhost is required for microphone access. No account or database is needed.

The private key belongs only in the server environment. Never name it `VITE_OPENAI_API_KEY`, paste it into client code, or commit `.env`.

### Environment variables

| Variable                  | Purpose                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`          | Required for live voice. Server-only OpenAI project key.                                                                                                |
| `OPENAI_VOICE_MODEL`      | Optional voice-model override. Defaults to `gpt-live-1`.                                                                                                |
| `OPENAI_DELEGATION_MODEL` | Optional reasoning-model override. Defaults to `gpt-6-luna`.                                                                                            |
| `ALLOWED_ORIGINS`         | Optional comma-separated exact browser origins. Same-host requests and the documented localhost defaults are allowed. This check is not authentication. |
| `NITRO_PRESET`            | Optional deployment target. Local production builds default to `node-server`; Vercel uses `vercel`.                                                     |
| `HOST`, `PORT`            | Address and port for the built Node server.                                                                                                             |

The key needs access to both configured models. Audio and raw transcripts are not stored in local storage. Game position and preferences stay on the current device.

### Commands

```sh
bun run dev
bun run typecheck
bun run lint
bun run build
bun run start
bun run preview
```

`postinstall` copies the matching Stockfish JavaScript, WASM, and GPL license into `public/stockfish`. Do not mix worker files from different Stockfish builds.

There is no `test` command in this hackathon version. Type checking, linting, and building do not replace checking the running application.

## Voice and typed commands

Live voice accepts natural language. The typed fallback accepts a smaller command vocabulary. Open the keyboard button beside the orb.

| Goal                  | Example                                         |
| --------------------- | ----------------------------------------------- |
| Open a page           | `play chess`, `home`, `audio settings`, `help`  |
| Make a move           | `e2 to e4`, then `yes` or `cancel`              |
| Inspect a square      | `what is on e4`                                 |
| Describe the position | `describe the board`                            |
| Read occupied squares | `read the board`, `read rank 4`, `read file e`  |
| Hear recent moves     | `history`                                       |
| Ask for help          | `hint`, `choose a move for me`, `quick guide`   |
| Control the game      | `pause`, `resume`, `undo`, `new game`, `resign` |

Tab into the board. Use arrow keys to explore squares. Press Enter or Space to select a piece, then select a destination. Move-history buttons review positions without changing the live game.

## Deployment

### Vercel

Import this repository as one project. `vercel.json` uses `bun install --frozen-lockfile` and `NITRO_PRESET=vercel bun run build`. Nitro produces the Vercel output for the frontend and server route. Do not deploy the app as static files only, and do not run the standalone `start` command on Vercel.

Set `OPENAI_API_KEY` as a server environment variable. Use a Node version supported by your Vercel project, such as Node 24. Set provider budgets before enabling public voice access. Test a real voice connection on the deployed origin; local verification does not prove a hosting deployment.

### Dokploy or another Node host

Install dependencies, build once, and run the combined server.

```sh
bun install --frozen-lockfile
bun run build
HOST=0.0.0.0 PORT=3000 bun run start
```

The build contains the frontend and API in `.output`. Supply the OpenAI key at runtime. Keep durable storage separate if a future version adds accounts or multiplayer state.

## Code map

- `src/app/App.tsx` owns page state and keeps one game and voice controller alive.
- `src/components/PlayByVoice` contains the imported screens and companion dock.
- `src/hooks/useChessGame.ts` owns authoritative chess state and Stockfish lifecycle.
- `src/voice/chessTools.ts` bounds model actions to legal moves and confirmed controls.
- `src/voice/useVoiceCompanion.ts` owns microphone, WebRTC, captions, and connection cleanup.
- `server/routes/api/voice/session.post.ts` creates server-configured OpenAI sessions without exposing the key.
- `public/artwork` contains optimized decorative artwork and piece sprites extracted from the supplied SVGs, not full-page screenshots.

## Attribution and licenses

The chess implementation was adapted from [Chess by Sparsh](https://github.com/sparshsam/chess-by-sparsh), MIT licensed, at commit `ee19f22519a4afb3ec3800dac6b430e56eb8f9ab`. The original MIT notice remains in `LICENSE`.

Stockfish assets come from `stockfish@19.0.1` under GNU GPL v3. The installed license is served at `/stockfish/Copying.txt`. Corresponding source and build information are available at [stockfish.js, stockfish-19](https://github.com/nmrugg/stockfish.js/tree/stockfish-19). Preserve the license, notices, and corresponding-source information when redistributing the engine.

Visual artwork comes from the supplied `DevDay Hackathon.zip` exports. Motion follows [Emil Kowalski's animation guidance](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md). This README is the only project Markdown document in this version.
