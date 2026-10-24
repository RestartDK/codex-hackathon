# Current visual direction: glacial glass

The user requested the style of [Glacia](https://glacia.framer.ai/) on 25 October 2026. This is the current visual authority for the landing page and supersedes earlier neutral editorial styling notes where they differ. The existing game platform remains unchanged.

## Reference translated into Play by Voice

The live reference was inspected in a browser. The adopted visual cues are a continuous pale ice-blue canvas, abstract folded highlights in the hero, translucent pill navigation, light sans-serif headings paired with selective italic serif lines, pale cyan controls, and softly lit frosted panels. Product content, game identities, and assets remain Play by Voice's own. No Glacia copy, testimonials, performance claims, or artwork were imported.

- Canvas: `#E8F4F9`; text: `#163D50`; supporting text: `#4E6B79`; accent serif: `#317796`; borders: `#D0E2EC`; focus: `#166992`.
- Primary controls: cyan gradient `#D9FBFF` to `#9DDDED`, dark text, white rim, soft blue shadow. Secondary controls: translucent white.
- Type: existing locally bundled Manrope, regular-weight headings; Georgia italic for short accent lines. Hero 60/72px, section headings 48px, mobile 36/44px. Body 16px; narrow-screen lead 14px. This explicit reference direction overrides the skill's default ban on serif accents and backgrounds with gradients.
- Width: 1120px content; 820px navigation; 760px hero companion panel. Section spacing 96px desktop and 64px mobile. Major panel radii 32px, 24px mobile; controls remain rounded pills.
- Hero art: original scalable `ice-flow.svg`, made from softly shaded curved folds. It fades into the continuous page background. No raster upscaling.
- Each game keeps its identity as a light tint: Chess green, Loups-Garous amber, Tic-Tac-Toe violet. Status text remains accurate.
- White chat FAQ stays functional. The real game preview stays inert, sharp HTML with a nearby launch link. Voice examples remain explicitly illustrative.
- Existing liquid gradient orbs, icon-only pause, hover lift, arrow motion, and pressed response remain. Section entrances use IntersectionObserver with an 800ms custom ease. Content remains visible without enhancement; reduced motion skips entrance effects.

## Implementation and verification

`public/landing/glacial-theme.css` loads after the earlier styles and controls this revision. New files and edits are confined to landing assets and documentation. No packages, game source, preferences, microphone behavior, or root routes were changed.

Checked widths 1440, 1024, 768, 390, and 320px without horizontal page overflow. Tested the mobile menu and FAQ suggestions; confirmed the real preview's Marine colors and an empty browser error log. Production build, JavaScript syntax, formatting, and whitespace checks passed. Review was in the desktop browser; physical-device and formal screen-reader testing remain outside this check.
