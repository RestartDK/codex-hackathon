# Manual audio and accessibility test script

Target environment: Windows, current desktop Chrome, NVDA, headphones, and then laptop speakers. Record browser, NVDA, model, date, latency, failures, and tester observations.

## Keyboard and startup

- Open the root URL. Confirm there is no login or landing-page barrier.
- Press Tab. Focus should start on “Start voice companion” and remain clearly visible.
- Activate it with Enter, grant microphone permission using the keyboard, and verify the connected status and captions.
- Deny permission once. Confirm the board and typed-command fallback remain playable and the error is understandable.

## Blind-play game flow

- Play at least ten player moves without viewing the screen.
- Verify every committed player and computer move names color, piece, origin, destination, capture/check when applicable, and whose turn follows.
- Ask for status, both sides’ piece locations, occupied and empty squares, legal moves, material, and recent history.
- Try an illegal move and confirm the position stays unchanged.
- Request an ambiguous move and verify the companion asks for an origin rather than guessing.
- Correct a proposal before confirming it. Confirm that silence and unrelated speech do not commit it.
- Request a hint and “choose a move for me.” Verify that each returns one legal move and never starts continuous autoplay.

## Chess cases

Use prepared positions or typed controls to verify:

- Castling is rejected through check.
- En passant announces the capture accurately.
- Promotion asks for queen, rook, bishop, or knight.
- Checkmate, stalemate, repetition, fifty-move draw, and insufficient-material draw have correct results.
- Playing as Black causes the computer to move first and “my” still means Black.
- Undo removes the player turn and computer reply where appropriate.
- Resign and new game require confirmation.

## Screen reader and low vision

- Enable screen-reader narration mode. Confirm companion audio is muted and important updates occur once through the live region.
- Traverse the board with the keyboard. Every square must announce coordinate and occupant; arrow navigation and Enter/Space activation must work.
- Test all controls at 200% browser zoom without hidden or overlapping essential content.
- Check visible focus, contrast, reduced-motion behavior, captions, and operation without sound.
- Close each dialog with keyboard controls and confirm focus returns predictably.

## The Intercept cases

- Start a new story and verify the opening scene and every visible option are spoken once in the displayed order.
- Choose by number, ordinal, exact choice text, button, and typed command. Explicit choices must not ask for confirmation.
- Ask the companion to choose. Confirm that it proposes a visible option and waits for approval.
- Interrupt narration with a choice, then verify no passage from the previous revision is spoken afterward.
- Test repeat, recap, pause/resume, one-step undo, reload/resume, restart confirmation, and a complete ending without viewing the screen.
- Confirm the companion never announces internal variables, unseen choices, or future consequences.

## Tic-Tac-Toe cases

- Complete one win, loss, and draw without viewing the screen, using natural square names and numbers one through nine.
- Verify every player and computer mark is announced with its position and followed by the correct turn or result.
- Ask for the board, one square, available squares, history, score, and whose turn; compare every answer with the visible board.
- Confirm a directly ordered square plays immediately, while “suggest a move” waits for confirmation.
- Verify arrow-key focus wraps around the semantic grid and Enter or Space selects an empty square.
- Change difficulty during an unfinished round and confirm that clearing the board requires approval.
- Test full-turn undo before and after the computer reply, new round with retained score, reset match, corrupt-save recovery, and reload/resume.
- On Hard, try forks and traps and confirm the local computer always responds once without freezing or using the voice API.

## Failure and recovery

- End voice and verify the microphone indicator disappears.
- Disconnect the network during a game. Confirm the chess state is preserved and typed controls continue working.
- Reload after several moves. Confirm move history and repetition-relevant state are reconstructed.
- Disconnect during computer calculation and confirm no duplicate or late move is applied.
- Interrupt a long answer, request repetition, mute/unmute with keyboard, and compare headphones with speakers for echo-triggered commands.

## Exit criteria

Do not label the experience validated until blind or low-vision participants complete the core game flow and their issues are triaged. Automated tests and sighted screen-reader checks are supporting evidence, not substitutes for user testing.
