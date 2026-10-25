import { describe, expect, it } from "vite-plus/test";
import { createLudoState, LUDO_GUIDE } from "./ludo/ludo";
import { createLudoToolExecutor, type LudoToolBridge } from "./ludo/ludoTools";
import {
  createTicTacToeState,
  TIC_TAC_TOE_DASHBOARD,
  TIC_TAC_TOE_GUIDE,
  TIC_TAC_TOE_INTRODUCTION,
} from "./tic-tac-toe/ticTacToe";
import {
  createTicTacToeToolExecutor,
  type TicTacToeToolBridge,
} from "./tic-tac-toe/ticTacToeTools";
import { transcriptPageText } from "./intercept/intercept";

const unused = () => ({ ok: true, message: "unused" });

function ludoBridge(overrides: Partial<LudoToolBridge> = {}): LudoToolBridge {
  return {
    state: createLudoState(),
    awaitingStartChoice: false,
    paused: false,
    pendingToken: null,
    confirmMoves: false,
    rollDice: unused,
    proposeToken: unused,
    confirmToken: unused,
    cancelToken: unused,
    correct: unused,
    continueGame: unused,
    newGame: () => undefined,
    pauseGame: unused,
    resumeGame: unused,
    ...overrides,
  };
}

function ticTacToeBridge(overrides: Partial<TicTacToeToolBridge> = {}): TicTacToeToolBridge {
  return {
    state: createTicTacToeState(),
    awaitingStartChoice: false,
    paused: false,
    playHumanMove: unused,
    undo: unused,
    newRound: unused,
    resetMatch: unused,
    pause: unused,
    resume: unused,
    changeDifficulty: unused,
    ...overrides,
  };
}

describe("authored game content", () => {
  it("serves the Ludo guide from its single authored source", async () => {
    const executor = createLudoToolExecutor(() => ludoBridge());
    const result = JSON.parse(await executor.execute("get_game_guide", "{}"));
    expect(result.status).toBe("ok");
    expect(result.message).toBe(LUDO_GUIDE);
  });

  it("reports blocked Ludo states in get_position", async () => {
    const executor = createLudoToolExecutor(() =>
      ludoBridge({ awaitingStartChoice: true, paused: true }),
    );
    const result = JSON.parse(await executor.execute("get_position", "{}"));
    expect(result.awaitingStartChoice).toBe(true);
    expect(result.paused).toBe(true);
    expect(result.message).toContain("saved game is waiting");
    expect(result.message).toContain("paused");
  });

  it("serves the authored Tic-Tac-Toe introduction, guide, and dashboard", async () => {
    const executor = createTicTacToeToolExecutor(() => ticTacToeBridge());
    const read = async (name: string) =>
      JSON.parse(await executor.execute(name, "{}")).message as string;
    expect(await read("get_tic_tac_toe_introduction")).toBe(TIC_TAC_TOE_INTRODUCTION);
    expect(await read("get_tic_tac_toe_guide")).toBe(TIC_TAC_TOE_GUIDE);
    expect(await read("get_tic_tac_toe_dashboard")).toBe(TIC_TAC_TOE_DASHBOARD);
  });

  it("reports blocked Tic-Tac-Toe states in get_tic_tac_toe_state", async () => {
    const executor = createTicTacToeToolExecutor(() =>
      ticTacToeBridge({ awaitingStartChoice: true, paused: true }),
    );
    const result = JSON.parse(await executor.execute("get_tic_tac_toe_state", "{}"));
    expect(result.awaitingStartChoice).toBe(true);
    expect(result.paused).toBe(true);
    expect(result.message).toContain("saved round is waiting");
  });

  it("pages the Intercept transcript over revealed entries only", () => {
    const entries = Array.from({ length: 7 }, (_, index) => ({
      kind: index === 2 ? ("choice" as const) : ("passage" as const),
      text: `entry ${index + 1}`,
    }));
    const first = transcriptPageText(entries, 1, 5);
    expect(first).toContain("page 1 of 2");
    expect(first).toContain("entry 1 to 5 of 7");
    expect(first).toContain("You chose entry 3.");
    expect(first).toContain("Say next transcript page to hear more.");
    const second = transcriptPageText(entries, 2, 5);
    expect(second).toContain("page 2 of 2");
    expect(second).toContain("entry 6 to 7 of 7");
    expect(second).not.toContain("Say next transcript page");
    expect(transcriptPageText([], 1, 5)).toBe("The story transcript is empty.");
  });
});
