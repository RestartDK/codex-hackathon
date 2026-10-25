import { appSettingsSchema, describePreferences } from "../lib/preferences";

export const QUICK_GUIDE =
  "Your goal is to checkmate the opposing king. Files are letters a through h, and ranks are numbers one through eight. Pawns move forward and capture diagonally. Knights move in an L shape. Bishops move diagonally. Rooks move straight. Queens move straight or diagonally, and kings move one square. Say a move like e two to e four, ask about a square, ask for legal moves, or request a hint. Legal moves and game controls run immediately. I announce what happened after it is done. You can also ask me to choose a move for you. Say help for more commands.";

export function localIntent(command: string): { name: string; args: object } | null {
  const text = command
    .trim()
    .toLowerCase()
    .replace(/[,.?!]/g, "")
    .replace(/[“”"]/g, "");
  if (/^(no|cancel|never mind|nevermind)$/.test(text)) return { name: "cancel_action", args: {} };
  if (/^(chess|play chess|start chess|open chess)$/.test(text))
    return { name: "navigate_app", args: { destination: "chess" } };
  if (
    /^(loups-garous|werewolf|play loups-garous|play werewolf|start loups-garous|open loups-garous)$/.test(
      text,
    )
  )
    return { name: "navigate_app", args: { destination: "loups-garous" } };
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
    /^(?:move )?([a-h][1-8])\s*(?:to|→|-)\s*([a-h][1-8])(?:\s+(queen|rook|bishop|knight))?$/,
  );
  if (move)
    return {
      name: "make_move",
      args: { from: move[1], to: move[2], piece: null, promotion: move[3] ?? null },
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
