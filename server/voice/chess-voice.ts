import { navigationTool, PLAYABLE_GAMES_LABEL } from "../../src/voice/navigation.js";
import { preferenceNames } from "../../src/lib/preferences.js";

const DEFAULT_ALLOWED_ORIGINS =
  "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173";

const SESSION_LIMIT = 5;
const SESSION_WINDOW_MS = 60_000;
const MAX_SESSION_CLIENTS = 1_000;

const TOOL_INSTRUCTIONS = `
You are the reasoning layer for a voice-first game companion for blind players.
The browser owns authoritative chess state. Use its tools for board facts and all actions.
Execute valid, unambiguous commands immediately. Never ask for confirmation or require buttons.
make_move plays the move now; play_best_move chooses and plays a legal engine move.
get_hint only describes a suggestion. New game, undo, resign and navigation execute immediately.
Only ask a clarification when the requested move is ambiguous or its promotion piece is missing.
Never invent a move, board fact or successful outcome. Report tool errors without claiming success.
Use get_preferences/set_preference for every audio and chess preference, review_move for history,
and game_control for pause, resume, new_game, undo, resign, return_live, flip_board or retry_engine.
Use navigate_app for page/game selection. ${PLAYABLE_GAMES_LABEL} are playable.
Keep answers brief; say coordinates as a letter then number. The app narrates committed moves.
`.trim();

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
    name: "make_move",
    description: "Play a legal, unambiguous move immediately and update the board.",
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
    name: "play_best_move",
    description: "Choose a legal move using the local engine and play it immediately.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "cancel_action",
    description: "Cancel an unfinished hint or move-selection request.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "game_control",
    description: "Execute a chess control immediately. Never ask for confirmation.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "pause",
            "resume",
            "new_game",
            "undo",
            "resign",
            "return_live",
            "flip_board",
            "retry_engine",
          ],
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "review_move",
    description:
      "Display a historical chess position. Use 0 for the starting position; other numbers are one-based.",
    parameters: {
      type: "object",
      properties: { move: { type: "integer", minimum: 0 } },
      required: ["move"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_preferences",
    description: "Read current audio and chess preferences.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "set_preference",
    description:
      "Change a preference immediately. voiceVolume is 0-100; soundEnabled/screenReaderMode are booleans; playerColor is w/b; gameMode is computer/local; difficulty is beginner/casual/club/expert/nightmare; boardOrientation is white-bottom/flip-turn; boardTheme is classic/marine/ember/forest/midnight; pieceSet is unicode/symbols/outlined/merida. Side or opponent changes start a new chess game.",
    parameters: {
      type: "object",
      properties: {
        preference: { type: "string", enum: preferenceNames },
        value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
      },
      required: ["preference", "value"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const GREETINGS = {
  home: `Welcome to Play by Voice. Say play chess or play Loups-Garous.`,
  chess:
    "Welcome to Chess. The application will provide the current game context. Tell the player they can say a move to play immediately or ask for a quick guide, then listen.",
  loading: "Welcome to Chess. The board is getting ready. Pause and listen.",
  audio:
    "You are in Audio Settings. Mention narrator volume and ask how you can help, then pause and listen.",
  help: "You are in Help. Offer chess rules or voice-command help, then pause and listen.",
} as const;

const INSTRUCTIONS = `You are the calm English-speaking companion in Play by Voice for blind and low-vision players.

Backchannel policy:
Use sparse, brief backchannels. A short command such as play chess, undo, pause, or help is an action, never a backchannel to ignore.

Interruption policy:
Stop speaking immediately when the player interrupts. Listen and carry out their command instead of finishing a greeting, tutorial, or question.

Delegation policy:
Backend tools own app navigation, chess state and actions, history review, and audio/chess preferences.
Generate <|SpawnThinking|> when:
- The player selects a game or asks to navigate, including the exact short command play chess.
- The player requests a move, hint, engine-chosen move, pause, resume, undo, new game, resign, review, or a preference change.
- A reply needs current board facts, legal moves, history, or settings.
Do not generate <|SpawnThinking|> for a brief greeting, general rules, or repeating a still-current verified result.
Generate <|SpawnThinking|> before answering anything that needs backend work. Never merely promise a change. Wait for its tool result before reporting success.

Execute clear commands immediately, without confirmation prompts or required clicks. Use make_move, play_best_move, game_control, navigate_app, review_move, get_preferences, and set_preference. Only ask for missing information such as an ambiguous origin or promotion piece. Illegal moves leave the position unchanged. Never invent an outcome.

Welcome the player briefly on the page supplied by the application, then listen. On the picker they can play chess or Loups-Garous. Tic-Tac-Toe is unavailable. Opening Chess resumes the saved position automatically. Never make a tutorial or yes/no question a prerequisite for playing. Give the quick guide only when requested.

The guide covers checkmate, files a-h, ranks 1-8, piece movement and voice commands. Requested actions execute immediately and are announced afterward. get_hint suggests without moving; play_best_move plays for the player. Honor requests to repeat, shorten, slow down or stop speaking. Use get_history for what did I miss, review_move for history, and return_live for the live board. The app supplies authoritative move/game-over narration; do not duplicate it.`;

export type ChessVoiceSettings = {
  apiKey: string | undefined;
  voiceModel: string;
  delegationModel: string;
  voice: string;
  allowedOrigins: readonly string[];
};

export type ChessVoiceTransport = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  attempts: Map<string, number[]>;
};

export function chessVoiceSettings(env: Record<string, string | undefined>): ChessVoiceSettings {
  return {
    apiKey: env.OPENAI_API_KEY,
    voiceModel: env.OPENAI_VOICE_MODEL ?? "gpt-live-1",
    delegationModel: env.OPENAI_DELEGATION_MODEL ?? "gpt-6-luna",
    voice: env.OPENAI_VOICE ?? "marin",
    allowedOrigins: (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function createChessVoiceTransport(): ChessVoiceTransport {
  return {
    fetch: (url, init) => fetch(url, init),
    now: Date.now,
    attempts: new Map(),
  };
}

function problem(error: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error }, { status, headers });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAllowedOrigin(
  request: Request,
  origin: string | null,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const requestHost =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host");
    return Boolean(requestHost) && new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function exceedsSessionLimit(request: Request, transport: ChessVoiceTransport): boolean {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "local";
  const now = transport.now();
  const recent = (transport.attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < SESSION_WINDOW_MS,
  );
  const limited = recent.length >= SESSION_LIMIT;
  if (!limited) recent.push(now);
  transport.attempts.delete(key);
  transport.attempts.set(key, recent);
  if (transport.attempts.size > MAX_SESSION_CLIENTS) {
    const oldestClient = transport.attempts.keys().next().value;
    if (oldestClient !== undefined) transport.attempts.delete(oldestClient);
  }
  return limited;
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

async function providerRejectionMessage(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed: unknown = JSON.parse(raw);
    const error = isObject(parsed) && isObject(parsed.error) ? parsed.error : null;
    if (error && typeof error.message === "string") detail = error.message;
  } catch {
    detail = "";
  }
  const safeDetail = detail.replace(/\bsk-[\w-]+\b/gu, "[redacted]");
  const suffix = safeDetail ? `: ${safeDetail.slice(0, 300)}` : "";
  return `The voice provider rejected this session (${response.status})${suffix}`;
}

function greetingFor(view: unknown): string {
  switch (view) {
    case "chess":
      return GREETINGS.chess;
    case "loading":
      return GREETINGS.loading;
    case "audio":
      return GREETINGS.audio;
    case "help":
      return GREETINGS.help;
    default:
      return GREETINGS.home;
  }
}

export async function handleChessVoiceSession(
  request: Request,
  settings: ChessVoiceSettings,
  transport: ChessVoiceTransport,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(request, origin, settings.allowedOrigins))
    return problem("Unexpected request origin", 403);

  if (exceedsSessionLimit(request, transport))
    return problem("Too many voice sessions. Wait a minute and try again.", 429, {
      "retry-after": "60",
    });

  if (!settings.apiKey) return problem("OPENAI_API_KEY is not configured on the server", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (
    !isObject(body) ||
    typeof body.sdp !== "string" ||
    !body.sdp.trim() ||
    body.sdp.length > 64_000
  )
    return problem("A valid SDP offer is required", 400);

  const greeting = greetingFor(body.view);
  let upstream: Response;
  try {
    upstream = await transport.fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${settings.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: settings.voiceModel,
          audio: { output: { voice: settings.voice } },
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
          instructions: INSTRUCTIONS,
          delegation: {
            type: "responses",
            responses: {
              model: settings.delegationModel,
              reasoning: { effort: "low" },
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
    return problem(`The voice provider could not be reached (${code}).`, 502);
  }

  if (!upstream.ok) return problem(await providerRejectionMessage(upstream), 502);

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
  )
    return problem("The voice provider returned an invalid session.", 502);

  return Response.json({ transport: { sdp: session.transport.sdp } });
}
