# Voice-accessible chess — implementation plan

## 1. Outcome and agreed stack

Adapt an existing chess website so blind and low-vision players can play a complete, untimed game against a computer through English conversation.

The website opens directly onto the chessboard. There is no login, landing page, or required setup form. After activating audio and granting browser microphone permission, the player can operate the game through speech.

**Deliverables:** working local application, automated tests, manual accessibility test script, environment configuration example, and Vercel deployment instructions. Publishing is a later step.

| Area | Decision |
|---|---|
| Existing game | Fork [Chess by Sparsh](https://github.com/sparshsam/chess-by-sparsh) |
| Frontend | Retain React + TypeScript; migrate to Vite+ |
| Backend | Nitro integrated into the Vite build |
| Styling | Tailwind CSS + shadcn/ui using Radix primitives |
| Chess rules | chess.js |
| Opponent and hints | Stockfish 19 lite single-threaded Web Worker |
| Conversation | OpenAI GPT-Live, `gpt-live-1`, over WebRTC |
| Delegated tool selection | `gpt-6-luna` |
| State and persistence | React subscription to application state; localStorage |
| Testing | Vite+ test runner, React Testing Library, Playwright |
| Package manager | npm; preserve and update the existing lockfile |
| Primary test environment | Windows, desktop Chrome, NVDA |

Default settings: player White, Easy opponent, essential narration, move confirmation enabled, untimed play.

Exclude Loups-Garous, multiplayer, accounts, databases, continuous autoplay, mobile certification, and tournament clocks. Prepare a reusable game adapter without implementing a general plugin platform.

## 2. Player experience and chess behavior

### Opening and starting

- Render the board, game status, voice controls, and move history immediately.
- Make “Start voice companion” the first interactive control, with clear screen-reader instructions. Support keyboard activation.
- Request microphone access only after activation. Browser permission is an unavoidable browser-controlled step.
- Once connected, announce the player’s color, opponent difficulty, current turn, and example commands.
- If a saved game exists, display its position immediately and offer “Resume game” or “Start a new game” through speech. Keep computer play paused until the choice.
- Provide a brief optional tutorial explaining coordinates, piece names, confirmations, and board queries.

### Spoken capabilities

Support natural variations of these requests, rather than requiring exact phrases:

| Capability | Examples and required behavior |
|---|---|
| Move | “Move e2 to e4”; “Move my knight to f3”; resolve against legal moves |
| Stepwise selection | “Select my knight on g1”; “Where can it move?”; “Move to f3” |
| Clarification | If several pieces qualify, name their origin squares and ask which one |
| Confirmation | Read back piece, origin, destination, capture, and promotion; await yes or cancellation |
| Position overview | “What’s happening?” gives turn, check status, latest move, and material balance |
| Piece locations | “Where are my pawns?”; “Where is their queen?” |
| Square inspection | “What’s on d5?”; include color and piece or say empty |
| Board reading | “Read the board”; “Read rank four”; “Read the e-file” |
| Legal moves | “What can my bishop on c1 do?” |
| History | “What did the computer play?”; “Repeat my last move”; “Read recent moves” |
| Assistance | “Give me a hint”; “Why that move?”; “Choose a move for me” |
| Game controls | New game, resume, pause, undo, resign, choose color and difficulty |
| Audio controls | Repeat, stop speaking, shorter or more detailed answers, speak slower |
| Preferences | Enable or disable move confirmations; change narration level |

Interpret “my” and “opponent” using player color, including when the player chooses Black. Speak coordinates clearly; support phonetic clarification such as “E as in Echo, four.”

“Choose a move for me” proposes one engine-selected move and uses the normal confirmation flow. It never enables continuous autoplay.

### Narration and guidance

- Announce every committed move with color, piece, origin, and destination.
- Include captures, captured-piece square for en passant, castling, promotion, check, and the resulting turn or game ending.
- Example: “Black knight from f6 takes your pawn on e4. Your turn.”
- Keep automatic narration factual and brief. Coaching is available on request.
- Distinguish material advantage from engine evaluation. Never describe either as a guaranteed outcome.
- Generate board facts and event descriptions from application state. The conversational model must consult tools for current game facts.
- Read long board descriptions in interruptible chunks, grouped by color and piece type. Allow “continue” and “repeat.”
- Preserve important move events when interrupted, so “What did I miss?” can recover them.

### Chess rules and controls

Implement ordinary legal chess, including king safety, castling restrictions, en passant, promotion to all four allowed pieces, checkmate, and stalemate.

For this casual version, automatically end draws when chess.js detects repetition, the fifty-move condition, or insufficient material. Document this behavior rather than presenting it as a tournament claim procedure. Do not add draw negotiation with the computer.

- Promotion without a named piece asks which piece before confirming the move.
- Illegal moves leave the position unchanged and receive a useful explanation.
- New game, resignation, undo, and changing player color require confirmation.
- Changing color starts a new game. Changing difficulty applies to the next computer search without resetting the board.
- Undo restores the position before the player’s latest move, removing the computer reply if already played. If the reply is still calculating, cancel it first.
- If Black has not made a first player move, undo reports that there is no player move to undo.
- Pause stops computer scheduling and move execution while allowing position questions.
- Provide Easy, Medium, and Hard Stockfish settings using skill levels 0, 8, and 16, with a one-second search limit. Use a separate stronger analysis setting for hints; do not display invented Elo ratings.

### Accessibility and visual design

Use a restrained, high-contrast layout: board on the left, companion and game status on the right, controls beneath. Stack these sections at narrower widths.

- Use readable text, visible focus, large controls, and text labels alongside icons.
- Support browser zoom, reduced motion, and light/dark high-contrast themes.
- Give squares descriptive accessible names and keyboard navigation.
- Provide an accessible textual position view alongside the visual board.
- Make dialogs keyboard-operable and restore focus when they close.
- Keep captions and event history available.
- Avoid duplicate screen-reader announcements while the companion speaks; provide a screen-reader narration mode using live regions with companion audio muted.
- Retain mouse, keyboard, and a typed command/control fallback for testing and recovery. All use the same game operations as voice.

## 3. Architecture, interfaces, and reliability

### One authoritative game controller

Extract the fork’s game operations into a controller independent of React and OpenAI. The board, keyboard controls, and voice tools must call this controller.

Its state includes the starting position, complete move history, player color, difficulty, game result, selected piece, pause status, and a monotonically increasing revision.

Expose a small reusable `GameAdapter` with:

- `getSnapshot()`
- `getCapabilities()`
- `execute(command)`
- `subscribe(listener)`

The chess implementation supplies chess-specific commands and facts. Other games can later supply their own adapter without replacing the audio connection.

Use typed snapshots, commands, and events. Every event includes game ID, revision, event ID, and factual payload. Represent draws with no winner.

### Voice tools and confirmations

Expose a bounded tool registry covering:

- Position, square, piece, legal-move, history, and evaluation queries.
- Piece selection and move proposals.
- Confirming or cancelling a pending action.
- Hints and one-move assistance.
- Game controls and preferences.

Validate tool arguments at runtime. Never execute generated JavaScript, arbitrary function names, or raw model-provided board replacements.

A pending action stores its ID, game revision, intended action, and spoken description. Confirmations are application state, not just prompt instructions.

- Require a subsequent affirmative user response after proposing the action.
- Do not allow proposal and confirmation in the same backend response.
- Ambiguous replies ask again; silence never confirms.
- Corrections cancel or replace the pending proposal.
- Queries can be answered without losing a pending proposal.
- A changed position, new game, disconnect, or cancellation invalidates pending confirmation.
- Deduplicate tool calls and reject stale results before any mutation.
- Even with confirmations disabled, ambiguous moves and destructive game controls still require clarification or confirmation.

### OpenAI connection

Use the official OpenAI SDK on Nitro and browser-native WebRTC. Do not mix GPT-Live event formats with the older Realtime API.

Implement `POST /api/voice/session`: accept an SDP offer, create the Live session using server-owned configuration, and return its session ID and SDP answer. Keep `OPENAI_API_KEY` exclusively on the server. Follow the [GPT-Live WebRTC connection flow](https://developers.openai.com/api/docs/guides/voice-webrtc).

Configure Responses delegation to `gpt-6-luna` with sequential application tools. Handle completed function calls from nested response events, return matching tool results, then continue the response. Browser code owns execution of local chess tools. Follow the [delegation protocol](https://developers.openai.com/api/docs/guides/live-delegation).

Keep voice and backend model names configurable through server environment variables. Verify account access in the first integration milestone; unavailable access must produce an explicit error, not a silent model substitution.

Use separate prompts:

- **Voice prompt:** concise English conversation, clear coordinates, interruption support, and delegation for game facts/actions.
- **Tool prompt:** consult current state, clarify ambiguity, follow confirmation rules, and announce success only after successful execution.

Send committed game events into the conversation for automatic announcements. Keep an application event log independent of model memory.

### Stockfish integration

Replace the legacy engine wrapper with `stockfish@19.0.1`, deploying only its lite single-threaded JavaScript and matching WASM assets. Serve them locally with correct MIME types. This build avoids cross-origin isolation requirements. Preserve engine licensing and corresponding-source information. [Stockfish.js documentation](https://github.com/nmrugg/stockfish.js)

- Run computation off the main thread.
- Serialize searches and distinguish opponent, hint, and evaluation requests.
- Revalidate every returned move against the current position.
- On cancellation, terminate/recreate the worker to prevent late UCI output from satisfying a newer request.
- Use bounded initialization/search timeouts and expose retry controls.
- An engine failure pauses the game and announces the problem; do not silently substitute random moves.
- Keep explanations grounded in the returned move and verified consequences. Avoid invented tactical claims.

### Persistence and recovery

Save a versioned record containing starting FEN, full move history, player settings, and game result. Reconstruct by replaying history, preserving repetition information; FEN alone is insufficient.

- Validate saves before loading. Handle unavailable storage without breaking play.
- Do not persist raw audio, API secrets, or conversation transcripts.
- Preserve the game if audio permission is denied or the network fails.
- If voice disconnects during voice play, pause computer scheduling, invalidate pending actions, and announce recovery instructions using browser speech synthesis where available.
- After reconnecting, supply a fresh snapshot and briefly recap the position before resuming.
- Support interruption without cancelling an already committed move.
- “Stop speaking” stops narration; “pause game” pauses gameplay; “end voice” closes the voice session.
- A muted microphone requires the accessible keyboard/button control to unmute.
- Close media tracks and the Live session cleanly when ending voice. Avoid automatic connection retry loops.

## 4. Implementation milestones

Complete these sequentially, keeping each milestone runnable.

1. **Import and establish a baseline.** Copy the selected upstream revision into a `chess-companion` subfolder; record its commit and retain notices. Run existing tests and build before changing behavior. Inspect actual code because some upstream architecture documentation is outdated.
2. **Migrate the toolchain.** Migrate to Vite+ using its [migration guide](https://viteplus.dev/guide/migrate), then add the [Nitro Vite integration](https://nitro.build/docs/vite). Retain npm and pin resolved dependencies in the lockfile. Add Tailwind and shadcn to the existing app. Verify frontend rendering, a Nitro health route, tests, and production build.
3. **Prove voice connectivity early.** Implement the session route, microphone activation, audio playback, captions, interruption, and clean shutdown. Verify a real GPT-Live session and one harmless game-state query before building the complete tool set.
4. **Build the game controller.** Unify mutations, add revision tracking, integrate the Stockfish worker, implement both player colors, game controls, save/resume, and correct result handling. Verify via typed controls before connecting voice mutations.
5. **Add conversation gameplay.** Implement queries, move proposals, confirmations, ambiguity handling, promotion, hints, delegated single moves, and automatic event narration. Add failure recovery and stale-call protection.
6. **Complete accessibility and handoff.** Finish keyboard/screen-reader behavior, low-vision styling, manual audio testing, setup documentation, and the Vercel deployment guide. Do not publish.

Provide documented scripts for development, type checking, tests, browser tests, build, and production preview. A new developer must be able to install dependencies, configure the server key, and start the app from Windows PowerShell.

The deployment guide must cover Nitro’s Vercel preset, HTTPS, environment variables, engine assets, and a post-deployment voice smoke test. Include request limits and provider spending controls for a future no-login demo; an origin check alone does not restrict who can consume API credits.

## 5. Validation and acceptance criteria

### Automated checks

Use deterministic fixtures and mocked voice transport for ordinary tests; do not depend on paid API calls in the default test suite.

Cover:

- Legal/illegal moves; ambiguous piece selection; either player color.
- Castling through check, en passant, all promotions, checkmate, stalemate, repetition, and fifty-move draws.
- Propose → confirm, cancel, correction, repeated confirmation, and stale confirmation.
- No move execution from a partial or ambiguous request.
- Undo before and after a computer reply; reset during engine search.
- Duplicate tool events, stale engine results, reconnects, and cancelled hints.
- Board summaries and capture announcements against known positions.
- Save/reload with full history, invalid saves, and unavailable storage.
- Engine loading failures and voice permission/network/API errors.
- Visible controls and voice tools reaching the same controller.
- Server-only secrets and validated session requests.
- Keyboard navigation, dialog focus, accessible labels, and responsive layouts.

Run at least one browser smoke test with the real Stockfish assets.

### Manual audio and accessibility checks

In desktop Chrome:

1. Open the site, locate Start voice with NVDA, and grant permission without mouse navigation.
2. Play at least ten player moves without looking at the screen.
3. Ask about both sides’ pieces, occupied squares, legal moves, material, and the opponent’s last move.
4. Correct a misunderstood move before confirming.
5. Interrupt a board reading and recover missed information.
6. Request a hint and a delegated move; verify only one move is proposed.
7. Use prepared positions to exercise castling, en passant, promotion, checkmate, and draws through speech.
8. Test Black, undo, pause, resume, resignation, and new game.
9. Disconnect during computer thinking and reconnect without losing or duplicating a move.
10. Test headphones and laptop speakers for echo-triggered commands.
11. Verify NVDA mode, keyboard-only fallback, and 200% zoom.
12. Record observed voice latency and actual API errors; do not claim audio verification from mocked tests.

**Done means:** the game runs locally, the board opens immediately, a player can complete the supported chess flow through speech after browser activation, state changes remain legal and confirmed, important game events are audible, tests pass, and the deployment guide is reproducible.

Report any unavailable real-audio or screen-reader testing explicitly. User testing with blind or low-vision players remains necessary before claiming the experience is validated for its intended audience.
