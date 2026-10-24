# codex-hackathon

React and TypeScript frontend with a Nitro API, built together with Vite+ into one `.output/` directory.

## Run locally

Use Node 26.12.1, pinned in `.node-version`, and Bun 1.4.4. Vite+ selects the declared Bun version for its package-management commands.

```sh
bun install
bun run dev
```

Open http://localhost:3000. The starter includes a React counter and a link to `GET /api/health`, which returns `{ "status": "ok" }`.

## Check and build

```sh
bun run check
bun run typecheck
bun run build
```

`check` runs Vite+ formatting, lint, and type checks. `typecheck` checks the frontend, Vite configuration, and server routes with TypeScript. `build` also runs TypeScript before producing the frontend and server.

## Run the production server

```sh
bun run start
```

The server listens on http://localhost:3000. Set `PORT` to use another port. The generated `.output/` directory contains the server and static assets.

With the server running, verify the HTML, frontend module responses, and Nitro API from another terminal:

```sh
bun run smoke http://127.0.0.1:3000
```

The same smoke check works against the development server or `bun run preview` when you pass its URL.

## Add application code

- `src/` contains the React frontend.
- `server/api/` contains API routes. `health.get.ts` handles `GET /api/health`.
- `vite.config.ts` combines the React and Nitro plugins with Vite+ lint and formatting settings.
- `scripts/smoke.mjs` checks that the frontend and API share one working server.

Nitro is pinned to `3.0.260903-beta`. This uses the Nitro 3 Vite plugin, not the older Nitro 2 `nitropack` setup. The `vite` dependency and override intentionally point to the matching Vite+ core package so plugins share one Vite instance.
