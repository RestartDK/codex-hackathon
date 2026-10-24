# Codex prompt — inspect, then implement

Copy the prompt below into Codex inside the Play by Voice repository. Make DESIGN.md, IMPLEMENTATION_BRIEF.md, and the references directory available in that workspace. The prompt authorizes inspection followed by implementation in one run.

---

Build the Play by Voice hackathon landing page from the supplied DESIGN.md and IMPLEMENTATION_BRIEF.md. Use the four supplied screenshots as composition references. Read the files and inspect the repository before changing application files, then implement the page in this same run. Do not stop after planning or ask for routine implementation approval.

First, perform a read-only inspection:

1. Read applicable AGENTS.md files and existing design/project instructions. Identify the framework, router, package manager, scripts, global styles, font setup, UI components, and image pipeline from local files.
2. Locate the homepage, game selector/onboarding, Chess and Loups-Garous routes/screens, orb, transcript, voice/audio controls, keyboard support, speech settings, and usable screenshots/assets. Do not read or print secret values.
3. Check what actually works. Map primary/game CTAs to real destinations. Verify which accessibility and voice claims are supported. Identify actual browser and permission behavior, plus any existing privacy information. The previous conversation describes intentions, not proof of functionality.
4. Inspect game components for side effects before embedding them in a preview. Preserve existing routes, providers, state, and game behavior. Do not replace a working product with a new scaffold.
5. Report a short inspection summary in the chat: stack, reusable components/assets, landing route, CTA destinations, verified claims, missing items, and checks to run. Make no application changes before this report. Then continue directly to implementation.

If there is no application repository, report that limitation and keep the handoff documents. Do not invent a new application or claim implementation is complete.

Implement the following:

- Follow DESIGN.md for exact semantic colors, font scale, spacing, widths, radii, shadows, button states, responsive rules, motion, and accessibility. Merge it into the repository root if needed, preserving relevant existing requirements.
- Use a light premium/editorial direction with generous whitespace, floating pill navigation, large centered headlines, atmospheric sky/sunset scenes, a pink/lavender/sky orb, and authentic product UI within selected scenes. Use restrained glass only where specified. Preserve an established readable product font when possible.
- Keep the exact section order: Hero → Product showcase → Games → How it works → Voice experience → Accessibility → FAQ → Final CTA/footer.
- Hero headline: “Play beyond the screen.” Use DESIGN.md's supporting copy and conditional alternatives based on verified product capability. Keep the orb as the main hero object; put the product screenshot in the showcase.
- Reuse real Chess/Loups-Garous screens or assets. Use screenshots or a side-effect-free preview mode. If unavailable, use the clearly labeled example conversation from DESIGN.md rather than a fabricated dashboard.
- Implement a growing library shelf with the current and planned game entries and an invitation to future games. Only enable real launch destinations; label unavailable games “Coming soon.” Primary “Start playing” actions must share a real destination, or point to #games when no selector exists.
- Keep the three-step explanation open and minimal. Describe required on-screen setup honestly.
- Build the voice section as a labeled, always-readable example transcript. Add Play/Pause only if a real recording exists. Do not trigger audio or microphone permission on page load. Reuse a live demo only if an existing working implementation can be integrated safely with explicit start/stop, permission/error states, and a text alternative.
- Style FAQ like the AI-chat reference: one large atmospheric scene and a readable conversation panel. Use working chat bubbles, suggested-question buttons, and an accessible text composer. Answer locally from the verified product FAQ, clearly label that scope, and handle unknown questions honestly. Do not display fake controls or an unrestricted-AI claim. Publish only supported answers; privacy claims must match actual behavior.
- Use semantic landmarks, one H1, a skip link, visible focus, logical keyboard order, minimum 44px controls, readable contrast, accessible navigation disclosure, and reduced-motion support. Keep content visible without animation/JavaScript enhancement. Scope landing styles so game screens retain their own design.
- Use original/reusable assets or CSS atmosphere. Do not ship the reference website screenshots as production artwork, imitate their branding, add fake metrics/testimonials/logos, scatter generic AI sparkles, or build grids of repeated SaaS feature cards.
- Keep dependencies minimal. Use existing framework/router/styling conventions; no framework migration, new speech service, FAQ backend, or app-wide redesign.

Verify and finish:

1. Run required repository checks and appropriate existing tests. Add tests only for meaningful new interactive behavior where warranted.
2. Run the page locally using the established workflow. Inspect screenshots at 1440×1000, 1024×768, 768×1024, 390×844, and 320×740; fix composition, clipping, and overflow. Check intermediate widths.
3. Check every link/CTA, menu keyboard behavior, FAQ, reduced motion, zoom/reflow, focus visibility, image/text contrast, runtime errors, and direct loading of landing/game routes. Confirm preview components do not start sessions. Verify audio/microphone states only when implemented.
4. Preserve gameplay and existing product screens. Do not publish, deploy, send messages, or add external integrations as part of this task.
5. Deliver the actual implementation, then report changed files, landing route, reused screens/components, working destinations, validation performed and outcomes, and remaining limitations. Clearly separate actual features, illustrative content, and planned capabilities. Never report a check as passed unless it ran successfully.

Use your judgment for routine choices and keep moving. If a missing asset or unimplemented feature has an honest fallback in DESIGN.md, use it and document the limitation.


Current brand guidance: read [PLATFORM_STYLE.md](PLATFORM_STYLE.md) alongside DESIGN.md. Use the platform’s original colors, textures, font, game marks, and orb artwork; keep the refined landing layouts. `platform-theme.css` is the current visual authority.
