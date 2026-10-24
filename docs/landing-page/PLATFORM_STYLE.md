# Shared visual language with the gaming platform

Current authority: `public/landing/platform-theme.css`. Layout remains in `styles.css`; this theme loads last. Earlier dark FAQ, black CTA, enlarged bitmap, full-strength grain, and unanimated orb treatments are superseded by the user's requested quality refinements.

The landing retains its editorial layout, open example conversation, working FAQ chat, and oversized footer. All changes are limited to landing files and documentation; the actual game source and preferences remain untouched.

## Exact platform controls and foundation

| Source | Landing mapping |
| --- | --- |
| `src/app/main.css` | Arial/Helvetica, white `#FFFFFF`, ink `#111111`, muted `#6B7280`, border `#E5E7EB`, focus `#386DF6` |
| `App.css` `.pill-button` | 44px minimum height; 24px radius; 10px 18px padding; 13px regular type; 8px gap; white fill; `#E0E4DC` border; hover `#F3F6ED` |
| `.pill-button.primary` | `#D4E89C` fill/border; hover `#C4DF83`; dark text; no invented shadow or bevel |
| `.send-command` | 44px green circle for the FAQ send control |
| Blue companion glow | Hero and quiet supporting light: `#BAE3FF`, `#EEF9FF`, `#CFEAFA` |
| Game-picker marks | Exact white triangle, pentagon, and diamond identities |

## Quality and color treatment

Hero, showcase, and accessibility visuals remain in a restrained ice-blue/white family. Showcase and FAQ scene use `#EDF3F7`, `#E5EDF2`, and `#F1F4F7`, avoiding the previous dark violet surround. The FAQ panel, header, and composer are white; answers are charcoal; player bubbles are `#F3F4F6`. Reuse the actual game button styles throughout.

Cards retain green, amber, and blue-violet game identities. Original source artwork supplies broad color variation at 35% opacity with a 3px blur, preventing enlarged coarse pixels. Fine grain comes from a small repeating procedural SVG with 8% alpha; scenes further reduce its opacity. Grain spans the entire card without a horizontal boundary. Copy stays on a dark lower scrim with adequate contrast. Ordinary text surfaces stay untextured.

## Sharp imagery

Large orbs use new resolution-independent blue/green SVG artwork in the companion palette, with broad fluid fields and dimensional shading. CSS adds internal flow, gentle breathing, and slight rotation. Small companion marks use the same SVGs. This replaces visibly enlarged 480px bitmap sources on the landing without replacing the product's own assets.

The showcase uses the actual rendered Chess DOM and copies of the existing app styles in a script-free sandboxed iframe. It displays the game's existing Marine board palette (`#DEF0F3`, `#6B9BAF`, `#36576A`) and a calmer local preview glow. This is an inert static preview, with no game state, API, microphone, or preference side effects. Live HTML preserves sharp text and icons when enlarged. A ResizeObserver fits its fixed desktop composition to the preview wrapper; without JavaScript the earlier screenshot is a static fallback. `assets/chess-preview.html` and `assets/product-preview.css` are snapshot assets, not an alternate playable game.

The snapshot was captured from the real `.app-shell` Chess view, then paired with copies of `src/app/main.css` and `src/app/App.css`. Keep original MIT attribution through the repository license. If the product UI changes, recapture the actual view and refresh these landing-only copies; do not change product files to update a marketing preview.

## Motion and accessibility

Ambient animation is decorative and does not imply an active microphone. It runs only while orbs are near the viewport. A visible Pause/Resume orb animation button pauses all orb motion. `prefers-reduced-motion` removes animation and hides that unnecessary control. Forced colors retains readable controls; no audio starts automatically. Preserve the local FAQ's truthful answer scope and keyboard behavior.

## Figma correction: game color is not the global brand

The later Figma review supersedes the earlier global green-primary mapping above. See [FIGMA_REVIEW.md](FIGMA_REVIEW.md) for source frames and final roles. Generic primary actions are black/white; site accents and the FAQ send action use blue-gray. Keep the existing button geometry, but confine green to Chess, amber to Loups-Garous, and violet to Tic-Tac-Toe. The user's requested softer icons intentionally replace pointed game polygons and Unicode arrows with a local rounded SVG set.

## Motion and turn-story refinement — 25 October

Orbs retain fixed silhouettes with softly moving inner gradient fields, rather than rotating or bouncing the whole object. A 44px icon-only pause control exposes its next action to assistive technology and switches to play while paused. Offscreen/hidden-document motion stops; reduced-motion users see static orbs. The voice example is now an ordered three-stage turn with one compact player confirmation, replacing the long alternating transcript. The current audit is in DESIGN_AUDIT.md.

## Particle-water refinement — 25 October

The large orbs now contain a canvas particle field following continuous rippling spherical bands, with depth-based opacity and perspective. Small brand orbs use a lower particle count. Static gradient art remains the fallback. The shared pause control freezes both particle time and gradient motion; reduced-motion users receive a fixed field. Only visible orbs render frames, hidden documents stop work, and removed FAQ avatars release their particle state. Hero sky gradients now fade through an opacity mask to fully transparent over white before the section boundary.

## Current liquid gradient — 25 October

The particle experiment is superseded. Orbs use continuous blue/lavender/pink color fields (green tones only for the Chess example), warped into slowly flowing liquid folds. There are no dots. The fixed spherical outline, pause control, visibility gating, and reduced-motion support remain. Buttons use a 700ms custom easing curve, a small hover lift and shadow, directional arrow motion, and a 120ms pressed response; touch devices avoid sticky hover and reduced motion removes transforms.

The user-supplied `elayadesign/ai-design-skills` landing-page-design skill was installed and consulted for motion. Existing platform typography, atmospheric backgrounds, and the agreed page structure take precedence over conflicting generic skill defaults. No new dependencies or changes to game files were needed.
