import { describe, expect, it } from "vite-plus/test";
import {
  chessSetupSelection,
  defaultChessSetup,
  describeChessSetup,
  reduceChessSetup,
  type ChessSetupCommand,
  type ChessSetupState,
} from "./chessSetup";

function run(state: ChessSetupState, commands: ChessSetupCommand[]): ChessSetupState {
  return commands.reduce((current, command) => reduceChessSetup(current, command).state, state);
}

describe("chess setup draft", () => {
  it("starts at the opponent step with the default draft", () => {
    const state = defaultChessSetup();
    expect(state.step).toBe("opponent");
    expect(state.ready).toBe(false);
    expect(chessSetupSelection(state)).toEqual({
      gameMode: "computer",
      difficulty: "beginner",
      playerColor: "w",
      timerMinutes: null,
      explainRules: false,
    });
  });

  it("advances to the step after the choice that was made", () => {
    const afterDifficulty = run(defaultChessSetup(), [
      { kind: "choose-difficulty", difficulty: "club" },
    ]);
    expect(afterDifficulty.step).toBe("color");
    expect(afterDifficulty.draft.difficulty).toBe("club");

    expect(describeChessSetup(afterDifficulty)).toContain("Choose your pieces");

    const afterColor = run(afterDifficulty, [{ kind: "choose-color", color: "b" }]);
    expect(afterColor.step).toBe("timer");
    expect(afterColor.draft.color).toBe("b");
    expect(describeChessSetup(afterColor)).toContain("Current timer: off");
  });

  it("completes the wizard and starts with the chosen draft", () => {
    const ready = run(defaultChessSetup(), [
      { kind: "choose-difficulty", difficulty: "casual" },
      { kind: "choose-color", color: "random" },
      { kind: "choose-timer", minutes: null },
      { kind: "choose-rules", explainRules: true },
    ]);
    expect(ready.ready).toBe(true);
    const outcome = reduceChessSetup(ready, { kind: "start" });
    expect(outcome.effect).toBe("start");
    expect(chessSetupSelection(outcome.state)).toMatchObject({
      difficulty: "casual",
      explainRules: true,
      timerMinutes: null,
    });
  });

  it("resets every choice to the real defaults and starts for the defaults command", () => {
    const customised = run(defaultChessSetup(), [
      { kind: "choose-difficulty", difficulty: "club" },
      { kind: "choose-color", color: "b" },
      { kind: "choose-rules", explainRules: true },
    ]);
    const outcome = reduceChessSetup(customised, { kind: "defaults" });
    expect(outcome.effect).toBe("start");
    expect(outcome.state.draft).toEqual(defaultChessSetup().draft);
  });

  it("steps back through the wizard and cancels only from the first step", () => {
    const atColor = run(defaultChessSetup(), [
      { kind: "choose-difficulty", difficulty: "casual" },
    ]);
    const backToDifficulty = reduceChessSetup(atColor, { kind: "back" });
    expect(backToDifficulty.state.step).toBe("difficulty");
    expect(backToDifficulty.effect).toBe("none");
    expect(reduceChessSetup(defaultChessSetup(), { kind: "back" }).effect).toBe("cancel");
    expect(reduceChessSetup(atColor, { kind: "cancel" }).effect).toBe("cancel");
  });

  it("keeps a ready setup editable without losing the chosen draft", () => {
    const ready = run(defaultChessSetup(), [
      { kind: "choose-difficulty", difficulty: "club" },
      { kind: "choose-color", color: "b" },
      { kind: "choose-timer", minutes: null },
      { kind: "choose-rules", explainRules: false },
    ]);
    expect(ready.ready).toBe(true);
    const edited = reduceChessSetup(ready, { kind: "choose-difficulty", difficulty: "beginner" });
    expect(edited.state.draft.difficulty).toBe("beginner");
    expect(edited.state.draft.color).toBe("b");
  });
});
