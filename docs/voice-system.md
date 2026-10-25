# Voice system handoff

This game has one player-facing assistant voice. It reads every public NPC line and narration with speaker attribution, listens for the player's commands, and can open a full-duplex private guide conversation. NPCs generate text and make decisions, but never receive their own synthetic voice.

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
| Change the optional Live integration       | `src/voice/live-voice.ts`         | Browser microphone/WebRTC lifecycle for a future dedicated Live surface.                                                                  |
| Change the server Live request             | `server/game/live-voice.ts`       | Server-only provider session creation, model/voice configuration, player-safe context.                                                    |
| Change NPC wording and decisions           | `server/game/agents.ts`           | Text generation only. NPCs never get a direct provider audio session.                                                                     |

## The current setup

### NPCs and narration

NPC lines, narrator events, and typed guide replies pass through `useStoryAudio`. It turns a line into “Camille says: …” or “Narrator: …” before speaking it with the assistant voice. It is an ordered queue: one call to `NarrationBackend.speak()` is active at a time. `onFinished()` starts the next line. Mute and stop clear the pending queue; pause keeps the current line available to resume.

The app prefers `createOpenAINarrationBackend()` for an active game session. It sends text to the authenticated `/api/games/:id/narration` route, which keeps the API key on the server and asks OpenAI TTS for a smooth `marin` narration. If credentials or TTS are unavailable, it falls back to `createBrowserNarrationBackend()` and `window.speechSynthesis`. The one `assistant` profile supplies a compatible browser-voice fallback.

The voice-control router in `src/App.tsx` handles start-game, question, audio-control, pause/resume, and validated game-command intents. All game-changing language goes through `POST /api/games/:id/action` as `{ command }`; the server parses it with the current state and rejects illegal actions transactionally.

### Always-on Voice Companion

On a first visit, the player taps anywhere once to approve the browser microphone. The companion then starts persistent browser transcription on the landing screen and throughout the match, so “start the game” works by voice before a game exists. Game language is sent to `POST /api/games/:id/action`; questions are sent to `POST /api/games/:id/assistant`; every reply is read by the same assistant narration queue. If embedded browser transcription reports a `network` failure during a game, the app switches once to the server-backed GPT-Live guide instead of retrying forever. GPT-Live sends input transcript fragments over its data channel without a final-turn event, so the frontend routes a command after a brief quiet interval. There is no microphone button to operate.

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
- `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE` configure server-side narration. The browser uses its own voice only as a fallback.
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
- **Guide does not answer a spoken question:** check `src/App.tsx` routing and the `/assistant` route response. The Voice Guide speaks guide replies with the same narration queue.
- **Optional Live integration fails:** inspect `server/game/live-voice.ts`, the `/voice` route response, the configured model access, and the browser microphone permission.
- **A voice change exposes secrets:** preserve the player-scoped `guideContext` and keep private feed entries out of `useStoryAudio`.
