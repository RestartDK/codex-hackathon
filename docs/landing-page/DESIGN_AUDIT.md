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

## Current gradient and button refinement

Replaced particles with a continuous liquid color field. Confirmed six liquid canvases and no particle canvases in the page, a fixed outer sphere, and paused gradient state after using the pause control. Desktop and 390px layouts render without overflow. Verified custom button transition styles in the browser; hover rules are gated to fine pointers, disabled send buttons do not move, and reduced-motion styles remove transforms. Production build, JavaScript syntax, formatting, and whitespace checks passed. The earlier particle screenshot comparison describes the superseded experiment.

## Glacia style revision

The current visual authority is GLACIAL_DIRECTION.md. Reviewed the restyled page at 320–1440px, with no horizontal overflow. Confirmed mobile menu and FAQ suggestions still work, the game preview renders its real Marine board, and the browser reported no errors. The original game was not restyled. Muted colors were checked against the light canvas; frosted panels keep text on controlled surfaces. Physical-device and formal assistive-technology testing remain outstanding.

## Reference motion and rendering quality

A second live inspection of Glacia identified its duplicated hover labels, vertical text exchange, cyan internal loop flare, diagonal blurred light streak, and mobile frosted navigation expansion. These observed behaviors now replace the earlier generic hover lift. Navigation and CTA labels have one accessible name, and keyboard focus receives the same visual exchange. The mobile menu is a full-width top panel with centered links and a text-only Menu/Close control; its height reflects Play by Voice's three links. It supports Escape, selection close, and focus return.

The hero's ice folds are now continuously warped by a local WebGL texture shader. The liquid orb uses a high-precision fragment shader rather than the old 192px CPU bitmap. Large orb buffers are at least 512px and scale with display density and element size; circle clipping happens at the browser's native edge. Small companion avatars retain scalable SVG/CSS. Resize observers refresh buffers, and context failure leaves the SVG/CSS fallback. The shared pause control freezes the background, orbs, and ambient button flare; reduced-motion preferences stop ambient motion and skip text reveals.

Headlines reveal characters in reading order, with semantic heading labels retained. Motion was reconstructed locally from the reference's visible behavior and DOM geometry; no Framer bundle or third-party background source was imported.

Verification: compared two running screenshots and observed changed background/orb pixels; compared two paused screenshots and both regions were pixel-identical. Checked 320, 390, 768, 1024, and 1440px without overflow, mobile menu open/close/Escape, keyboard label exchange, FAQ suggestions, 512px orb buffers, and empty browser error logs. Production build, syntax, formatter, and whitespace checks passed. Native reduced-motion preference changes and physical-device performance were not exercised.

## Alignment polish

Game emblems now share the card copy’s 24px left inset. Setup numbers are 30px/36px with no background or border. The FAQ send control uses explicit grid centering for its SVG, including hover; the input border is now 30% opacity. Browser geometry confirmed matching icon/text offsets and zero horizontal/vertical offset between the arrow and button centers at desktop and mobile widths.
