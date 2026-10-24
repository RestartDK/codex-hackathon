export const QUICK_GUIDE =
  "Your goal is to checkmate the opposing king. Files are letters a through h, and ranks are numbers one through eight. Pawns move forward and capture diagonally. Knights move in an L shape. Bishops move diagonally. Rooks move straight. Queens move straight or diagonally, and kings move one square. Say a move like e two to e four, ask about a square, ask for legal moves, or request a hint. Moves are read back before confirmation unless you turn confirmations off in settings. Say yes to confirm, or cancel. You can also ask me to choose a move for you. Say help for more commands.";

export function localIntent(command: string): { name: string; args: object } | null {
  const text = command
    .trim()
    .toLowerCase()
    .replace(/[,.?!]/g, "")
    .replace(/[“”"]/g, "");
  if (/^(yes|confirm|play it|do it)$/.test(text)) return { name: "confirm_action", args: {} };
  if (/^(no|cancel|never mind|nevermind)$/.test(text)) return { name: "cancel_action", args: {} };
  if (/^(chess|play chess|start chess|open chess)$/.test(text))
    return { name: "navigate_app", args: { destination: "chess" } };
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
    return { name: "propose_best_move", args: {} };
  const control = text.match(/^(pause|resume|undo|resign|new game|start a new game)(?: game)?$/);
  if (control)
    return {
      name: "propose_game_control",
      args: { action: control[1].includes("new") ? "new_game" : control[1] },
    };
  const square = text.match(/^(?:what(?: is|'s) on |inspect )([a-h][1-8])$/);
  if (square) return { name: "inspect_square", args: { square: square[1] } };
  const move = text.match(
    /^(?:move )?([a-h][1-8])\s*(?:to|→|-)\s*([a-h][1-8])(?:\s+(queen|rook|bishop|knight))?$/,
  );
  if (move)
    return {
      name: "propose_move",
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
  if ("description" in result && typeof result.description === "string") {
    return (
      result.description +
      ("status" in result && result.status === "confirmation_required"
        ? ". Say yes to confirm, or cancel."
        : ".")
    );
  }
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
  if ("status" in result && result.status === "nothing_pending")
    return "There is no action waiting for confirmation.";
  return "Done.";
}
