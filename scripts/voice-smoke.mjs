import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3065";
const session = process.env.VOICE_BROWSER_SESSION ?? "voice-access-smoke";
const evidence = resolve(process.env.VOICE_EVIDENCE_DIR ?? ".voice-evidence");
mkdirSync(evidence, { recursive: true });

function browser(args, input) {
  let stdout;
  try {
    stdout = execFileSync("agent-browser", ["--session", session, "--json", ...args], {
      input,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`${error.message}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`);
  }
  const result = JSON.parse(stdout);
  assert.equal(result.success, true, JSON.stringify(result));
  return result.data;
}

function evaluate(source) {
  return browser(["eval", "--stdin"], source).result;
}

function installVoiceBoundary() {
  const originalFetch = window.fetch.bind(window);
  const test = {
    channels: [],
    transcripts: [],
    spoken: [],
    outputs: new Map(),
    requests: [],
    sequence: 0,
    recognizer: null,
    async call(name, args = {}) {
      const channel = [...this.channels].reverse().find((item) => item.readyState === "open");
      if (!channel) throw new Error("No active voice data channel");
      const callId = `smoke-${++this.sequence}`;
      const response = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.outputs.delete(callId);
          reject(new Error(`No voice-tool response for ${name}`));
        }, 8_000);
        this.outputs.set(callId, (output) => {
          clearTimeout(timer);
          resolve(JSON.parse(output));
        });
      });
      channel.receive({
        type: "response.event",
        event: {
          type: "response.output_item.done",
          item: { type: "function_call", name, call_id: callId, arguments: JSON.stringify(args) },
        },
      });
      return response;
    },
    say(text) {
      if (!this.recognizer) throw new Error("No active speech recognizer");
      this.transcripts.push(text);
      this.recognizer.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: text }, length: 1, isFinal: true }],
      });
    },
  };
  class Channel extends EventTarget {
    readyState = "open";
    receive(payload) {
      const event = new MessageEvent("message", { data: JSON.stringify(payload) });
      this.dispatchEvent(event);
      this.onmessage?.(event);
    }
    send(raw) {
      const event = JSON.parse(raw);
      if (event.item?.type === "function_call_output") {
        test.outputs.get(event.item.call_id)?.(event.item.output);
        test.outputs.delete(event.item.call_id);
      }
      if (event.type === "session.close") queueMicrotask(() => this.receive({ type: "session.closed" }));
    }
    close() { this.readyState = "closed"; }
  }
  class Peer {
    iceGatheringState = "complete";
    connectionState = "connected";
    createDataChannel() {
      this.channel = new Channel();
      test.channels.push(this.channel);
      return this.channel;
    }
    addTrack() {}
    async createOffer() { return { type: "offer", sdp: "smoke-offer" }; }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription() { this.channel.receive({ type: "session.started" }); }
    close() { this.channel?.close(); this.connectionState = "closed"; }
  }
  class Recognition {
    start() { test.recognizer = this; this.onstart?.(); }
    stop() { if (test.recognizer === this) test.recognizer = null; this.onend?.(); }
  }
  window.__voiceTest = test;
  window.RTCPeerConnection = Peer;
  window.SpeechRecognition = Recognition;
  window.webkitSpeechRecognition = Recognition;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => new MediaStream() },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: async () => ({ state: "granted" }) },
  });
  speechSynthesis.speak = (utterance) => {
    test.spoken.push(utterance.text);
    queueMicrotask(() => utterance.onend?.());
  };
  speechSynthesis.cancel = () => {};
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.pathname === "/api/voice/session") {
      test.requests.push(JSON.parse(init.body));
      return Response.json({ transport: { sdp: "smoke-answer" } });
    }
    if (/\/api\/games\/[^/]+\/voice$/.test(url.pathname)) {
      test.requests.push({ endpoint: url.pathname });
      return Response.json({ sdp: "smoke-answer" });
    }
    return originalFetch(input, init);
  };
  return "voice boundaries installed; game APIs and application handlers are real";
}

function waitFor(expression) {
  return evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 10000;
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() > deadline) return reject(new Error(${JSON.stringify(expression)}));
      requestAnimationFrame(check);
    };
    check();
  })`);
}

function call(name, args = {}) {
  return evaluate(`window.__voiceTest.call(${JSON.stringify(name)}, ${JSON.stringify(args)})`);
}

function openApp() {
  browser(["open", `${base}/dashboard/`]);
  waitFor('document.querySelector(".companion-dock")');
  evaluate("localStorage.clear()");
  browser(["reload"]);
  waitFor('document.querySelector(".companion-dock")');
  evaluate(`(${installVoiceBoundary.toString()})()`);
  browser(["click", '[aria-label="Start voice companion"]']);
  waitFor('document.querySelector(".voice-connected")');
}

const results = [];
async function scenario(name, run) {
  try {
    await run();
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "FAIL", error: String(error) });
    console.error(`FAIL ${name}: ${error}`);
    try { browser(["screenshot", resolve(evidence, `${results.length}-failure.png`)]); } catch {}
  }
}

try {
  await scenario("Chess voice choices update the actual setup and start that configuration", () => {
    openApp();
    call("navigate_app", { destination: "chess" });
    waitFor('document.querySelector(".page-chess")');
    call("game_control", { action: "new_game" });
    waitFor('document.querySelector(".chess-setup-page")');
    call("set_preference", { preference: "difficulty", value: "club" });
    waitFor('document.querySelector(".setup-panel")?.textContent.includes("Choose your pieces")');
    call("set_preference", { preference: "playerColor", value: "b" });
    call("game_control", { action: "start_game" });
    waitFor('document.querySelector(".page-chess")');
    const settings = evaluate('JSON.parse(localStorage.getItem("chess-by-sparsh-settings"))');
    assert.equal(settings.difficulty, "club");
    assert.equal(settings.playerColor, "b");
  });
} finally {
  writeFileSync(resolve(evidence, "voice-smoke.json"), JSON.stringify({ base, results }, null, 2));
  if (!process.env.VOICE_KEEP_BROWSER) browser(["close"]);
}
process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
