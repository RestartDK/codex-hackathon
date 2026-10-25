import { useEffect, useRef, useState } from "react";
import { InterceptGame } from "./intercept";

export function useInterceptGame() {
  const gameRef = useRef<InterceptGame | null>(null);
  if (!gameRef.current) gameRef.current = new InterceptGame();
  const game = gameRef.current;
  const [, render] = useState(0);

  useEffect(() => game.subscribe(() => render((value) => value + 1)), [game]);
  useEffect(() => () => game.dispose(), [game]);

  return {
    state: game.state,
    awaitingStartChoice: game.awaitingStartChoice,
    canUndo: game.canUndo,
    choose: (choiceId: string) => game.choose(choiceId),
    chooseNumber: (number: number) => game.chooseNumber(number),
    undo: () => game.undo(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    newGame: () => game.newGame(),
    repeat: () => game.currentNarration(),
    recap: () => game.recap(),
    choices: () => game.choiceList(),
    transcriptPage: (page: number, pageSize: number) => game.transcriptPage(page, pageSize),
  };
}

