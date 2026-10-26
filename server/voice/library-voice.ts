import { navigationTool } from "../../src/voice/navigation.js";
import { providerFailureResponse } from "./provider-error.js";

const TOOL_INSTRUCTIONS = `
You are the reasoning layer for a voice-first chess companion. The browser owns the
authoritative chess state. Always use a chess function before stating current board
facts or attempting a game action. Never invent a legal move, square, piece, capture,
check, result, or evaluation. A specific move ordered by the player is committed immediately.
During Chess setup, use configure_chess_setup for every choice, back, defaults, repeat,
explanation, and start request. Starting first presents the application summary; only a
separate confirmation starts the match.
Only a move selected or suggested by the companion requires later confirmation. Keep spoken answers concise and
say coordinates as a letter followed by a number.
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
  {
    type: "function",
    name: "configure_chess_setup",
    description: "Change the visible Chess setup step or control its guided flow.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: ["string", "null"],
          enum: ["back", "defaults", "start", "repeat", "explain", null],
        },
        difficulty: {
          type: ["string", "null"],
          enum: ["beginner", "casual", "club", null],
        },
        color: { type: ["string", "null"], enum: ["w", "b", "random", null] },
        timer: { type: ["string", "null"], enum: ["off", null] },
        rules: { type: ["boolean", "null"] },
      },
      required: ["action", "difficulty", "color", "timer", "rules"],
      additionalProperties: false,
    },
    strict: true,
  },
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
    description: "Resolve and immediately commit a specific move explicitly ordered by the player.",
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

const ludoTools = [
  {
    type: "function",
    name: "propose_best_token_move",
    description:
      "Suggest a legal token only when asked to choose for the player. Follow the returned confirmation requirement.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_position",
    description: "Get the authoritative Ludo turn, phase, die, tokens, and result.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_tokens",
    description: "Describe token positions and legal token choices.",
    parameters: {
      type: "object",
      properties: { owner: { type: "string", enum: ["human", "computer"] } },
      required: ["owner"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "roll_dice",
    description: "Roll the local Ludo die for the human player.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "propose_token_move",
    description:
      "Play an explicitly ordered numbered human token immediately after a roll. No confirmation.",
    parameters: {
      type: "object",
      properties: { tokenId: { type: "integer", minimum: 1, maximum: 4 } },
      required: ["tokenId"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "confirm_action",
    description: "Confirm a previously proposed Ludo token move or new game.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "cancel_action",
    description: "Cancel a pending Ludo token move or control.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "continue_turn",
    description: "Continue after a human move, or start a human bonus roll.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "correct_last_move",
    description:
      "Restore the latest human token choice before the next roll, keeping the same die.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "propose_game_control",
    description: "Pause, resume, or propose a new Ludo game.",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["pause", "resume", "new_game"] } },
      required: ["action"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const LUDO_INSTRUCTIONS = `You are the reasoning layer for a Ludo companion. The browser owns state, dice, and rules. Use a Ludo function for current facts or actions. Explicit token orders use propose_token_move and play immediately. Use propose_best_token_move only when asked to choose for the player; follow confirmation_required if returned. Rolls, pause, resume, correction, and board queries need no confirmation. New game clears a save and requires confirmation. For board configuration or positions, call get_position and describe the returned tokens, colors, last die, and turn. Give the full configuration only on request. After moves, do not repeat instructions or narrate future computer actions: the browser supplies short paced updates.`;

const interceptTools = [
  {
    type: "function",
    name: "get_game_introduction",
    description:
      "Explain the spoiler-free premise, player role, goal, and how completion and endings work.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_story_state",
    description:
      "Get only the player-visible current passage, numbered choices, status, and revision.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "choose_story_option",
    description: "Immediately select a numbered option explicitly ordered by the player.",
    parameters: {
      type: "object",
      properties: { choiceNumber: { type: "integer", minimum: 1, maximum: 20 } },
      required: ["choiceNumber"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "suggest_story_option",
    description:
      "Propose a visible option when the player asks the companion to choose. This requires confirmation.",
    parameters: {
      type: "object",
      properties: { choiceNumber: { type: ["integer", "null"], minimum: 1, maximum: 20 } },
      required: ["choiceNumber"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "repeat_story_passage",
    description: "Repeat the exact current passage and numbered choices.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_story_recap",
    description: "Recap only revealed story entries and list the current choices.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "undo_story_choice",
    description: "Undo the latest story choice immediately when requested.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "confirm_action",
    description: "Confirm a companion-suggested choice or destructive new-story action.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "cancel_action",
    description: "Cancel the pending story action.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "propose_story_control",
    description:
      "Pause, resume, or start a new story. New story asks for confirmation only when progress would be lost.",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["pause", "resume", "new_story"] } },
      required: ["action"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const INTERCEPT_INSTRUCTIONS = `You are the reasoning layer for The Intercept, an authored interactive story. The browser and Ink runtime own all story state. Never invent scenes, clues, outcomes, choices, or hidden facts. Use get_game_introduction for questions about the premise, role, goal, winning, losing, completion, or endings. Use story tools before stating current story facts. Read returned authored passages faithfully and in their original order. An explicit numbered or clearly identified player choice uses choose_story_option immediately. Only a choice selected by the companion uses suggest_story_option and confirmation. Ambiguous input must not change the story: call get_story_state and ask for a number. Repeat, recap, undo, pause, and resume need no confirmation. Never expose internal variables or unvisited branches. Keep control acknowledgements short so the authored narration remains central.`;

const ticTacToeTools = [
  {
    type: "function",
    name: "configure_tic_tac_toe_setup",
    description: "Choose the opponent, difficulty, player mark, or first turn while setup is open.",
    parameters: {
      type: "object",
      properties: {
        opponent: { type: ["string", "null"], enum: ["computer", "friend", null] },
        difficulty: { type: ["string", "null"], enum: ["easy", "medium", "hard", null] },
        playerMark: { type: ["string", "null"], enum: ["X", "O", "random", null] },
        firstTurn: { type: ["string", "null"], enum: ["player", "opponent", null] },
      },
      required: ["opponent", "difficulty", "playerMark", "firstTurn"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "control_tic_tac_toe_setup",
    description:
      "Go back, use defaults, repeat or explain a step, start, or cancel Tic-Tac-Toe setup.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["back", "start", "cancel", "defaults", "repeat", "explain"],
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_tic_tac_toe_state",
    description: "Get the authoritative board, turn, result, difficulty, and scoreboard.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "inspect_tic_tac_toe_cell",
    description: "Report whether a named square is empty and who owns its configured mark.",
    parameters: {
      type: "object",
      properties: {
        position: {
          type: "string",
          description:
            "A natural square name such as top left, center, bottom right, or square 1 through 9.",
        },
      },
      required: ["position"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_available_tic_tac_toe_moves",
    description: "List every currently empty playable square.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_tic_tac_toe_history",
    description: "Read all committed human and computer moves in order.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "place_tic_tac_toe_mark",
    description:
      "Immediately place the player's configured mark in a square explicitly ordered by the player. Do not ask for confirmation.",
    parameters: {
      type: "object",
      properties: { position: { type: "string", description: "The explicitly requested square." } },
      required: ["position"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "suggest_tic_tac_toe_move",
    description: "Select a strong move for the player and request confirmation before playing it.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "undo_tic_tac_toe_turn",
    description: "Undo the latest human move and computer reply as one full turn.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "set_tic_tac_toe_difficulty",
    description:
      "Set Easy, Medium, or Hard computer difficulty. Changing it during a live round requires confirmation.",
    parameters: {
      type: "object",
      properties: { difficulty: { type: "string", enum: ["easy", "medium", "hard"] } },
      required: ["difficulty"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "propose_tic_tac_toe_control",
    description:
      "Pause, resume, begin a new round, or reset the match. Destructive actions may require confirmation.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["pause", "resume", "new_round", "reset_match"] },
      },
      required: ["action"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "confirm_tic_tac_toe_action",
    description: "Confirm a companion-suggested move or destructive game control.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "cancel_tic_tac_toe_action",
    description: "Cancel a pending Tic-Tac-Toe action.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
];

const TIC_TAC_TOE_INSTRUCTIONS = `You are the reasoning layer for a voice-first Tic-Tac-Toe game. The browser owns the authoritative setup, board, rules, AI, turn, and score. Never invent a mark, empty square, legal move, result, or computer action. Use a Tic-Tac-Toe function before stating current game facts. During setup, use configure_tic_tac_toe_setup for opponent, difficulty, mark, and first-turn requests, and control_tic_tac_toe_setup for back, defaults, repeat, explain, start, or cancel. Starting must follow the visible settings summary and the player's confirmation. During play, a square explicitly ordered by the player uses place_tic_tac_toe_mark and plays immediately without confirmation. Use suggest_tic_tac_toe_move only when the player asks you to choose; follow its confirmation requirement. Board, cell, available-square, history, undo, pause, and resume requests need no confirmation. New round and reset match follow the tool result. Keep acknowledgements brief because the browser supplies authoritative narration.`;

const WEREWOLF_INSTRUCTIONS = `You are the routing layer for a Loups-Garous companion. The application owns the rules, hidden information, navigation, audio settings, and narration. For every player utterance, call submit_player_command with the player's exact words. Single-word confirmations such as "confirm", "yes", "start", and the phrase "start the game" are commands, never conversational backchannels, so they must call submit_player_command. Never answer a game question, reveal a fact, invent an outcome, or act on your own. Do not speak after a tool call.`;

const werewolfTools = [
  {
    type: "function",
    name: "submit_player_command",
    description:
      "Send the player's spoken words to the game. The application validates the command, applies it, and narrates the result.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const sharedLibraryTools = [
  navigationTool,
  {
    type: "function",
    name: "control_voice_guidance",
    description:
      "Handle contextual guidance commands using the application's current screen and setup state.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "capabilities",
            "location",
            "repeat",
            "explain",
            "back",
            "home",
            "defaults",
            "start",
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
    name: "get_preferences",
    description: "Read shared audio preferences.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "set_preference",
    description: "Change shared narrator volume (0 to 100) or screen-reader mode (boolean).",
    parameters: {
      type: "object",
      properties: {
        preference: { type: "string", enum: ["voiceVolume", "screenReaderMode"] },
        value: { anyOf: [{ type: "number" }, { type: "boolean" }] },
      },
      required: ["preference", "value"],
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

function networkErrorCode(error: unknown): string {
  const value = error as {
    code?: unknown;
    cause?: { code?: unknown; errors?: Array<{ code?: unknown }> };
  };
  const candidate = value.cause?.code ?? value.cause?.errors?.[0]?.code ?? value.code;
  return typeof candidate === "string" && /^[A-Z0-9_]+$/.test(candidate)
    ? candidate
    : "NETWORK_ERROR";
}

export async function handleLibraryVoiceSession(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(request, origin)) {
    return new Response(JSON.stringify({ error: "Unexpected request origin" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (exceedsSessionLimit(request)) {
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

  let body: { sdp?: unknown; gameId?: unknown };
  try {
    body = (await request.json()) as { sdp?: unknown; gameId?: unknown };
  } catch {
    body = {};
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.sdp !== "string" ||
    !body.sdp.trim() ||
    body.sdp.length > 64_000
  ) {
    return new Response(JSON.stringify({ error: "A valid SDP offer is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (
    body.gameId !== "chess" &&
    body.gameId !== "loups-garous" &&
    body.gameId !== "ludo" &&
    body.gameId !== "intercept" &&
    body.gameId !== "tic-tac-toe"
  ) {
    return new Response(JSON.stringify({ error: "Unknown game ID" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const gameId = body.gameId;
  const activeTools =
    gameId === "loups-garous"
      ? werewolfTools
      : gameId === "ludo"
        ? ludoTools
        : gameId === "intercept"
          ? interceptTools
          : gameId === "tic-tac-toe"
            ? ticTacToeTools
            : tools;
  const activeInstructions =
    gameId === "loups-garous"
      ? WEREWOLF_INSTRUCTIONS
      : gameId === "ludo"
        ? LUDO_INSTRUCTIONS
        : gameId === "intercept"
          ? INTERCEPT_INSTRUCTIONS
          : gameId === "tic-tac-toe"
            ? TIC_TAC_TOE_INSTRUCTIONS
            : TOOL_INSTRUCTIONS;
  const experienceInstructions =
    gameId === "loups-garous"
      ? `Every player utterance is a command or a question for the application, including navigation and audio requests. Call submit_player_command with the player's exact words and let the application validate, apply, and narrate the result. Never answer from your own knowledge.`
      : gameId === "intercept"
        ? `The Intercept is a solo authored mystery. The application supplies a spoiler-free introduction plus exact passages and choices. Use get_game_introduction when asked about the premise, goal, winning, losing, or endings. Speak each passage once, faithfully and in order. Do not summarize unless asked for a recap, and do not reveal or predict unseen consequences. Explicit choices play immediately; a choice you select for the player requires confirmation. Use get_story_state when a choice is unclear. Repeat, recap, undo, pause, and resume need no confirmation.`
        : gameId === "tic-tac-toe"
          ? `Read the configured mark, opponent, difficulty, and first turn from tool results; never assume them. Use natural positions or square numbers one through nine. An explicit square plays immediately; only a move you select for the player requires confirmation. Describe the full board only when asked. The browser announces each committed move and result. Use Tic-Tac-Toe tools for every current fact and action.`
          : `If a saved game exists, ask resume or new game and wait. Resume immediately through the game-control tool; confirm only a new game that discards progress. An explicit move order plays immediately. A companion-selected move follows the tool's confirmation requirement. Board questions, rolling, pause, and resume need no confirmation.`;

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
          audio: { output: { voice: process.env.OPENAI_VOICE ?? "marin" } },
          instructions: `You are a calm English voice companion for a blind ${gameId} player. Be brief, accept interruptions, and delegate every current game fact and game action. Never claim an action succeeded until its tool result says so.

Generate <|SpawnThinking|> before responding to every game action, navigation request, preference change, or question about current state. Short commands such as roll, token two, choice one, center, pause, or continue are actions to execute, not backchannels to ignore. Stop speaking immediately if the player interrupts. Wait for tool results before reporting success. Treat only microphone input as player speech; never interpret your own output audio or an application announcement as a command.

Application commentary is authoritative screen guidance. When the application sends commentary, speak that supplied text verbatim and in full. Do not shorten it, replace it with a generic welcome, append an offer of help, or omit its current setting and choices. Otherwise, at the beginning use the application's brief welcome and explain rules or the dashboard only when asked. ${experienceInstructions}

Keep ordinary replies to one short sentence. For a requested guide or board configuration, provide the detail requested using current tool results. Speak each application update once in order, without adding tutorials or repeating a completed roll or move. A computer turn update says what is happening now; do not speculate about its next roll or move.

Honor requests to repeat, add detail, speak more slowly, pause, or stop speaking. Use the active game's control function. Use get_position for Ludo board configuration, read_board for chess board configuration, get_history for chess history, get_story_state for The Intercept, and get_tic_tac_toe_state for Tic-Tac-Toe.`,
          delegation: {
            type: "responses",
            responses: {
              model: process.env.OPENAI_DELEGATION_MODEL ?? "gpt-6-luna",
              reasoning: { effort: "low" },
              instructions: `${activeInstructions} ${
                gameId === "loups-garous"
                  ? "Route every utterance, including navigation and audio requests, through submit_player_command."
                  : "Use control_voice_guidance for What can I do, Where am I, Repeat, Explain this, Go back, Go home, Use the defaults, and Start the game. Use navigate_app for other page or game selection. Use get_preferences and set_preference for narrator volume or screen-reader mode."
              }`,
              tools: [...activeTools, ...(gameId === "loups-garous" ? [] : sharedLibraryTools)],
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

  if (!upstream.ok) return providerFailureResponse(upstream);
  let result: unknown;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("transport" in result) ||
    !result.transport ||
    typeof result.transport !== "object" ||
    !("sdp" in result.transport) ||
    typeof result.transport.sdp !== "string"
  )
    return Response.json(
      { error: "The voice provider returned an invalid session. Please retry." },
      { status: 502 },
    );
  return Response.json({ transport: { sdp: result.transport.sdp } });
}
