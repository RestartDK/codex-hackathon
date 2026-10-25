# Voice system handoff

## Scope and local requirements

This guide describes Loups-Garous in `src/werewolf/App.tsx`. The shared picker and Chess use `src/app/App.tsx`, `src/voice/useChessCompanion.ts`, and `src/voice/useVoiceCompanion.ts`. The shell in `src/shell/AppShell.tsx` mounts one experience at a time; switching to Loups-Garous closes the Chess voice connection.

No API key is needed for Chess board play, typed chess commands, Werewolf rules, deterministic NPC bots, or local guide replies. Chess live voice uses `/api/voice/session` and requires a server-side `OPENAI_API_KEY`, provider model access, network connectivity, and browser microphone permission. Its quick guide can use browser speech synthesis without credentials.

Werewolf browser transcription requires browser support and microphone permission, and may depend on the browser's network speech service. Narration falls back to browser speech synthesis; guide replies and NPC decisions fall back to local rules and bots. Provider TTS, model replies, and the WebRTC fallback require the server key. Text controls remain available when speech is unavailable. Restart the server after changing `.env`; never put credentials in `VITE_` variables.

This game has one player-facing assistant voice. It reads every public NPC line, narration, and guide reply with speaker attribution, while a separate transcription path listens for player commands. NPCs generate text and make decisions, but never receive their own synthetic voice.

```mermaid
flowchart LR
  NPC[NPC or narrator text] --> Feed[Public game feed]
  Guide[Typed guide reply] --> Queue[Ordered story-audio queue]
  Feed --> Queue
  Queue --> BrowserTTS[Browser narration backend]
  PlayerMic[Voice Guide microphone] --> Recognition[Browser speech recognition]
  Recognition --> Router[Voice command router]
  Router --> ActionAPI[/action command]
  Router --> GuideAPI[/assistant]
```

## What controls each voice

| Need                                       | File to change                    | What it controls                                                                                                                          |
| ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Change the one assistant browser voice     | `src/voice/browser-narration.ts`  | `browserVoiceProfiles.assistant` selects one installed browser voice, speed, and pitch for all public lines.                              |
| Replace browser speech with a TTS provider | `src/voice/browser-narration.ts`  | Implement `NarrationBackend` and pass it to `useStoryAudio`. Preserve the `onFinished` callback so the shared queue cannot overlap lines. |
| Change microphone transcription behavior   | `src/voice/speech-recognition.ts` | Persistent browser speech recognition. It restarts after normal recognition ends while Voice Guide is enabled.                            |
| Change the Live fallback                   | `src/voice/live-voice.ts`         | Browser microphone/WebRTC lifecycle when browser transcription fails during a Werewolf game.                                              |
| Change the server Live request             | `server/game/live-voice.ts`       | Server-only provider session creation, model/voice configuration, player-safe context.                                                    |
| Change NPC wording and decisions           | `server/game/agents.ts`           | Text generation only. NPCs never get a direct provider audio session.                                                                     |

## The current setup

### NPCs and narration

NPC lines, narrator events, and typed guide replies pass through `useStoryAudio`. It turns a line into “Camille says: …” or “Narrator: …” before speaking it with the assistant voice. It is an ordered queue: one call to `NarrationBackend.speak()` is active at a time. `onFinished()` starts the next line. Mute and stop clear the pending queue; pause keeps the current line available to resume.

The app uses `createBrowserNarrationBackend()` for every active-game line. The one `assistant` profile is selected once for the session, so a guide answer, a game update, and a villager line always use the same voice without waiting for a network audio download. The server-side OpenAI narration route remains available as an optional adapter, but the active game does not switch between it and browser speech.

The voice-control router in `src/werewolf/App.tsx` handles start-game, question, audio-control, pause/resume, and validated game-command intents. All game-changing language goes through `POST /api/games/:id/action` as `{ command }`; the server parses it with the current state and rejects illegal actions transactionally.

### Always-on Voice Companion

On a first visit, the player taps anywhere once to approve the browser microphone. The companion then starts persistent browser transcription on the landing screen and throughout the match, so “start the game” works by voice before a game exists. Game language is sent to `POST /api/games/:id/action`; questions are sent to `POST /api/games/:id/assistant`; every reply is read by the same assistant narration queue. If embedded browser transcription reports a `network` failure during a game, the app hands off exclusively to the server-backed GPT-Live transcription path. It uses echo cancellation, noise suppression, and automatic gain control; it does not attach or play model audio. GPT-Live transcript fragments are finalized after a short quiet interval and route through the same command handler. There is no microphone button to operate.

The `/api/games/:id/voice` WebRTC endpoint uses `gpt-live-1`, WebRTC microphone media, and a player-scoped context. Its transcript and its captions share the same command router as browser recognition, so every game-changing sentence still passes through the validated action interface.

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
- **Optional Live integration fails:** inspect `server/game/live-voice.ts`, the `/voice` route response, the configured model access, and the browser microphone permission.
- **A voice change exposes secrets:** preserve the player-scoped `guideContext` and keep private feed entries out of `useStoryAudio`.
