# Play by Voice

Choose Chess or Loups-Garous from the game picker. Audio Settings and Help are available from the shared shell. Tic-Tac-Toe is not playable yet.

Chess runs in the browser with Stockfish and saves your position locally. Loups-Garous is a single-player social deduction game with NPC villagers. Use **Games** to return to the picker. Leaving a Loups-Garous match asks for confirmation because it cannot be resumed from the picker.

The project uses the supplied React, Vite+, and Nitro application. Vite+ builds the browser app and Nitro API into `.output/` for a regular Node server.

## Run locally

On NixOS, enter the development shell before you install dependencies or start the server:

```sh
nix develop
```

The locked shell provides Nix-packaged Node 26.12.1, matching `.node-version`, and Bun 1.4.4, matching `package.json`. Keep `.node-version` and the Node package in `flake.lock` aligned when you update the toolchain.

Without Nix, install a Node version allowed by `package.json` and the declared Bun version (`bun@1.4.4`). In either environment, run:

```sh
bun install
bun run dev
```

Open http://localhost:3000. Games run without a provider key; the guide responds from local game rules and NPCs use deterministic bots. To enable model-driven guide and NPC replies, copy `.env.example` to `.env` and set `OPENAI_API_KEY`. The configured defaults are `OPENAI_VOICE_MODEL=gpt-live-1`, `OPENAI_DELEGATION_MODEL=gpt-6-luna`, and `OPENAI_NPC_MODEL=gpt-6-luna`. Provider credentials are read only by Nitro and are never sent to the browser.

## Checks and production

```sh
bun run check
bun run typecheck
bun run test
bun run build
bun run start
```

The production server listens on port 3000 by default. `bun run smoke http://127.0.0.1:3000` checks the app shell, browser entry, health route, Stockfish worker and WebAssembly assets, and both voice endpoints without calling a provider.

The dev and build scripts copy the engine assets from pinned `stockfish@19.0.1` into `public/stockfish/`. The generated JavaScript and WebAssembly files are not committed. The Stockfish license remains in `public/stockfish/Copying.txt`.

## Deploy to Netlify

The included `netlify.toml` runs the production build with Nitro's Netlify preset. It publishes the browser app from `dist/` and packages the Nitro API as Netlify Functions, so the frontend and `/api` routes deploy together.

Connect the repository to Netlify and deploy the branch you want to serve. The build configuration supplies `NITRO_PRESET=netlify`; add `OPENAI_API_KEY` in the site's environment variables for model-driven guide, NPC, and voice features. The game still runs with its local guide and bot fallbacks if that variable is unavailable.

Treat only `OPENAI_API_KEY` as a secret. `OPENAI_BASE_URL`, `OPENAI_*_MODEL`, and `OPENAI_VOICE` are public configuration labels. The Netlify configuration excludes only those labels from secret-value scanning while keeping API-key scanning enabled.

## Rules

The standard village size is 4–12 players. The game assigns a balanced default role mix with at least one Werewolf. A village contains one human and NPCs. Cupid chooses two lovers at the start when present; the surviving lover dies when their partner does. At night the pack hunts, the Seer investigates, and the Witch may use one healing and one poison potion over the full game. During the day, villagers discuss and vote. A tied vote follows the selected no-exile or random-among-tied rule. A Hunter eliminated from the game gets one final shot, including after a lover-chain death.

The village wins when no Werewolves remain. Werewolves win when they equal or outnumber all other living players. Cross-faction lovers win if they are the only two living players. Roles remain private until the game ends. The server filters private findings, wolf teammates, and Witch night information for each authorized view.

## Sessions and model agents

Creating a game returns a cryptographically random session token once. Read and action requests require that token in `X-Game-Session`. Action writes also require a UUID `X-Request-Id`; successful retries return the saved result. Game state is held in memory and is cleared when the server restarts.

The player-facing guide uses the Responses API with a player-scoped view of the game. It can explain rules, the current phase, and strategy, but has no action route and cannot alter a game. Missing credentials or a provider failure show a labeled local guide response. The browser can optionally speak those text responses with its local speech feature.

The Voice Companion is always ready. On a first visit, the player taps anywhere once to approve the browser microphone, then can say “start the game” or “start a quick test” from the landing screen. After that, persistent browser transcription handles game commands, public morning conversation, and private guide questions. A spoken briefing begins every game before the public story line, covering the player's role, win condition, phase flow, and voice examples. The private guide also has a **Replay briefing** control and understands “repeat the guide.” When credentials are configured, narration uses the authenticated server-side OpenAI TTS route with the `marin` voice and falls back to browser speech if the provider is unavailable. During the day, natural messages such as “Camille, why do you suspect Noémie?” and “tell the village I trust Jules” become public village speech and prompt NPC replies. Say “voice help” for the complete phase-aware command list, including role actions, public conversation, voting, narration controls, game pause/resume, and voice-control pause/resume. Any night role can say “wait for dawn” to leave its ability unused; a human Werewolf can additionally say “let the pack decide,” “pass,” or “do nothing” to delegate the target. Commands still use the validated action route; guide questions use the player-scoped assistant route and are read by the same narrator voice. If browser transcription reports a network failure during a game, the app switches to the `gpt-live-1` WebRTC guide backed by `gpt-6-luna`. GPT-Live transcript fragments use the same command router after a short quiet interval, so game actions remain validated server-side.

NPC agents are separate from the guide and voice configuration. They use `OPENAI_NPC_MODEL` only when their controller is `agent`; local `bot` players never call a model. Every NPC target remains validated against the deterministic game rules. Missing credentials, timeout, provider errors, or malformed NPC output use the local fallback.

## Story and audio

A new normal game begins with a short Valombre prologue. Each NPC has a public background, personality, visual portrait, and introduction. The player can begin the first night whenever they are ready. Returning players skip the prologue after starting it once; the quick-test game also skips it so it opens directly on a playable night.

One player-facing assistant queues and reads public narration, NPC dialogue, and guide replies, always naming the speaker before their original text. It highlights the active speaker and provides automatic-reading, mute, volume, speech speed, pause/resume, repeat, and stop controls. If speech synthesis is unavailable, every line remains in the village history.

For a provider/ML handoff, read [the voice-system guide](docs/voice-system.md). It separates browser narration, microphone transcription, real-time guide audio, and NPC text generation, and identifies the safe integration point for a neural TTS provider.

NPCs retain short public-conversation memories and build suspicions from accusations and public votes. They open each new day with an automatic public exchange. The model prompt receives only their role-safe information, profile, memories, and public discussion; the deterministic engine validates each game action. Once microphone permission is granted, persistent browser transcription routes spoken questions to the private guide and spoken game commands to the same validated action interface used by typed commands. The private guide never takes actions on the player's behalf.

## Game modules

The API is shared by registered game modules. `GET /api/games` returns the game catalog; `POST /api/games` accepts a `gameType` (defaults to `loups-garous`) and the selected module's create options. Session reads and action writes use the same authenticated routes for every registered game. A failed action runs against a private state copy and is discarded; successful actions are committed once and can be safely retried with the same request ID.

To add a game, create a module under `server/game/modules/` that implements `GameModule<State, CreateInput, ActionInput, PublicView>`, then register it in `server/game/registry.ts`. Each module owns its state, validates its create/action inputs, applies its rules, and returns a player-safe view. The shared API handles game lookup, sessions, action locking, request IDs, and catalog discovery. Add a matching frontend renderer for that module's view shape. The werewolf frontend uses this API; Chess runs separately in the browser.

Modules can advertise typed/voice-command and undo support. A module can implement `parseCommand` to translate typed text or a speech transcript into one of its validated actions; the shared action route accepts `{ "command": "..." }` and applies the resulting action transactionally. Loups-Garous supports commands such as “start the game”, “investigate Camille”, “wait for dawn”, “hear the villagers”, “I accuse Camille”, “vote Camille”, “pause game”, and “say …”. The always-on Voice Companion uses the same command path, while typed controls remain available. Undo remains unsupported in Loups-Garous; another module can expose an `undoAction` hook.

The default store is still in-memory and single-process: games and session tokens are cleared on server restart, and the store is not suitable for multi-instance deployment. `GameRepository` isolates that storage choice, so a durable database adapter can be added without rewriting game rules. The existing request lock and receipt cache also live in memory, so multi-instance deployments must move those into shared storage too.

## Project structure

- `src/shell/` — exclusive game mounting and shared preferences
- `src/app/` and `src/components/PlayByVoice/` — picker, Chess, Audio Settings, and Help
- `src/chess/` — browser chess rules and engine integration
- `src/werewolf/` — Loups-Garous interface
- `server/api/` — Nitro game catalog, session, action, and health endpoints
- `server/game/engine.ts` — deterministic game rules and player views
- `server/game/module.ts` and `registry.ts` — typed module contract and game catalog
- `server/game/modules/` — individual game implementations
- `server/game/agents.ts` — LLM provider and fallback decisions
- `server/game/prepare.ts` — NPC phase setup
- `server/game/store.ts` — in-memory state, sessions, request receipts, and locks
