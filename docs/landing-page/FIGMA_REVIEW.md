# Figma review: neutral brand, individual game palettes

Reviewed the user's [DevDay Hackathon file](https://www.figma.com/design/JTzxNHEGEnz77huBwRe6B0/DevDay-Hackathon?node-id=0-1) using high-fidelity design context and rendered screenshots for:

- `1:4` — Desktop - 1: white platform shell, black brand text, neutral navigation, blue companion, distinct green / amber / violet game cards.
- `17:304` — Play by Voice · Audio settings: white reading surfaces, black neutral actions, `#DFEDEF` blue-gray active/voice controls, rounded line icons.

The landing page previously applied the Chess-specific green primary action globally. That mapping was incorrect. The platform's brand shell is neutral with blue companion tones; each game's color belongs within that game context.

Current landing mappings:

| Role | Treatment |
| --- | --- |
| Page and reading surfaces | White, black/gray text |
| Generic primary actions | `#111111` fill, white text; rounded platform control geometry retained |
| Generic secondary actions | White fill, neutral border, cool-gray hover |
| Generic links and accents | `#36576A` blue-gray |
| FAQ send / voice-related action | `#DFEDEF` pale blue-gray |
| Chess | Green, confined to its card and explicitly labeled Chess example |
| Loups-Garous | Amber |
| Tic-Tac-Toe | Blue-violet |

The user explicitly requested different, softer icons, so this revision intentionally replaces the Figma's pointed polygon markers. Cards now use rounded translucent emblems with a pawn, crescent, and rounded grid. Site arrows, menu, audio waves, keyboard, and headphones use rounded stroke caps/joins from the existing Lucide dependency; the pawn is a small code-native SVG. All are decorative alongside visible labels. `assets/icons.svg` is local; `assets/lucide-LICENSE.txt` preserves the ISC notice. No new dependency or temporary Figma URL is used at runtime.

Other recently accepted details remain: white FAQ, fine grain, scalable animated companion spheres, sharp static HTML game preview, and the oversized editorial footer. Actual platform source files are unchanged.
