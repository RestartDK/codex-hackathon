export type TicTacToeMark = 'X' | 'O';
export type TicTacToeCell = TicTacToeMark | null;
export type TicTacToeDifficulty = 'easy' | 'medium' | 'hard';
export type TicTacToeStatus = 'playing' | 'won' | 'draw';

export interface TicTacToeMove {
  index: number;
  mark: TicTacToeMark;
}

export interface TicTacToeScore {
  wins: number;
  losses: number;
  draws: number;
}

export interface TicTacToeState {
  version: 1;
  board: TicTacToeCell[];
  turn: TicTacToeMark;
  status: TicTacToeStatus;
  winner: TicTacToeMark | null;
  winningLine: number[] | null;
  moves: TicTacToeMove[];
  difficulty: TicTacToeDifficulty;
  score: TicTacToeScore;
  revision: number;
}

export interface TicTacToeActionResult {
  ok: boolean;
  message: string;
}

export const TIC_TAC_TOE_SAVE_KEY = 'voice-game-companion-tic-tac-toe-save';
export const POSITION_NAMES = [
  'top left', 'top middle', 'top right',
  'middle left', 'center', 'middle right',
  'bottom left', 'bottom middle', 'bottom right',
] as const;

export const WINNING_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function createTicTacToeState(
  difficulty: TicTacToeDifficulty = 'medium',
  score: TicTacToeScore = { wins: 0, losses: 0, draws: 0 },
): TicTacToeState {
  return {
    version: 1,
    board: Array<TicTacToeCell>(9).fill(null),
    turn: 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
    moves: [],
    difficulty,
    score: { ...score },
    revision: 0,
  };
}

export function findWinningLine(board: readonly TicTacToeCell[]): number[] | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [...line];
  }
  return null;
}

export function availableMoves(board: readonly TicTacToeCell[]): number[] {
  return board.flatMap((cell, index) => cell === null ? [index] : []);
}

export function applyTicTacToeMove(state: TicTacToeState, index: number): TicTacToeActionResult {
  if (state.status !== 'playing') return { ok: false, message: 'This round is over. Start a new round to play again.' };
  if (!Number.isInteger(index) || index < 0 || index > 8) return { ok: false, message: 'Choose a square from one to nine.' };
  if (state.board[index] !== null) return { ok: false, message: `${POSITION_NAMES[index]} is already occupied by ${state.board[index]}.` };

  const mark = state.turn;
  state.board[index] = mark;
  state.moves.push({ index, mark });
  state.revision += 1;
  const line = findWinningLine(state.board);
  if (line) {
    state.status = 'won';
    state.winner = mark;
    state.winningLine = line;
    if (mark === 'X') state.score.wins += 1;
    else state.score.losses += 1;
    return { ok: true, message: `${mark === 'X' ? 'You placed X' : 'The computer placed O'} in ${POSITION_NAMES[index]}. ${mark === 'X' ? 'You win!' : 'The computer wins.'}` };
  }
  if (state.board.every(Boolean)) {
    state.status = 'draw';
    state.score.draws += 1;
    return { ok: true, message: `${mark === 'X' ? 'You placed X' : 'The computer placed O'} in ${POSITION_NAMES[index]}. The round is a draw.` };
  }
  state.turn = mark === 'X' ? 'O' : 'X';
  return {
    ok: true,
    message: `${mark === 'X' ? 'You placed X' : 'The computer placed O'} in ${POSITION_NAMES[index]}. ${state.turn === 'X' ? 'Your turn.' : 'Computer thinking.'}`,
  };
}

function terminalScore(board: readonly TicTacToeCell[], depth: number): number | null {
  const line = findWinningLine(board);
  if (line) return board[line[0]] === 'O' ? 10 - depth : depth - 10;
  return availableMoves(board).length === 0 ? 0 : null;
}

function minimax(board: TicTacToeCell[], turn: TicTacToeMark, depth: number, alpha: number, beta: number): number {
  const terminal = terminalScore(board, depth);
  if (terminal !== null) return terminal;
  if (turn === 'O') {
    let best = -Infinity;
    for (const index of availableMoves(board)) {
      board[index] = 'O';
      best = Math.max(best, minimax(board, 'X', depth + 1, alpha, beta));
      board[index] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const index of availableMoves(board)) {
    board[index] = 'X';
    best = Math.min(best, minimax(board, 'O', depth + 1, alpha, beta));
    board[index] = null;
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function immediateMove(board: readonly TicTacToeCell[], mark: TicTacToeMark): number | null {
  for (const index of availableMoves(board)) {
    const probe = [...board];
    probe[index] = mark;
    if (findWinningLine(probe)) return index;
  }
  return null;
}

export function chooseBestMove(board: readonly TicTacToeCell[], mark: TicTacToeMark): number | null {
  const moves = availableMoves(board);
  if (!moves.length) return null;
  let bestMove = moves[0];
  let bestScore = mark === 'O' ? -Infinity : Infinity;
  for (const index of moves) {
    const probe = [...board];
    probe[index] = mark;
    const score = minimax(probe, mark === 'O' ? 'X' : 'O', 0, -Infinity, Infinity);
    if ((mark === 'O' && score > bestScore) || (mark === 'X' && score < bestScore)) {
      bestScore = score;
      bestMove = index;
    }
  }
  return bestMove;
}

export function chooseComputerMove(
  state: Pick<TicTacToeState, 'board' | 'difficulty'>,
  random: () => number = Math.random,
): number | null {
  const moves = availableMoves(state.board);
  if (!moves.length) return null;
  if (state.difficulty === 'easy') return moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))];
  if (state.difficulty === 'medium') {
    const winning = immediateMove(state.board, 'O');
    if (winning !== null) return winning;
    const block = immediateMove(state.board, 'X');
    if (block !== null) return block;
    return moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))];
  }
  return chooseBestMove(state.board, 'O');
}

export function undoTicTacToeTurn(state: TicTacToeState): TicTacToeActionResult {
  if (!state.moves.length) return { ok: false, message: 'There is no turn to undo.' };
  if (state.status === 'won') {
    if (state.winner === 'X') state.score.wins = Math.max(0, state.score.wins - 1);
    else state.score.losses = Math.max(0, state.score.losses - 1);
  } else if (state.status === 'draw') state.score.draws = Math.max(0, state.score.draws - 1);

  const lastHuman = state.moves.map((move) => move.mark).lastIndexOf('X');
  const retained = lastHuman < 0 ? [] : state.moves.slice(0, lastHuman);
  state.board = Array<TicTacToeCell>(9).fill(null);
  for (const move of retained) state.board[move.index] = move.mark;
  state.moves = retained;
  state.turn = 'X';
  state.status = 'playing';
  state.winner = null;
  state.winningLine = null;
  state.revision += 1;
  return { ok: true, message: 'Your previous turn and the computer reply were undone. Your turn.' };
}

export function parseTicTacToePosition(input: string): number | null {
  const value = input.toLowerCase().replace(/[,.!?-]/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases: Array<[RegExp, number]> = [
    [/\b(?:top|upper) left\b|\brow 1 column 1\b/, 0],
    [/\b(?:top|upper) (?:middle|center|centre)\b|\brow 1 column 2\b/, 1],
    [/\b(?:top|upper) right\b|\brow 1 column 3\b/, 2],
    [/\b(?:middle|center|centre) left\b|\brow 2 column 1\b/, 3],
    [/\b(?:middle|center|centre) right\b|\brow 2 column 3\b/, 5],
    [/\b(?:bottom|lower) left\b|\brow 3 column 1\b/, 6],
    [/\b(?:bottom|lower) (?:middle|center|centre)\b|\brow 3 column 2\b/, 7],
    [/\b(?:bottom|lower) right\b|\brow 3 column 3\b/, 8],
    [/\brow 2 column 2\b|\b(?:center|centre|middle)\b/, 4],
  ];
  for (const [pattern, index] of phrases) if (pattern.test(value)) return index;
  const numbered = value.match(/\b(?:square|cell|position)?\s*(one|two|three|four|five|six|seven|eight|nine|[1-9])\b/);
  if (!numbered) return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  return (words[numbered[1]] ?? Number(numbered[1])) - 1;
}

export function describeTicTacToeBoard(state: TicTacToeState): string {
  const occupied = state.board.flatMap((cell, index) => cell ? [`${POSITION_NAMES[index]} is ${cell === 'X' ? 'your X' : 'computer O'}`] : []);
  const empty = availableMoves(state.board).map((index) => POSITION_NAMES[index]);
  const position = occupied.length ? occupied.join(', ') : 'The board is empty';
  const empties = empty.length ? ` Empty: ${empty.join(', ')}.` : '';
  const ending = state.status === 'won' ? ` ${state.winner === 'X' ? 'You won' : 'The computer won'}.` : state.status === 'draw' ? ' The round is a draw.' : ` ${state.turn === 'X' ? 'Your turn' : "Computer's turn"}.`;
  return `${position}.${empties}${ending}`;
}

export function serializeTicTacToe(state: TicTacToeState): string {
  return JSON.stringify({ version: 1, state });
}

export function deserializeTicTacToe(raw: string): TicTacToeState | null {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; state?: Partial<TicTacToeState> };
    const state = parsed.state;
    if (parsed.version !== 1 || state?.version !== 1 || !Array.isArray(state.board) || state.board.length !== 9 || !state.board.every((cell) => cell === null || cell === 'X' || cell === 'O')) return null;
    if (!Array.isArray(state.moves) || !state.moves.every((move) => Number.isInteger(move?.index) && move.index >= 0 && move.index <= 8 && (move.mark === 'X' || move.mark === 'O'))) return null;
    if (!['easy', 'medium', 'hard'].includes(String(state.difficulty)) || !state.score || ![state.score.wins, state.score.losses, state.score.draws].every((value) => Number.isInteger(value) && value >= 0)) return null;
    const replay = createTicTacToeState(state.difficulty as TicTacToeDifficulty, state.score);
    for (const move of state.moves) {
      if (replay.turn !== move.mark || !applyTicTacToeMove(replay, move.index).ok) return null;
    }
    // Replaying updates the score; restore the already persisted totals.
    replay.score = { ...state.score } as TicTacToeScore;
    replay.revision = typeof state.revision === 'number' && state.revision >= replay.moves.length ? state.revision : replay.moves.length;
    return replay;
  } catch {
    return null;
  }
}
