# Voice Game Companion: chess + Ludo implementation plan

Planning date: 2026-10-24. Status: implemented locally; continuing user and real-audio validation.

This document extends `plan.md`, preserving that original chess plan as history. For this expansion, use this document and the actual current implementation as the source of truth. Paths below are relative to `chess-companion/`, the current application root. Do not rename the app directory during this work.

Implementation checkpoint: the library routes, shared catalog/contracts, Ludo rules/session/UI/voice tools, separate Ludo save, startup resume choice, and regression/integration coverage are implemented. The verification commands currently pass: 104 unit tests, 12 Playwright integration tests, typecheck, lint with three pre-existing chess warnings, and production build. Real GPT-Live audio, NVDA, and blind-player usability still require hands-on testing.

## 1. Outcome and agreed decisions

Deliver one accessible website containing two fully playable games: existing chess and two-player Ludo against the computer. A blind player can discover, choose, learn, play, pause, resume, and switch games using speech after browser audio activation. Establish shared modules that support adding several more games without copying voice, navigation, confirmation, or persistence implementations.

User-approved choices:

| Choice | Decision |
| --- | --- |
| Working product name | Voice Game Companion; retain upstream attribution in credits |
| First page | Game library with Chess and Ludo, separate resume options |
| Ludo participants | One human and one computer; four tokens each |
| Human actions | Explicit spoken roll and explicit token choice, including single-legal-move situations |
| Confirmations | Confirm token moves by default; user can disable this |
| Ludo rules | Six to enter, safe squares, exact finish, bonus for six/capture/finish, third consecutive six ends turn, earlier moves stand; no blocking stacks |
| Corrections | Correct the latest human token choice only before the next roll; retain the original die |
| Correction opportunity | Wait for “continue” before the computer's next turn; “roll” continues a human bonus turn |
| Saves | Separate chess and Ludo saves, retained when switching games |

Technical defaults below are implementation recommendations, not additional user decisions: English, existing React/TypeScript/Vite+/Nitro stack, current configurable voice models, local persistence, desktop Chrome/NVDA as primary verification target. Red human versus opposite Yellow computer; human starts. Retain the recognizable four-corner board with other colors visibly inactive. Announce these defaults in the tutorial. One straightforward computer strategy initially, with on-demand hints and delegated single moves.

Exclude accounts, network multiplayer, four active Ludo players, rankings, payments, cloud saves, other games, and automatic continuous play. Preserve existing chess functionality, including its existing local mode; the new Ludo mode is specifically human versus computer.

## 2. Findings from the current app

- `src/app/App.tsx` owns chess-specific rendering and passes chess callbacks directly into the voice panel.
- `src/components/VoiceCompanion/VoiceCompanion.tsx` combines shared controls with chess onboarding, typed intents, and move narration.
- `src/voice/useVoiceCompanion.ts` manages WebRTC but imports `ChessToolExecutor` and contains chess-specific error copy.
- `server/routes/api/voice/session.post.ts` hardcodes chess prompts and function schemas. Merely adding another board will not create a reusable platform.
- `src/voice/chessTools.ts` owns chess queries and confirmations. Its pending actions include a FEN and callback; cross-game safety needs session identity and revision, not FEN alone.
- `src/hooks/useChessGame.ts` owns existing game behavior. Wrap and extract incrementally instead of rewriting chess rules or Stockfish.
- `src/lib/storage.ts` uses `chess-by-sparsh-save` and `chess-by-sparsh-settings`; saves contain FEN/history/result. Preserve these through migration.
- `src/hooks/useSettings.ts` mixes general accessibility preferences with chess-specific choices.
- `AGENTS.md` describes the original upstream product and several outdated implementation details. The user's approved multi-game scope and working name supersede conflicting old identity/scope instructions. Update operating documentation during implementation.
- This inspected local copy has no usable Git repository metadata. Before future branch/PR work, locate or establish the correct team checkout and compare with current main; do not assume this folder matches remote main. This planning task makes no GitHub changes.

## 3. Player experience

### Library and onboarding

`/` displays a small, high-contrast library with two game cards. Each has a name, short spoken description, Play/New Game, and Resume when a valid unfinished save exists. Show saved status in accessible text. Avoid a decorative landing page before the library.

The shared voice control is first in keyboard order. Before audio permission, provide screen-reader-readable instructions; do not promise automatic speech on page load. Once activated, say briefly what the dashboard contains and ask which game to open. Example: “You have Chess and Ludo. Both can be played against the computer. You have a saved chess game. Say play chess, resume chess, or play Ludo.”

On entering a game, describe its controls, offer resume versus new when appropriate, then offer a skippable tutorial. Explicit “resume chess” already answers the resume question. Replacing an existing unfinished save requires confirmation. Do not run the opponent while the player is deciding or learning the introduction.

Implement onboarding as application state: library selection, resume/new choice, tutorial offer, tutorial playback, ready. Resolve “yes” according to the current explicit question; do not let one “yes” simultaneously select a tutorial and commit a pending move. Persist tutorial preferences separately per game; “teach me” remains available anytime.

Routes: `/`, `/games/chess`, `/games/ludo`. Direct links, refresh, browser Back/Forward, keyboard navigation, and voice navigation use the same lifecycle. A direct game link still offers resume/new and tutorial appropriately. Invalid game IDs return an accessible library/error view.

### Shared shell and game-specific layouts

The shell contains header, Library button, persistent voice controls, captions, status/error region, settings, and accessible dialogs. Each game supplies its own board, action panel, tutorial, status summaries, and history rendering. Do not force Ludo into chess coordinates or a universal board component.

Chess retains its board, history/review, promotion, difficulty, color, Stockfish, and existing controls. Ludo has a conventional board plus numbered-token list, die result, Roll, legal token choices, Confirm/Cancel, Correct Last Move, Continue, and a turn log. Use capabilities to render controls: Ludo correction is distinct from chess undo.

Keep stable token numbers 1–4 for each owner, including after captures. Labels include owner, number, position, safety, and whether the token can move. Use shape/text in addition to color. Inactive corners are labeled inactive and have no actionable tokens.

Examples: “Roll”; “Move token two”; “Where are my tokens?”; “What can move?”; “What did the computer do?”; “Which token is safest?”; “Choose for me”; “Correct my last move”; “Continue”; “Pause”; “Go to the library”; “Resume chess.”

Default narration is short and factual: die, legal choices, committed move, captures, finishes, bonus turns, no-move passes, and winner. Describe positions with relative progress and landmarks; detailed queries may include stable track-space labels. Clearly distinguish base, shared track, private home lane, and finished home. Explain what the next valid action is.

## 4. Shared architecture

Keep one app and one server. Lazy-load game modules; do not load Stockfish while viewing the library or playing Ludo. No microfrontends or externally executable plugins.

Suggested structure:

```text
src/
  app/                         # shell, routes, library
  platform/
    contracts/                 # module/controller/event/action contracts
    sessions/                  # active session and switch lifecycle
    voice/                     # transport, generic dispatcher, captions
    onboarding/                # explicit conversation flow
    confirmations/             # pending action service
    persistence/               # save envelopes and migration
    accessibility/             # narration, focus, shared preferences
    components/                # genuinely shared UI
  games/
    registry.ts                # static metadata + lazy loaders
    chess/                     # adapter, existing engine/UI, tools, tutorial
    ludo/                      # pure rules, board map, AI, UI, tools, tutorial
shared/
  game-catalog.ts              # browser/server-safe IDs and metadata
  voice-contracts/            # trusted schemas and prompt fragments
server/
  routes/api/voice/session.post.ts
```

Game metadata includes ID, title, description, module/save/rules versions and capabilities. Each module owns typed state and commands, `createController`, view, tutorial, query/action definitions, validators, save codec, narration, and capability handlers. Each controller exposes `getSnapshot`, `subscribe`, query/execute operations, pause/resume, and dispose. Unsupported operations return explicit results rather than silently succeeding.

Common snapshots contain game ID, session ID, monotonically increasing revision, lifecycle status, active player, available actions, and a concise accessible summary. Game-specific state remains discriminated/typed; do not make every game carry chess FEN or Ludo dice. Runtime input validation is required at tool/save boundaries; TypeScript assertions do not validate incoming JSON.

Events include unique ID, game ID, session ID, revision, actor and typed payload. Keep an authoritative application event log for repeat/history/missed-event queries. Narration derives from committed facts, not model memory. UI, keyboard, typed commands, voice and computer moves all call the same controller validation path.

One shared confirmation service binds a proposed command to session ID, revision, action ID and originating user interaction. Later confirmation revalidates everything. No proposal-plus-confirmation in one model turn. Switching, restarting, disconnecting, and stale state invalidate proposals. Queries do not accidentally approve or discard pending moves.

### Voice integration and switching

Retain the working provider configuration. Separate WebRTC transport from game execution, and separate universal conversational instructions from module descriptions. Never send secrets to the browser.

Use a small stable platform tool surface for listing/opening games, discovering current capabilities, querying state, submitting a named action with validated arguments, and confirming/cancelling. Discovery returns only the active module's tool/action descriptions. The dispatcher accepts only actions registered for the current game and checks session/revision. Explicit argument schemas live with the module and are checked at runtime; generic dispatch is not permission to execute arbitrary functions or code. Test schema-to-handler coverage.

This design keeps one voice session across game switches without depending on unverified live schema-update features. Do not include the rules and command sets for every game in every turn. After a switch, inject a fresh authoritative context/overview and require subsequent facts to consult the current game. Old conversation facts cannot authorize actions. Measure the extra discovery overhead; cache module descriptions for the current activation only.

Switch sequence: block new mutations, finish or cancel the in-flight operation at a defined boundary, pause the outgoing controller, save, invalidate proposals, cancel workers/timers/searches and queued narration, advance activation generation, activate the target, move focus, then announce its overview. Returning to a saved game waits for resume. Session generation guards every asynchronous result and queued tool call, even when returning to the same game ID. Resolve the navigation tool call once; do not accidentally lose its response by disposing the transport mid-call.

If voice disconnects, preserve the game and pause computer work. Reconnect supplies fresh context, recaps and asks to resume; no silent duplicate action or die roll. Library mode must also remain usable without a game controller. A failed module load returns a recoverable library state.

### Saves and settings

Use one envelope per game: envelope version, game ID, session ID, module schema version, ruleset version, timestamp, lifecycle status and module payload. Persist enough state to restore a rolled but unused die and a correction checkpoint. Reset nonpersistent connection state and confirmations on restore; require a fresh move proposal.

Store global accessibility/audio preferences separately from per-game settings. Chess color/difficulty and Ludo choices must not overwrite one another. Support one in-progress save per game initially, plus the latest finished result if useful.

Migrate legacy chess saves/settings idempotently: validate and reconstruct the chess history, write and read back the new record before marking migration successful, and retain the old keys as recovery data. Do not overwrite a valid newer save on subsequent startup. Handle malformed/unsupported versions, storage denied/quota exceeded, and a corrupt save for one game without disabling the other. If saving fails, state that progress is only in memory; never claim it was saved.

Reject competing writes from another tab using a session owner/read-only conflict state; offer explicit takeover with fresh reload and invalidation. Do not silently allow two tabs to overwrite the same saved game.

## 5. Ludo rules and authoritative state

Ship one documented, versioned house ruleset. Do not claim all Ludo variants use identical rules.

- Two opposite active colors, four individually numbered tokens each. Unused colors never receive a turn.
- A six releases one chosen token onto its starting square; this consumes the roll, not six additional spaces. Alternatively move an already active token six spaces.
- One roll moves one token by its full value. Do not split dice values, move finished tokens, or overshoot home.
- Safe squares: four starts and four marked stars. Private home lanes are safe and owner-exclusive.
- Friendly tokens can share a square but move independently and never block passage. Different owners can coexist on safe squares.
- Landing on an unsafe occupied square captures all opposing tokens there, returning them to base. Passing over tokens does not capture.
- Six, capture or reaching final home grants at most one bonus roll for that move, even if several apply.
- Third consecutive six in the current turn is consumed without movement and ends the turn. Earlier moves remain. Any non-six resets the consecutive-six counter, even when capture/home earns another roll.
- No legal move consumes the die and announces why. Proposed explicit edge policy: a six still grants a bonus roll unless it is the third consecutive six; otherwise pass. Document this edge in the tutorial/rules page.
- Exact roll required to finish; first player to finish all four wins immediately. Check victory before offering bonus rolls. No requirement to capture before entering home.
- Human starts; clearly announce this. Dice are generated by local code, never the language model or AI strategy. Use uniform random values with an injectable deterministic source for tests; production code must not accept a user-supplied die value.

Board mapping is an implementation checkpoint: define one shared 52-square ring plus per-color ordered routes and home lanes. Independently verify both opposite routes, their entry/exit squares, safe cells and exact finish counts with explicit fixtures; UI coordinates, narration, capture comparisons and rules must use the same mapping. Do not infer captures by comparing different players' relative progress numbers.

State includes tokens, active player, turn/roll IDs, consumed dice history, current die, six streak, phase, result, ruleset version, event history and optional correction checkpoint. Separate lifecycle pause status from gameplay phase.

Phases: awaiting-roll, awaiting-token-choice, awaiting-confirmation, awaiting-continue, computer-turn, finished. No legal move and third-six handling are atomic rules transitions. Repeated roll requests cannot generate a second die while a die is unresolved. Repeated move confirmations cannot move twice.

### Correction and pacing

After a committed human move, hold at awaiting-continue before generating any next die. Say “Say continue, or correct that move.” On a human bonus turn, “roll” also continues. Correct restores the pre-move board with the same die and restores captures, finished counts, six streak and event/result state; it does not refund or reroll the die. Record a correction event so history remains understandable. New choice follows normal confirmation.

Once the next roll commits, discard the correction checkpoint. Reload/switch/resume must preserve this boundary. A just-completed human winning move may still be corrected while its checkpoint exists; a new game or leaving that finished session closes that option. Finished computer moves are not reversible through this action.

The computer runs its own turn, including bonus rolls, without asking the human to choose its tokens. Announce each action and remain interruptible/pausable. Schedule steps asynchronously with cancellation guards; never let a long bonus chain block the UI. Hints rank legal moves using the rolled value; before rolling, give general advice only. The AI cannot see or influence future rolls. Start with a transparent heuristic for finishing, captures, safety and progress; describe hints as suggestions, not guaranteed winning moves.

## 6. Open-source reuse decision

Research shortlist (repository descriptions inspected; code correctness and full licensing audit remain implementation work):

- [kenrick/ludo.js](https://github.com/kenrick/ludo.js): JavaScript engine with a LICENSE file identified as MIT and source/test directories. Candidate for rule-engine reuse; sparse README and older build configuration require inspection before adoption.
- [Souma061/Ludo](https://github.com/Souma061/Ludo): React/TypeScript Ludo UI; README describes four-player play and persistence and claims MIT. The inspected root listing did not show a LICENSE file. Treat licensing/asset rights as unresolved until verified, and expect work for two-player AI and accessibility.
- [Dashain's own rules](https://www.dashain.app/ludo/rules): example of a published two-player opposite-color variant. Reference for comparison only, not authority over our agreed house rules or a code-reuse license.

Recommendation: audit the engine candidate first and keep the shared platform independent of the outcome. Do not embed an entire unrelated Ludo website or import its voice/persistence stack. Adopt only if license, exact rules, serializable state, deterministic dice injection and testability fit. Record pinned source revision and notices for copied code/assets. If adaptation is more complex than a small pure TypeScript rules module, implement the agreed rules locally with original board rendering and thorough fixtures. Record the audit and rationale before proceeding; do not market an untested repository as the Ludo equivalent of chess.js.

## 7. Implementation sequence and gates

1. **Baseline and audit.** Read current instructions, establish correct checkout, record actual tests/typecheck/lint/build results, inventory chess behavior and existing saves, audit Ludo candidates. Preserve unrelated changes. Do not rely on historical test counts.
2. **Contracts and chess adapter.** Introduce registry, typed controllers/events, shared confirmations and persistence migration. Wrap current chess hook initially, then extract only what shared lifecycle requires. Preserve chess rules and engine behavior. Gate: current chess flows and migration tests pass.
3. **Library and shared companion.** Add routes, shared settings/voice/onboarding, capability-driven controls, focus handling and reliable switch lifecycle. Use a test-only minimal adapter to exercise generic behavior, not a third visible game. Gate: chess works through library and direct link, without voice regressions; inactive modules do no work.
4. **Ludo core.** Freeze board map and rules fixtures; implement pure transitions, dice source, computer strategy, serialization, correction checkpoints. Gate: rules and deterministic complete-game tests pass independently of UI/provider.
5. **Ludo experience.** Add board/token list, commands, tutorials, factual narration, guidance, confirmations and pacing. Gate: keyboard/typed controls complete a game; then mocked voice exercises the same commands.
6. **Cross-game hardening.** Test switching at difficult boundaries, restoration, stale callbacks, dialogue ambiguity, multi-tab conflict and provider failures. Gate: no cross-game action leakage or save loss; both games pass shared contracts.
7. **Real voice/accessibility and handoff.** Run local app, unit/integration checks and browser journeys, then live audio and screen-reader exercises. Record observed failures and remaining limitations. Update README, operating notes, third-party notices and the next-game checklist. Changes go through a feature branch/PR in the team repo when requested; no secrets or direct merge to main.

## 8. Verification and acceptance

Use mocked transport and seeded dice in ordinary tests. No API key or paid calls required for default tests. Run existing scripts: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` from the app root. Add tests for meaningful state behavior rather than only mirroring component implementation.

| Layer | Required coverage |
| --- | --- |
| Shared controller contract | Lifecycle, invalid command, capabilities, event identity, revisions, cancellation, subscriptions/dispose |
| Chess regression | Both colors, legal/illegal moves, promotion, special moves, results, hints, undo, review, Stockfish failures, legacy save restoration |
| Ludo unit tests | Both routes, entry, all die values, exact finish/overshoot, safe/unsafe captures, stacks, inactive colors, bonus combinations, third six, no legal move, final victory |
| Randomness/AI | Dice consumed once; deterministic injected rolls; only legal AI moves; no future-roll access; bounded scheduled work |
| Correction | Restore same die and captured tokens, result correction, refusal after next roll, persistence of checkpoint, no duplicate reapplication |
| Integration | Save/reload at every phase, migration idempotence, corrupt/unsupported saves, denied storage, per-game settings, competing tabs |
| Voice boundary | Invalid arguments, duplicate/out-of-order calls, confirmation in same turn rejected, ambiguous yes, disconnected calls, stale activation and wrong-game tool names |
| Browser | Library to each game; separate resume; switch while chess thinks/Ludo awaits confirmation; Back/Forward; direct refresh; game completion and restart |
| Accessibility | Keyboard-only flow, focus restore, numbered tokens, non-color labels, accessible errors, captions, reduced motion, zoom and responsive layout |

Run deterministic full Ludo games over multiple seeds with a generous test step bound; report seeds/traces on failure. The bound is a test safeguard, not a product rule or fabricated winner. Independently assert conservation of eight tokens and legal position/turn/die invariants throughout.

Manual scripts must cover library onboarding, declining/requesting tutorials, ten turns in each game with no visual assistance, token queries, capture, home finish, correction, interruption, repeat/missed events, disconnect/reconnect, and switching back to an unchanged saved chess game. Test headphones and speakers and avoid overlapping screen-reader/companion speech. Automated mocks do not prove actual voice or blind-user usability.

Measure voice startup, speech-end to useful response, action completion and game-switch delay in local development measurements, separating acknowledgements from actual results. Use the same scenarios before/after; report sample size, median and p95 only with meaningful samples. Do not invent latency figures or add remote analytics. If provider events cannot reliably identify speech boundaries, document the manual measurement method.

Done means: the website presents exactly two playable games; both support the agreed audio experience and fallback controls; chess saves survive; Ludo obeys the documented rules; switching preserves both games and rejects stale work; required checks pass; live audio/accessibility verification is honestly documented; and adding a third module requires registration plus its own rules/UI/tools/tests rather than changes to voice transport or storage infrastructure.

## 9. Next-game checklist

For each future game, provide metadata/capabilities, typed state/actions, legal-action validation, deterministic test hooks, save version/codec, status and event narration, tutorial, accessible view, game tools, optional computer opponent and contract fixtures. Register a lazy loader and trusted server-safe descriptions. Treat support for multiplayer/private roles as a future explicit extension, not a capability promised by this two-game local platform.

## 10. References and remaining implementation decisions

- Existing `plan.md` and inspected source files listed above.
- OpenAI [delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation): validate integration details against the current API before implementation; preserve the currently working transport flow.
- Open-source candidates and rules comparison linked in section 6.

Remaining technical decisions: reuse audit result/pinned revision, precise board-map fixtures, and verified provider message handling for the stable dispatcher. These do not require choosing a different product scope. Any necessary change to agreed player behavior should be raised explicitly rather than silently substituted.
