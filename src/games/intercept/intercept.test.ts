import { describe, expect, it } from "vite-plus/test";
import { InterceptGame, matchInterceptChoice } from "./intercept";
import { createInterceptToolExecutor, type InterceptToolBridge } from "./interceptTools";

function bridgeFor(game: InterceptGame): InterceptToolBridge {
  return {
    get state() {
      return game.state;
    },
    get awaitingStartChoice() {
      return game.awaitingStartChoice;
    },
    get canUndo() {
      return game.canUndo;
    },
    choose: (id) => game.choose(id),
    undo: () => game.undo(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    newGame: () => game.newGame(),
    repeat: () => game.currentNarration(),
    recap: () => game.recap(),
    choices: () => game.choiceList(),
    transcriptPage: (page, pageSize) => game.transcriptPage(page, pageSize),
  };
}

function completeStory(policy: (length: number, step: number) => number) {
  const game = new InterceptGame(null);
  let steps = 0;
  while (game.state.status !== "finished" && steps < 80) {
    const index = policy(game.state.choices.length, steps);
    const choice = game.state.choices[index];
    expect(choice).toBeDefined();
    expect(game.choose(choice!.id).ok).toBe(true);
    steps += 1;
  }
  expect(game.state.status).toBe("finished");
  expect(game.state.choices).toEqual([]);
  expect(game.state.transcript.some((entry) => entry.kind === "choice")).toBe(true);
  return game;
}

describe("The Intercept story", () => {
  it("completes distinct first, last, and alternating-choice playthroughs", () => {
    const games = [
      completeStory(() => 0),
      completeStory((length) => length - 1),
      completeStory((length, step) => (step % 2 === 0 ? 0 : length - 1)),
    ];
    expect(games).toHaveLength(3);
  });

  it("rejects stale and invalid choices without changing the story", () => {
    const game = new InterceptGame(null);
    const initialRevision = game.state.revision;
    const invalid = game.choose("not-a-current-choice");
    expect(invalid.ok).toBe(false);
    expect(game.state.revision).toBe(initialRevision);

    const oldChoice = game.state.choices[0]!;
    expect(game.choose(oldChoice.id).ok).toBe(true);
    const currentRevision = game.state.revision;
    expect(game.choose(oldChoice.id).ok).toBe(false);
    expect(game.state.revision).toBe(currentRevision);
  });

  it("parses only unambiguous numbered or exact spoken choices", () => {
    const game = new InterceptGame(null);
    expect(matchInterceptChoice("choice one", game.state.choices)?.number).toBe(1);
    expect(matchInterceptChoice(game.state.choices[0]!.text, game.state.choices)?.number).toBe(1);
    expect(matchInterceptChoice("something ambiguous", game.state.choices)).toBeNull();
    expect(matchInterceptChoice("choice 99", game.state.choices)).toBeNull();
  });

  it("cancels stale suggestions and never applies a confirmation twice", async () => {
    const game = new InterceptGame(null);
    const bridge = bridgeFor(game);
    const executor = createInterceptToolExecutor(() => bridge);
    const proposed = JSON.parse(await executor.execute("suggest_story_option", "{}"));
    expect(proposed.status).toBe("confirmation_required");

    expect(game.choose(game.state.choices.at(-1)!.id).ok).toBe(true);
    const revision = game.state.revision;
    expect(JSON.parse(await executor.execute("confirm_action", "{}")).status).toBe("stale");
    expect(game.state.revision).toBe(revision);
    expect(JSON.parse(await executor.execute("confirm_action", "{}")).status).toBe(
      "nothing_pending",
    );
  });

  it("supports pause, resume, undo, and a clean restart", () => {
    const game = new InterceptGame(null);
    const opening = game.state.passage.join(" ");
    expect(game.pause().ok).toBe(true);
    expect(game.choose(game.state.choices[0]!.id).ok).toBe(false);
    expect(game.resume().ok).toBe(true);
    expect(game.choose(game.state.choices[0]!.id).ok).toBe(true);
    expect(game.undo().ok).toBe(true);
    expect(game.state.passage.join(" ")).toBe(opening);
    expect(game.newGame().ok).toBe(true);
    expect(game.state.transcript.some((entry) => entry.kind === "choice")).toBe(false);
  });
});
