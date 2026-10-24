# Play by Voice landing page — design audit

Reviewed 25 October 2026. Scope: `/landing/`, with the platform home and Figma home/audio-settings screens as design references.

## Assessment

The current page is visually coherent: a neutral white/black shell, blue-gray atmospheric surfaces, rounded controls, and individual green, amber, and violet game identities. Green is confined to Chess contexts. The white FAQ, soft icon strokes, fine grain, and editorial footer fit this direction. The redesigned turn example is easier to scan than the previous long alternating transcript.

## Findings addressed

| Finding | Change | Verification |
| --- | --- | --- |
| Orb motion felt like object movement | Fixed outer silhouette with two slow internal gradient currents | Computed inner transforms changed while the exterior transform stayed `none` |
| Pause label occupied too much visual space | 44px icon-only pause/play button with action label and tooltip | Pause froze the inner transform across observations; resume restored motion |
| Example turn was too long and loosely spaced | Ordered three-stage turn, compact confirmation, one Chess orb | Desktop and mobile screenshots reviewed |
| Skip link did not explicitly focus its destination | Focusable main landmark | Enter on Skip to content focused `main` |
| Anchor spacing was applied twice | Removed extra section scroll margin | FAQ arrived at 104px beneath a navbar ending at 96px |
| FAQ input boundary was faint | Stronger neutral border `#87939D` | 3.14:1 against white |
| Static showcase lacked a nearby direct launch action | Added “Open the game” link and static-preview label | Link points to the existing game at `/` |
| Ambient motion could consume work out of view | Intersection-based and document-visibility pausing; observer cleanup for pruned FAQ messages | Source reviewed; visible orb behavior checked |

## Checks completed

- No horizontal page overflow at 1440, 1024, 768, 390, or 320 CSS pixels.
- Desktop/full-page and mobile screenshots reviewed for hierarchy, wrapping, spacing, colors, and game-card identity.
- Mobile menu opens, closes on selection, and Escape returns focus to its button.
- FAQ suggested questions, Enter submission, empty-send disabling, and honest unknown-topic response work.
- Normal text `#111111` on white: 18.88:1. Muted `#6B7280`: 4.83:1. These are sampled solid-color pairs, not a claim that every gradient pixel was audited.
- Reduced-motion and forced-color styles reviewed in source. Reduced motion removes ambient effects and hides the unnecessary pause control.
- Inert HTML product preview rendered its Marine board palette correctly; the original game source and preferences were preserved.
- Browser error log was empty during the final review.
- Typecheck, production build, JavaScript syntax, formatting, and whitespace checks passed. Lint returned zero errors and three existing warnings in the original chess engine files.

## Remaining limits

This was a visual and keyboard review in the desktop browser at responsive viewport sizes. It was not a formal accessibility certification, native screen-reader session, physical-phone test, low-power animation benchmark, or live-voice test. The small-screen product showcase remains a labeled visual preview with a direct link to the full game. Planned games remain clearly marked Coming soon.

## Follow-up particle check

Added visible wave-like particle motion inside the landing orbs. Compared screenshots of the same orb crop: paused frames were pixel-identical; the resumed frame changed. Checked the updated page at 390px without overflow and an empty browser error log. Verified the final sky boundary reaches white with no color jump. Reduced-motion behavior remains implemented in source, without a native preference-emulation test.
