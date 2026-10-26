import {
  availableMoves,
  chooseBestMove,
  describeTicTacToeBoard,
  parseTicTacToePosition,
  POSITION_NAMES,
  TIC_TAC_TOE_DASHBOARD,
  TIC_TAC_TOE_GUIDE,
  ticTacToeIntroduction,
  type TicTacToeActionResult,
  type TicTacToeDifficulty,
  type TicTacToeSetup,
  type TicTacToeState,
} from "./ticTacToe";

export interface TicTacToeToolBridge {
  state: TicTacToeState;
  awaitingStartChoice: boolean;
  paused: boolean;
  playHumanMove: (index: number) => TicTacToeActionResult;
  undo: () => TicTacToeActionResult;
  newRound: () => TicTacToeActionResult;
  resetMatch: () => TicTacToeActionResult;
  pause: () => TicTacToeActionResult;
  resume: () => TicTacToeActionResult;
  changeDifficulty: (difficulty: TicTacToeDifficulty) => TicTacToeActionResult;
  phase?: "loading" | "setup" | "game";
  setup?: Omit<TicTacToeSetup, "playerMark"> & {
    playerMark: TicTacToeSetup["playerMark"] | "random";
  };
  configureSetup?: (
    patch: Partial<
      Omit<TicTacToeSetup, "playerMark"> & {
        playerMark: TicTacToeSetup["playerMark"] | "random";
      }
    >,
  ) => TicTacToeActionResult;
  setupBack?: () => TicTacToeActionResult;
  startConfiguredGame?: () => TicTacToeActionResult;
  cancelSetup?: () => TicTacToeActionResult;
  controlSetup?: (action: "repeat" | "explain" | "defaults") => TicTacToeActionResult;
}

type PendingAction = {
  id: string;
  description: string;
  revision: number;
  kind: "move" | "new-round" | "reset-match" | "difficulty";
  index?: number;
  difficulty?: TicTacToeDifficulty;
};

const json = (value: unknown) => JSON.stringify(value);

export function createTicTacToeToolExecutor(
  getBridge: () => TicTacToeToolBridge,
  onPendingChange: () => void = () => undefined,
) {
  let pending: PendingAction | null = null;
  let nextId = 1;

  function invalidatePending() {
    pending = null;
    onPendingChange();
  }

  function propose(action: Omit<PendingAction, "id">) {
    pending = { ...action, id: `tic-tac-toe-action-${nextId++}` };
    onPendingChange();
    return json({
      status: "confirmation_required",
      actionId: pending.id,
      description: pending.description,
    });
  }

  function resolvePosition(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9)
      return value - 1;
    return parseTicTacToePosition(String(value ?? ""));
  }

  async function execute(name: string, rawArguments: string): Promise<string> {
    const bridge = getBridge();
    let args: Record<string, unknown> = {};
    try {
      args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
    } catch {
      return json({ status: "error", message: "The tool arguments were not valid JSON." });
    }

    if (name === "get_tic_tac_toe_introduction")
      return json({
        status: "ok",
        message:
          bridge.phase === "setup"
            ? "Tic-Tac-Toe is a three by three strategy game. Make three of your marks in a row, column, or diagonal. Your mark, opponent, and first turn are selected during setup."
            : ticTacToeIntroduction(bridge.state),
      });
    if (name === "get_tic_tac_toe_guide") return json({ status: "ok", message: TIC_TAC_TOE_GUIDE });
    if (name === "get_tic_tac_toe_dashboard")
      return json({ status: "ok", message: TIC_TAC_TOE_DASHBOARD });

    if (name === "get_tic_tac_toe_state") {
      if (bridge.phase === "setup")
        return json({
          status: "ok",
          phase: "setup",
          setup: bridge.setup,
          message:
            "Tic-Tac-Toe setup is open. Choose an opponent, difficulty, mark, and who moves first.",
        });
      return json({
        status: "ok",
        message: `${bridge.awaitingStartChoice ? "A saved round is waiting; resume it or start a new round. " : ""}${bridge.paused ? "The game is paused. " : ""}${describeTicTacToeBoard(bridge.state)}`,
        turn:
          bridge.state.turn === bridge.state.playerMark
            ? "player"
            : bridge.state.opponent === "computer"
              ? "computer"
              : "player two",
        gameStatus: bridge.state.status,
        paused: bridge.paused,
        awaitingStartChoice: bridge.awaitingStartChoice,
        score: bridge.state.score,
        difficulty: bridge.state.difficulty,
        revision: bridge.state.revision,
      });
    }

    if (name === "configure_tic_tac_toe_setup") {
      if (bridge.phase !== "setup" || !bridge.configureSetup)
        return json({ status: "error", message: "Tic-Tac-Toe setup is not open." });
      const patch: Partial<
        Omit<TicTacToeSetup, "playerMark"> & {
          playerMark: TicTacToeSetup["playerMark"] | "random";
        }
      > = {};
      if (args.opponent === "computer" || args.opponent === "friend")
        patch.opponent = args.opponent;
      if (args.difficulty === "easy" || args.difficulty === "medium" || args.difficulty === "hard")
        patch.difficulty = args.difficulty;
      if (args.playerMark === "X" || args.playerMark === "O" || args.playerMark === "random")
        patch.playerMark = args.playerMark;
      if (args.firstTurn === "player" || args.firstTurn === "opponent")
        patch.firstTurn = args.firstTurn;
      if (!Object.keys(patch).length)
        return json({ status: "error", message: "Name the setup option you want to change." });
      return json(bridge.configureSetup(patch));
    }

    if (name === "control_tic_tac_toe_setup") {
      if (bridge.phase !== "setup")
        return json({ status: "error", message: "Tic-Tac-Toe setup is not open." });
      const action = String(args.action ?? "");
      if (action === "back" && bridge.setupBack) return json(bridge.setupBack());
      if (action === "start" && bridge.startConfiguredGame)
        return json(bridge.startConfiguredGame());
      if (action === "cancel" && bridge.cancelSetup) return json(bridge.cancelSetup());
      if (
        (action === "repeat" || action === "explain" || action === "defaults") &&
        bridge.controlSetup
      )
        return json(bridge.controlSetup(action));
      return json({ status: "error", message: "Unknown setup control." });
    }

    if (name === "inspect_tic_tac_toe_cell") {
      const index = resolvePosition(args.position);
      if (index === null)
        return json({
          status: "clarification_required",
          message: "Name a square such as top left, center, or square nine.",
        });
      const mark = bridge.state.board[index];
      return json({
        status: "ok",
        position: POSITION_NAMES[index],
        mark,
        message: `${POSITION_NAMES[index]} is ${mark === null ? "empty" : mark === bridge.state.playerMark ? `your ${mark}` : bridge.state.opponent === "computer" ? `computer ${mark}` : `player two ${mark}`}.`,
      });
    }

    if (name === "get_available_tic_tac_toe_moves") {
      const moves = availableMoves(bridge.state.board);
      const message = moves.length
        ? `Available squares: ${moves.map((index) => POSITION_NAMES[index]).join(", ")}.`
        : "There are no available squares.";
      return json({
        status: "ok",
        moves: moves.map((index) => ({ number: index + 1, position: POSITION_NAMES[index] })),
        message,
      });
    }

    if (name === "get_tic_tac_toe_history") {
      const history = bridge.state.moves.map(
        (move, index) =>
          `${index + 1}. ${move.mark === bridge.state.playerMark ? `You played ${move.mark}` : bridge.state.opponent === "computer" ? `Computer played ${move.mark}` : `Player two played ${move.mark}`} in ${POSITION_NAMES[move.index]}`,
      );
      return json({
        status: "ok",
        history,
        message: history.length ? history.join(". ") + "." : "No moves have been played.",
      });
    }

    if (name === "place_tic_tac_toe_mark") {
      const index = resolvePosition(args.position);
      if (index === null)
        return json({
          status: "clarification_required",
          message: "Choose a square such as top left, center, or square nine.",
        });
      invalidatePending();
      const result = bridge.playHumanMove(index);
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "suggest_tic_tac_toe_move") {
      if (bridge.awaitingStartChoice)
        return json({ status: "error", message: "Choose Resume Saved Round or New Round first." });
      if (bridge.paused)
        return json({ status: "error", message: "Resume the round before asking for a move." });
      if (bridge.state.status !== "playing" || bridge.state.turn !== bridge.state.playerMark)
        return json({
          status: "error",
          message:
            bridge.state.status === "playing"
              ? "Wait for the computer to move."
              : "This round is over.",
        });
      const index = chooseBestMove(bridge.state.board, bridge.state.playerMark);
      if (index === null) return json({ status: "error", message: "There is no legal move." });
      return propose({
        kind: "move",
        index,
        revision: bridge.state.revision,
        description: `Place your ${bridge.state.playerMark} in ${POSITION_NAMES[index]}`,
      });
    }

    if (name === "undo_tic_tac_toe_turn") {
      invalidatePending();
      const result = bridge.undo();
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "set_tic_tac_toe_difficulty") {
      const difficulty = String(args.difficulty ?? "") as TicTacToeDifficulty;
      if (!["easy", "medium", "hard"].includes(difficulty))
        return json({ status: "error", message: "Choose Easy, Medium, or Hard difficulty." });
      if (difficulty === bridge.state.difficulty)
        return json({
          status: "completed",
          message: `${difficulty} difficulty is already selected.`,
        });
      if (
        bridge.state.opponent === "computer" &&
        bridge.state.status === "playing" &&
        bridge.state.turn !== bridge.state.playerMark
      )
        return json({
          status: "wait",
          message: "The computer is moving now. Change difficulty when your turn begins.",
        });
      if (bridge.state.moves.length > 0 && bridge.state.status === "playing")
        return propose({
          kind: "difficulty",
          difficulty,
          revision: bridge.state.revision,
          description: `Change to ${difficulty} difficulty and start a new round`,
        });
      return json(bridge.changeDifficulty(difficulty));
    }

    if (name === "propose_tic_tac_toe_control") {
      const action = String(args.action ?? "");
      if (action === "pause") return json(bridge.pause());
      if (action === "resume") return json(bridge.resume());
      if (action === "new_round") {
        if (
          bridge.state.opponent === "computer" &&
          bridge.state.status === "playing" &&
          bridge.state.turn !== bridge.state.playerMark
        )
          return json({
            status: "wait",
            message: "The computer is moving now. Start a new round when your turn begins.",
          });
        if (bridge.state.status === "playing" && bridge.state.moves.length > 0)
          return propose({
            kind: "new-round",
            revision: bridge.state.revision,
            description: "Start a new round and clear the current board",
          });
        return json(bridge.newRound());
      }
      if (action === "reset_match") {
        if (
          bridge.state.opponent === "computer" &&
          bridge.state.status === "playing" &&
          bridge.state.turn !== bridge.state.playerMark
        )
          return json({
            status: "wait",
            message: "The computer is moving now. Reset the match when your turn begins.",
          });
        const hasAnything =
          bridge.state.moves.length > 0 ||
          Object.values(bridge.state.score).some((value) => value > 0);
        if (hasAnything)
          return propose({
            kind: "reset-match",
            revision: bridge.state.revision,
            description: "Reset the board and clear the scoreboard",
          });
        return json(bridge.resetMatch());
      }
      return json({ status: "error", message: "Unknown Tic-Tac-Toe control." });
    }

    if (name === "confirm_tic_tac_toe_action") {
      if (!pending)
        return json({
          status: "nothing_pending",
          message: "There is no Tic-Tac-Toe action waiting for confirmation.",
        });
      const action = pending;
      invalidatePending();
      if (action.revision !== bridge.state.revision)
        return json({
          status: "stale",
          message: "The board changed, so that suggestion was cancelled.",
        });
      const result =
        action.kind === "move" && action.index !== undefined
          ? bridge.playHumanMove(action.index)
          : action.kind === "new-round"
            ? bridge.newRound()
            : action.kind === "difficulty" && action.difficulty
              ? bridge.changeDifficulty(action.difficulty)
              : bridge.resetMatch();
      return json({ status: result.ok ? "completed" : "error", message: result.message });
    }

    if (name === "cancel_tic_tac_toe_action") {
      const hadPending = Boolean(pending);
      invalidatePending();
      return json({
        status: hadPending ? "cancelled" : "nothing_pending",
        message: hadPending ? "Action cancelled." : "There is no action waiting for confirmation.",
      });
    }

    return json({ status: "error", message: `Unknown Tic-Tac-Toe tool: ${name}` });
  }

  return {
    execute,
    invalidatePending,
    getPending: () => (pending ? { id: pending.id, description: pending.description } : null),
  };
}
