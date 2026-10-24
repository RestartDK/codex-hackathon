import assert from "node:assert/strict";

const baseURL = new URL(process.argv[2] ?? "http://127.0.0.1:3000");

async function get(path) {
  const url = new URL(path, baseURL);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `${url} must return HTTP 200`);
  return response;
}

const home = await get("/");
assert.match(home.headers.get("content-type") ?? "", /text\/html/u);
const html = await home.text();
const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu)];
assert.ok(sources.length > 0, "The frontend must include a module entry");

for (const [, source] of sources) {
  const script = await get(source);
  assert.match(script.headers.get("content-type") ?? "", /javascript|typescript/u);
}

const health = await get("/api/health");
assert.match(health.headers.get("content-type") ?? "", /application\/json/u);
assert.deepEqual(await health.json(), { status: "ok" });

process.stdout.write(`Frontend modules and Nitro API verified at ${baseURL.origin}\n`);
