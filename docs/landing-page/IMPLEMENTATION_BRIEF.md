# Play by Voice — Implementation brief

## Outcome

Build a polished, primarily light hackathon landing page that explains voice-led gaming, shows the actual product, and leads to a working game. Use [DESIGN.md](DESIGN.md) as the visual and interaction source of truth. Apply the uploaded references through their composition, hierarchy, atmosphere, and restraint.

The handoff was prepared in an empty projectless workspace. No application repository or original game screens were available. No landing page was implemented or application behavior tested here. The four reference screenshots are included in `references/`; they are inspiration, not production artwork. This brief provides a complete implementation path once used inside the application repository.

## Product inventory and claim policy

| Item | Available evidence | Implementation treatment |
| --- | --- | --- |
| Product name | Play by Voice in the conversation | Use consistently |
| Core direction | Speaking/listening-led gaming and accessibility intent | Explain directly, with prototype limitations where needed |
| Chess and Loups-Garous | Named in the conversation | Inspect availability before enabling game actions |
| Existing game designs | Mentioned, not supplied | Locate and preserve; never invent screenshots |
| Pink/lavender/sky orb | Brand motif described in conversation | Reuse existing asset; CSS fallback if absent |
| Voice-only flow, repeat, speed, keyboard, high contrast | Suggested capabilities | Verify separately before claiming |
| Multiplayer, providers, supported browsers, recording retention | Unknown | Read code/config/docs; omit unsupported claims |

Maintain a short capability ledger during implementation: claim, evidence location, observed behavior, final wording. Keep sensitive configuration values out of the report. A provider integration alone does not prove an end-to-end capability.

## Phase 1 — Inspect without changing files

Read applicable `AGENTS.md` instructions. Identify package manager and lockfile, framework/version from local files, build/start commands, routing, current homepage, providers, global styles, font setup, design tokens, image tooling, and existing verification commands.

Locate game selector, onboarding, Chess, Loups-Garous, microphone/audio state, transcript, repeat control, speech settings, and orb. Inspect components for side effects before embedding anything in a marketing preview. Locate real screenshots or a safe way to capture the running product without creating an unwanted game session.

Map each launch CTA to an actual existing destination. Determine whether the root route is already a game screen. If it is, preserve direct access to that game at its established supported destination; do not simply overwrite gameplay. Follow existing routing conventions to expose the landing page. Avoid public route changes that break bookmarked flows.

Inspect existing content for language, implemented commands, game availability, browser limitations, microphone permission handling, and privacy notices. Follow established UI language; use the English copy in DESIGN.md unless the repo clearly requires localization.

Produce a concise inspection report in the chat before edits: stack, reusable components/assets, chosen landing route, real CTA destinations, verified capability wording, missing items, and checks to run. Then continue implementation in the same run. Do not stop for routine approval. If there is no repo, stop at a truthful handoff report; do not generate a replacement application.

## Phase 2 — Implement the foundation

1. Add or merge DESIGN.md into the repository root without discarding existing design requirements. Keep the companion brief and prompt in the repo's established docs location when appropriate.
2. Introduce landing-scoped semantic tokens from DESIGN.md. Reuse existing primitives and font if suitable. Avoid modifying the product's global theme.
3. Create the content container, section heading, accessible action styles, and atmospheric scene wrapper. Reuse existing components rather than making redundant abstractions.
4. Add the orb using the existing asset/component, or a lightweight CSS fallback. Build the page statically before adding motion.
5. Create floating navigation and skip link. Implement the compact-menu disclosure with keyboard behavior.

Suggested responsibilities, adapted to the existing repository rather than imposed as a new architecture:

| Responsibility | Purpose |
| --- | --- |
| Landing page composition | Own section order and route |
| Landing tokens/styles | Scope visual system |
| Atmospheric scene | Crop decoration without clipping controls |
| Brand orb | Share the recurring visual asset |
| Product preview | Render real screenshot or safe read-only preview |
| Game entry | Show real availability and launch destination |
| Example conversation | Keep transcript and optional audio controls together |
| FAQ | Semantic questions/answers in conversation styling |

Use local content structures if helpful; a CMS, backend, generic page builder, or new state library is unnecessary.

## Phase 3 — Build section by section

| Order | Section | Implementation action | Completion evidence |
| --- | --- | --- | --- |
| 1 | Hero | Pale atmospheric stage, floating nav, exact headline, two actions, large orb | Clear headline at 320px; actions resolve; orb does not obscure text |
| 2 | Product showcase | Capture/reuse real game UI inside one large scene | Correct product content; static or no session side effects |
| 3 | Games | Growing library shelf; current/planned entries and future invitation | Working launch paths or honest Coming soon states |
| 4 | How it works | Open three-step ordered list | Wording matches actual setup and voice flow |
| 5 | Voice experience | Labeled example transcript; audio only if real asset exists | Readable without JS/audio; no permission on page load |
| 6 | Accessibility | Editorial explanation plus verified capability text | Each published capability has evidence |
| 7 | FAQ | Working chat panel with suggested/typed questions and curated local answers | Keyboard operation, readable surfaces, no fake input |
| 8 | Final CTA/footer | Large centered headline, pill action, underlined links, oversized faded wordmark | Same launch target everywhere; no invented links |

Use exact copy from DESIGN.md with the conditional alternatives it specifies. Preserve original app components and game behavior. Avoid copying reference branding, third-party app UI, logos, or typography embedded in images.

## Phase 4 — Motion and polish

Implement only the short entrance and hover effects that help the page. Keep the orb static after entry by default. Content is visible before enhancement. Reduced-motion users see all content immediately. Do not add parallax, automatic audio, hidden transcript content, or a simulated listening state.

Inspect the whitespace, relative scene scale, actual headline wrapping, and transitions from sky to neutral canvas. Check the page as a whole rather than polishing isolated cards until the composition loses its rhythm.

## Phase 5 — Verification

Use repository-required checks. Add tests only for meaningful new behavior, such as navigation/menu or audio state that existing tests cannot cover. Do not create tests that merely assert decorative markup.

### Functional review

- Navigate through every primary and game CTA; confirm the expected app flow opens.
- Open and close mobile navigation by trigger, Escape, and selecting a link. Verify hidden links cannot receive focus.
- Submit suggested and typed FAQ questions using keyboard alone; verify empty submission and unknown-question fallback.
- Confirm static preview does not start a session or microphone stream.
- If audio exists, test play, pause, restart, unavailable asset/error, and transcript access.
- If a real microphone demo is reused, test permission grant/denial, unavailable browser support, stop, and recovery using the application's supported environment.
- Refresh the landing and game routes directly; confirm existing gameplay still works.

### Visual and accessibility review

Capture and inspect at 1440×1000, 1024×768, 768×1024, 390×844, and 320×740. These are review viewports, not design-specific device requirements. Check intermediate widths while resizing.

Verify no horizontal page overflow; no clipped headings, CTAs, focus rings, or product previews; stable imagery with reserved dimensions; readable text over actual scenery. Check keyboard sequence, skip link, heading hierarchy, semantic names, 200% text sizing, 400% reflow, reduced motion, and forced colors. Check important flows with an available screen reader. An automated audit complements manual review; it does not establish full accessibility conformance.

Verify token contrast and then rendered state contrast. Measure performance using existing tooling, note the environment, and report observed results without inventing a score. Confirm no console/runtime errors or missing image requests introduced by the page.

### Required final report from the implementing agent

State the landing route, changes made, reused product components/screens, actual launch destinations, checks run and outcomes, inspected screenshots, and any remaining limitations. Distinguish implemented features from illustrative conversation content and planned game features. Report unavailable checks as unavailable, never passed.

## Acceptance checklist

- [ ] All eight sections exist in the specified order, with one H1 and clear landmarks.
- [ ] Light neutral base, scenic moments, orb, pill navigation, and large centered type form a coherent visual language.
- [ ] Tokens, spacing, radii, shadows, and widths follow DESIGN.md.
- [ ] Real product screens/components are preserved wherever available.
- [ ] Every CTA navigates or operates correctly; unavailable games are labeled clearly.
- [ ] FAQ is functional and honest about its capabilities.
- [ ] Voice transcript is always readable; no automatic audio or microphone request.
- [ ] Accessibility and privacy wording is backed by observed behavior or qualified clearly.
- [ ] Small screens, keyboard, reduced motion, and zoom have been reviewed.
- [ ] Existing product routes and behavior remain working.
- [ ] Required repository checks pass, or exact unresolved failures are documented.
- [ ] No invented customers, sponsors, metrics, testimonials, or unsupported game modes.

## Scope boundary for the hackathon

Required: complete landing page, real navigation, real game links, responsive composition, accessible menu and chat FAQ, truthful copy, real product preview where available, labeled transcript, and visual review.

Optional only after the above: recorded audio example, short entrance motion, additional original scenery, preview game switcher using existing safe components.

Outside default scope: new game implementation, speech backend, FAQ AI backend, authentication redesign, payments, email collection, analytics migration, new game modes, or a site-wide component rewrite. If a required asset is missing, use the specified honest fallback and record it.


Current brand guidance: read [PLATFORM_STYLE.md](PLATFORM_STYLE.md) alongside DESIGN.md. Use the platform’s original colors, textures, font, game marks, and orb artwork; keep the refined landing layouts. `platform-theme.css` is the current visual authority.
