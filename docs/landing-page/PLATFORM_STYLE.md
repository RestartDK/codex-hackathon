# Shared visual language with the gaming platform

The landing page retains its editorial layout, open example conversation, chat FAQ, and oversized footer. Its presentation now derives from the actual gaming platform rather than a separate marketing palette. Original application files remain unchanged.

`public/landing/platform-theme.css` loads after the layout stylesheet and owns these mappings. Consult it first for current brand colors and artwork. Earlier pastel and Manrope treatments are superseded.

| Platform source | Landing use |
| --- | --- |
| `src/app/main.css`: Arial / Helvetica | All page text and controls |
| `#FFFFFF`, `#111111`, `#6B7280`, `#E5E7EB` | Canvas, copy, supporting text, borders |
| `#526834`, `#D4E89C` | Restrained Chess-linked accents, status, link hover |
| `#386DF6` | Keyboard focus |
| `App.css` companion blue glow: `#BAE3FF`, `#EEF9FF`, `#CFEAFA` | Hero, accessibility scene, quiet footer light |
| `/artwork/orb-blue.webp` | Original companion orb in hero, branding, FAQ and accessibility visual |
| `/artwork/orb-green.webp` | Chess example orb and assistant markers |
| `/artwork/chess-card.webp` | Exact grainy Chess library background |
| `/artwork/werewolf-card.webp` | Exact grainy amber Loups-Garous background |
| `/artwork/tic-tac-toe-card.webp` | Exact violet/blue Tic-Tac-Toe background and scenic backdrop source |
| App game-picker triangle, pentagon, diamond | Corresponding white game identity marks |
| App rounded game cards | 48px desktop / 36px mobile library corners |
| App interaction easing | `cubic-bezier(.23,1,.32,1)` |

Large visual scenes soften the source artwork's enlarged grain and overlay a small repeating procedural grain asset to keep grain density fine and consistent. The game cards retain their original textured images. Keep ordinary reading surfaces white and untextured, matching the platform. Grain and decoration never capture pointer events or affect text contrast.

The actual Chess screenshot is shown in its original colors, with no grayscale or recoloring filter. The landing page does not change the game renderer, audio behavior, providers, or user preferences.

Dark FAQ panels use a reliably opaque marine/slate surface above the textured backdrop. Game copy sits over a dark lower scrim. All voice/privacy and availability wording remains factual. Preserve readable contrast, keyboard focus, reduced motion, and forced colors when changing this theme.
