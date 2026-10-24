import { defineHandler } from 'nitro';

const TOOL_INSTRUCTIONS = `
You are the reasoning layer for a voice-first chess companion. The browser owns the
authoritative chess state. Always use a chess function before stating current board
facts or attempting a game action. Never invent a legal move, square, piece, capture,
check, result, or evaluation. A specific move ordered by the player is committed immediately.
Only a move selected or suggested by the companion requires later confirmation. Keep spoken answers concise and
say coordinates as a letter followed by a number.
After a move tool reports completion, acknowledge it briefly without repeating the
full move because the application supplies an authoritative move narration.
`.trim();

const sessionAttempts = new Map<string, number[]>();

function exceedsSessionLimit(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const key = forwarded || request.headers.get('x-real-ip') || 'local';
  const now = Date.now();
  const recent = (sessionAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < 60_000);
  recent.push(now);
  sessionAttempts.set(key, recent);
  return recent.length > 5;
}

const tools = [
  {
    type: 'function',
    name: 'get_position',
    description: 'Get a concise, authoritative summary of the current chess position.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'inspect_square',
    description: 'Report which piece occupies one square.',
    parameters: {
      type: 'object',
      properties: { square: { type: 'string', pattern: '^[a-h][1-8]$' } },
      required: ['square'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'locate_pieces',
    description: 'List locations of a piece type for the player or opponent.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', enum: ['player', 'opponent', 'white', 'black'] },
        piece: { type: 'string', enum: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'all'] },
      },
      required: ['owner', 'piece'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'get_legal_moves',
    description: 'List legal moves, optionally limited to an origin square.',
    parameters: {
      type: 'object',
      properties: { from: { type: ['string', 'null'], pattern: '^[a-h][1-8]$' } },
      required: ['from'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'get_history',
    description: 'Read recent committed moves.',
    parameters: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 12 } },
      required: ['count'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'explain_last_move',
    description: 'Explain only the verified effects of the latest move without inventing strategy.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'read_board',
    description: 'Read every occupied square, one rank, or one file.',
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'rank', 'file'] },
        value: { type: ['string', 'null'] },
      },
      required: ['scope', 'value'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'propose_move',
    description: 'Resolve and immediately commit a specific move explicitly ordered by the player.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: ['string', 'null'], pattern: '^[a-h][1-8]$' },
        to: { type: 'string', pattern: '^[a-h][1-8]$' },
        piece: { type: ['string', 'null'], enum: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', null] },
        promotion: { type: ['string', 'null'], enum: ['queen', 'rook', 'bishop', 'knight', null] },
      },
      required: ['from', 'to', 'piece', 'promotion'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'get_hint',
    description: 'Ask the local analysis engine for one suggested move without playing it.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'propose_best_move',
    description: 'Ask the local engine for one move and put it through the normal confirmation flow.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'confirm_action',
    description: 'Confirm the currently pending action after a separate user affirmation.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'cancel_action',
    description: 'Cancel the currently pending action.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'propose_game_control',
    description: 'Handle resume or propose a consequential game control. New game, undo, and resign require confirmation; resume does not.',
    parameters: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['pause', 'resume', 'new_game', 'undo', 'resign'] } },
      required: ['action'],
      additionalProperties: false,
    },
    strict: true,
  },
];

const ludoTools = [
  { type: 'function', name: 'propose_best_token_move', description: 'Suggest a legal token only when asked to choose for the player. Follow the returned confirmation requirement.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'get_position', description: 'Get the authoritative Ludo turn, phase, die, tokens, and result.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'get_tokens', description: 'Describe token positions and legal token choices.', parameters: { type: 'object', properties: { owner: { type: 'string', enum: ['human', 'computer'] } }, required: ['owner'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'roll_dice', description: 'Roll the local Ludo die for the human player.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'propose_token_move', description: 'Play an explicitly ordered numbered human token immediately after a roll. No confirmation.', parameters: { type: 'object', properties: { tokenId: { type: 'integer', minimum: 1, maximum: 4 } }, required: ['tokenId'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'confirm_action', description: 'Confirm a previously proposed Ludo token move or new game.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'cancel_action', description: 'Cancel a pending Ludo token move or control.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'continue_turn', description: 'Continue after a human move, or start a human bonus roll.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'correct_last_move', description: 'Restore the latest human token choice before the next roll, keeping the same die.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'propose_game_control', description: 'Pause, resume, or propose a new Ludo game.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['pause', 'resume', 'new_game'] } }, required: ['action'], additionalProperties: false }, strict: true },
];

const LUDO_INSTRUCTIONS = `You are the reasoning layer for a Ludo companion. The browser owns state, dice, and rules. Use a Ludo function for current facts or actions. Explicit token orders use propose_token_move and play immediately. Use propose_best_token_move only when asked to choose for the player; follow confirmation_required if returned. Rolls, pause, resume, correction, and board queries need no confirmation. New game clears a save and requires confirmation. For board configuration or positions, call get_position and describe the returned tokens, colors, last die, and turn. Give the full configuration only on request. After moves, do not repeat instructions or narrate future computer actions: the browser supplies short paced updates.`;

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(request: Request, origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  try {
    const requestHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
      ?? request.headers.get('host');
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
  return typeof candidate === 'string' && /^[A-Z0-9_]+$/.test(candidate)
    ? candidate
    : 'NETWORK_ERROR';
}

export default defineHandler(async (event) => {
  const origin = event.req.headers.get('origin');
  if (!isAllowedOrigin(event.req, origin)) {
    return new Response(JSON.stringify({ error: 'Unexpected request origin' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (exceedsSessionLimit(event.req)) {
    return new Response(JSON.stringify({ error: 'Too many voice sessions. Wait a minute and try again.' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60' },
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured on the server' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { sdp?: unknown; gameId?: unknown };
  try {
    body = await event.req.json();
  } catch {
    body = {};
  }
  if (typeof body.sdp !== 'string' || !body.sdp.trim() || body.sdp.length > 64_000) {
    return new Response(JSON.stringify({ error: 'A valid SDP offer is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const gameId = body.gameId === 'ludo' ? 'ludo' : 'chess';
  const activeTools = gameId === 'ludo' ? ludoTools : tools;
  const activeInstructions = gameId === 'ludo' ? LUDO_INSTRUCTIONS : TOOL_INSTRUCTIONS;

  let upstream: Response;
  try {
    upstream = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          model: process.env.OPENAI_VOICE_MODEL ?? 'gpt-live-1',
          instructions: `You are a calm English voice companion for a blind ${gameId} player. Be brief, accept interruptions, and delegate every current game fact and game action. Never claim an action succeeded until its tool result says so.

At the beginning, use the application's brief welcome. If a saved game exists, ask resume or new game and wait. Resume immediately through propose_game_control; confirm only a new game that discards progress. Offer help in one short phrase; explain rules or the dashboard only when asked. An explicit move order plays immediately. A companion-selected move follows the tool's confirmation requirement. Board questions, rolling, pause, and resume need no confirmation.

Keep ordinary replies to one short sentence. For a requested guide or board configuration, provide the detail requested using current tool results. Speak each application update once in order, without adding tutorials or repeating a completed roll or move. A computer turn update says what is happening now; do not speculate about its next roll or move.

Honor requests to repeat, add detail, speak more slowly, pause, or stop speaking. Delegate pause and resume to propose_game_control. Use get_position for Ludo board configuration, read_board for chess board configuration, and get_history for chess history.`,
          delegation: {
            type: 'responses',
            responses: {
              model: process.env.OPENAI_DELEGATION_MODEL ?? 'gpt-6-luna',
              instructions: activeInstructions,
              tools: activeTools,
              tool_choice: 'auto',
              parallel_tool_calls: false,
            },
          },
        },
        transport: { type: 'webrtc', sdp: body.sdp },
      }),
    });
  } catch (error) {
    const code = networkErrorCode(error);
    console.warn(`[voice/session] OpenAI connection failed: ${code}`);
    return new Response(JSON.stringify({ error: `The voice provider could not be reached (${code}).` }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
});
