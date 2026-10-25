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

The app uses `createBrowserNarrationBackend()` for every active-game line. The one `assistant` profile is selected once for the session, so a guide answer, a game update, and a villager line always use the same voice without waiting for a network audio download. The server-side OpenAI narration route remains available as an optional adapter, but the active game does not switch between it and browser speech.

The voice-control router in `src/werewolf/App.tsx` handles start-game, question, audio-control, pause/resume, and validated game-command intents. All game-changing language goes through `POST /api/games/:id/action` as `{ command }`; the server parses it with the current state and rejects illegal actions transactionally.

### On-demand Voice Companion

Press the voice orb to connect. Loups-Garous uses the same `/api/voice/session` WebRTC companion as every other game. The live model calls `submit_player_command` with the player's words. The app validates and applies the command through `POST /api/games/:id/action`, answers guide questions through `POST /api/games/:id/assistant`, and reads every reply with the assistant narration queue. The companion's own audio stays muted so it cannot overlap that narrator. There is no browser speech-recognition path and no automatic reconnect. A failed setup shows its error and waits for the player.

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

- **Every NPC sounds identical:** expected. The assistant identifies each speaker in words and deliberately uses one voice identity for every public line.
- **Two speakers overlap:** check that a custom backend calls `onFinished()` only after audio playback ends, and that `cancel()` stops its active audio.
- **Guide does not answer a spoken question:** check `src/werewolf/App.tsx` routing and the `/assistant` route response. The Voice Guide speaks guide replies with the same narration queue.
- **Optional Live integration fails:** inspect `server/voice/library-voice.ts`, the `/api/voice/session` response, the configured model access, and the browser microphone permission.
- **A voice change exposes secrets:** preserve the player-scoped `guideContext` and keep private feed entries out of `useStoryAudio`.
