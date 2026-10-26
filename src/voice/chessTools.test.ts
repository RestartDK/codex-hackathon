import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Chess } from "chess.js";
import { createChessToolExecutor, type ChessToolBridge } from "./chessTools";
import { localIntent } from "./commands";
import { DEFAULT_SETTINGS, loadSettings } from "../lib/storage";

function setup() {
  const game = new Chess();
  const controls: string[] = [];
  const bridge: ChessToolBridge = {
    game,
    history: [],
    playerColor: "w",
    view: "chess",
    settings: { ...DEFAULT_SETTINGS },
    updateSettings: (changes) => {
      bridge.settings = { ...bridge.settings, ...changes };
    },
    review: null,
    reviewMove: (move) => ({ ok: true, message: `Reviewing move ${move}.` }),
    returnToLive: () => {
      bridge.review = null;
    },
    flipBoard: () => {
      controls.push("flip_board");
    },
    retryEngine: () => {
      controls.push("retry_engine");
    },
    navigate: (destination) => {
      controls.push(destination);
      return `Opened ${destination}.`;
    },
    makeMove: (from, to, promotion) => {
      const move = game.move({ from, to, promotion });
      bridge.history = game.history();
      return { ok: true, message: `Played ${move.san}.` };
    },
    newGame: () => {
      controls.push("new_game");
      game.reset();
      bridge.history = [];
    },
    undoMove: () => {
      controls.push("undo");
      game.undo();
      bridge.history = game.history();
    },
    resign: () => {
      controls.push("resign");
      bridge.isTerminated = true;
    },
    pauseGame: () => {
      controls.push("pause");
      bridge.isPaused = true;
    },
    resumeGame: () => {
      controls.push("resume");
      bridge.isPaused = false;
    },
    getHint: async () => ({ ok: true, from: "e2", to: "e4", san: "e4" }),
  };
  return { bridge, game, controls, executor: createChessToolExecutor(() => bridge) };
}

afterEach(() => vi.unstubAllGlobals());

describe("immediate chess commands", () => {
  it("executes a recognized move on the real board without a second command", async () => {
    const { game, executor } = setup();
    const intent = localIntent("e2 to e4");
    expect(intent).not.toBeNull();
    if (!intent) throw new Error("Move command not recognized");
    const result = JSON.parse(await executor.execute(intent.name, JSON.stringify(intent.args)));
    expect(result.status).toBe("completed");
    expect(game.get("e4")).toMatchObject({ type: "p", color: "w" });
    expect(game.get("e2")).toBeUndefined();
    expect(game.history()).toEqual(["e4"]);
  });

  it.each(["new game", "undo", "resign"])("executes %s immediately", async (command) => {
    const { game, controls, executor } = setup();
    game.move("e4");
    game.move("e5");
    const intent = localIntent(command);
    if (!intent) throw new Error("Control not recognized");
    const result = JSON.parse(await executor.execute(intent.name, JSON.stringify(intent.args)));
    expect(result.status).toBe("completed");
    expect(controls).toContain(command === "new game" ? "new_game" : command);
  });

  it("leaves an active match without a confirmation and pauses its saved position", async () => {
    const { game, bridge, controls, executor } = setup();
    game.move("e4");
    game.move("e5");
    bridge.history = game.history();
    const fen = game.fen();
    const result = JSON.parse(await executor.execute("navigate_app", '{"destination":"home"}'));
    expect(result.status).toBe("completed");
    expect(controls).toEqual(["pause", "home"]);
    expect(game.fen()).toBe(fen);
  });

  it("does not restore an obsolete confirmation preference from local storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ confirmMoves: true }) });
    expect(loadSettings()).not.toHaveProperty("confirmMoves");
  });

  it("plays an engine-chosen move immediately but leaves a hint read-only", async () => {
    const { game, executor } = setup();
    expect(JSON.parse(await executor.execute("get_hint", "{}")).status).toBe("ok");
    expect(game.history()).toEqual([]);
    expect(JSON.parse(await executor.execute("play_best_move", "{}")).status).toBe("completed");
    expect(game.history()).toEqual(["e4"]);
  });

  it.each([
    { from: "e2", to: "e5", piece: "pawn", promotion: null },
    { from: "e2", to: "e4", piece: "dragon", promotion: null },
    { from: "e2", to: "e4", piece: "pawn", promotion: "king" },
    { from: "z2", to: "e4", piece: "pawn", promotion: null },
  ])("does not mutate the position for an invalid move %#", async (args) => {
    const { game, executor } = setup();
    const fen = game.fen();
    expect(JSON.parse(await executor.execute("make_move", JSON.stringify(args))).status).not.toBe(
      "completed",
    );
    expect(game.fen()).toBe(fen);
  });

  it("asks only for the missing origin when two knights can reach a square", async () => {
    const { game, executor } = setup();
    game.load("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1");
    const fen = game.fen();
    const result = JSON.parse(
      await executor.execute(
        "make_move",
        '{"from":null,"to":"d2","piece":"knight","promotion":null}',
      ),
    );
    expect(result.status).toBe("clarification_required");
    expect(result.origins).toEqual(expect.arrayContaining(["b1", "f1"]));
    expect(game.fen()).toBe(fen);
  });

  it("requires a promotion piece, then promotes immediately once it is specified", async () => {
    const { game, executor } = setup();
    game.load("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const args = { from: "a7", to: "a8", piece: "pawn", promotion: null };
    expect(JSON.parse(await executor.execute("make_move", JSON.stringify(args))).status).toBe(
      "clarification_required",
    );
    expect(game.get("a7")?.type).toBe("p");
    expect(
      JSON.parse(
        await executor.execute("make_move", JSON.stringify({ ...args, promotion: "rook" })),
      ).status,
    ).toBe("completed");
    expect(game.get("a8")).toMatchObject({ type: "r", color: "w" });
  });

  it("moves both the king and rook when castling by command", async () => {
    const { game, executor } = setup();
    game.load("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const result = JSON.parse(
      await executor.execute(
        "make_move",
        '{"from":"e1","to":"g1","piece":"king","promotion":null}',
      ),
    );
    expect(result.status).toBe("completed");
    expect(game.get("g1")?.type).toBe("k");
    expect(game.get("f1")?.type).toBe("r");
    expect(game.get("e1")).toBeUndefined();
    expect(game.get("h1")).toBeUndefined();
  });

  it("applies en passant from the authoritative legal-move list", async () => {
    const { game, bridge, executor } = setup();
    game.load("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2");
    const result = JSON.parse(
      await executor.execute(
        "make_move",
        '{"from":"e5","to":"d6","piece":"pawn","promotion":null}',
      ),
    );
    expect(result.status).toBe("completed");
    expect(game.get("d6")).toMatchObject({ type: "p", color: "w" });
    expect(game.get("d5")).toBeUndefined();
    expect(bridge.history).toEqual(["exd6"]);
  });

  it("reports checkmate, stalemate, and supported draw positions from chess.js", async () => {
    const { game, executor } = setup();
    game.load("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
    let position = JSON.parse(await executor.execute("get_position", "{}"));
    expect(position.gameOver).toBe(true);
    expect(game.isCheckmate()).toBe(true);

    game.load("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    position = JSON.parse(await executor.execute("get_position", "{}"));
    expect(position.gameOver).toBe(true);
    expect(game.isStalemate()).toBe(true);

    game.load("8/8/8/8/8/8/6k1/6K1 w - - 0 1");
    expect(game.isInsufficientMaterial()).toBe(true);
    expect(game.isDraw()).toBe(true);
  });

  it("does not apply a repeated move tool call after the turn changes", async () => {
    const { game, executor } = setup();
    const request = '{"from":"e2","to":"e4","piece":"pawn","promotion":null}';
    expect(JSON.parse(await executor.execute("make_move", request)).status).toBe("completed");
    expect(JSON.parse(await executor.execute("make_move", request)).status).toBe("error");
    expect(game.history()).toEqual(["e4"]);
  });

  it.each([
    { preference: "confirmMoves", value: true },
    { preference: "voiceVolume" },
    { preference: "voiceVolume", value: 101 },
    { preference: "voiceVolume", value: null },
    { preference: "soundEnabled", value: "false" },
    { preference: "difficulty", value: "impossible" },
  ])("rejects an invalid preference without changing saved state %#", async (args) => {
    const { bridge, executor } = setup();
    const settings = { ...bridge.settings };
    expect(JSON.parse(await executor.execute("set_preference", JSON.stringify(args))).status).toBe(
      "error",
    );
    expect(bridge.settings).toEqual(settings);
  });

  it("preserves zero volume and false toggles rather than substituting defaults", async () => {
    const { bridge, executor } = setup();
    expect(
      JSON.parse(await executor.execute("set_preference", '{"preference":"voiceVolume","value":0}'))
        .status,
    ).toBe("completed");
    expect(
      JSON.parse(
        await executor.execute("set_preference", '{"preference":"soundEnabled","value":false}'),
      ).status,
    ).toBe("completed");
    expect(bridge.settings.voiceVolume).toBe(0);
    expect(bridge.settings.soundEnabled).toBe(false);
  });

  it("does not play an old hint after a new game, even when the FEN matches", async () => {
    const { bridge, game, executor } = setup();
    let finish = () => {};
    bridge.getHint = () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true, from: "e2", to: "e4", san: "e4" });
      });
    const pending = executor.execute("play_best_move", "{}");
    await executor.execute("game_control", '{"action":"new_game"}');
    finish();
    expect(JSON.parse(await pending).status).toBe("stale");
    expect(game.history()).toEqual([]);
  });

  it("recovers corrupt settings per field and retains valid stored preferences", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          confirmMoves: true,
          boardTheme: "obsolete",
          voiceVolume: 55,
          soundEnabled: false,
          playerColor: "b",
        }),
    });
    const settings = loadSettings();
    expect(settings.voiceVolume).toBe(55);
    expect(settings.soundEnabled).toBe(false);
    expect(settings.playerColor).toBe("b");
    expect(settings.boardTheme).toBe(DEFAULT_SETTINGS.boardTheme);
    expect(settings).not.toHaveProperty("confirmMoves");
  });

  it("uses the reviewed side to move alongside historical legal moves", async () => {
    const { game, bridge, executor } = setup();
    game.move("e4");
    const reviewed = new Chess(game.fen());
    game.move("e5");
    bridge.history = game.history();
    bridge.review = { game: reviewed, move: 1 };
    const result = JSON.parse(await executor.execute("get_legal_moves", '{"from":null}'));
    expect(result.turn).toBe("Black");
    expect(result.moves).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: "e7", to: "e5" })]),
    );
  });

  it("returns to the live board before computing and describing a hint", async () => {
    const { game, bridge, executor } = setup();
    game.move("e4");
    const reviewed = new Chess(game.fen());
    game.move("e5");
    bridge.history = game.history();
    bridge.review = { game: reviewed, move: 1 };
    bridge.getHint = async () => ({ ok: true, from: "g1", to: "f3", san: "Nf3" });
    const result = JSON.parse(await executor.execute("get_hint", "{}"));
    expect(result.status).toBe("ok");
    expect(result.description).toContain("Back at the live board.");
    expect(bridge.review).toBeNull();
    expect(game.history()).toEqual(["e4", "e5"]);
  });

  it("does not silently enter history review when the board is not open", async () => {
    const { bridge, executor } = setup();
    bridge.view = "home";
    expect(JSON.parse(await executor.execute("review_move", '{"move":0}')).status).toBe("error");
    expect(bridge.review).toBeNull();
  });

  it("routes guided Chess setup choices through the visible setup bridge", async () => {
    const { bridge, executor } = setup();
    const configureSetup = vi.fn(() => ({ ok: true, message: "Black selected." }));
    bridge.view = "chess-setup";
    bridge.configureSetup = configureSetup;
    const result = JSON.parse(
      await executor.execute(
        "configure_chess_setup",
        JSON.stringify({ action: null, difficulty: null, color: "b", timer: null, rules: null }),
      ),
    );
    expect(result.status).toBe("completed");
    expect(configureSetup).toHaveBeenCalledWith({ color: "b" });
  });
});
