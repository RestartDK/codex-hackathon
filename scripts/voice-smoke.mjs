import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3065";
const session = process.env.VOICE_BROWSER_SESSION ?? "voice-access-smoke";
const evidence = resolve(process.env.VOICE_EVIDENCE_DIR ?? ".voice-evidence");
const fixtureHash = createHash("sha256").update(installVoiceBoundary.toString()).digest("hex").slice(0, 12);
const fixturePath = resolve(evidence, `../voice-boundaries-${fixtureHash}.js`);
mkdirSync(evidence, { recursive: true });

function browser(args, input) {
  let stdout;
  try {
    stdout = execFileSync("agent-browser", ["--session", session, "--json", "--init-script", fixturePath, ...args], {
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
    actions: [],
    streams: [],
    game: null,
    fixture: null,
    sequence: 0,
    recognizer: null,
    mediaError: null,
    mediaRequests: 0,
    deferMedia: false,
    sessionError: null,
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
    async say(text) {
      if (!this.recognizer) return this.call("submit_player_command", { command: text });
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
    constructor() { test.peer = this; }
    createDataChannel() {
      this.channel = new Channel();
      test.channels.push(this.channel);
      return this.channel;
    }
    addTrack() {}
    async createOffer() { return { type: "offer", sdp: "smoke-offer" }; }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription() { this.channel.receive({ type: "session.started" }); }
    fail() { this.connectionState = "failed"; this.onconnectionstatechange?.(); }
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
    value: { getUserMedia: async () => {
      test.mediaRequests += 1;
      if (test.deferMedia) await new Promise(resolve => { test.releaseMedia = resolve; });
      if (test.mediaError) throw new DOMException("Simulated permission failure", test.mediaError);
      const track = { kind: "audio", enabled: true, stopped: false, stop() { this.stopped = true; } };
      const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
      test.streams.push(stream);
      return stream;
    } },
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
      if (test.sessionError) return Response.json({ error: "Simulated voice service failure" }, { status: test.sessionError });
      return Response.json({ transport: { sdp: "smoke-answer" } });
    }
    if (/\/api\/games\/[^/]+\/voice$/.test(url.pathname)) {
      test.requests.push({ endpoint: url.pathname });
      return Response.json({ sdp: "smoke-answer" });
    }
    if (url.pathname === "/api/games" && init?.method === "POST" && test.fixture === "witch") {
      init = { ...init, body: JSON.stringify({
        ...JSON.parse(init.body),
        count: 4,
        testMode: false,
        skipIntro: true,
        roleCounts: { werewolf: 1, witch: 1, villager: 2, seer: 0, cupid: 0, hunter: 0 },
      }) };
      for (let attempt = 0; attempt < 40; attempt++) {
        const response = await originalFetch(input, init);
        const state = await response.clone().json();
        if (!response.ok) throw new Error(JSON.stringify(state));
        if (state.me?.role === "witch") {
          test.game = state;
          return response;
        }
      }
      throw new Error("Could not obtain a Witch game through the real create API");
    }
    if (/\/api\/games\/[^/]+\/action$/.test(url.pathname) && init?.body)
      test.actions.push(JSON.parse(init.body));
    const response = await originalFetch(input, init);
    if (/\/api\/games(?:\/[^/]+(?:\/action)?)?$/.test(url.pathname) && response.ok) {
      const state = await response.clone().json();
      if (state.me && state.phase) test.game = state;
    }
    return response;
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

function say(text) {
  evaluate(`window.__voiceTest.say(${JSON.stringify(text)})`);
}

function selectedSettings() {
  return evaluate('JSON.parse(localStorage.getItem("chess-by-sparsh-settings"))');
}

function call(name, args = {}) {
  return evaluate(`window.__voiceTest.call(${JSON.stringify(name)}, ${JSON.stringify(args)})`);
}

writeFileSync(fixturePath, `(${installVoiceBoundary.toString()})();`);

function openApp(saved = null) {
  browser(["open", `${base}/dashboard/`]);
  waitFor('document.querySelector(".companion-dock")');
  evaluate("localStorage.clear()");
  if (saved) evaluate(`localStorage.setItem("chess-by-sparsh-save", ${JSON.stringify(JSON.stringify(saved))})`);
  browser(["reload"]);
  waitFor('document.querySelector(".companion-dock")');
  browser(["click", '[aria-label="Start voice companion"]']);
  waitFor('document.querySelector(".voice-connected")');
}

const results = [];
async function scenario(name, run) {
  if (process.env.VOICE_CASE && !name.toLowerCase().includes(process.env.VOICE_CASE.toLowerCase())) return;
  try {
    await run();
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
    browser(["screenshot", resolve(evidence, `${results.length}-pass.png`)]);
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
    browser(["screenshot", resolve(evidence, "chess-setup-after.png")]);
    call("set_preference", { preference: "playerColor", value: "b" });
    call("game_control", { action: "start_game" });
    waitFor('document.querySelector(".page-chess")');
    const settings = evaluate('JSON.parse(localStorage.getItem("chess-by-sparsh-settings"))');
    assert.equal(settings.difficulty, "club");
    assert.equal(settings.playerColor, "b");
  });

  await scenario("Werewolf configuration and audio work before a session exists", () => {
    openApp();
    call("navigate_app", { destination: "loups-garous" });
    waitFor('document.querySelector(".ww-rail") && document.querySelector(".ww-companion-dock.voice-connected") && document.body.textContent.includes("Who do you want")');
    say("solo");
    waitFor('document.querySelector(".ww-count-value")');
    say("set players to 6");
    waitFor('Number.parseInt(document.querySelector(".ww-count-value")?.textContent) === 6');
    say("explain the game as we play off");
    waitFor('document.querySelector(".ww-guidance input[type=checkbox]")?.checked === false');
    say("audio settings");
    waitFor('document.querySelector("[role=dialog]")');
    say("set volume to 35");
    waitFor('JSON.parse(localStorage.getItem("chess-by-sparsh-settings")).voiceVolume === 35');
    say("set speech speed to 1.2");
    waitFor('[...document.querySelectorAll("input[type=range]")].some(x => Number(x.value) === 1.2)');
    say("close dialog");
    waitFor('!document.querySelector("[role=dialog]")');
    say("back");
    waitFor('!document.querySelector(".ww-count-value")');
    say("solo");
    waitFor('Number.parseInt(document.querySelector(".ww-count-value")?.textContent) === 6');
  });

  await scenario("Leaving Werewolf by voice keeps the next game's voice active", () => {
    openApp();
    call("navigate_app", { destination: "loups-garous" });
    waitFor('document.querySelector(".ww-rail") && document.querySelector(".ww-companion-dock.voice-connected") && document.body.textContent.includes("Who do you want")');
    say("play tic tac toe");
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "tic-tac-toe"');
    waitFor('window.__voiceTest.channels.at(-1)?.readyState === "open"');
    assert.equal(evaluate('window.__voiceTest.recognizer'), null);
    const oldStreams = evaluate('window.__voiceTest.streams.slice(0,-1).every(s => s.getTracks().every(t => t.stopped))');
    assert.equal(oldStreams, true);
  });

  await scenario("Witch uses both potions through recognized speech and the real game API", () => {
    openApp();
    call("navigate_app", { destination: "loups-garous" });
    waitFor('document.querySelector(".ww-rail") && document.querySelector(".ww-companion-dock.voice-connected") && document.body.textContent.includes("Who do you want")');
    evaluate('window.__voiceTest.fixture = "witch"');
    say("start the game");
    waitFor('window.__voiceTest.game?.me.role === "witch" && window.__voiceTest.game.phase === "night"');
    const before = evaluate('window.__voiceTest.game');
    const victim = before.me.wolfVictim;
    assert.ok(victim, "The real server must have prepared a wolf victim");
    const poison = before.players.find(p => p.alive && p.id !== before.me.id && p.name !== victim);
    assert.ok(poison);
    say("continue");
    say(`save ${victim === before.me.name ? "me" : victim} and poison ${poison.name}`);
    waitFor('window.__voiceTest.game?.phase !== "night"');
    const after = evaluate('window.__voiceTest.game');
    assert.equal(after.me.witchHealAvailable, false);
    assert.equal(after.me.witchPoisonAvailable, false);
    assert.equal(after.players.find(p => p.name === victim).alive, true);
    assert.equal(after.players.find(p => p.id === poison.id).alive, false);
  });

  await scenario("Chess draft survives reversible steps, Help, Audio, and defaults", () => {
    openApp();
    call("navigate_app", { destination: "chess" });
    waitFor('document.querySelector(".page-chess")');
    call("game_control", { action: "new_game" });
    call("chess_setup", { action: "choose_opponent", value: "computer" });
    call("chess_setup", { action: "choose_difficulty", value: "intermediate" });
    call("chess_setup", { action: "choose_color", value: "random" });
    call("chess_setup", { action: "choose_timer", value: "off" });
    call("navigate_app", { destination: "help" });
    call("app_control", { action: "back" });
    waitFor('document.querySelector(".setup-panel")?.textContent.includes("Explain")');
    assert.match(call("chess_setup", { action: "read", value: null }).message, /rules/i);
    call("navigate_app", { destination: "audio" });
    call("app_control", { action: "back" });
    waitFor('document.querySelector(".chess-setup-page")');
    call("chess_setup", { action: "choose_rules", value: "off" });
    call("chess_setup", { action: "back", value: null });
    call("chess_setup", { action: "back", value: null });
    waitFor('document.querySelector(".setup-panel")?.textContent.includes("Set a timer")');
    call("chess_setup", { action: "back", value: null });
    waitFor('document.querySelector(".setup-panel button[aria-pressed=true]")?.textContent.trim() === "Random"');
    call("chess_setup", { action: "start", value: null });
    waitFor('document.querySelector(".page-chess")');
    assert.equal(selectedSettings().difficulty, "casual");
    assert.ok(["w", "b"].includes(selectedSettings().playerColor));
    call("game_control", { action: "new_game" });
    call("chess_setup", { action: "defaults", value: null });
    waitFor('document.querySelector(".page-chess")');
    assert.equal(selectedSettings().difficulty, "beginner");
    assert.equal(selectedSettings().playerColor, "w");
  });

  await scenario("Chess result retains keyboard-accessible typed fallback and voice review dismisses it", () => {
    openApp();
    call("navigate_app", { destination: "chess" });
    waitFor('document.querySelector(".page-chess")');
    assert.equal(call("propose_move", { from: "e2", to: "e4", piece: null, promotion: null }).status, "completed");
    assert.equal(call("game_control", { action: "resign" }).status, "completed");
    waitFor('document.querySelector("[role=dialog]")');
    assert.equal(evaluate('Boolean(document.querySelector("[role=dialog] .companion-dock"))'), true);
    assert.equal(evaluate('Boolean(document.querySelector(".companion-dock").closest("[inert]"))'), false);
    browser(["click", '[aria-label="Type a command"]']);
    waitFor('document.querySelector("#command-panel input")');
    browser(["fill", "#command-panel input", "review game"]);
    browser(["press", "Enter"]);
    waitFor('!document.querySelector("[role=dialog]")');
    assert.match(evaluate('document.body.textContent'), /review/i);
  });

  await scenario("Ludo exposes authored rules and saved-game pause/resume state", () => {
    openApp();
    call("navigate_app", { destination: "ludo" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "ludo"');
    const guide = call("get_game_guide").message;
    assert.match(guide, /six/i);
    assert.match(guide, /safe/i);
    assert.match(guide, /capture/i);
    call("propose_game_control", { action: "pause" });
    assert.equal(call("get_position").paused, true);
    call("propose_game_control", { action: "resume" });
    assert.equal(call("get_position").paused, false);
    evaluate("Math.random = () => 0.99");
    assert.equal(call("roll_dice").ok, true);
    assert.equal(call("propose_token_move", { tokenId: 1 }).ok, true);
    waitFor('JSON.parse(localStorage.getItem("voice-game-companion-ludo-save")).state.history.length > 0');
    call("navigate_app", { destination: "tic-tac-toe" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "tic-tac-toe"');
    call("navigate_app", { destination: "ludo" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "ludo"');
    assert.equal(call("get_position").awaitingStartChoice, true);
    call("propose_game_control", { action: "resume" });
    assert.equal(call("get_position").awaitingStartChoice, false);
  });

  await scenario("Tic-Tac-Toe exposes authored content and authoritative state", () => {
    openApp();
    call("navigate_app", { destination: "tic-tac-toe" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "tic-tac-toe"');
    assert.match(call("get_tic_tac_toe_introduction").message, /three|row/i);
    assert.match(call("get_tic_tac_toe_guide").message, /square|center/i);
    assert.match(call("get_tic_tac_toe_dashboard").message, /board|score/i);
    call("propose_tic_tac_toe_control", { action: "pause" });
    assert.equal(call("get_tic_tac_toe_state").paused, true);
    call("propose_tic_tac_toe_control", { action: "resume" });
    call("place_tic_tac_toe_mark", { position: "center" });
    assert.equal(call("inspect_tic_tac_toe_cell", { position: "center" }).mark, "X");
    call("navigate_app", { destination: "ludo" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "ludo"');
    call("navigate_app", { destination: "tic-tac-toe" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "tic-tac-toe"');
    assert.equal(call("get_tic_tac_toe_state").awaitingStartChoice, true);
  });

  await scenario("Intercept reads revealed transcript entries older than its recent recap", () => {
    openApp();
    call("navigate_app", { destination: "intercept" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "intercept"');
    call("propose_story_control", { action: "resume" });
    const first = call("get_story_state").passage;
    for (let i = 0; i < 5; i++) {
      const state = call("get_story_state");
      if (!state.choices.length) break;
      const result = call("choose_story_option", { choiceNumber: state.choices[0].number });
      assert.equal(result.status, "completed", JSON.stringify(result));
    }
    const page = call("read_story_transcript", { page: 1, pageSize: 20 });
    assert.ok(page.totalEntries > 5);
    assert.ok(page.message.includes(Array.isArray(first) ? first[0] : first));
    assert.ok(page.message.length > call("get_story_recap").message.length);
  });

  await scenario("Voice soft pause blocks mutations while capture remains available for resume", () => {
    openApp();
    call("navigate_app", { destination: "tic-tac-toe" });
    waitFor('window.__voiceTest.requests.at(-1)?.gameId === "tic-tac-toe"');
    const before = call("get_tic_tac_toe_state").revision;
    assert.equal(call("voice_control", { action: "pause_commands" }).commandsPaused, true);
    assert.match(call("place_tic_tac_toe_mark", { position: "center" }).message, /paused/i);
    assert.equal(evaluate('window.__voiceTest.streams.at(-1).getAudioTracks()[0].enabled'), true);
    assert.equal(call("voice_control", { action: "resume_commands" }).commandsPaused, false);
    assert.equal(call("get_tic_tac_toe_state").revision, before);
    call("place_tic_tac_toe_mark", { position: "center" });
    assert.equal(call("inspect_tic_tac_toe_cell", { position: "center" }).mark, "X");
  });

  await scenario("Mute reports its reactivation limit and explicit end releases all capture", () => {
    openApp();
    assert.match(call("voice_control", { action: "mute_microphone" }).message, /cannot hear|on-screen/i);
    assert.equal(evaluate('window.__voiceTest.streams.at(-1).getAudioTracks()[0].enabled'), false);
    browser(["click", '[aria-label="Unmute microphone"]']);
    assert.equal(call("voice_control", { action: "read_state" }).microphoneMuted, false);
    const requests = evaluate('window.__voiceTest.requests.length');
    assert.match(call("voice_control", { action: "end_voice" }).message, /cannot hear|on-screen/i);
    waitFor('window.__voiceTest.channels.every(c => c.readyState === "closed") && window.__voiceTest.streams.every(s => s.getTracks().every(t => t.stopped))');
    evaluate('new Promise(resolve => setTimeout(resolve, 4500))');
    assert.equal(evaluate('window.__voiceTest.requests.length'), requests);
  });

  await scenario("Unexpected connection loss recovers without retaining the old microphone", () => {
    openApp();
    const requests = evaluate('window.__voiceTest.requests.length');
    evaluate('window.__voiceTest.peer.fail()');
    waitFor('window.__voiceTest.requests.length === ' + (requests + 1) + ' && document.querySelector(".voice-connected")');
    assert.equal(evaluate('window.__voiceTest.streams.slice(0,-1).every(s => s.getTracks().every(t => t.stopped))'), true);
    assert.equal(call("voice_control", { action: "read_state" }).status, "completed");
  });

  await scenario("Denied microphone permission does not cause automatic retries", () => {
    openApp();
    browser(["click", '[aria-label="End voice"]']);
    waitFor('window.__voiceTest.channels.every(c => c.readyState === "closed")');
    evaluate('window.__voiceTest.mediaError = "NotAllowedError"');
    browser(["click", '[aria-label="Start voice companion"]']);
    waitFor('document.querySelector(".voice-error")');
    const attempts = evaluate('window.__voiceTest.mediaRequests');
    evaluate('new Promise(resolve => setTimeout(resolve, 4500))');
    assert.equal(evaluate('window.__voiceTest.mediaRequests'), attempts);
  });

  await scenario("Landing voice requires activation and hands consent to the dashboard once", () => {
    browser(["open", `${base}/`]);
    assert.equal(evaluate('window.__voiceTest.recognizer'), null);
    assert.equal(evaluate('window.__voiceTest.streams.length'), 0);
    browser(["click", "#voice-navigation-toggle"]);
    waitFor('window.__voiceTest.recognizer');
    say("open the menu");
    waitFor('document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "true"');
    say("close the menu");
    say("pause animations");
    waitFor('document.documentElement.classList.contains("motion-paused")');
    say("resume animations");
    say("open FAQ about voice");
    waitFor('[...document.querySelectorAll(".bubble-faq")].some(x => x.dataset.expanded === "true")');
    say("close FAQ");
    waitFor('[...document.querySelectorAll(".bubble-faq")].every(x => x.dataset.expanded !== "true")');
    say("start playing");
    waitFor('location.pathname === "/dashboard/" && document.querySelector(".voice-connected")');
    assert.equal(evaluate('new URLSearchParams(location.search).has("voice")'), false);
    assert.equal(evaluate('window.__voiceTest.requests.length'), 1);
    browser(["reload"]);
    waitFor('document.querySelector(".companion-dock")');
    assert.equal(evaluate('window.__voiceTest.requests.length'), 0);
  });

  await scenario("Landing fallback transcribes before a game exists", () => {
    browser(["open", `${base}/`]);
    evaluate('delete window.SpeechRecognition; delete window.webkitSpeechRecognition');
    browser(["click", "#voice-navigation-toggle"]);
    waitFor('window.__voiceTest.requests.some(r => r.mode === "lobby")');
    evaluate('window.__voiceTest.channels.at(-1).receive({ type: "conversation.item.input_audio_transcription.completed", transcript: "open the menu" })');
    waitFor('document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "true"');
    evaluate('window.__voiceTest.channels.at(-1).receive({ type: "conversation.item.input_audio_transcription.completed", transcript: "stop voice" })');
    waitFor('window.__voiceTest.streams.every(s => s.getTracks().every(t => t.stopped))');
  });


  await scenario("Stopping landing voice while microphone permission is pending releases the late stream", () => {
    browser(["open", `${base}/`]);
    evaluate('delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.__voiceTest.deferMedia = true');
    browser(["click", "#voice-navigation-toggle"]);
    waitFor('typeof window.__voiceTest.releaseMedia === "function"');
    browser(["click", "#voice-navigation-toggle"]);
    evaluate('window.__voiceTest.releaseMedia()');
    waitFor('window.__voiceTest.streams.length === 1');
    assert.equal(evaluate('window.__voiceTest.streams.every(s => s.getTracks().every(t => t.stopped))'), true);
    assert.equal(evaluate('window.__voiceTest.channels.length'), 0);
  });

  await scenario("A rejected landing voice negotiation releases capture and offers a retry", () => {
    browser(["open", `${base}/`]);
    evaluate('delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.__voiceTest.sessionError = 503');
    browser(["click", "#voice-navigation-toggle"]);
    waitFor('document.querySelector("#voice-navigation-toggle").getAttribute("aria-pressed") === "false"');
    assert.equal(evaluate('window.__voiceTest.streams.every(s => s.getTracks().every(t => t.stopped))'), true);
    assert.match(evaluate('document.querySelector("#voice-navigation-captions").textContent'), /failure/);
  });

  await scenario("Denied browser speech recognition is not displayed as listening", () => {
    browser(["open", `${base}/`]);
    browser(["click", "#voice-navigation-toggle"]);
    evaluate('window.__voiceTest.recognizer.onerror({ error: "not-allowed" })');
    waitFor('document.querySelector("#voice-navigation-toggle").getAttribute("aria-pressed") === "false"');
    assert.equal(evaluate('window.__voiceTest.recognizer'), null);
  });


  await scenario("Promotion keeps the typed fallback inside its keyboard focus scope", () => {
    const game = new Chess();
    for (const move of ["a4", "b5", "axb5", "a6", "bxa6", "Ra7", "a7", "Rb7"]) game.move(move);
    openApp({ version: 3, fen: game.fen(), history: game.history(), result: null, timestamp: Date.now() });
    call("navigate_app", { destination: "chess" });
    waitFor('document.querySelector(".page-chess")');
    assert.equal(call("game_control", { action: "resume" }).status, "completed");
    browser(["click", '[data-square="a7"]']);
    browser(["click", '[data-square="a8"]']);
    waitFor('document.querySelector(".promotion-dialog")');
    assert.equal(evaluate('Boolean(document.querySelector("[role=dialog] .companion-dock"))'), true);
    assert.equal(evaluate('Boolean(document.querySelector("main").inert)'), true);
    browser(["click", '[aria-label="Type a command"]']);
    waitFor('document.querySelector("#command-panel input")');
    browser(["fill", "#command-panel input", "knight"]);
    browser(["press", "Enter"]);
    waitFor('!document.querySelector(".promotion-dialog")');
    assert.match(JSON.stringify(call("inspect_square", { square: "a8" })), /knight/i);
  });

  await scenario("Unexpected reconnect preserves command pause and still permits audio preferences", () => {
    openApp();
    call("voice_control", { action: "pause_commands" });
    const requests = evaluate('window.__voiceTest.requests.length');
    evaluate('window.__voiceTest.peer.fail()');
    waitFor('window.__voiceTest.requests.length === ' + (requests + 1) + ' && document.querySelector(".voice-connected")');
    assert.equal(call("voice_control", { action: "read_state" }).commandsPaused, true);
    assert.equal(call("set_preference", { preference: "voiceVolume", value: 25 }).status, "completed");
    assert.equal(selectedSettings().voiceVolume, 25);
    call("voice_control", { action: "resume_commands" });
  });

  await scenario("Rate-limited voice startup does not cause automatic microphone retries", () => {
    openApp();
    browser(["click", '[aria-label="End voice"]']);
    waitFor('window.__voiceTest.channels.every(c => c.readyState === "closed")');
    evaluate('window.__voiceTest.sessionError = 429');
    browser(["click", '[aria-label="Start voice companion"]']);
    waitFor('document.querySelector(".voice-error")?.textContent.includes("Too many")');
    const attempts = evaluate('window.__voiceTest.mediaRequests');
    evaluate('new Promise(resolve => setTimeout(resolve, 4500))');
    assert.equal(evaluate('window.__voiceTest.mediaRequests'), attempts);
    assert.equal(evaluate('window.__voiceTest.streams.every(s => s.getTracks().every(t => t.stopped))'), true);
  });

  await scenario("Disconnected typed voice status does not claim capture is listening", () => {
    openApp();
    browser(["click", '[aria-label="End voice"]']);
    waitFor('window.__voiceTest.channels.every(c => c.readyState === "closed")');
    browser(["click", '[aria-label="Type a command"]']);
    waitFor('document.querySelector("#command-panel input")');
    browser(["fill", "#command-panel input", "voice status"]);
    browser(["press", "Enter"]);
    waitFor('document.querySelector(".companion-caption")?.textContent.includes("not connected")');
  });

  await scenario("Landing live transcript followed by compatibility completion executes once", () => {
    browser(["open", `${base}/`]);
    evaluate('delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.__voiceTest.scrolls = 0; const scroll = window.scrollBy.bind(window); window.scrollBy = (...args) => { window.__voiceTest.scrolls += 1; scroll(...args); }');
    browser(["click", "#voice-navigation-toggle"]);
    waitFor('window.__voiceTest.requests.some(r => r.mode === "lobby")');
    evaluate('window.__voiceTest.channels.at(-1).receive({ type: "session.input_transcript.delta", delta: "scroll down" })');
    waitFor('window.__voiceTest.scrolls === 1');
    evaluate('window.__voiceTest.channels.at(-1).receive({ type: "conversation.item.input_audio_transcription.completed", transcript: "scroll down" })');
    assert.equal(evaluate('window.__voiceTest.scrolls'), 1);
    browser(["click", "#voice-navigation-toggle"]);
    assert.equal(evaluate('window.__voiceTest.streams.every(s => s.getTracks().every(t => t.stopped))'), true);
  });

} finally {
  writeFileSync(resolve(evidence, "voice-smoke.json"), JSON.stringify({ base, results }, null, 2));
  if (!process.env.VOICE_KEEP_BROWSER) browser(["close"]);
}
process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
