# Play by Voice — Design system

Status: implementation specification for a hackathon landing page.
Date: 24 October 2026.
Companion files: [implementation brief](IMPLEMENTATION_BRIEF.md), [Codex prompt](CODEX_PROMPT.md).

**Current visual authority:** [PLATFORM_STYLE.md](PLATFORM_STYLE.md) and `public/landing/platform-theme.css` align the entire page with the actual gaming platform. They supersede earlier pastel palette, custom orb, font, and screenshot-filter choices below. Preserve the refined layouts and interactions.

## 1. Product and evidence

Play by Voice is a voice-led gaming project. The prior product discussion names Chess and Loups-Garous and refers to existing screens for both. The landing page should invite people to discover games through speaking and listening, including people who cannot rely on a visual board.

The actual repository, product screens, supported commands, game availability, speech providers, browser support, and accessibility test results were not available when this specification was prepared. Treat those as implementation discovery items. The prior discussion is evidence of intent, not proof of working features. Never turn an aspiration into an unqualified product claim.

All four uploaded reference images were visually inspected. Local copies are retained for the implementation handoff:

| Reference                                              | Apply                                                                                                        | Leave behind                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [Scenic hero](references/01-scenic-hero.png)           | Floating white pill navigation, centered hierarchy, scenery framing a clear central area                     | Sales badges, busy peripheral UI, lead-generation copy                    |
| [Product showcase](references/02-product-showcase.png) | Generous white space, one large environment framing a real product screen                                    | Red palette, trust logos, testimonials, screen-recording content          |
| [AI chat](references/03-ai-chat-faq.png)               | Large translucent conversation panel inside an atmospheric scene; this is the user's requested FAQ direction | Third-party branding, fake working chat input, hard-to-read text on glass |
| [Sunset landscape](references/04-sunset-landscape.png) | Immersive environment, calm horizon, bold centered type, pill actions                                        | Fundraising badge, unrelated mountains or literal imitation               |

The user called the AI-chat image the “second image.” Identify it by its content rather than attachment order.

## 2. Identity and composition

**Editorial simplicity, immersive environments, floating product UI.**

The page feels like an invitation into a quiet, imaginative game world. White and warm off-white establish the rhythm. Sky, lavender, pink, and peach appear inside selected scenes. The orb is the recurring identity object: soft, dimensional, luminous, and recognizable at small sizes.

Every section has one dominant focal point. Headings introduce an experience; the scene or actual interface makes it tangible. Empty space is intentional. Avoid ornament added merely to occupy space.

Use a primarily light page. Dark panels are confined to existing product UI or the FAQ when appropriate. Keep roughly two-thirds of the overall page visually neutral; atmospheric sections provide the contrast. Do not wrap every section in a card.

Voice: plain, welcoming, concrete. Use “speak,” “listen,” “choose,” “play,” and real game language. Avoid claims of revolutionary technology, invented popularity, and generic AI promises.

## 3. Color roles

Use semantic variables, scoped to the landing page to protect existing game themes. All colors below are exact defaults; retain a proven product accent only if discovery demonstrates an established brand system, then document the mapping.

| Token                | Value     | Role                                                       |
| -------------------- | --------- | ---------------------------------------------------------- |
| `--pv-canvas`        | `#FAF9F6` | Warm page background                                       |
| `--pv-surface`       | `#FFFFFF` | Cards, text panels, controls                               |
| `--pv-surface-soft`  | `#F1F0F5` | Quiet rows, FAQ chips, hover fills                         |
| `--pv-ink`           | `#20212B` | Headings, primary copy, primary button fill                |
| `--pv-muted`         | `#5C5E6D` | Supporting copy; never lower opacity for body text         |
| `--pv-line`          | `#DFDFE7` | Decorative dividers; not sufficient as sole input boundary |
| `--pv-control-line`  | `#7B7D8D` | Required control outlines on light surfaces                |
| `--pv-accent`        | `#5945A5` | Text links, active states, small meaningful accents        |
| `--pv-accent-hover`  | `#48358C` | Link hover/pressed state                                   |
| `--pv-focus`         | `#4F46B8` | Keyboard focus on light backgrounds                        |
| `--pv-sky`           | `#D9EAF7` | Atmospheric sky only                                       |
| `--pv-lavender`      | `#D8CFF0` | Orb and scene middle tones                                 |
| `--pv-pink`          | `#F1C9DD` | Orb and cloud highlights                                   |
| `--pv-peach`         | `#F5D5BF` | Warm horizon and final CTA                                 |
| `--pv-night`         | `#25293A` | Optional FAQ dark panel solid fallback                     |
| `--pv-on-dark`       | `#F9F9FC` | Copy on dark panels                                        |
| `--pv-muted-on-dark` | `#D5D8E3` | Secondary text on dark panels                              |
| `--pv-success`       | `#25624A` | Confirmed positive status, always accompanied by text      |
| `--pv-error`         | `#A1293D` | Errors on white, always accompanied by text                |

Atmospheric colors are decorative, not text colors. Put text over a sufficiently opaque surface or calm light zone. Do not assume contrast from an average background color; check the actual pixels behind text in every state.

Primary button: ink fill, white text; hover `#343644`; active `#171820`. Secondary: white fill, ink text, control-line border; hover surface-soft. Quiet text link: accent with underline on hover and focus. Disabled: surface-soft fill, muted text, no hover, native disabled semantics where appropriate.

Focus: 3px solid focus with 3px offset. Over variable scenery or dark UI use a white inner halo plus the focus outer ring so focus stays visible.

## 4. Typography

Preserve an existing readable product font where possible. Otherwise use **Manrope Variable**, locally hosted WOFF2, weights 400–700. Fallback: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Font loading must use `font-display: swap`; the page must remain usable when the font fails.

No dependency on remote font requests. No display serif, gradient text, all-caps body copy, or novelty futuristic font. Use weight and scale for hierarchy; reserve uppercase for short optional labels.

| Role                | Wide ≥1024px | Medium 768–1023px | Small <768px | Weight / leading / tracking |
| ------------------- | ------------ | ----------------- | ------------ | --------------------------- |
| Hero H1             | 80px         | 64px              | 44px         | 600 / 1.04 / -0.045em       |
| Section H2          | 52px         | 44px              | 34px         | 600 / 1.10 / -0.035em       |
| Card H3             | 30px         | 28px              | 26px         | 600 / 1.18 / -0.025em       |
| Lead copy           | 20px         | 20px              | 18px         | 400 / 1.55 / -0.01em        |
| Body                | 16px         | 16px              | 16px         | 400 / 1.65 / 0              |
| Navigation / action | 14px         | 14px              | 14px         | 600 / 1.4 / 0               |
| Caption / eyebrow   | 13px         | 13px              | 13px         | 500 / 1.5 / 0.02em          |

Interpolate within bands if useful; do not fall below the small values. At 320px allow headline wrapping naturally. Hero headline max width 800px; section headlines 760px; leads 600px; reading columns 64ch. Use `text-wrap: balance` as progressive enhancement. Avoid hard-coded `<br>` that breaks at mobile widths. Exactly one H1; H2 per section; H3 for game titles.

## 5. Layout, spacing, radii, depth

- Content max width: **1200px**. Wide visual max width: **1360px**. Navbar max width: **1040px**. FAQ panel max width: **800px**.
- Page gutters: 48px at ≥1280px; 32px at 768–1279px; 20px at 480–767px; 16px below 480px.
- Spacing scale: **4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128, 160px**. Do not invent near-duplicate values.
- Section vertical padding: 128px wide, 96px medium, 72px small. Small 72px is an explicit layout exception to the spacing scale. Inter-section empty space must not double unintentionally through adjacent padding plus margins.
- Eyebrow → heading: 16px. Heading → lead: 24px. Lead → actions: 32px. Text block → visual: 64px wide, 40px small.
- Two-column grid: equal tracks, 32px gap wide, 24px medium; stack with 24px gap small. Use `minmax(0, 1fr)` to prevent overflow.
- Scene padding: 64px wide, 40px medium, 20px small. Product frame width up to 960px. Nested content panels: 32px wide / 24px small.
- Radii: scene 40px wide / 24px small; product panel 24px / 20px; game card 32px / 24px; inner controls 12px; buttons, tags, nav 999px. Never nest many rounded boxes.
- Shadow soft: `0 8px 24px rgba(32,33,43,.06)`.
- Shadow floating: `0 24px 64px -16px rgba(32,33,43,.20), 0 2px 8px rgba(32,33,43,.05)`.
- Shadow nav: `0 8px 32px rgba(32,33,43,.09)`.
- Border surface: `1px solid rgba(32,33,43,.10)` for decorative separation only.
- Glass light: white at 88% opacity, 16px backdrop blur, white at 72% border. Fallback white at 98%. Use only navbar and, optionally, one conversation panel.
- Dark FAQ glass: night at 94% opacity, 16px backdrop blur, on-dark text. Fallback solid night. Background scenery must not compromise text.
- Layer order: scenery 0, orb 1, content 2, sticky nav 20, mobile panel 30. Avoid negative layers escaping their section.

Set a shared `--pv-nav-clearance: 104px` wide / `88px` small and `scroll-margin-top` on targets. Crop scenery within its own rounded wrapper; keep focus outlines outside clipping wrappers.

## 6. Orb and atmosphere

Use an existing orb asset/component first. Preserve its recognizable shape and palette. Otherwise build a static CSS orb using layered radial gradients and a subtle inset highlight; no WebGL dependency is needed. It should read as a sphere, not a blurred flat disk.

Suggested orb color map: sky at upper left, lavender through center, pink at lower right, peach on the horizon-facing edge, small soft white highlight at upper left. Dimensional shading may use ink at 10–18% opacity; avoid a neon outer ring. Back halo stays inside the scene.

Hero orb diameter: `clamp(240px, 31vw, 440px)`. Demo orb: 200px wide / 136px small. Final CTA orb: 120px wide / 96px small. Tiny wordmark orb: 24px.

The hero atmosphere has a pale sky top, cloudy lavender middle, warm peach lower horizon, and fade into the page canvas. Provide broad low-frequency color fields, depth, and soft cloud texture rather than a saturated diagonal wash. Use original or licensed scenery if already available. Reference screenshots guide composition; never ship their unrelated website UI as page artwork.

Fallback: layered CSS gradients plus the orb, with a strong white text-safe zone. No new stock photography requirement. Atmospheric images are decorative with empty alt text; the orb is `aria-hidden` unless it conveys a real state, in which case expose that state as adjacent text.

## 7. Navigation and controls

Navbar: sticky/fixed floating pill, 24px from top wide / 12px small, 72px tall wide / 64px small. Horizontally centered within page gutters. Wordmark “Play by Voice” at left; links “Games,” “How it works,” “FAQ”; “Start playing” at right. Reserve hero clearance to prevent overlap. No pricing or invented account link.

Below 768px show wordmark and a 44px menu button; place “Start playing” at the top of the expanded menu. Use an inline disclosure panel anchored below the pill, not a full-screen modal. `aria-expanded`, `aria-controls`, Escape to close, close on selection, return focus to trigger on Escape, remove hidden links from tab order. Do not trap focus for this nonmodal disclosure.

Actions: primary and secondary minimum height 48px, horizontal padding 24px, gap 12px; other icon controls minimum 44×44px. Decorative arrow may be inline at 16px, hidden from assistive technology. Use links for navigation and buttons for state changes. Hover changes fill and may translate -1px; pressed returns to 0. Layout must never jump.

Route policy: resolve real existing game selector/onboarding paths during inspection. If unavailable, “Start playing” points to `#games`; game cards explain availability without dead links. Never invent `/play`, enable a fake download, or use `href="#"`.

## 8. Section specifications and default copy

Copy below is ready for implementation except where explicitly conditional. Product verification takes precedence over speculative claims.

### 8.1 Hero — `#top`

Eyebrow: **Accessible gaming, powered by voice**.
H1: **Play beyond the screen.**
Lead: **Discover Chess and Loups-Garous through conversation. Listen, speak, and find your next move.**
Actions: **Start playing** and **Explore games** (`#games`).

Layout: wide immersive sky stage with centered text above the orb. Hero top padding 176px wide / 136px small includes navigation clearance; bottom 64px / 48px. Wide minimum height 860px; use content-driven height on small screens, never a locked viewport height. Max text area 800px. Orb sits in normal flow after a 40px gap, slightly overlapping the horizon. Keep the headline background pale and quiet. No product screenshot in the hero.

If either game is unavailable, update lead to name only demonstrated games; describe planned games in Games rather than implying launch availability. If the implemented product does not support the core accessibility intent yet, use eyebrow “Gaming through conversation” and describe accessibility work candidly in its section.

### 8.2 Product showcase — `#experience`

H2: **Speak. Listen. Play.**
Lead: **Choose a game and follow the conversation, one turn at a time.**

Centered introduction on warm white. One large 16:10 atmospheric scene with actual product UI floating above it. Use the real Chess screen first if it is the strongest available screen. Keep screenshot aspect ratio intact; a 960px frame occupies roughly 76–84% of the scene on wide screens. Use the floating shadow once. Any perspective tilt is at most 2 degrees and must never affect a live interactive UI.

On small screens remove tilt, reduce scenery padding, and use a dedicated crop only if essential controls and labels remain visible. A screenshot is a static preview with concise alt text and a nearby real launch link; never make baked-in buttons appear operational. A live preview may reuse existing components only in a side-effect-free preview mode, with no automatic microphone connection, session creation, or analytics spam.

Fallback if no product screen exists: an honestly labeled “Example conversation” using the sample in 8.5, not a fabricated dashboard. Do not borrow chess UI from reference websites.

### 8.3 Games — `#games`

H2: **Choose your world.**
Lead: **A growing world of games, brought closer by conversation.**

Present a growing collection rather than a page about two games. Use a three-column library shelf on desktop and compact horizontal game entries stacked on mobile. Current entries are Chess (available), Loups-Garous (coming soon), and Tic-Tac-Toe (coming soon), reflecting the actual game picker. Retain one launch link for Chess and no enabled links for planned games. Future entries should be straightforward to add without changing the composition.

Use cooler, restrained blue-gray, mist-lavender, and pale sage surfaces with simple game objects. Below the shelf, an open editorial invitation reads **More games. More ways in.** with a real link to the game picker. Do not invent release dates, gameplay, or named future games. These entries are the beginning of the collection, not its limit.

### 8.4 How it works — `#how-it-works`

H2: **All you need is your voice.**
Use that headline only if the complete demonstrated flow works by voice; otherwise **A game starts with a conversation.**

Three numbered moments in one open row, separated by quiet lines, not three elevated cards:

1. **Choose.** “Pick the game you want to enter.”
2. **Listen.** “Hear the next moment in the game.”
3. **Speak.** “Say what you want to do.”

Stack as a semantic ordered list on small screens. Numbers are visual anchors, not oversized background decoration. Mention an initial on-screen setup step when required by the actual product. Do not conceal microphone permission or login steps.

### 8.5 Voice experience — `#voice-demo`

H2: **Your move, in your words.**
Lead: **A short example of a turn in Chess.**

Use a compact ordered three-step turn beside a single Chess-colored orb. The stages are “Hear where you are”, “Say your next move”, and “You have the final say”. Use small numbered circles and subtle connecting lines, with role labels and readable quoted dialogue. A single pale rounded reply holds “Yes, play it.” followed by the confirmed result. Avoid an enclosing transcript card, repeated avatar rows, and large gaps between chat bubbles. At ≥1024px use copy/orb left and the turn right; below, center the orb above the ordered turn.

Label it “An illustrative Chess conversation. No microphone needed.” Never imply this is a live session or play audio without a real recording and explicit action.

A live microphone demo is a separate enhancement only when the repo already supplies a working flow. Explain permission before requesting it; expose idle, requesting, listening, processing, speaking, stopped, denied, and unavailable states in text. Include Stop, error recovery, and a text alternative. Denied permission must not break the landing page. Never animate “Listening” without an active microphone session.

### 8.6 Accessibility — `#accessibility`

H2: **Built around speaking and listening.**
Lead: **The goal is simple: make the game understandable without relying on the board.**

Use one real product detail beside an editorial text column. Three or four concise capability labels may sit alongside the visual; on small screens place them in normal flow. Labels must also be readable text, not image content.

Candidate capabilities: spoken game state; repeat instructions; keyboard controls; adjustable speech; high contrast. Publish only capabilities verified in the product. Move unimplemented capabilities to a clearly labeled “In progress” sentence or omit them. “Works with screen readers,” “fully accessible,” and “no screen required” need end-to-end evidence.

The landing page itself must satisfy the requirements in section 11 regardless of product maturity. Do not equate a decorative microphone icon with accessibility.

### 8.7 FAQ — `#faq`

H2: **A few things you might be wondering.**

Follow the original AI-chat reference literally in its interaction pattern: a large scenic blue/gray environment, a white conversation panel, right-aligned pale neutral question bubbles, left-aligned assistant responses with the orb, suggested questions, and a working pill-shaped text composer with send action. Do not use accordion rows.

The current implementation is a local product FAQ guide, visibly identified as **Product guide** / **Answers from our product FAQ**. It uses curated factual answers, with no API, recording, or persistence. Support typed questions and suggested-question buttons. Unknown topics receive an honest scope explanation and a route to the project documentation. Never pretend this is an unrestricted AI assistant.

Provide verified answers about available games, getting started, typed/keyboard controls, accessibility limitations, move guidance, microphone requirements, and voice privacy. Say that only Chess is playable now; do not imply planned games work. Distinguish local storage behavior from the voice provider's retention.

The composer has an accessible label, Enter submission, disabled empty submission, and 300-character limit. Render all messages using text nodes. Keep a bounded in-memory transcript and an accessible, keyboard-scrollable log with polite announcements. Reveal controls only after enhancement so the initial conversation and documentation link remain useful without JavaScript. No decorative microphone control unless it really works.

Exact colors: scene uses pale sky `#DFE9F0`, lavender-gray `#E9E8EF`, and white; panel and composer white; question bubbles `#F3F4F6`; text `#111111`; muted text `#6B7280`; send control `#DFEDEF`. The composer border is `#87939D`. Use opaque readable surfaces and fine, restrained grain. These current values supersede earlier dark FAQ specifications.

### 8.8 Final invitation and footer

Use a single spacious editorial footer matching the user's supplied reference: warm off-white canvas, very large centered **Reconnect with play.** headline, one dark softly beveled pill **Start playing** action, an open row of underlined links, then an oversized pale **PLAY BY VOICE** wordmark that fades toward the bottom. Remove the previous orb-led CTA scene and compact footer bar.

Only use real links: Games, How it works, GitHub, and Back to top. Do not invent social accounts, email addresses, or an App Store listing. Keep the oversized wordmark decorative and hidden from assistive technology. Contain its crop in its own wrapper; it must not create document overflow. Wrap the link row naturally on small screens and retain 44px targets.

## 9. Responsive rules

| Width       | Layout behavior                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------ |
| 320–479px   | 16px gutters, one column, 44px H1, stacked full-width hero actions, compact orb, menu disclosure |
| 480–767px   | 20px gutters, one column, actions may share a row when labels fit, menu disclosure               |
| 768–1023px  | 32px gutters, two game cards, 64px H1, full navigation; voice demo remains stacked               |
| 1024–1279px | 32px gutters, full two-column compositions, 80px H1                                              |
| ≥1280px     | 48px gutters, max-width containers, no endlessly stretching text or scenes                       |

At 768px verify wordmark, nav, and CTA fit; if measured content exceeds available width, retain the compact menu until it fits. Never clip nav labels to force the breakpoint.

No horizontal page scrolling at 320px or at 200% text size. Permit vertical growth in cards/nav panels. At 400% browser zoom, reflow to a readable single column. Use logical properties; avoid fixed text panel heights. Preserve the same content and reading order at every breakpoint. Scenic layers may crop; product content may not silently disappear.

## 10. Motion

Motion suggests a calm voice presence. It does not compete with comprehension.

| Motion         | Specification                                                                      |
| -------------- | ---------------------------------------------------------------------------------- |
| Control hover  | 160ms ease-out; fill/shadow, translate at most 1px                                 |
| Disclosure     | Native instant open/close is acceptable; no height animation required              |
| Section reveal | Optional 420ms `cubic-bezier(.22,1,.36,1)`, opacity and translateY 12px; once only |
| Orb entrance   | One gentle 700ms settle from scale .97 to 1; no essential information              |
| Message demo   | Only on explicit Play action; follow actual audio timing when audio exists         |

Default orb rests after entry. Continuous floating or breathing, if added, needs an obvious pause control because it persists beyond five seconds. Prefer the static version for the hackathon. No parallax, scroll hijacking, looping typewriter, flashes, racing waveform, or cursor-following orb.

`prefers-reduced-motion: reduce`: remove transforms, scrolling animation, reveals, pulse, and timed message entry. Show all content immediately. Content is visible without JavaScript; enhancement must never leave sections at opacity zero after a script error. Decorative animation never generates screen-reader announcements.

## 11. Accessibility and interaction requirements

Target WCAG 2.2 AA for the landing page; do not publish a conformance claim without an audit.

- Semantic header/nav/main/sections/footer; skip link becomes visible on focus and targets main.
- Full keyboard use with logical focus order, visible focus, no hover-only information, and no obscured focused controls beneath the sticky navbar.
- Text contrast ≥4.5:1 for normal text; ≥3:1 for large text. Required control boundaries and meaningful icons ≥3:1 against adjacent colors. Check hover, active, disabled presentation, and image-backed panels separately.
- Minimum 44px interaction targets by design, except ordinary inline prose links with sufficient separation.
- Icon-only controls have explicit names. Status is communicated in text as well as color or animation.
- Screenshots have useful alt text, e.g. “Chess game preview with the move transcript beside the board.” Decorative scenery and duplicate orb art have empty alt/hidden semantics.
- Use real button/link semantics; no clickable divs. Native FAQ disclosure exposes state. Do not add redundant or conflicting ARIA.
- No automatic audio or microphone permission prompt. The microphone starts only from an explicit user action and has an obvious stop action.
- Transcript always available. Do not put the entire example transcript in a live region; live regions are only for concise actual status updates.
- Support browser zoom, text resizing, reduced motion, and forced colors. In forced colors, keep outlines and native controls; remove decorative gradients if they obscure meaning.
- Never make an image of text the sole source of game instructions or FAQ content.

## 12. Performance and resilient delivery

For the showcase, use a cool sky-blue environment and a crisp inert HTML capture of the existing game UI. Apply Marine board colors only inside the preview; preserve the original game files and preferences. Keep the preview explicitly static and provide a real launch link.

Use the existing framework, router, styling approach, icon set, and image pipeline. No UI framework migration. Scope selectors/tokens to the landing page and avoid restyling actual game screens accidentally.

Reuse assets first. Atmospheric images: responsive AVIF/WebP with appropriate sizes, explicit dimensions, and a useful fallback color. Target ≤300KB for the above-fold scene and ≤1.5MB total initial transfer where practical; measure rather than promising. Prioritize only the actual LCP asset, never every image. Lazy-load below-fold images. A CSS orb needs no large media dependency.

Use one local font family; only required weights. Avoid adding animation, 3D, audio, or chatbot libraries for decorative effects. No autoplay video. Preserve existing app providers and session handling. Static preview components must not initialize live product sessions.

## 13. Do / don't

| Do                                                                  | Don't                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Make one scene or interface the focal point                         | Fill every gap with badges, icons, and floating cards                     |
| Keep headlines dark and sharply readable                            | Use gradient text, neon glows, or hairline light text                     |
| Repeat the orb as the brand signature                               | Scatter sparkles, robot icons, and arbitrary waveforms                    |
| Use actual game UI or clearly labeled examples                      | Fabricate dashboards, usage counts, testimonials, or sponsors             |
| Give the FAQ a conversation aesthetic with real disclosure controls | Present a nonfunctional AI chat box                                       |
| Use a few atmospheric moments separated by white space              | Cover the whole page in purple gradients and glass                        |
| Preserve product routes, screens, and established state             | Replace the app to make a landing page easier                             |
| State prototype limitations plainly                                 | Claim complete voice access, privacy, or browser support without evidence |
| Show the start of a growing game collection                         | Present two games as the whole product                                    |

## 14. Definition of done

Eight sections appear in the specified order, the orb is consistent, real product assets are retained, and mobile composition is deliberate. Every action has a valid destination or implemented behavior. FAQ works with keyboard; demo is honest; no audio starts automatically. Actual product capabilities govern the final wording. Desktop and small-screen screenshots have been inspected, routes still work, and repository-required checks pass. See the implementation brief for the detailed delivery checklist.

## Current orb motion

Keep sphere outlines fixed. Animate two softly blended internal gradient fields with continuous 14–19 second curves, plus subtle movement inside small companion avatars. Use an icon-only 44px pause control with an accessible action label and tooltip; change to play when paused. Pause offscreen orbs and hidden documents. Reduced-motion preferences remove animation and hide the unnecessary control. Never imply the ambient animation is listening or processing.
