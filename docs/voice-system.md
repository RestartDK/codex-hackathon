# Voice system handoff

## Scope and local requirements

This guide describes Loups-Garous in `src/werewolf/App.tsx`. The shared picker and Chess use `src/app/App.tsx`, `src/voice/useChessCompanion.ts`, and `src/voice/useVoiceCompanion.ts`. The shell in `src/shell/AppShell.tsx` mounts one experience at a time; switching to Loups-Garous closes the Chess voice connection.

No API key is needed for Chess board play, typed chess commands, Werewolf rules, deterministic NPC bots, or local guide replies. Live voice in every game uses `/api/voice/session` and requires a server-side `OPENAI_API_KEY`, provider model access, network connectivity, and browser microphone permission.

Loups-Garous narration uses browser speech synthesis, and its guide and NPCs fall back to local rules and bots. Live voice requires the server key. Typed and visual controls remain available when speech or the provider is unavailable. Restart the server after changing `.env`; never put credentials in `VITE_` variables.

This game has one player-facing assistant voice. It reads every public NPC line, narration, and guide reply with speaker attribution. A separate on-demand live companion handles player commands. NPCs generate text and make decisions, but never receive their own synthetic voice.

```mermaid
flowchart LR
  NPC[NPC or narrator text] --> Feed[Public game feed]
  Guide[Typed guide reply] --> Queue[Ordered story-audio queue]
  Feed --> Queue
  Queue --> BrowserTTS[Browser narration backend]
  PlayerMic[Player microphone] --> LiveCompanion[/api/voice/session]
  LiveCompanion --> Router[submit_player_command]
  Router --> ActionAPI[/action command]
  Router --> GuideAPI[/assistant]
```

## What controls each voice

| Need                                       | File to change                   | What it controls                                                                                                                          |
| ------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Change the one assistant browser voice     | `src/voice/browser-narration.ts` | `browserVoiceProfiles.assistant` selects one installed browser voice, speed, and pitch for all public lines.                              |
| Replace browser speech with a TTS provider | `src/voice/browser-narration.ts` | Implement `NarrationBackend` and pass it to `useStoryAudio`. Preserve the `onFinished` callback so the shared queue cannot overlap lines. |
| Change the live voice connection           | `src/voice/useVoiceCompanion.ts` | On-demand WebRTC companion shared by every game. It starts from the orb, keeps one connection, and never retries a failed setup.          |
| Change the server voice request            | `server/voice/library-voice.ts`  | Provider session, tool list, and instructions for the library games, including Loups-Garous.                                              |
| Change the Loups-Garous command router     | `src/werewolf/App.tsx`           | `submit_player_command` forwards each transcript to the validated command handler.                                                        |
| Change NPC wording and decisions           | `server/game/agents.ts`          | Text generation only. NPCs never get a direct provider audio session.                                                                     |

## The current setup

### NPCs and narration

NPC lines, narrator events, and typed guide replies pass through `useStoryAudio`. It turns a line into “Camille says: …” or “Narrator: …” before speaking it with the assistant voice. It is an ordered queue: one call to `NarrationBackend.speak()` is active at a time. `onFinished()` starts the next line. Mute and stop clear the pending queue; pause keeps the current line available to resume.

All active-game lines use `createRoleAwareNarrationBackend()`: free local speech first, then authenticated audio if the local engine fails or silently never starts. One failed local engine is remembered for this game, avoiding an eight-second gap on every subsequent scene. Repeats reuse a bounded memory-only audio cache. `flowNarration.ts` supplies current-screen acknowledgements, legal choices, vote counts and endings from the player-scoped view. Fresh feed events and that screen guidance form one ordered scene (split below the narration route's text limit), reducing generation requests and competing confirmations.

### Private role reveal

The role screen has a separate, explicit delivery lifecycle in `src/werewolf/roleReveal.ts`. Both pointer and voice navigation trigger the same effect after the screen renders and the player-scoped `game.me.role` is available. A connecting voice session gets a bounded readiness wait; an unavailable connection does not prevent the narrator from providing the explanation. Completed delivery is retained across card flips and live reconnection. Only a new game or an explicit repeat creates another delivery.

`server/game/role-guidance.ts` supplies authored explanations for all six roles and phase-specific voice instructions. It accepts `GameView`, never the raw game or another player's private role. It describes potion availability, authorized packmates and lovers using only `me`. Role help remains in Help and supports “Repeat my role”, “Explain my abilities”, and “What do I do next?” during play.

Role guidance uses the same local-first resilient backend. If local speech fails or does not start within eight seconds, it tries the authenticated narration route and plays audio through an `HTMLAudioElement`. Live output is temporarily suppressed while authored game guidance owns the speaker; the command session remains connected. Tool outputs still receive the required backend continuation, but routing instructions prohibit a duplicate spoken acknowledgement. See the [official OpenAI delegation contract](https://developers.openai.com/api/docs/guides/live-delegation).

A caption, successful HTTP response, or speech request does not complete a reveal. `onPlaybackStarted` and `onPlaybackFinished` distinguish completed, interrupted, and failed playback. The ready action stays locked until audio finishes, while an explicit “skip role explanation” can advance immediately. Stop, cancellation, failed synthesis, blocked playback and silent startup leave an accessible retry message. Queue generations reject stale callbacks, and canceled browser startup timers cannot cancel a later role announcement.

Verification on 2026-10-26 covered every human role with controlled engine assignments and actual recorded Chrome audio output. Villager, Werewolf, Seer, Hunter, Cupid, and Witch all reached audio completion before the ready action unlocked. The Hunter test interrupted playback, verified the locked state and retry message, then completed “Repeat my role”. A full local transport fixture exercised setup, confirmation, all character introductions, Witch reveal and “What do I do next?”, including delayed game data and voice readiness. Its audio played through a real MediaStream and HTML audio element; recorded waveforms were nonzero for each scene. Commands in this fixture used the UI and typed command router, rather than live microphone recognition. A real provider Witch announcement was also played before further paid voice calls were stopped; the remaining runs used local speech fixtures. Automated regressions separately cover privacy, potion legality, delayed delivery, stale cleanup, failure, explicit skip, reconnect deduplication and cached replay.

The voice-control router in `src/werewolf/App.tsx` handles start-game, question, audio-control, pause/resume, and validated game-command intents. All game-changing language goes through `POST /api/games/:id/action` as `{ command }`; the server parses it with the current state and rejects illegal actions transactionally.

### On-demand Voice Companion

Press the voice orb to connect. Loups-Garous uses the same `/api/voice/session` WebRTC companion as every other game. The live model calls `submit_player_command` with the player's words. The app validates and applies the command through `POST /api/games/:id/action`, answers guide questions through `POST /api/games/:id/assistant`, and reads replies with the narration queue. Live audio owns setup and character introductions; it is suppressed while authored game narration plays. There is no browser speech-recognition path and no automatic reconnect. A failed setup shows its error and waits for the player.

### Flow and action recovery

Passive-role nights resolve NPC actions automatically. Active human roles retain their choice, including passing. Eliminated spectators advance NPC-only rounds after narration and acknowledgement screens, unless paused. The server validates the Werewolf through the same night-action engine as other roles; NPC Witch actions wait for the actual pack target and run before dawn. Potion availability and the victim are disclosed only to the entitled Witch. Eliminated roles are public, matching the UI and implemented rules.

`ActionDelivery` retains a request ID after a lost action response. “Retry last move” reuses the server receipt rather than executing twice; different choices are blocked while the result is uncertain. Replies arriving after navigation to another game are ignored. Validation failures are spoken for pointer and voice actions alike. Narration failures leave a visible alert, screen-reader guidance and retry controls. Help retains the full private role explanation; supporting reveal controls live in Help and Audio Settings so the card matches Figma.

The server sends only `guideContext(game, actorId)`, which is already filtered to the player. Never replace it with the raw `Game` object.

## Config

```sh
OPENAI_VOICE_MODEL=gpt-live-1
OPENAI_DELEGATION_MODEL=gpt-6-luna
OPENAI_VOICE=marin
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
OPENAI_NPC_MODEL=gpt-6-luna
```

- `OPENAI_VOICE_MODEL` and `OPENAI_VOICE` configure the optional Live endpoint only.
- `OPENAI_DELEGATION_MODEL` handles the guide's reasoning.
- `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE` configure the optional server-side narration adapter. The active game uses the browser narrator for one consistent low-latency voice.
- `OPENAI_NPC_MODEL` generates NPC **text** only.
- Browser narration uses the one `browserVoiceProfiles.assistant` profile, not these environment values.

## Adding a neural TTS backend for the assistant

Keep `useStoryAudio` and replace only the narration backend. The backend needs four operations:

```ts
interface NarrationBackend {
  isSupported(): boolean;
  speak(request: NarrationRequest): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}
```

The critical rule is to call `request.onFinished()` exactly once, after the output audio ends or fails. This lets the queue advance safely. A provider-backed implementation should request audio from a server route, play the returned blob or stream in the browser, and cancel its pending request and active audio when `cancel()` runs. Do not put a provider credential in `src/`.

For a provider-specific voice ID, add it to the one `assistant` profile. The queue and game engine do not need to change.

## Fast troubleshooting

Loups-Garous input recovery: a connected but muted microphone is visible, and the orb offers Unmute microphone instead of only toggling command pause. Capture interruption/removal and command-channel closure have explicit recovery guidance. Late playback callbacks cannot resurrect an old connection or overwrite a newer mute choice. Speech fragments use the documented Live timeline (there is no completed-turn/item-ID contract), with fresh grouping identities after reconnect. Only validated tool commands change gameplay; a 12-second missing-command warning never guesses a move from partial text. Queued commands select the latest screen handler after the previous transition commits; intentional repeats are not discarded by a text cooldown. The setup transcript fast path deduplicates its tool counterpart separately.

The input regressions use simulated media tracks, data channels and a mocked session endpoint; unexpected network calls fail. No paid voice requests are needed to run these tests. They do not establish live microphone recognition quality or provider latency.

- **Every NPC sounds identical:** expected. The assistant identifies each speaker in words and deliberately uses one voice identity for every public line.
- **Two speakers overlap:** check that a custom backend calls `onFinished()` only after audio playback ends, and that `cancel()` stops its active audio.
- **Guide does not answer a spoken question:** check `src/werewolf/App.tsx` routing and the `/assistant` route response. The Voice Guide speaks guide replies with the same narration queue.
- **Optional Live integration fails:** inspect `server/voice/library-voice.ts`, the `/api/voice/session` response, the configured model access, and the browser microphone permission.
- **A voice change exposes secrets:** preserve the player-scoped `guideContext` and keep private feed entries out of `useStoryAudio`.
