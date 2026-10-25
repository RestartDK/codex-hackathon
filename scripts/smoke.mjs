import assert from "node:assert/strict";

const baseURL = new URL(process.argv[2] ?? "http://127.0.0.1:3000");

async function get(path) {
  const url = new URL(path, baseURL);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `${url} must return HTTP 200`);
  return response;
}

async function getHtml(path) {
  const response = await get(path);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/u);
  return response.text();
}

const landing = await getHtml("/");
assert.match(landing, /<title>Play by Voice — Play beyond the screen\.<\/title>/u);
assert.match(landing, /href="\/dashboard\/"/u, "the landing play action opens the game picker");
assert.match(
  landing,
  /href="\/landing\/styles\.css"/u,
  "landing assets resolve from the root address",
);
assert.doesNotMatch(landing, /\/src\/main\.tsx/u, "the root address does not boot the game app");
const landingStyles = await get("/landing/styles.css");
assert.match(landingStyles.headers.get("content-type") ?? "", /text\/css/u);
const legacyLanding = await getHtml("/landing/");
assert.match(
  legacyLanding,
  /<link rel="canonical" href="\/" \/>/u,
  "the old landing URL still reaches the page",
);

for (const path of ["/dashboard", "/dashboard/"]) {
  const html = await getHtml(path);
  assert.match(html, /<div id="root"><\/div>/u, `${path} boots the game app`);
  assert.doesNotMatch(html, /Play beyond the screen\./u, `${path} does not serve the landing page`);
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu)];
  assert.ok(sources.length > 0, `${path} must include a module entry`);
  for (const [, source] of sources) {
    const script = await get(source);
    assert.match(script.headers.get("content-type") ?? "", /javascript|typescript/u);
  }
}

const engineScript = await get("/stockfish/stockfish-19-lite-single.js");
assert.match(engineScript.headers.get("content-type") ?? "", /javascript/u);
const engineWasm = await get("/stockfish/stockfish-19-lite-single.wasm");
assert.match(engineWasm.headers.get("content-type") ?? "", /application\/wasm/u);

const foreignVoiceSession = await fetch(new URL("/api/voice/session", baseURL), {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://not-allowed.example" },
  body: JSON.stringify({ sdp: "v=0" }),
});
assert.equal(foreignVoiceSession.status, 403, "the chess voice endpoint refuses foreign origins");

const health = await get("/api/health");
assert.match(health.headers.get("content-type") ?? "", /application\/json/u);
assert.deepEqual(await health.json(), { status: "ok" });

const catalogResponse = await get("/api/games");
const catalog = await catalogResponse.json();
assert.ok(
  catalog.games.some((game) => game.id === "loups-garous" && game.capabilities.voiceCommands),
);

const createdResponse = await fetch(new URL("/api/games", baseURL), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Smoke", count: 4, start: false, testMode: true }),
});
assert.equal(createdResponse.status, 200, "a valid game can be created");
const created = await createdResponse.json();
assert.equal(typeof created.session, "string", "the game returns a session token once");
assert.equal(created.gameType, "loups-garous", "the game identifies its registered module");
assert.equal(created.testMode, true, "the quick test is marked in the game view");
assert.equal(created.players.length, 4, "the quick test creates four players");
assert.equal(created.me.role, "seer", "the quick test always gives the human the Seer role");
assert.ok(
  created.players.slice(1).every((player) => player.controller === "bot"),
  "the quick test uses bot opponents without model calls",
);
assert.ok(created.players.every((player) => player.revealedRole === undefined));

const route = `/api/games/${created.id}`;
const unauthorized = await fetch(new URL(route, baseURL));
assert.equal(unauthorized.status, 401, "game reads require a session");
const sessionResponse = await fetch(new URL(route, baseURL), {
  headers: { "X-Game-Session": created.session },
});
assert.equal(sessionResponse.status, 200, "the session can read its game");
const sessionView = await sessionResponse.json();
assert.equal(sessionView.session, undefined, "game reads do not repeat the token");

const unauthorizedGuide = await fetch(new URL(`${route}/assistant`, baseURL), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "What is my role?" }),
});
assert.equal(unauthorizedGuide.status, 401, "the game guide requires a session");
const guideResponse = await fetch(new URL(`${route}/assistant`, baseURL), {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Game-Session": created.session },
  body: JSON.stringify({ message: "What is my role?", history: [] }),
});
const guide = await guideResponse.json();
assert.equal(guideResponse.status, 200, guide.error ?? "the game guide responds");
assert.equal(typeof guide.reply, "string", "the game guide has a text reply");
assert.ok(["local", "model"].includes(guide.mode), "the guide labels its response mode");

async function action(action) {
  return await actionWithId(action, crypto.randomUUID());
}

async function actionWithId(action, requestId) {
  const response = await fetch(new URL(`${route}/action`, baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Game-Session": created.session,
      "X-Request-Id": requestId,
    },
    body: JSON.stringify(action),
  });
  const body = await response.json();
  assert.equal(response.status, 200, body.error ?? `action ${action.type} succeeds`);
  return body;
}

let state = await action({ type: "start" });
if (state.phase === "cupid") {
  const candidates = state.players.filter((player) => player.alive && player.id !== state.me.id);
  state = await action({ type: "lovers", first: candidates[0].id, second: candidates[1].id });
}
assert.equal(state.phase, "night", "the opening phase leads to a night");
const invalidNight = await fetch(new URL(`${route}/action`, baseURL), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Game-Session": created.session,
    "X-Request-Id": crypto.randomUUID(),
  },
  body: JSON.stringify({ type: "night", target: "not-a-player" }),
});
assert.equal(invalidNight.status, 400, "illegal actions are rejected");
const unchanged = await (
  await fetch(new URL(route, baseURL), {
    headers: { "X-Game-Session": created.session },
  })
).json();
assert.equal(unchanged.phase, "night", "rejected actions do not partially change the game");
assert.equal(
  unchanged.me.investigations.length,
  0,
  "rejected actions do not leave private findings",
);
const choices = state.players.filter((player) => player.alive && player.id !== state.me.id);
let submittedAction;
const receiptId = crypto.randomUUID();
if (state.me.role === "werewolf") {
  const wolfNames = new Set(state.me.werewolfTeam ?? []);
  const target = choices.find((player) => !wolfNames.has(player.name));
  submittedAction = { type: "night", target: target.id };
} else if (state.me.role === "seer") {
  submittedAction = { command: `investigate ${choices[0].name}` };
} else {
  submittedAction = { type: "night" };
}
state = await actionWithId(submittedAction, receiptId);
assert.deepEqual(
  await actionWithId(submittedAction, receiptId),
  state,
  "retries with the same request ID return the original result",
);
assert.ok(["day", "hunter", "over"].includes(state.phase), "night actions resolve through the API");
if (state.phase === "day") {
  state = await action({ command: "hear the villagers" });
  assert.ok(
    state.feed.some((entry) => entry.kind === "speech"),
    "typed commands can request discussion",
  );
  state = await action({ command: "begin vote" });
  assert.equal(state.phase, "vote", "typed commands can open the village vote");
  state = await action({ command: "vote Camille" });
  assert.ok(
    ["night", "hunter", "over"].includes(state.phase),
    "typed votes resolve through the API",
  );
}

process.stdout.write(`Frontend modules and Nitro API verified at ${baseURL.origin}\n`);
