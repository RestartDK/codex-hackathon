import { appSettingsSchema, describePreferences } from "../lib/preferences";

export const QUICK_GUIDE =
  "Your goal is to checkmate the opposing king. Files are letters a through h, and ranks are numbers one through eight. Pawns move forward and capture diagonally. Knights move in an L shape. Bishops move diagonally. Rooks move straight. Queens move straight or diagonally, and kings move one square. Say a move like e two to e four, ask about a square, ask for legal moves, or request a hint. Legal moves and game controls run immediately. I announce what happened after it is done. You can also ask me to choose a move for you. Say help for more commands.";

export function localIntent(command: string): { name: string; args: Record<string, unknown> } | null {
  const numberWords: Record<string, string> = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
  };
  const text = command
    .trim()
    .toLowerCase()
    .replace(/[,.?!]/g, "")
    .replace(/[“”"]/g, "")
    .replace(
      /\b([a-h])\s+(one|two|three|four|five|six|seven|eight)\b/g,
      (_match, file: string, rank: string) => file + numberWords[rank],
    )
    .replace(/\b([a-h])\s+([1-8])\b/g, "$1$2")
    .replace(/\s+/g, " ");
  if (/^(no|cancel|never mind|nevermind)$/.test(text)) return { name: "cancel_action", args: {} };
  if (/^(cancel setup|cancel the setup|exit setup|leave setup)$/.test(text))
    return { name: "chess_setup", args: { action: "cancel", value: null } };
  const promotion = text.match(/^(?:promote(?: pawn)?(?: to)? )?(queen|rook|bishop|knight)$/);
  if (promotion) return { name: "promote_pawn", args: { piece: promotion[1] } };
  if (/^(start with (?:the )?defaults?|start defaults?)$/.test(text))
    return { name: "chess_setup", args: { action: "defaults", value: null } };
  if (/^(start game)$/.test(text)) return { name: "game_control", args: { action: "start_game" } };
  if (/^(pause voice commands|pause commands|pause voice control|pause listening|pause microphone)$/.test(text))
    return { name: "voice_control", args: { action: "pause_commands" } };
  if (/^(resume voice commands|resume commands|resume voice control|resume listening|continue listening)$/.test(text))
    return { name: "voice_control", args: { action: "resume_commands" } };
  if (/^(mute (?:the )?(?:microphone|mic)|turn off (?:the )?(?:microphone|mic))$/.test(text))
    return { name: "voice_control", args: { action: "mute_microphone" } };
  if (/^(unmute (?:the )?(?:microphone|mic)|turn on (?:the )?(?:microphone|mic))$/.test(text))
    return { name: "voice_control", args: { action: "unmute_microphone" } };
  if (/^(end voice|stop voice|end the voice session|stop listening|disable listening|turn off voice)$/.test(text))
    return { name: "voice_control", args: { action: "end_voice" } };
  if (/^(voice status|read voice state|is voice listening)$/.test(text))
    return { name: "voice_control", args: { action: "read_state" } };
  if (/^(back|go back|previous step|back a step)$/.test(text))
    return { name: "app_control", args: { action: "back" } };
  if (/^(close|dismiss|close dialog|close dialogue)$/.test(text))
    return { name: "app_control", args: { action: "close" } };
  if (/^(review result|review the result|review game|review the game|review moves)$/.test(text))
    return { name: "app_control", args: { action: "review_result" } };
  if (/^(next step|next setup step)$/.test(text))
    return { name: "chess_setup", args: { action: "next", value: null } };
  if (/^(read setup|read the setup|setup options|setup status)$/.test(text))
    return { name: "chess_setup", args: { action: "read", value: null } };
  if (/^(random|random color|random pieces)$/.test(text))
    return { name: "chess_setup", args: { action: "choose_color", value: "random" } };
  if (/^(timer off|no timer)$/.test(text))
    return { name: "chess_setup", args: { action: "choose_timer", value: "off" } };
  const rules = text.match(/^(?:explain )?rules (on|off)$/);
  if (rules)
    return { name: "chess_setup", args: { action: "choose_rules", value: rules[1] } };
  const setupDifficulty = text.match(
    /^(?:choose|set) difficulty (beginner|intermediate|advanced)$/,
  );
  if (setupDifficulty)
    return { name: "chess_setup", args: { action: "choose_difficulty", value: setupDifficulty[1] } };
  const setupColor = text.match(/^(?:choose|set) (white|black|random) pieces$/);
  if (setupColor)
    return { name: "chess_setup", args: { action: "choose_color", value: setupColor[1] } };
  const setupOpponent = text.match(/^(?:choose|set) opponent (computer|local|two player)$/);
  if (setupOpponent)
    return {
      name: "chess_setup",
      args: { action: "choose_opponent", value: setupOpponent[1] },
    };
  if (/^(board|board configuration|describe board|give me the board configuration)$/.test(text))
    return { name: "read_board", args: { scope: "all", value: null } };
  const locate = text.match(
    /^(?:where (?:are|is)|locate|find) (?:my|the opponent'?s?|opponent) (pawns?|knights?|bishops?|rooks?|queens?|kings?|pieces)$/,
  );
  if (locate)
    return {
      name: "locate_pieces",
      args: {
        owner: /\bmy\b/.test(text) ? "player" : "opponent",
        piece: locate[1] === "pieces" ? "all" : locate[1].replace(/s$/, ""),
      },
    };
  if (/^(legal moves|available moves)$/.test(text))
    return { name: "get_legal_moves", args: { from: null } };
  if (/^(explain last move|explain the last move)$/.test(text))
    return { name: "explain_last_move", args: {} };
  const setting = text.match(/^(?:play as|i play|i am) (white|black)$/);
  if (setting)
    return {
      name: "set_preference",
      args: { preference: "playerColor", value: setting[1] === "white" ? "w" : "b" },
    };
  if (/^(chess|play chess|start chess|open chess)$/.test(text))
    return { name: "navigate_app", args: { destination: "chess" } };
  if (
    /^(loups-garous|werewolf|play loups-garous|play werewolf|start loups-garous|open loups-garous)$/.test(
      text,
    )
  )
    return { name: "navigate_app", args: { destination: "loups-garous" } };
  if (/^(ludo|play ludo|start ludo|open ludo)$/.test(text))
    return { name: "navigate_app", args: { destination: "ludo" } };
  if (/^(the intercept|intercept|play (?:the )?intercept|open (?:the )?intercept)$/.test(text))
    return { name: "navigate_app", args: { destination: "intercept" } };
  if (/^(tic tac toe|tic-tac-toe|play tic tac toe|open tic tac toe)$/.test(text))
    return { name: "navigate_app", args: { destination: "tic-tac-toe" } };
  if (/^(home|go home|leave game|leave the game|game picker)$/.test(text))
    return { name: "navigate_app", args: { destination: "home" } };
  if (/^(settings|audio|audio settings|open settings)$/.test(text))
    return { name: "navigate_app", args: { destination: "audio" } };
  if (/^(help|open help)$/.test(text))
    return { name: "navigate_app", args: { destination: "help" } };
  if (/^(status|position|describe the board|what is happening|whats happening)$/.test(text))
    return { name: "get_position", args: {} };
  if (/^(read the board|read board)$/.test(text))
    return { name: "read_board", args: { scope: "all", value: null } };
  if (
    /^(history|recent moves|last moves|repeat the last move|what did the computer play)$/.test(text)
  )
    return { name: "get_history", args: { count: 4 } };
  if (/^(hint|give me a hint|suggest a move|what should i play next)$/.test(text))
    return { name: "get_hint", args: {} };
  if (/^(choose a move|choose a move for me|play for me)$/.test(text))
    return { name: "play_best_move", args: {} };
  const control = text.match(/^(pause|resume|undo|resign|new game|start a new game)(?: game)?$/);
  if (control)
    return {
      name: "game_control",
      args: { action: control[1].includes("new") ? "new_game" : control[1] },
    };
  if (/^(flip|flip board|flip the board)$/.test(text))
    return { name: "game_control", args: { action: "flip_board" } };
  if (/^(live board|back to live board|exit review)$/.test(text))
    return { name: "game_control", args: { action: "return_live" } };
  if (/^(retry engine|restart engine)$/.test(text))
    return { name: "game_control", args: { action: "retry_engine" } };
  if (/^(read settings|read preferences)$/.test(text)) return { name: "get_preferences", args: {} };
  const screenReader = text.match(/^(?:set )?screen reader(?: mode)? (on|off)$/);
  if (screenReader)
    return {
      name: "set_preference",
      args: { preference: "screenReaderMode", value: screenReader[1] === "on" },
    };
  const review = text.match(/^(?:review|review move) (\d+)$/);
  if (review) return { name: "review_move", args: { move: Number(review[1]) } };
  const volume = text.match(/^(?:volume|set volume to) (\d+)$/);
  if (volume)
    return {
      name: "set_preference",
      args: { preference: "voiceVolume", value: Number(volume[1]) },
    };
  const square = text.match(/^(?:what(?: is|'s) on |inspect )([a-h][1-8])$/);
  if (square) return { name: "inspect_square", args: { square: square[1] } };
  const move = text.match(
    /^(?:(?:move|play) )?(?:(?:my |the )?(king|queen|rook|bishop|knight|pawn) (?:from )?)?([a-h][1-8])\s*(?:to|→|-)\s*([a-h][1-8])(?:\s+(?:promote (?:to )?)?(queen|rook|bishop|knight))?$/,
  );
  if (move)
    return {
      name: "make_move",
      args: { from: move[2], to: move[3], piece: move[1] ?? null, promotion: move[4] ?? null },
    };
  const pieceMove = text.match(
    /^(?:move |play )?(?:my )?(king|queen|rook|bishop|knight|pawn) to ([a-h][1-8])$/,
  );
  if (pieceMove)
    return {
      name: "make_move",
      args: { from: null, to: pieceMove[2], piece: pieceMove[1], promotion: null },
    };
  const legal = text.match(/^(?:legal moves|moves from)\s+([a-h][1-8])$/);
  if (legal) return { name: "get_legal_moves", args: { from: legal[1] } };
  const board = text.match(/^read (rank|file) ([a-h1-8])$/);
  if (board) return { name: "read_board", args: { scope: board[1], value: board[2] } };
  return null;
}

export function formatToolReply(raw: string): string {
  const result: unknown = JSON.parse(raw);
  if (!result || typeof result !== "object") return "The request could not be completed.";
  if ("message" in result && typeof result.message === "string") return result.message;
  if ("preferences" in result) {
    const parsed = appSettingsSchema.safeParse(result.preferences);
    if (parsed.success) return describePreferences(parsed.data);
  }
  if ("description" in result && typeof result.description === "string")
    return result.description + ".";
  if ("verifiedEffects" in result && "move" in result && typeof result.move === "string")
    return result.move + ".";
  if ("occupant" in result && "square" in result)
    return `${String(result.occupant)} on ${String(result.square)}.`;
  if ("turn" in result && "latestMove" in result)
    return `${String(result.turn)} to move.${"inCheck" in result && result.inCheck ? " Check." : ""} ${"gameOver" in result && result.gameOver ? "The game is over." : ""} Latest move: ${String(result.latestMove)}.`;
  if ("moves" in result && Array.isArray(result.moves)) {
    const moves = result.moves.flatMap((move: unknown) => {
      if (!move || typeof move !== "object") return [];
      if ("spoken" in move && typeof move.spoken === "string") return [move.spoken];
      if ("san" in move && typeof move.san === "string") return [move.san];
      return [];
    });
    return moves.length ? moves.join(". ") + "." : "No moves to read yet.";
  }
  if ("pieces" in result && Array.isArray(result.pieces)) {
    const pieces = result.pieces.flatMap((piece: unknown) => {
      if (!piece || typeof piece !== "object" || !("piece" in piece) || !("square" in piece))
        return [];
      return [
        `${"color" in piece ? String(piece.color) + " " : ""}${String(piece.piece)} on ${String(piece.square)}`,
      ];
    });
    return pieces.length ? pieces.join(", ") + "." : "No pieces found there.";
  }
  if ("status" in result && result.status === "cancelled") return "Cancelled. Nothing was changed.";
  return "Done.";
}
