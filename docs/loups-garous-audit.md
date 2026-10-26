# Loups-Garous narration and flow audit

Date: 2026-10-26. Implementation and verification recorded before publication; no deployment performed.

## Root causes and fixes

- Chrome accepted browser-speech requests without starting playback. The earlier fallback covered role explanations only, leaving later game scenes silent. All game narration now uses local speech first and authenticated audio fallback, remembers a failed local engine, and caches repeated audio within the session. Playback callbacks, not transcripts or HTTP success, establish completion.
- Imperative action confirmations competed with phase cleanup and feed narration. Each state update now forms an ordered scene containing actual outcomes and guidance for the visible screen. Private findings, vote totals, elimination acknowledgements, Hunter shots and endings have authored, viewer-scoped instructions. Overlay acknowledgements prevent unrelated next-phase actions.
- Human Werewolf actions bypassed night/alive/locked-action validation. They now use the engine's validated action handler. NPC Witch actions wait for the actual wolf target and run before dawn. Passive human roles no longer hold up NPC-only nights. Eliminated spectators progress after narration and acknowledgement unless paused.
- Witch command parsing could confuse poison with healing, choose the first name for both potions, or silently save the actual victim despite a different named target. Potion clauses are parsed separately; named save targets are validated, self-poison and negative action commands are rejected, and spent potions are not offered. Cupid can pair the human by voice.
- Spoken and written rules disagreed about public elimination roles and omitted restrictions. Role help and the server guide now share authored rules. Hidden potion state and the victim are restricted to the entitled Witch. Custom games already satisfying a win condition finish at the start; pending Hunter shots still precede victory.
- A lost action response could be retried with a new request ID. Uncertain moves retain their receipt key, expose “Retry last move”, and block conflicting choices. Late results cannot overwrite a different game after navigation.
- Cancelled speech timers, delayed audio while paused, and stale callbacks are covered by regressions. Failed playback leaves an alert and recovery controls instead of marking narration complete. Live output is suppressed while the authored narrator owns the speaker; the required delegated backend continuation remains intact.

## Figma comparison

Retrieved design context and screenshots for `37:201` (Seer reveal) and `37:267` (instructions) in the supplied file. Compared the actual rendered role card and flip against them.

- Removed the visible status block, three-button narration row and extra explanation disclosure below the card. Full explanations and retry/repeat/skip controls remain in Help and Audio Settings; failures still show a visible recovery alert.
- Removed the extra lover note from the card; private details remain in speech and Help. Extra rail controls are visually hidden on the role screen except when keyboard-focused.
- Matched the 369-pixel card, 386-pixel front, 414-pixel minimum back, 34-pixel spacing, intended heading/card placement, 14-pixel pill labels and 130-pixel role-screen voice orb. Retained the 180-degree flip, inert hidden face, focus handling and keyboard operation.
- Preserved the app's existing Playora/Loups-Garous branding rather than copying the Figma frame's stale Chess label. Longer role-specific rules can increase back-face height to avoid clipping.

## Automated coverage

The complete-match suite runs twelve engine matches across 4–12 players and six additional matches through the command/action module, one for each human role. It covers village and Werewolf outcomes, both tie policies, eliminated humans, Hunter resolution, potion limits, private views and fresh replay state. These are controlled fixtures, not live-provider matches.

Focused regressions cover phase/death validation, NPC potion ordering, passive-night progression, Cupid self-pairing, combined and invalid potion targets, private findings, actual vote counts, screen acknowledgements, win/loss guidance, custom initial wins, uncertain-request identity, late responses, cancelled startup timers, silent speech fallback, delayed audio while paused, role delivery/readiness and reconnect deduplication.

## Audio and browser evidence

Audio was captured from Chrome's actual output with ScreenCaptureKit and checked for nonzero PCM waveforms aligned to playing events. Successful transcripts alone were not counted. The expanded audit used local speech fixtures to avoid paid voice generation.

- Seer browser match: reveal, night instructions, private finding, dawn, discussion and NPC replies, voting, elimination role, village victory and replay. Actual recorded segments include the finding/dawn scene (26.81 s), voting prompt (14.53 s), eliminated role (2.68 s) and final victory (4.98 s).
- Witch browser match: setup, confirmation, all village introductions, delayed game data and voice readiness, complete role explanation (47.42 s), first-night guidance (23.21 s), combined save/poison through the command router, and village victory (12.21 s result scene). Recorded setup prompts and introductions also contain nonzero output. Keyboard flip and the ready action were exercised.
- Werewolf browser match: two nights and two votes, NPC Witch saving the first hunt, a subsequent spent heal, linked lover deaths, both public elimination-role acknowledgements and a Werewolf parity victory. Recorded output includes the full role (34.74 s), first dawn/discussion (27.32 s), second dawn/deaths (27.05 s) and final victory (4.90 s), all with nonzero PCM. Commands used the typed/live application router, not a separate test action path.
- Earlier role-specific recordings verified Villager, Werewolf, Seer, Witch, Hunter and Cupid announcements. Hunter interruption/retry, delayed readiness, explicit skip and repeat were exercised. One real-provider Witch announcement was verified earlier; the expanded matrix did not add paid voice calls.

The local live-transport fixture feeds real audio through a MediaStream and HTML audio element, but simulates provider events. Typed commands exercise the same application router used by live function calls; they are not proof of live microphone recognition.

## Remaining verification limits

- Full microphone-to-provider recognition, live reconnect and interruption across every complete match were not verified end to end. They are not represented as passing merely because fixtures or transcripts passed.
- The entire journey was not repeated audibly for every role and every tie/ending. Rare outcomes are covered by controlled engine/module tests.
- Safari did not provide a usable verification run. Visual/audio checks were completed in a fresh Chrome window after an earlier browser window showed an empty content area.
- Recordings and temporary fixture servers are diagnostics outside the repository, not shipped assets.

## Final checks

The final automated suite passes 173 tests in 25 files. TypeScript, the production build, the HTTP application smoke check and `git diff --check` pass. Lint exits successfully with warnings (mostly vendored/runtime code, plus React effect/dependency warnings); it is not warning-free. The build retains the existing large-chunk and Nitro chunk-debug-name warnings.
