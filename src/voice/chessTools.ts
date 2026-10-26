import type { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import { appSettingsSchema, describePreference, type AppSettings } from "../lib/preferences";
import { moveArgumentsSchema, squareSchema } from "./chessActions";
import { parseDestination, PLAYABLE_GAMES_LABEL, type AvailableDestination } from "./navigation";
import type { ChessSetupCommand } from "../components/PlayByVoice/ChessSetup";

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
  view: AvailableDestination | "loading" | "chess-setup";
  navigate: (destination: AvailableDestination) => string;
  awaitingStartChoice?: boolean;
  isTerminated?: boolean;
  isPaused?: boolean;
  settings: AppSettings;
  updateSettings: (changes: Partial<AppSettings>) => void;
  review: { game: Chess; move: number } | null;
  reviewMove: (move: number) => { ok: boolean; message: string };
  returnToLive: () => void;
  flipBoard: () => void;
  retryEngine: () => void;
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
  startDefaultGame?: () => void;
  configureSetup?: (command: ChessSetupCommand) => { ok: boolean; message: string };
  setupGuidance?: { key: string; message: string } | null;
  pendingPromotion?: { from: Square; to: Square } | null;
  promote?: (piece: "q" | "r" | "b" | "n") => void;
  cancelPromotion?: () => void;
  resumeGame?: () => void | { ok: boolean; message: string };
  pauseGame?: () => void | { ok: boolean; message: string };
  undoMove: () => void | { ok: boolean; message: string };
  resign: () => void | { ok: boolean; message: string };
}

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

export function createChessToolExecutor(getBridge: () => ChessToolBridge) {
  let revision = 0;
  const cancelRequests = () => {
    revision++;
  };
  const readGame = () => getBridge().review?.game ?? getBridge().game;

  function currentPieces(color: Color, piece?: PieceSymbol) {
    const found: Array<{ square: Square; piece: string }> = [];
    for (const rank of readGame().board()) {
      for (const entry of rank) {
        if (entry && entry.color === color && (!piece || entry.type === piece)) {
          found.push({ square: entry.square, piece: pieceNames[entry.type] });
        }
      }
    }
    return found;
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

    if (name === "control_voice_guidance") {
      const rawAction = fields.get("action");
      const action = typeof rawAction === "string" ? rawAction : "";
      if (action === "home") {
        cancelRequests();
        return json({ status: "completed", message: bridge.navigate("home") });
      }
      if (action === "back") {
        if (bridge.view === "chess-setup" && bridge.configureSetup)
          return json(bridge.configureSetup({ action: "back" }));
        return json({
          status: "error",
          message: "There is no previous step here. Say go home to open the game picker.",
        });
      }
      if (action === "defaults" || action === "start") {
        if (bridge.view !== "chess-setup" || !bridge.configureSetup)
          return json({
            status: "error",
            message: "Open Chess setup before changing or confirming setup.",
          });
        return json(
          bridge.configureSetup({ action: action === "defaults" ? "defaults" : "start" }),
        );
      }
      const current =
        bridge.setupGuidance?.message ??
        (bridge.view === "chess"
          ? `You are playing Chess as ${colorName(bridge.playerColor)}. ${colorName(bridge.game.turn())} to move.`
          : `You are on the ${bridge.view} screen.`);
      if (action === "location")
        return json({
          status: "ok",
          message: `You are in ${bridge.view === "chess-setup" ? "Chess setup" : bridge.view}. ${current}`,
        });
      if (action === "capabilities")
        return json({
          status: "ok",
          message: `${current} You can ask for available actions, repeat, an explanation, go back, go home, or continue with the current choice.`,
        });
      if (action === "explain")
        return json({
          status: "ok",
          message:
            bridge.view === "chess-setup"
              ? `Chess setup chooses opponent strength, piece color, timer, and guidance. ${current}`
              : `${current} Ask for the quick guide for rules and move examples.`,
        });
      if (action === "repeat") return json({ status: "ok", message: current });
      return json({ status: "error", message: "Unknown guidance command." });
    }

    if (name === "navigate_app") {
      const destination = parseDestination(fields.get("destination"));
      if (!destination)
        return json({
          status: "error",
          message: `Choose ${PLAYABLE_GAMES_LABEL}, home, audio settings, or help.`,
        });
      cancelRequests();
      if (
        destination !== "chess" &&
        destination !== "audio" &&
        destination !== "help" &&
        bridge.view === "chess" &&
        bridge.history.length > 0 &&
        !bridge.awaitingStartChoice &&
        !bridge.isPaused &&
        !bridge.isTerminated
      )
        bridge.pauseGame?.();
      return json({ status: "completed", message: bridge.navigate(destination) });
    }

    if (name === "get_preferences") return json({ status: "ok", preferences: bridge.settings });

    if (name === "set_preference") {
      const preference = appSettingsSchema.keyof().safeParse(fields.get("preference"));
      if (!preference.success) return json({ status: "error", message: "Unknown preference." });
      if (!fields.has("value"))
        return json({ status: "error", message: "A preference value is required." });
      const changes = appSettingsSchema
        .partial()
        .safeParse({ [preference.data]: fields.get("value") });
      if (!changes.success)
        return json({
          status: "error",
          message: "That value is not available for this preference.",
        });
      cancelRequests();
      bridge.updateSettings(changes.data);
      const resets = preference.data === "playerColor" || preference.data === "gameMode";
      return json({
        status: "completed",
        message: `${describePreference(preference.data, { ...bridge.settings, ...changes.data })}.${resets ? " A new chess game starts with this preference." : ""}`,
      });
    }

    if (
      ["make_move", "get_hint", "play_best_move", "review_move"].includes(name) &&
      bridge.view !== "chess"
    ) {
      return json({ status: "error", message: "Open Chess first. Say play chess." });
    }

    if (name === "review_move") {
      const move = fields.get("move");
      if (typeof move !== "number" || !Number.isInteger(move) || move < 0)
        return json({
          status: "error",
          message: "Use a move number, or zero for the starting position.",
        });
      cancelRequests();
      const result = bridge.reviewMove(move);
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "get_position") {
      const game = readGame();
      const latest = bridge.review
        ? (bridge.history[bridge.review.move - 1] ?? "Starting position")
        : (game.history().at(-1) ?? "No moves yet");
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
        reviewMove: bridge.review?.move ?? null,
        material,
      });
    }

    if (name === "inspect_square") {
      const parsed = squareSchema.safeParse(String(fields.get("square") ?? "").toLowerCase());
      if (!parsed.success) return json({ status: "error", message: "Use a square from a1 to h8." });
      const square = parsed.data;
      const piece = readGame().get(square);
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
      const parsed = squareSchema
        .nullable()
        .safeParse(fields.get("from") == null ? null : String(fields.get("from")).toLowerCase());
      if (!parsed.success) return json({ status: "error", message: "Use a square from a1 to h8." });
      const moves = readGame().moves({
        ...(parsed.data ? { square: parsed.data } : {}),
        verbose: true,
      });
      return json({
        status: "ok",
        turn: colorName(readGame().turn()),
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
        color: readGame().get(item.square)?.color === "w" ? "White" : "Black",
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

    if (name === "make_move") {
      if (bridge.awaitingStartChoice)
        return json({ status: "error", message: "Choose Resume or New Game first." });
      if (bridge.isPaused)
        return json({ status: "error", message: "The game is paused. Resume it before moving." });
      if (bridge.isTerminated)
        return json({ status: "error", message: "The game is already over." });
      if (bridge.game.turn() !== bridge.playerColor)
        return json({ status: "error", message: "It is the computer’s turn." });
      const parsed = moveArgumentsSchema.safeParse({
        from: fields.get("from") ?? null,
        to: fields.get("to"),
        piece: fields.get("piece") ?? null,
        promotion: fields.get("promotion") ?? null,
      });
      if (!parsed.success)
        return json({
          status: "error",
          message: "Use valid squares and a known piece or promotion.",
        });
      const { from, to, piece, promotion } = parsed.data;
      const requestedPiece = piece === null ? null : pieceSymbols[piece];
      const requestedPromotion = promotion === null ? null : promotionSymbols[promotion];
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
      cancelRequests();
      bridge.returnToLive();
      const result = bridge.makeMove(move.from, move.to, requestedPromotion ?? undefined);
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "promote_pawn") {
      const piece = promotionSymbols[String(fields.get("piece"))];
      if (!piece || !bridge.pendingPromotion || !bridge.promote || bridge.isPaused)
        return json({
          status: "error",
          message:
            "There is no pawn waiting for promotion. Choose queen, rook, bishop, or knight when prompted.",
        });
      bridge.promote(piece);
      return json({ status: "completed", message: "The pawn was promoted." });
    }

    if (name === "get_hint" || name === "play_best_move") {
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
      const wasReviewing = bridge.review !== null;
      bridge.returnToLive();
      const requestRevision = ++revision;
      const requestFen = bridge.game.fen();
      const hint = await bridge.getHint();
      if (
        revision !== requestRevision ||
        getBridge().game.fen() !== requestFen ||
        getBridge().isPaused ||
        getBridge().isTerminated ||
        getBridge().review !== null ||
        getBridge().view !== "chess"
      )
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
      const description = `${wasReviewing ? "Back at the live board. " : ""}${describeMove(move)}`;
      if (name === "get_hint") return json({ status: "ok", move: hint.san, description });
      const result = getBridge().makeMove(hint.from, hint.to, hint.promotion);
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "cancel_action") {
      cancelRequests();
      bridge.cancelPromotion?.();
      return json({ status: "cancelled", message: "Cancelled the current request." });
    }

    if (name === "game_control") {
      const action = fields.get("action");
      cancelRequests();
      if (action === "start_game") {
        if (bridge.view !== "chess-setup" || !bridge.startDefaultGame)
          return json({
            status: "error",
            message: "Open new game setup first, or say play chess to resume.",
          });
        bridge.startDefaultGame();
        return json({
          status: "completed",
          message: "Chess has started. Say your move or ask about the board.",
        });
      }
      if (action === "new_game") {
        bridge.newGame();
        return json({
          status: "completed",
          message: "Chess setup is open. Choose your preferences before starting.",
        });
      }
      if (action === "return_live") {
        bridge.returnToLive();
        return json({ status: "completed", message: "Back at the live board." });
      }
      if (action === "flip_board") {
        bridge.flipBoard();
        return json({ status: "completed", message: "The board is flipped." });
      }
      if (action === "retry_engine") {
        bridge.retryEngine();
        return json({ status: "completed", message: "Restarting the local chess engine." });
      }
      const control =
        action === "resume"
          ? bridge.resumeGame
          : action === "pause"
            ? bridge.pauseGame
            : action === "undo"
              ? bridge.undoMove
              : action === "resign"
                ? bridge.resign
                : null;
      if (!control)
        return json({ status: "error", message: "That game control is not available." });
      const result = control();
      const message =
        action === "resume"
          ? "The game is resumed."
          : action === "pause"
            ? "The game is paused."
            : action === "undo"
              ? "Your latest turn was undone."
              : "You resigned the game.";
      return json({
        status: result?.ok === false ? "error" : "completed",
        message: result?.message ?? message,
      });
    }

    if (name === "configure_chess_setup") {
      if (bridge.view !== "chess-setup" || !bridge.configureSetup)
        return json({ status: "error", message: "Chess setup is not open." });
      const command: ChessSetupCommand = {};
      const action = fields.get("action");
      if (["back", "defaults", "start", "repeat", "explain"].includes(String(action)))
        command.action = action as ChessSetupCommand["action"];
      const difficulty = fields.get("difficulty");
      if (["beginner", "casual", "club"].includes(String(difficulty)))
        command.difficulty = difficulty as ChessSetupCommand["difficulty"];
      const color = fields.get("color");
      if (["w", "b", "random"].includes(String(color)))
        command.color = color as "w" | "b" | "random";
      if (fields.get("timer") === "off") command.timer = "off";
      if (typeof fields.get("rules") === "boolean") command.rules = fields.get("rules") as boolean;
      const result = bridge.configureSetup(command);
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    return json({ status: "error", message: `Unknown tool: ${name}` });
  }

  return { execute, cancelRequests };
}
