# Play by Voice landing page

## Where it lives

The new website is served at **`/landing/`** (explicit entry: `/landing/index.html`). The existing application remains at `/`. All launch actions open its existing game picker, where Chess can be selected. Loups-Garous is marked coming soon.

This implementation adds files only in `public/landing/` and `docs/landing-page/`. It does not modify existing application files, package definitions, lockfiles, server routes, deployment settings, or product styles. Vite/Nitro copies `public/landing/` into its existing production public output automatically.

## Run and build

Use the repository's existing setup and commands:

```sh
bun install --frozen-lockfile
bun run dev
```

Open the local URL printed by the server, followed by `/landing/`. For production, use the existing `bun run build` and deployment workflow. This change deliberately does not replace the root homepage or adjust hosting configuration.

## Files

- `public/landing/index.html`: all eight sections, semantic FAQ, truthful prototype copy.
- `public/landing/styles.css`: independent design tokens and responsive styles; no application stylesheet imports.
- `public/landing/script.js`: mobile navigation disclosure only; no speech, capture, analytics, or external API calls.
- `public/landing/assets/sky.svg`: original decorative cloud atmosphere.
- `public/landing/assets/chess-preview.webp`: screenshot captured from the actual existing Chess interface; static preview with no session initialization.
- `public/landing/assets/manrope-latin-variable.woff2`: locally served Manrope font, with its OFL license alongside it.
- Existing `/artwork/orb-blue.webp` and chess-piece artwork are reused by URL, without editing or duplicating the originals.
- This documentation directory retains DESIGN.md, the implementation brief, Codex prompt, and the four original visual references. The references are not copied into the shipped public website.

## Content verified against the repository

| Published capability | Source |
| --- | --- |
| Chess available; Loups-Garous and Tic-Tac-Toe planned | `GamePicker.tsx`, `navigation.ts`, README |
| Typed commands and explicit voice start/stop | `CompanionDock.tsx` |
| Spoken board descriptions, hints, confirmation, history | `ChessView.tsx`, voice tools, README |
| Narrator volume and optional screen-reader mode | `AudioSettings.tsx` |
| Initial action and microphone permission required | Voice implementation and README |
| Audio is sent to OpenAI during live voice; no landing capture | Voice implementation; landing script has no capture code |
| Saved game and preferences; no raw transcripts in local storage | Repository README and storage implementation |

The illustrated transcript is labeled as an example. Full accessibility conformance, hands-free first launch, production voice availability, data-retention guarantees, and unimplemented game modes are not claimed.

## Verification

- Repository typecheck passed.
- Repository lint completed with no errors and three warnings in existing chess source files, which were not edited.
- Repository production build passed, including the new static landing files.
- Landing script syntax and formatting checked.
- Browser layouts captured and inspected at 1440×1000, 1024×768, 768×1024, 390×844, and 320×740; no document overflow or clipped key content found.
- Mobile menu toggle, Escape/focus return, link selection/close, FAQ Enter/Space operation, and launch into the existing game picker checked.
- Actual Chess screen opened and captured without microphone access. Live voice and physical-device audio were not tested; no server key was configured for this work.
- The initial browser session displayed an engine-load error; reloading and reopening Chess produced the normal screen used for the preview. The landing change does not alter the existing engine implementation.
- Landing text and assets remain present without animation; reduced-motion and forced-color styles are supplied. A formal accessibility audit, screen-reader session, and physical-device review have not been performed.

## Handoff documents

[DESIGN.md](DESIGN.md) contains the original visual specification. [IMPLEMENTATION_BRIEF.md](IMPLEMENTATION_BRIEF.md) and [CODEX_PROMPT.md](CODEX_PROMPT.md) were prepared before the repository became available; their initial “no repository” statements record that earlier handoff context. This README describes the completed repository implementation. Where route guidance differs, `/landing/` is intentional to honor the instruction to leave existing files untouched.
