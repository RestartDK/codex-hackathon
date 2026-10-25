# Play by Voice landing page

## Where it lives

The new website is served at **`/landing/`** (explicit entry: `/landing/index.html`). The existing application remains at `/`. All launch actions open its existing game picker, where Chess and Loups-Garous can be selected. Tic-Tac-Toe is coming soon.

This implementation adds files only in `public/landing/` and `docs/landing-page/`. It does not modify existing application files, package definitions, lockfiles, server routes, deployment settings, or product styles. Vite/Nitro copies `public/landing/` into its existing production public output automatically.

## Run and build

Use the repository's existing setup and commands:

```sh
bun install --frozen-lockfile
bun run dev
```

Open the local URL printed by the server, followed by `/landing/`. For production, use the existing `bun run build` and deployment workflow. This change deliberately does not replace the root homepage or adjust hosting configuration.

## Files

- `public/landing/index.html`: all eight sections, a growing game library, chat FAQ, and truthful prototype copy.
- `public/landing/styles.css`: independent design tokens and responsive styles; no application stylesheet imports.
- `public/landing/script.js`: mobile navigation and a local FAQ chat guide; no speech, capture, analytics, or external API calls.
- `public/landing/assets/sky.svg`: original decorative cloud atmosphere.
- `public/landing/assets/chess-preview.webp`: screenshot captured from the actual existing Chess interface; static preview with no session initialization.
- `public/landing/assets/manrope-latin-variable.woff2`: locally served Manrope font, with its OFL license alongside it.
- Existing `/artwork/orb-blue.webp` and chess-piece artwork are reused by URL, without editing or duplicating the originals.
- This documentation directory retains DESIGN.md, the implementation brief, Codex prompt, and the four original visual references. The references are not copied into the shipped public website.

## Content verified against the repository

| Published capability                                            | Source                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| Chess and Loups-Garous available; Tic-Tac-Toe planned           | `GamePicker.tsx`, `navigation.ts`, README                |
| Typed commands and explicit voice start/stop                    | `CompanionDock.tsx`                                      |
| Spoken board descriptions, hints, confirmation, history         | `ChessView.tsx`, voice tools, README                     |
| Narrator volume and optional screen-reader mode                 | `AudioSettings.tsx`                                      |
| Initial action and microphone permission required               | Voice implementation and README                          |
| Audio is sent to OpenAI during live voice; no landing capture   | Voice implementation; landing script has no capture code |
| Saved game and preferences; no raw transcripts in local storage | Repository README and storage implementation             |

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

## Requested visual revision

The showcase now uses a cool blue environment and a grayscale CSS treatment on the original product capture. Actual game screens and original artwork remain unchanged. The library presents three current/planned entries plus a future-facing invitation. FAQ is now a functioning chat interface with suggested and typed questions, local curated answers, bounded in-memory history, an accessible message log, and an explicit fallback for unknown topics. It is not a live AI service.

Rechecked the chat using suggestions, Enter submission, empty submission state, unknown questions, and long-answer scrolling. Revised layouts fit 1440, 768, 390, and 320px without page overflow or clipped chat controls.

## Conversation and footer refinement

The example transcript now sits in open space, with rounded player bubbles and assistant orb markers instead of an enclosing rectangular card. The final invitation and footer are combined into a spacious off-white composition inspired by the supplied reference: centered headline, pill launch action, real underlined links, and a large faded decorative wordmark. No social or App Store destinations are invented.

## Platform visual alignment

The entire landing now uses the platform's Arial/Helvetica type, white/black foundation, exact blue and green companion artwork, original grainy game backgrounds, geometric game marks, large rounded surfaces, and shared focus/easing values. The existing platform files remain untouched. A separate `platform-theme.css` owns the alignment; see [PLATFORM_STYLE.md](PLATFORM_STYLE.md) for exact source mappings. This supersedes the earlier cool/grayscale showcase treatment and custom pastel orb. The original screenshot colors are restored.

## Quality, controls, and motion refinement

The current landing uses the exact `.pill-button` and `.pill-button.primary` values from the app, a white FAQ, lighter blue scenic backgrounds, greatly reduced fine grain, and scalable animated SVG orbs. The showcase is now an inert HTML capture of the real Chess interface rather than an enlarged screenshot. Its Marine board theme and restrained glow are landing-only preview styles. Original product sources and saved preferences remain unchanged. The earlier screenshot remains a no-JavaScript fallback.

New assets: `orb-blue.svg`, `orb-green.svg`, `chess-preview.html`, and `product-preview.css`. Motion includes pause/resume, viewport visibility gating, and reduced-motion support. See PLATFORM_STYLE.md for exact final mappings, source provenance, and snapshot refresh guidance.

## Figma color and icon correction

Reviewed the actual Figma home and audio-settings frames. Global green actions were a Chess-color leak. The landing now uses neutral primary actions and blue-gray accents; each game retains its own palette. Pointed game symbols and thin Unicode glyphs are replaced by rounded SVG icons. See FIGMA_REVIEW.md for source references, exact color roles, and the deliberate icon changes requested by the user. Original product files remain untouched.

Latest visual and interaction review: [DESIGN_AUDIT.md](DESIGN_AUDIT.md).

Current design: [GLACIAL_DIRECTION.md](GLACIAL_DIRECTION.md), based on the user’s latest Glacia reference.

Latest FAQ: question message bubbles with plus/close disclosures and white Play by Voice reply bubbles. The old typed chatbot was replaced. The footer wordmark is white. See GLACIAL_DIRECTION.md.
