# Local baseline

Verified 25 October 2026 on macOS, branch `chore/local-baseline`, starting from `1b2715f`. No commits or deployments were made.

## Setup

- Node `26.10.0` satisfies `package.json`; `.node-version` pins `26.12.1` for environments that manage Node versions.
- Bun `1.4.4` installed under `~/.bun` with `npm install --global --prefix "$HOME/.bun" bun@1.4.4`.
- Dependencies installed with `~/.bun/bin/bun install --frozen-lockfile`. No dependency or lockfile upgrades.
- `node scripts/copy-stockfish.mjs` prepared the pinned Stockfish worker and WASM. Dev and build also run this preparation automatically. These generated engine assets remain ignored by Git.
- Existing `.env.example` retained and expanded with NPC/TTS model defaults. No `.env` or credentials were created. Local rules, bots, and guide fallbacks were used.

Run `~/.bun/bin/bun run dev --host 127.0.0.1`. In this session, port 3000 was occupied and left untouched; Vite+ selected **http://127.0.0.1:3001/**. Use the URL printed on future starts. Add `$HOME/.bun/bin` to your shell's `PATH` to use `bun` directly.

The sandboxed dev launch failed with `EMFILE` while creating watchers; the same command ran successfully outside the sandbox. Local HTTP smoke requests also required sandbox approval. Neither required a project configuration change.

## Changes

- Fixed Stockfish effect ownership so React StrictMode cleanup is followed by fresh initialization. Cancelled initialization can no longer overwrite a replacement engine's state. Added a regression test.
- Corrected Werewolf availability in Help, landing content, and landing documentation. Tic-Tac-Toe remains planned.
- Corrected the Werewolf voice source path to `src/werewolf/App.tsx`, documented the separate Chess voice implementation, and clarified credential requirements and local fallbacks.

## Checks

| Command                               | Result                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                   | Passed. The historical Vite/Nitro plugin type mismatch did not reproduce.                                            |
| `bun run lint`                        | Passed with existing warnings about React hooks/refs, unawaited promises, string coercion, and recursive parameters. |
| `bun run test`                        | Passed: 44 tests in 10 files.                                                                                        |
| `bun run build`                       | Passed: browser assets and Nitro Node server generated.                                                              |
| `bun run check`                       | Failed at formatting in six untouched files listed below.                                                            |
| `bun run smoke http://127.0.0.1:3001` | Passed against dev.                                                                                                  |
| `bun run smoke http://127.0.0.1:3002` | Passed against a temporary production server, then stopped.                                                          |
| `git diff --check`                    | Passed.                                                                                                              |

The remaining formatter findings are in `docs/landing-page/CODEX_PROMPT.md`, `DESIGN_AUDIT.md`, `FIGMA_REVIEW.md`, `IMPLEMENTATION_BRIEF.md`, `PLATFORM_STYLE.md`, and `public/landing/assets/liquid-glass-preset.json`. They were left unchanged to keep this baseline scoped. Formatting was applied to the files edited here. No checks or error overlays were disabled.

## Smoke verification

In Arc, verified the game picker, Chess, Audio Settings, Help, Werewolf setup, and `/landing/` open. Chess loaded without the prior engine failure, accepted `e2–e4`, and Stockfish replied `e7–e6`. Created a normal eight-player Werewolf village named Baseline, reached its prologue, continued to the first night, and used “Let the pack decide” to advance to daytime NPC discussion. Landing now marks Chess and Werewolf available and Tic-Tac-Toe coming soon.

The existing HTTP smoke script additionally verified frontend modules, Stockfish asset responses, health/catalog routes, Werewolf quick-test creation, session authorization, local guide responses, invalid-action rejection, retry receipts, night actions, discussion, voting, and rejection of foreign origins by the Chess voice route.

## Remaining limits and manual steps

- Cancelling Werewolf narration requests can produce a development-only `aborted` overlay from the Nitro/Vite request bridge. Escape dismisses it; local play continued afterward. The dependency was not patched or upgraded, and the overlay remains enabled.
- Browser microphone access was declined during the smoke test. Microphone recognition, real audio quality, provider TTS, and live WebRTC voice were not verified. Browser narration was not audited by listening.
- For provider features, copy `.env.example` to `.env`, set `OPENAI_API_KEY` server-side, ensure access to the configured models, and restart dev. Grant microphone access manually when ready to test voice. Keep credentials out of `VITE_` variables. See [voice-system.md](voice-system.md) for fallbacks and requirements.
- Werewolf sessions remain in memory and disappear on server restart. Chess smoke-test moves were saved in this browser's local storage for the port 3001 origin.
- This was a functional smoke test, not a formal accessibility or screen-reader audit.
