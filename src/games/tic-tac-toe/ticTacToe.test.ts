import { describe, expect, it } from "vite-plus/test";
import {
  applyTicTacToeMove,
  availableMoves,
  chooseBestMove,
  chooseComputerMove,
  createTicTacToeState,
  findWinningLine,
  parseTicTacToePosition,
  WINNING_LINES,
  type TicTacToeCell,
} from "./ticTacToe";

function finishComputerMatch(
  difficulty: "easy" | "medium" | "hard",
  playerMark: "X" | "O",
  firstTurn: "player" | "opponent",
  playerPolicy: "first" | "optimal",
) {
  const state = createTicTacToeState(difficulty, undefined, {
    opponent: "computer",
    playerMark,
    firstTurn,
  });
  while (state.status === "playing") {
    const computerMark = playerMark === "X" ? "O" : "X";
    const index =
      state.turn === playerMark
        ? playerPolicy === "optimal"
          ? chooseBestMove(state.board, playerMark)
          : availableMoves(state.board)[0]
        : chooseComputerMove(state, () => 0, computerMark);
    expect(index).not.toBeNull();
    expect(applyTicTacToeMove(state, index!).ok).toBe(true);
  }
  return state;
}

describe("Tic-Tac-Toe rules", () => {
  it("recognizes all eight winning lines", () => {
    for (const line of WINNING_LINES) {
      const board = Array<TicTacToeCell>(9).fill(null);
      for (const index of line) board[index] = "X";
      expect(findWinningLine(board)).toEqual([...line]);
    }
  });

  it("rejects occupied cells and moves after a win", () => {
    const state = createTicTacToeState("easy", undefined, { opponent: "friend" });
    expect(applyTicTacToeMove(state, 0).ok).toBe(true);
    expect(applyTicTacToeMove(state, 0).ok).toBe(false);
    for (const index of [3, 1, 4, 2]) expect(applyTicTacToeMove(state, index).ok).toBe(true);
    expect(state.status).toBe("won");
    expect(state.winner).toBe("X");
    expect(applyTicTacToeMove(state, 8).ok).toBe(false);
  });

  it("detects a full-board draw", () => {
    const state = createTicTacToeState("easy", undefined, { opponent: "friend" });
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) applyTicTacToeMove(state, index);
    expect(state.status).toBe("draw");
    expect(state.winner).toBeNull();
  });

  it("supports O as the player and a computer-first opening", () => {
    const state = createTicTacToeState("hard", undefined, {
      playerMark: "O",
      firstTurn: "opponent",
    });
    expect(state.turn).toBe("X");
    const move = chooseComputerMove(state, () => 0, "X");
    expect(move).not.toBeNull();
    expect(state.board[move!]).toBeNull();
  });

  it("chooses legal winning moves for either mark", () => {
    expect(chooseBestMove(["X", "X", null, "O", null, null, null, null, "O"], "X")).toBe(2);
    expect(chooseBestMove(["O", "O", null, "X", null, null, null, null, "X"], "O")).toBe(2);
  });

  it("parses spoken cell names and positions one through nine", () => {
    expect(parseTicTacToePosition("top left")).toBe(0);
    expect(parseTicTacToePosition("center")).toBe(4);
    expect(parseTicTacToePosition("position 9")).toBe(8);
  });

  it("completes twelve matches across every opponent, difficulty, symbol, first turn, and outcome", () => {
    const completed = [];

    for (const line of WINNING_LINES) {
      const state = createTicTacToeState("easy", undefined, { opponent: "friend" });
      const replies = availableMoves(state.board)
        .filter((index) => !line.includes(index))
        .slice(0, 2);
      for (const index of [line[0], replies[0]!, line[1], replies[1]!, line[2]])
        expect(applyTicTacToeMove(state, index).ok).toBe(true);
      expect(state.status).toBe("won");
      expect(state.winner).toBe("X");
      expect(state.winningLine).toEqual([...line]);
      completed.push(state);
    }

    const friendDraw = createTicTacToeState("medium", undefined, {
      opponent: "friend",
      playerMark: "O",
      firstTurn: "player",
    });
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8])
      expect(applyTicTacToeMove(friendDraw, index).ok).toBe(true);
    expect(friendDraw.status).toBe("draw");
    completed.push(friendDraw);

    const easyComputerWin = finishComputerMatch("easy", "X", "opponent", "first");
    expect(easyComputerWin.winner).toBe("O");
    completed.push(easyComputerWin);

    const mediumDraw = finishComputerMatch("medium", "X", "player", "first");
    expect(mediumDraw.status).toBe("draw");
    completed.push(mediumDraw);

    const hardComputerFirstDraw = finishComputerMatch("hard", "O", "opponent", "optimal");
    expect(hardComputerFirstDraw.status).toBe("draw");
    completed.push(hardComputerFirstDraw);

    expect(completed).toHaveLength(12);
    expect(completed.every((state) => state.status !== "playing")).toBe(true);
  });
});
