import type { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import { parseDestination, PLAYABLE_GAMES_LABEL, type AvailableDestination } from "./navigation";

const pieceNames: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const pieceSymbols: Record<string, PieceSymbol> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};
const promotionSymbols: Record<string, "q" | "r" | "b" | "n"> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
};

export interface ChessToolBridge {
  game: Chess;
  history: string[];
  playerColor: Color;
  view: AvailableDestination | "loading";
  navigate: (destination: AvailableDestination) => string;
  awaitingStartChoice?: boolean;
  isTerminated?: boolean;
  isPaused?: boolean;
  confirmMoves?: boolean;
  makeMove: (
    from: Square,
    to: Square,
    promotion?: "q" | "r" | "b" | "n",
  ) => {
    ok: boolean;
    message: string;
  };
  getHint?: () => Promise<
    | { ok: true; from: Square; to: Square; promotion?: "q" | "r" | "b" | "n"; san: string }
    | { ok: false; message: string }
  >;
  newGame: () => void;
  resumeGame?: () => void | { ok: boolean; message: string };
  pauseGame?: () => void | { ok: boolean; message: string };
  undoMove: () => void | { ok: boolean; message: string };
  resign: () => void | { ok: boolean; message: string };
}

type PendingAction = {
  id: string;
  fen: string;
  kind: "move" | "game-control" | "navigation";
  description: string;
  execute: () => { ok: boolean; message: string };
};

export type ChessToolExecutor = ReturnType<typeof createChessToolExecutor>;

function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

function describeMove(move: Move): string {
  if (move.flags.includes("k")) return `${colorName(move.color)} castles kingside`;
  if (move.flags.includes("q")) return `${colorName(move.color)} castles queenside`;
  const capture = move.captured ? ` captures the ${pieceNames[move.captured]}` : "";
  const promotion = move.promotion ? ` and promotes to ${pieceNames[move.promotion]}` : "";
  const check = move.san.endsWith("#") ? ", checkmate" : move.san.endsWith("+") ? ", check" : "";
  return `${colorName(move.color)} ${pieceNames[move.piece]} from ${move.from} to ${move.to}${capture}${promotion}${check}`;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function createChessToolExecutor(
  getBridge: () => ChessToolBridge,
  onPendingChange: () => void = () => undefined,
) {
  let pending: PendingAction | null = null;
  let nextId = 1;
  let revision = 0;

  const invalidatePending = () => {
    revision++;
    pending = null;
    onPendingChange();
  };

  function currentPieces(color: Color, piece?: PieceSymbol) {
    const found: Array<{ square: string; piece: string }> = [];
    for (const rank of getBridge().game.board()) {
      for (const entry of rank) {
        if (entry && entry.color === color && (!piece || entry.type === piece)) {
          found.push({ square: entry.square, piece: pieceNames[entry.type] });
        }
      }
    }
    return found;
  }

  function propose(
    description: string,
    execute: PendingAction["execute"],
    kind: PendingAction["kind"] = "move",
  ) {
    const bridge = getBridge();
    revision++;
    pending = {
      id: `action-${nextId++}`,
      fen: bridge.game.fen(),
      kind,
      description,
      execute,
    };
    onPendingChange();
    return json({ status: "confirmation_required", actionId: pending.id, description });
  }

  async function execute(name: string, rawArguments: string): Promise<string> {
    const bridge = getBridge();
    let args: object;
    try {
      const parsed: unknown = rawArguments ? JSON.parse(rawArguments) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ status: "error", message: "Tool arguments must be an object." });
      }
      args = parsed;
    } catch {
      return json({ status: "error", message: "The tool arguments were not valid JSON." });
    }
    const fields = new Map<string, unknown>(Object.entries(args));

    if (name === "navigate_app") {
      const destination = parseDestination(fields.get("destination"));
      if (!destination)
        return json({
          status: "error",
          message: "Choose chess, Loups-Garous, home, audio settings, or help.",
        });
      if (destination === "tic-tac-toe") {
        return json({
          status: "unavailable",
          message: `${PLAYABLE_GAMES_LABEL} are ready to play. Tic-Tac-Toe is coming soon.`,
        });
      }
      invalidatePending();
      if (
        (destination === "home" || destination === "loups-garous") &&
        bridge.view !== "home" &&
        bridge.history.length > 0 &&
        !bridge.awaitingStartChoice &&
        !bridge.isPaused &&
        !bridge.isTerminated
      ) {
        return propose(
          "Leave the game? Your current position will be saved, so you can resume it later",
          () => {
            if (!bridge.isTerminated) getBridge().pauseGame?.();
            return { ok: true, message: getBridge().navigate(destination) };
          },
          "navigation",
        );
      }
      return json({ status: "completed", message: bridge.navigate(destination) });
    }

    if (
      ["propose_move", "get_hint", "propose_best_move"].includes(name) &&
      bridge.view !== "chess"
    ) {
      return json({ status: "error", message: "Open Chess first. Say play chess." });
    }

    if (name === "get_position") {
      const game = bridge.game;
      const latest = game.history().at(-1) ?? "No moves yet";
      const material: Record<Color, Record<string, number>> = {
        w: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
        b: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
      };
      for (const color of ["w", "b"] as const) {
        for (const item of currentPieces(color)) {
          if (item.piece !== "king") material[color][item.piece]++;
        }
      }
      return json({
        status: "ok",
        turn: colorName(game.turn()),
        playerColor: colorName(bridge.playerColor),
        inCheck: game.isCheck(),
        gameOver: game.isGameOver(),
        latestMove: latest,
        material,
      });
    }

    if (name === "inspect_square") {
      const square = String(fields.get("square") ?? "").toLowerCase() as Square;
      if (!/^[a-h][1-8]$/.test(square))
        return json({ status: "error", message: "Use a square from a1 to h8." });
      const piece = bridge.game.get(square);
      return json({
        status: "ok",
        square,
        occupant: piece ? `${colorName(piece.color)} ${pieceNames[piece.type]}` : "empty",
      });
    }

    if (name === "locate_pieces") {
      const owner = String(fields.get("owner") ?? "player");
      const color: Color =
        owner === "white"
          ? "w"
          : owner === "black"
            ? "b"
            : owner === "opponent"
              ? bridge.playerColor === "w"
                ? "b"
                : "w"
              : bridge.playerColor;
      const requested = String(fields.get("piece") ?? "all");
      const piece = requested === "all" ? undefined : pieceSymbols[requested];
      if (requested !== "all" && !piece)
        return json({ status: "error", message: "Unknown piece type." });
      return json({ status: "ok", color: colorName(color), pieces: currentPieces(color, piece) });
    }

    if (name === "get_legal_moves") {
      const fromValue =
        fields.get("from") == null ? null : String(fields.get("from")).toLowerCase();
      if (fromValue && !/^[a-h][1-8]$/.test(fromValue))
        return json({ status: "error", message: "Use a square from a1 to h8." });
      const moves = bridge.game.moves({
        ...(fromValue ? { square: fromValue as Square } : {}),
        verbose: true,
      });
      return json({
        status: "ok",
        turn: colorName(bridge.game.turn()),
        moves: moves.map((move) => ({ san: move.san, from: move.from, to: move.to })),
      });
    }

    if (name === "get_history") {
      const count = Math.min(12, Math.max(1, Number(fields.get("count")) || 4));
      const moves = bridge.game
        .history({ verbose: true })
        .slice(-count)
        .map((move) => ({
          san: move.san,
          spoken: describeMove(move),
        }));
      return json({ status: "ok", moves });
    }

    if (name === "explain_last_move") {
      const move = bridge.game.history({ verbose: true }).at(-1);
      if (!move) return json({ status: "error", message: "No move has been played yet." });
      const verifiedEffects: string[] = [];
      if (move.captured) verifiedEffects.push(`captured a ${pieceNames[move.captured]}`);
      if (move.promotion) verifiedEffects.push(`promoted to a ${pieceNames[move.promotion]}`);
      if (move.flags.includes("k") || move.flags.includes("q"))
        verifiedEffects.push("castled the king and rook");
      if (move.san.endsWith("#")) verifiedEffects.push("gave checkmate");
      else if (move.san.endsWith("+")) verifiedEffects.push("gave check");
      return json({
        status: "ok",
        move: describeMove(move),
        verifiedEffects,
        limitation: "Only verified consequences are available; do not invent a strategic motive.",
      });
    }

    if (name === "read_board") {
      const scope = String(fields.get("scope") ?? "all").toLowerCase();
      const value = String(fields.get("value") ?? "").toLowerCase();
      const pieces = [...currentPieces("w"), ...currentPieces("b")].map((item) => ({
        ...item,
        color: bridge.game.get(item.square as Square)?.color === "w" ? "White" : "Black",
      }));
      let selected = pieces;
      if (scope === "rank") {
        if (!/^[1-8]$/.test(value))
          return json({ status: "error", message: "A rank must be from 1 to 8." });
        selected = pieces.filter((item) => item.square[1] === value);
      } else if (scope === "file") {
        if (!/^[a-h]$/.test(value))
          return json({ status: "error", message: "A file must be from a to h." });
        selected = pieces.filter((item) => item.square[0] === value);
      } else if (scope !== "all") {
        return json({ status: "error", message: "Scope must be all, rank, or file." });
      }
      return json({ status: "ok", scope, value: value || null, pieces: selected });
    }

    if (name === "propose_move") {
      if (bridge.awaitingStartChoice)
        return json({ status: "error", message: "Choose Resume or New Game first." });
      if (bridge.isPaused)
        return json({ status: "error", message: "The game is paused. Resume it before moving." });
      if (bridge.isTerminated)
        return json({ status: "error", message: "The game is already over." });
      if (bridge.game.turn() !== bridge.playerColor)
        return json({ status: "error", message: "It is the computer’s turn." });
      const to = String(fields.get("to") ?? "").toLowerCase();
      if (!/^[a-h][1-8]$/.test(to))
        return json({ status: "error", message: "A destination square is required." });
      const from = fields.get("from") == null ? null : String(fields.get("from")).toLowerCase();
      const requestedPiece =
        fields.get("piece") == null ? null : pieceSymbols[String(fields.get("piece"))];
      const requestedPromotion =
        fields.get("promotion") == null ? null : promotionSymbols[String(fields.get("promotion"))];
      let candidates = bridge.game.moves({ verbose: true }).filter((move) => move.to === to);
      if (from) candidates = candidates.filter((move) => move.from === from);
      if (requestedPiece) candidates = candidates.filter((move) => move.piece === requestedPiece);
      if (requestedPromotion)
        candidates = candidates.filter((move) => move.promotion === requestedPromotion);
      if (!requestedPromotion && candidates.some((move) => move.promotion)) {
        return json({
          status: "clarification_required",
          message: "Which promotion piece: queen, rook, bishop, or knight?",
        });
      }
      const distinct = new Map(
        candidates.map((move) => [`${move.from}-${move.to}-${move.promotion ?? ""}`, move]),
      );
      candidates = [...distinct.values()];
      if (candidates.length === 0)
        return json({
          status: "illegal",
          message: "That is not a legal move in the current position.",
        });
      if (candidates.length > 1)
        return json({
          status: "clarification_required",
          origins: candidates.map((move) => move.from),
          message: `More than one piece can move to ${to}.`,
        });
      const move = candidates[0];
      const description = describeMove(move);
      if (bridge.confirmMoves === false) {
        const result = bridge.makeMove(
          move.from,
          move.to,
          move.promotion as "q" | "r" | "b" | "n" | undefined,
        );
        return json({ status: result.ok ? "completed" : "error", message: result.message });
      }
      return propose(description, () =>
        bridge.makeMove(move.from, move.to, move.promotion as "q" | "r" | "b" | "n" | undefined),
      );
    }

    if (name === "get_hint" || name === "propose_best_move") {
      if (bridge.awaitingStartChoice)
        return json({ status: "error", message: "Choose Resume or New Game first." });
      if (bridge.isPaused)
        return json({
          status: "error",
          message: "The game is paused. Resume it before requesting a move.",
        });
      if (bridge.isTerminated)
        return json({ status: "error", message: "The game is already over." });
      if (bridge.game.turn() !== bridge.playerColor)
        return json({ status: "error", message: "Wait for the computer to finish its turn." });
      if (!bridge.getHint) return json({ status: "error", message: "Hints are not available." });
      const requestRevision = revision;
      const hint = await bridge.getHint();
      if (revision !== requestRevision)
        return json({
          status: "stale",
          message: "That request was cancelled or replaced before the hint was ready.",
        });
      if (!hint.ok) return json({ status: "error", message: hint.message });
      const move = bridge.game
        .moves({ verbose: true })
        .find(
          (candidate) =>
            candidate.from === hint.from &&
            candidate.to === hint.to &&
            (!candidate.promotion || candidate.promotion === hint.promotion),
        );
      if (!move)
        return json({
          status: "stale",
          message: "The position changed, so the hint was discarded.",
        });
      const description = describeMove(move);
      if (name === "get_hint") return json({ status: "ok", move: hint.san, description });
      return propose(description, () =>
        bridge.makeMove(move.from, move.to, move.promotion as "q" | "r" | "b" | "n" | undefined),
      );
    }

    if (name === "confirm_action") {
      if (!pending)
        return json({
          status: "nothing_pending",
          message: "There is no action waiting for confirmation.",
        });
      if (
        pending.kind === "move" &&
        (bridge.awaitingStartChoice || bridge.isPaused || bridge.isTerminated)
      ) {
        const message = bridge.awaitingStartChoice
          ? "Choose Resume or New Game first."
          : bridge.isPaused
            ? "The game is paused. Resume it before moving."
            : "The game is already over.";
        if (bridge.isTerminated) invalidatePending();
        return json({ status: "error", message });
      }
      if (pending.kind !== "navigation" && pending.fen !== bridge.game.fen()) {
        invalidatePending();
        return json({
          status: "stale",
          message: "The position changed, so that action was cancelled.",
        });
      }
      const action = pending;
      invalidatePending();
      const result = action.execute();
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "cancel_action") {
      const hadPending = Boolean(pending);
      invalidatePending();
      return json({ status: hadPending ? "cancelled" : "nothing_pending" });
    }

    if (name === "propose_game_control") {
      const action = String(fields.get("action") ?? "");
      if (action === "resume") {
        if (!bridge.resumeGame)
          return json({ status: "error", message: "There is no game to resume." });
        const result = bridge.resumeGame();
        return json({
          status: result?.ok === false ? "error" : "completed",
          message: result?.message ?? "The game is resumed. Would you like the quick guide?",
        });
      }
      if (action === "pause") {
        if (!bridge.pauseGame) return json({ status: "error", message: "Pause is not available." });
        const result = bridge.pauseGame();
        return json({
          status: result?.ok === false ? "error" : "completed",
          message: result?.message ?? "The game is paused.",
        });
      }
      if (action === "new_game")
        return propose(
          "Start a new game and clear the current position",
          () => {
            bridge.newGame();
            return { ok: true, message: "A new game has started. Would you like the quick guide?" };
          },
          "game-control",
        );
      if (action === "undo")
        return propose(
          "Undo your latest turn",
          () => bridge.undoMove() ?? { ok: true, message: "Your latest turn was undone." },
          "game-control",
        );
      if (action === "resign")
        return propose(
          "Resign the current game",
          () => bridge.resign() ?? { ok: true, message: "You resigned the game." },
          "game-control",
        );
      return json({ status: "error", message: "Unknown game control." });
    }

    return json({ status: "error", message: `Unknown tool: ${name}` });
  }

  return {
    execute,
    invalidatePending,
    getPending: () =>
      pending && { id: pending.id, kind: pending.kind, description: pending.description },
  };
}
