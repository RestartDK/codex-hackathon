# Vercel deployment guide

This guide describes deployment but does not publish the project.

## 1. Verify locally

From `chess-companion`:

```powershell
npm install
npm run verify
npx playwright install chromium
npm run test:e2e
```

Confirm that `public/stockfish/stockfish-19-lite-single.js` and its matching `.wasm` file exist after installation. Test a computer move and a hint with the browser network panel open; both engine assets must return `200`, and WASM should use `application/wasm`.

## 2. Create the Vercel project

Import this repository into Vercel and set the root directory to `chess-companion`. The checked-in `vercel.json` selects the Nitro Vercel preset. Use:

- Install command: `npm install`
- Build command: `npm run build`
- Output settings: let Nitro/Vercel detect them from the build

Do not use a static-only deployment because `/api/voice/session` is a server route.

## 3. Configure production secrets

In Vercel project settings, add:

- `OPENAI_API_KEY`: a restricted project key stored only as a server environment variable
- `OPENAI_VOICE_MODEL`: `gpt-live-1`
- `OPENAI_DELEGATION_MODEL`: `gpt-6-luna`
- `ALLOWED_ORIGINS`: the exact HTTPS production origin, such as `https://example.vercel.app`

Add preview origins deliberately if previews need voice. Never create `VITE_OPENAI_API_KEY`; `VITE_` values are shipped to browsers.

## 4. Cost and abuse controls

The product currently has no login. An origin header check helps reject accidental cross-site calls but is not authentication and can be forged outside a browser.

Before sharing a public URL:

1. Set a low OpenAI project budget and usage alerts.
2. Add IP/session rate limits in front of `POST /api/voice/session`.
3. Monitor session creation and provider errors.
4. Keep model names configurable so unavailable access fails explicitly.
5. Rotate the project key if it is ever logged or exposed.

## 5. Production smoke test

Use desktop Chrome over HTTPS:

1. Open the root URL and verify the board appears without login.
2. Start voice and grant microphone access.
3. Ask “What is on e1?” and verify the answer is “White king.”
4. Say “Move e2 to e4,” verify that the position does not change before confirmation, then say “yes.”
5. Verify the move is announced and Stockfish replies once.
6. Ask for a hint; verify it proposes or describes one legal move only.
7. End voice and verify the browser microphone indicator turns off.
8. Reload and confirm the game can be reconstructed from saved move history.

Repeat the accessibility checklist in [`docs/MANUAL_ACCESSIBILITY_TESTS.md`](docs/MANUAL_ACCESSIBILITY_TESTS.md). Record actual latency and errors; do not treat mocked tests as proof that audio works.
