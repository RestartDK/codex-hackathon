import { defineHandler } from "nitro";
import { navigationTool } from "../../../../src/voice/navigation";

const TOOL_INSTRUCTIONS = `
You are the reasoning layer for a voice-first chess companion. The browser owns the
authoritative chess state. Always use a chess function before stating current board
facts or attempting a game action. Never invent a legal move, square, piece, capture,
check, result, or evaluation. Move requests create proposals; the application requires
a later spoken confirmation before committing them. Never confirm your own proposal;
return the pending action and wait for a separate user affirmation. Use navigate_app
for page and game selection. Chess is the only playable game; never fabricate other
gameplay. Follow saved-game resume and new-game choices from the tool result.
Keep spoken answers concise and say coordinates as a letter followed by a number.
After a move tool reports completion, acknowledge it briefly without repeating the
full move because the application supplies an authoritative move narration.
`.trim();

const sessionAttempts = new Map<string, number[]>();

function exceedsSessionLimit(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (sessionAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < 60_000);
  recent.push(now);
  sessionAttempts.set(key, recent);
  return recent.length > 5;
}

const tools = [
  navigationTool,
  {
    type: "function",
    name: "get_position",
    description: "Get a concise, authoritative summary of the current chess position.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "inspect_square",
    description: "Report which piece occupies one square.",
    parameters: {
      type: "object",
      properties: { square: { type: "string", pattern: "^[a-h][1-8]$" } },
      required: ["square"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "locate_pieces",
    description: "List locations of a piece type for the player or opponent.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", enum: ["player", "opponent", "white", "black"] },
        piece: {
          type: "string",
          enum: ["king", "queen", "rook", "bishop", "knight", "pawn", "all"],
        },
      },
      required: ["owner", "piece"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_legal_moves",
    description: "List legal moves, optionally limited to an origin square.",
    parameters: {
      type: "object",
      properties: { from: { type: ["string", "null"], pattern: "^[a-h][1-8]$" } },
      required: ["from"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_history",
    description: "Read recent committed moves.",
    parameters: {
      type: "object",
      properties: { count: { type: "integer", minimum: 1, maximum: 12 } },
      required: ["count"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "explain_last_move",
    description: "Explain only the verified effects of the latest move without inventing strategy.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "read_board",
    description: "Read every occupied square, one rank, or one file.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["all", "rank", "file"] },
        value: { type: ["string", "null"] },
      },
      required: ["scope", "value"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "propose_move",
    description:
      "Resolve a move and either request confirmation or commit it when move confirmations are disabled.",
    parameters: {
      type: "object",
      properties: {
        from: { type: ["string", "null"], pattern: "^[a-h][1-8]$" },
        to: { type: "string", pattern: "^[a-h][1-8]$" },
        piece: {
          type: ["string", "null"],
          enum: ["king", "queen", "rook", "bishop", "knight", "pawn", null],
        },
        promotion: { type: ["string", "null"], enum: ["queen", "rook", "bishop", "knight", null] },
      },
      required: ["from", "to", "piece", "promotion"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_hint",
    description: "Ask the local analysis engine for one suggested move without playing it.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "propose_best_move",
    description:
      "Ask the local engine for one move and put it through the normal confirmation flow.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "confirm_action",
    description: "Confirm the currently pending action after a separate user affirmation.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "cancel_action",
    description: "Cancel the currently pending action.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "propose_game_control",
    description:
      "Handle resume or propose a consequential game control. New game, undo, and resign require confirmation; resume does not.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["pause", "resume", "new_game", "undo", "resign"] },
      },
      required: ["action"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function allowedOrigins(): string[] {
  return (
    process.env.ALLOWED_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(request: Request, origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  try {
    const requestHost =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host");
    return Boolean(requestHost) && new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function networkErrorCode(error: unknown): string {
  if (!isObject(error)) return "NETWORK_ERROR";
  const cause = isObject(error.cause) ? error.cause : null;
  const first =
    cause && Array.isArray(cause.errors) && isObject(cause.errors[0]) ? cause.errors[0] : null;
  const candidate = cause?.code ?? first?.code ?? error.code;
  return typeof candidate === "string" && /^[A-Z0-9_]+$/.test(candidate)
    ? candidate
    : "NETWORK_ERROR";
}

export default defineHandler(async (event) => {
  const origin = event.req.headers.get("origin");
  if (!isAllowedOrigin(event.req, origin)) {
    return new Response(JSON.stringify({ error: "Unexpected request origin" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (exceedsSessionLimit(event.req)) {
    return new Response(
      JSON.stringify({ error: "Too many voice sessions. Wait a minute and try again." }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured on the server" }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
  }

  let body: unknown;
  try {
    body = await event.req.json();
  } catch {
    body = {};
  }
  if (
    !isObject(body) ||
    typeof body.sdp !== "string" ||
    !body.sdp.trim() ||
    body.sdp.length > 64_000
  ) {
    return new Response(JSON.stringify({ error: "A valid SDP offer is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const greetings = new Map([
    [
      "home",
      "Welcome to Play by Voice. Chess is ready to play. Ask whether the player would like to play chess, then pause and listen.",
    ],
    [
      "chess",
      "Welcome to Chess. The application will provide the current game context. Offer the quick guide or follow the saved-game choice, then pause and listen.",
    ],
    ["loading", "Welcome to Chess. The board is getting ready. Pause and listen."],
    [
      "audio",
      "You are in Audio Settings. Mention narrator volume and ask how you can help, then pause and listen.",
    ],
    ["help", "You are in Help. Offer chess rules or voice-command help, then pause and listen."],
  ]);
  const greeting =
    greetings.get(typeof body.view === "string" ? body.view : "home") ?? greetings.get("home");
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: process.env.OPENAI_VOICE_MODEL ?? "gpt-live-1",
          input: [
            {
              type: "message",
              role: "developer",
              content: [
                {
                  type: "input_text",
                  text: `Greet the player immediately in English. ${greeting}`,
                },
              ],
            },
          ],
          instructions: `You are the calm English-speaking companion in Play by Voice, a voice-first gaming app for blind and low-vision players. Be brief, accept interruptions, and delegate every current board fact and game action. Never claim an action succeeded until its tool result says so.

Backchannel policy:
Use moderate, brief backchannels without competing with the player.

Interruption policy:
Stop speaking when the player interrupts and listen to the correction.

Delegation policy:
Backend tools:
- App navigation: open chess, the game picker, audio settings, and help.
- Chess state: inspect squares and pieces, describe the position, list legal moves and recent moves.
- Chess actions: propose moves, request engine hints or delegated moves, confirm or cancel pending actions, pause, resume, undo, restart, and resign.
Generate <|SpawnThinking|> when:
- The player selects a game or asks to navigate, including saying play chess.
- A reply needs current board facts, legal moves, history, hints, or an evaluation.
- The player requests, confirms, cancels, or corrects a game action. A short yes or no about a pending action needs backend work too.
Do not generate <|SpawnThinking|> when:
- Greeting, giving general rules, offering the guide, or repeating a still-current verified result.
- A brief clarification is needed to understand the player.
Generate <|SpawnThinking|> before answering anything that depends on backend work. Never merely promise a page change or game action; wait for the backend result.

The application tells you which page is open. Start by welcoming the player on that page. On the game picker, ask whether they want to play chess. Chess is the only playable game. Loups-Garous and Tic-Tac-Toe are coming soon; never pretend they can be played. Use navigate_app to open Chess, the game picker, Audio Settings, or Help. After opening Chess, follow the tool result. If a saved game is waiting, ask whether to resume it or start a new game. Call propose_game_control with resume or new_game. New games need confirmation. Leaving an active game also needs confirmation, and saves and pauses the position.

After the game choice, ask whether the player wants a quick spoken guide or already knows how to play. Wait for their answer. Treat yes, please, or teach me as choosing the guide only when no game action is pending. If they decline, acknowledge it briefly and consult a game-state tool before saying whose turn it is.

For the guide, explain checkmate, file letters a through h and ranks one through eight, how each piece moves, and voice commands for moves, squares, pieces, legal moves, history and hints. Explain that moves are read back for confirmation unless the player disables confirmations. They can ask for a hint without moving, or ask you to choose a move, which still needs confirmation. Keep the initial guide under ninety seconds and offer more detail on request.

A pending action always takes priority over tutorial questions. Never confirm your own proposal. Wait for a separate user affirmation before confirm_action. Honor requests to repeat, shorten answers, add detail, slow down or stop speaking. Delegate what did I miss to get_history, and pause or resume to propose_game_control. The application supplies authoritative move and game-over narration. Do not repeat it or invent an outcome.`,

          delegation: {
            type: "responses",
            responses: {
              model: process.env.OPENAI_DELEGATION_MODEL ?? "gpt-6-luna",
              instructions: TOOL_INSTRUCTIONS,
              tools,
              tool_choice: "auto",
              parallel_tool_calls: false,
            },
          },
        },
        transport: { type: "webrtc", sdp: body.sdp },
      }),
    });
  } catch (error) {
    const code = networkErrorCode(error);
    console.warn(`[voice/session] OpenAI connection failed: ${code}`);
    return new Response(
      JSON.stringify({ error: `The voice provider could not be reached (${code}).` }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "The voice provider could not create this session." },
      { status: upstream.status },
    );
  }
  let session: unknown;
  try {
    session = await upstream.json();
  } catch {
    session = null;
  }
  if (
    !isObject(session) ||
    !isObject(session.transport) ||
    typeof session.transport.sdp !== "string"
  ) {
    return Response.json(
      { error: "The voice provider returned an invalid session." },
      { status: 502 },
    );
  }
  return Response.json({ transport: { sdp: session.transport.sdp } });
});
