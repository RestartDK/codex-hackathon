import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { createChessToolExecutor, type ChessToolBridge } from "./chessTools";
import { localIntent } from "./commands";
import { loadSettings } from "../lib/storage";

function setup() {
  const game = new Chess();
  const controls: string[] = [];
  const bridge: ChessToolBridge = {
    game,
    history: [],
    playerColor: "w",
    view: "chess",
    navigate: destination => { controls.push(destination); return `Opened ${destination}.`; },
    makeMove: (from, to, promotion) => {
      const move = game.move({ from, to, promotion });
      bridge.history = game.history();
      return { ok: true, message: `Played ${move.san}.` };
    },
    newGame: () => { controls.push("new_game"); game.reset(); bridge.history = []; },
    undoMove: () => { controls.push("undo"); game.undo(); bridge.history = game.history(); },
    resign: () => { controls.push("resign"); bridge.isTerminated = true; },
    pauseGame: () => { controls.push("pause"); bridge.isPaused = true; },
    resumeGame: () => { controls.push("resume"); bridge.isPaused = false; },
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

  it.each(["new game", "undo", "resign"])("executes %s immediately", async command => {
    const { game, controls, executor } = setup();
    game.move("e4"); game.move("e5");
    const intent = localIntent(command);
    if (!intent) throw new Error("Control not recognized");
    const result = JSON.parse(await executor.execute(intent.name, JSON.stringify(intent.args)));
    expect(result.status).toBe("completed");
    expect(controls).toContain(command === "new game" ? "new_game" : command);
  });

  it("leaves an active match without a confirmation and pauses its saved position", async () => {
    const { game, bridge, controls, executor } = setup();
    game.move("e4"); game.move("e5"); bridge.history = game.history();
    const fen = game.fen();
    const result = JSON.parse(await executor.execute("navigate_app", '{"destination":"home"}'));
    expect(result.status).toBe("completed");
    expect(controls).toEqual(["pause", "home"]);
    expect(game.fen()).toBe(fen);
  });

  it("does not restore an obsolete confirmation preference from local storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({confirmMoves:true}) });
    expect(loadSettings()).not.toHaveProperty("confirmMoves");
  });
});
