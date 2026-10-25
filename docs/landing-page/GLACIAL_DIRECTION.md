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

## Reference motion and rendering quality

A second live inspection of Glacia identified its duplicated hover labels, vertical text exchange, cyan internal loop flare, diagonal blurred light streak, and mobile frosted navigation expansion. These observed behaviors now replace the earlier generic hover lift. Navigation and CTA labels have one accessible name, and keyboard focus receives the same visual exchange. The mobile menu is a full-width top panel with centered links and a text-only Menu/Close control; its height reflects Play by Voice's three links. It supports Escape, selection close, and focus return.

The hero's ice folds are now continuously warped by a local WebGL texture shader. The liquid orb uses a high-precision fragment shader rather than the old 192px CPU bitmap. Large orb buffers are at least 512px and scale with display density and element size; circle clipping happens at the browser's native edge. Small companion avatars retain scalable SVG/CSS. Resize observers refresh buffers, and context failure leaves the SVG/CSS fallback. The shared pause control freezes the background, orbs, and ambient button flare; reduced-motion preferences stop ambient motion and skip text reveals.

Headlines reveal characters in reading order, with semantic heading labels retained. Motion was reconstructed locally from the reference's visible behavior and DOM geometry; no Framer bundle or third-party background source was imported.

Verification: compared two running screenshots and observed changed background/orb pixels; compared two paused screenshots and both regions were pixel-identical. Checked 320, 390, 768, 1024, and 1440px without overflow, mobile menu open/close/Escape, keyboard label exchange, FAQ suggestions, 512px orb buffers, and empty browser error logs. Production build, syntax, formatter, and whitespace checks passed. Native reduced-motion preference changes and physical-device performance were not exercised.

## Alignment polish

Game emblems now share the card copy’s 24px left inset. Setup numbers are 30px/36px with no background or border. The FAQ send control uses explicit grid centering for its SVG, including hover; the input border is now 30% opacity. Browser geometry confirmed matching icon/text offsets and zero horizontal/vertical offset between the arrow and button centers at desktop and mobile widths.

## Hover, menu and hero motion polish

Removed the inherited dark CTA hover border by explicitly retaining the icy rim and using a lighter cyan shadow. Mobile menu opening and closing now animate measured panel heights over 650ms with interruptible easing, rather than hiding the contents immediately. Closing links become inert and hidden from assistive technology during the transition; final layout uses the measured closed height to avoid a finishing jump. Escape, focus return, and breakpoint changes remain supported.

The hero shader clock increased from 0.12 to 0.4, with wider fold displacement and a slow lateral drift. Orb speed remains unchanged. Reduced-motion and pause behavior remain intact. Browser checks confirmed intermediate panel heights in both directions, the settled closed height, Escape, and desktop navigation after resizing. The browser error log was empty. Production build, JavaScript syntax, formatting and whitespace checks passed.

## White footer lettering and message FAQ

The large decorative PLAY BY VOICE lettering is pure white; its existing fade and blue footer background remain. The user clarified that white applies to the letters. FAQ now uses right-aligned question bubbles with circular plus controls and left-aligned white Play by Voice reply bubbles, replacing the text composer and chatbot transcript. The selected question becomes dark ice blue and its plus rotates to a close mark. Eight verified answers live in semantic HTML, with native details/summary behavior as the no-JavaScript fallback. The first answer starts open; enhancement allows one active reply, animates measured height/opacity, and supports keyboard and reduced motion. No FAQ API or microphone behavior was introduced.

Verified pointer expansion, keyboard opening/closing, switching replies, long privacy text, 320/390/768/1024/1440px layouts without overflow, pure-white footer text, and empty browser error logs. The production build and source checks passed.
