import { lazy, Suspense, useMemo, useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board/Board';
import GamePanel from '../components/GamePanel/GamePanel';
import PromotionDialog from '../components/PromotionDialog/PromotionDialog';
import SettingsPanel from '../components/Settings/SettingsPanel';
import PlayerPanel from '../components/PlayerPanel/PlayerPanel';
import GameEndModal from '../components/GameEndModal/GameEndModal';
import VoiceCompanion from '../components/VoiceCompanion/VoiceCompanion';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import { Button } from '../components/ui/Button';
import type { GameMode } from '../types';
import { useChessGame } from '../hooks/useChessGame';
import { useSettings } from '../hooks/useSettings';
import { isDebugEnabled, getDebugInfo, type EngineDebugInfo } from '../chess/engineDebug';
import './App.css';
import '../components/GamePanel/GamePanel.css';
import '../components/Settings/SettingsPanel.css';
import '../components/VoiceCompanion/VoiceCompanion.css';
import LudoPage from '../components/LudoGame/LudoPage';
import { gameRegistry, type GameMetadata } from '../games/registry';

const InterceptPage = lazy(() => import('../components/InterceptGame/InterceptPage'));
const TicTacToePage = lazy(() => import('../components/TicTacToeGame/TicTacToePage'));

function ChessPage() {
  const {
    settings,
    settingsOpen,
    setGameMode,
    setDifficulty,
    setPlayerColor,
    setConfirmMoves,
    setScreenReaderMode,
    setBoardOrientation,
    setBoardTheme,
    setPieceSet,
    setSoundEnabled,
    toggleSettings,
    closeSettings,
  } = useSettings();

  const {
    game,
    history,
    status,
    selectedSquare,
    legalMoves,
    pendingPromotion,
    isComputerThinking,
    gameResult,
    awaitingStartChoice,
    isPaused,
    reviewMode,
    reviewIndex,
    selectSquare,
    makeMove,
    getHint,
    promote,
    cancelPromotion,
    newGame,
    resumeGame,
    pauseGame,
    undoMove,
    resign,
    capturedPieces,
    enterReviewMode,
    exitReviewMode,
    goToMove,
    displayFen,
    stockfishStatus,
    stockfishError,
    stockfishProgress,
    retryStockfish,
    moveFeedback,
  } = useChessGame({ settings });

  const [engineDebug, setEngineDebug] = useState<Partial<EngineDebugInfo> | null>(null);
  const [requestedMode, setRequestedMode] = useState<GameMode | null>(null);
  const [manualBoardFlip, setManualBoardFlip] = useState(false);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    const interval = setInterval(() => {
      const info = getDebugInfo();
      if (info) setEngineDebug(info);
    }, 500);
    return () => clearInterval(interval);
  }, [isComputerThinking, history]);

  const captured = useMemo(() => capturedPieces(), [capturedPieces]);

  const materialAdvantage = useMemo(() => {
    const values = { q: 9, r: 5, b: 3, n: 3, p: 1 };
    let score = 0;
    for (const p of captured.white) score += values[p as keyof typeof values] || 0;
    for (const p of captured.black) score -= values[p as keyof typeof values] || 0;
    return score;
  }, [captured]);

  const canUndo = history.length > 0 && !awaitingStartChoice;
  const canResign = !awaitingStartChoice && !gameResult && !game.isGameOver() && history.length > 0;
  const presentedStatus = useMemo(() => {
    if (settings.gameMode !== 'computer' || gameResult || game.isGameOver()) return status;
    const turnColor = game.turn() === 'w' ? 'White' : 'Black';
    const owner = game.turn() === settings.playerColor ? 'Your turn' : "Computer's turn";
    const latest = game.history({ verbose: true }).at(-1);
    const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const;
    let captureNotice = '';
    if (latest?.captured) {
      const capturedColor = latest.color === 'w' ? 'b' : 'w';
      const capturedColorName = capturedColor === 'w' ? 'White' : 'Black';
      captureNotice = capturedColor === settings.playerColor
        ? `You lost your ${capturedColorName} ${pieceNames[latest.captured]}. `
        : `The computer lost its ${capturedColorName} ${pieceNames[latest.captured]}. `;
    }
    return `${captureNotice}${owner} — ${turnColor} to move${game.isCheck() ? ', in check' : ''}`;
  }, [game, gameResult, history, settings.gameMode, settings.playerColor, status]);

  const requestGameMode = (mode: GameMode) => {
    if (mode === settings.gameMode) return;
    if (history.length > 0) {
      setRequestedMode(mode);
      closeSettings();
      return;
    }
    setGameMode(mode);
  };

  // ── Display game for review mode (never mutates live game) ──
  const displayGame = useMemo(() => {
    if (!displayFen) return null;
    const g = new Chess();
    try { g.load(displayFen); } catch { return null; }
    return g;
  }, [displayFen]);

  // ── Last move & check highlighting ──
  const lastMove = useMemo(() => {
    if (reviewMode && reviewIndex >= 0 && reviewIndex < history.length) {
      const uci = history[reviewIndex];
      if (uci && uci.length >= 4) {
        return { from: uci.substring(0, 2), to: uci.substring(2, 4) };
      }
    }
    const verbose = game.history({ verbose: true });
    if (verbose.length === 0) return null;
    const last = verbose[verbose.length - 1];
    return { from: last.from, to: last.to };
  }, [game, history, reviewMode, reviewIndex]);

  function findKingSquare(src: Chess, color: 'w' | 'b'): string | null {
    const board = src.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === color) {
          return 'abcdefgh'[c] + (8 - r);
        }
      }
    }
    return null;
  }

  const kingInCheck = useMemo(() => {
    const src = displayGame ?? game;
    if (!src.isCheck()) return null;
    const turn = src.turn() as 'w' | 'b';
    const square = findKingSquare(src, turn);
    if (!square) return null;
    return { square, color: turn };
  }, [game, displayGame, history, reviewMode, reviewIndex]);

  const pieceSetClass = 'piece-set-active-' + settings.pieceSet;
  const boardThinkingClass = isComputerThinking ? ' board-computer-thinking' : '';

  return (
    <div className={'app ' + pieceSetClass}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header">
        <button className="library-link" onClick={() => { window.location.href = '/'; }}>Game library</button>
        <h1>Voice Chess Companion</h1>
        <span className="piece-set-badge" title="Active piece set">
          {settings.pieceSet}
        </span>
      </header>

      <main id="main-content" className="app-main">
        <VoiceCompanion
          game={game}
          history={history}
          playerColor={settings.playerColor}
          awaitingStartChoice={awaitingStartChoice}
          isTerminated={Boolean(gameResult)}
          isPaused={isPaused}
          makeMove={makeMove}
          getHint={getHint}
          newGame={newGame}
          resumeGame={resumeGame}
          pauseGame={pauseGame}
          undoMove={undoMove}
          resign={resign}
          confirmMoves={settings.confirmMoves}
          screenReaderMode={settings.screenReaderMode}
          onPlayerColorChange={setPlayerColor}
          onConfirmMovesChange={setConfirmMoves}
          onScreenReaderModeChange={setScreenReaderMode}
        />
        <button className="settings-toggle-btn" onClick={toggleSettings} aria-label="Open settings">
          &#9881; Settings
        </button>
        <div className="game-layout" aria-label="Chess game layout">
          <aside className="game-column game-column-left" aria-label="Player information">
            <PlayerPanel
              whiteCaptured={captured.white}
              blackCaptured={captured.black}
              gameMode={settings.gameMode}
              playerColor={settings.playerColor}
              turn={game.turn() as 'w' | 'b'}
              status={presentedStatus}
              materialAdvantage={materialAdvantage}
            />
          </aside>

          <section className={'board-section' + boardThinkingClass} aria-label="Chess board">
            <Board
              game={game}
              selectedSquare={selectedSquare}
              legalMoves={legalMoves}
              onSquareClick={selectSquare}
              boardOrientation={settings.boardOrientation}
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
              isComputerThinking={isComputerThinking}
              lastMove={lastMove}
              kingInCheck={kingInCheck}
              displayFen={displayFen}
              manualFlip={manualBoardFlip}
              playerColor={settings.playerColor}
              gameMode={settings.gameMode}
            />
          </section>

          <GamePanel
            status={presentedStatus}
            gameMode={settings.gameMode}
            difficulty={settings.difficulty}
            isComputerThinking={isComputerThinking}
            stockfishStatus={stockfishStatus}
            stockfishError={stockfishError}
            stockfishProgress={stockfishProgress}
            onRetryEngine={retryStockfish}
            history={history}
            reviewMode={reviewMode}
            reviewIndex={reviewIndex}
            moveFeedback={moveFeedback}
            onGoToMove={goToMove}
            onEnterReview={enterReviewMode}
            onExitReview={exitReviewMode}
            onNewGame={newGame}
            onUndo={undoMove}
            onResign={resign}
            isPaused={isPaused}
            canPause={!awaitingStartChoice && !gameResult}
            onPause={pauseGame}
            onResume={resumeGame}
            canUndo={canUndo}
            canResign={canResign}
            onFlipBoard={() => setManualBoardFlip((flipped) => !flipped)}
          />
        </div>
      </main>

      {pendingPromotion && (
        <PromotionDialog
          color={game.turn()}
          onPromote={promote}
          onCancel={cancelPromotion}
        />
      )}

      <GameEndModal
        result={gameResult}
        onNewGame={newGame}
        onEnterReview={enterReviewMode}
      />

      <SettingsPanel
        settings={settings}
        isOpen={settingsOpen}
        onClose={toggleSettings}
        onGameModeChange={requestGameMode}
        onDifficultyChange={setDifficulty}
        onBoardOrientationChange={setBoardOrientation}
        onBoardThemeChange={setBoardTheme}
        onPieceSetChange={setPieceSet}
        onSoundEnabledChange={setSoundEnabled}
      />
      {requestedMode && (
        <ConfirmDialog
          title="Change Game Mode"
          message="Changing game mode starts a new game and clears the current board. Continue?"
          confirmLabel="Change Mode"
          onConfirm={() => {
            setGameMode(requestedMode);
            setRequestedMode(null);
          }}
          onCancel={() => setRequestedMode(null)}
        />
      )}
      {engineDebug && (
        <div style={{
          position: 'fixed', bottom: 8, left: 8,
          fontSize: '11px', fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.75)', color: '#0f0',
          padding: '6px 10px', borderRadius: 4, zIndex: 999,
          maxWidth: 300, lineHeight: 1.4
        } as React.CSSProperties}>
          {engineDebug.difficulty} | depth {engineDebug.depthReached}/{engineDebug.maxDepth} |
          {' '}{engineDebug.nodesSearched} nodes | score {engineDebug.bestScore}cp |
          {' '}{engineDebug.openingBookHit ? '??' : ''} {engineDebug.quiescenceUsed ? '??' : ''} {engineDebug.transpositionTableUsed ? '???' : ''}
        </div>
      )}
    </div>
  );
}

function LibraryPage() {
  const saveStatus = (game: GameMetadata): 'none' | 'saved' | 'completed' => {
    try {
      const raw = localStorage.getItem(game.saveKey);
      if (!raw) return 'none';
      if (game.id === 'intercept') {
        const saved = JSON.parse(raw) as { state?: { status?: string } };
        if (saved.state?.status === 'finished') return 'completed';
      }
      if (game.id === 'tic-tac-toe') {
        const saved = JSON.parse(raw) as { state?: { moves?: unknown[]; score?: { wins?: number; losses?: number; draws?: number } } };
        const score = saved.state?.score;
        if (!(saved.state?.moves?.length || score?.wins || score?.losses || score?.draws)) return 'none';
      }
      return 'saved';
    } catch { return 'none'; }
  };
  return <div className="app library-app"><a href="#library-main" className="skip-link">Skip to main content</a><header className="app-header"><h1>Voice Game Companion</h1><span className="game-badge">Accessible games</span></header><main id="library-main" className="library-main"><section className="library-intro" aria-labelledby="library-heading"><p className="voice-eyebrow">Play by voice, keyboard, or mouse</p><h2 id="library-heading">Choose a game</h2><p>Play a strategy game against the computer or enter a narrated interactive mystery. Each game has accessible controls and its own save.</p></section><div className="game-library" role="list">{gameRegistry.map((game) => {
    const status = saveStatus(game);
    const hasSave = status !== 'none';
    return <article className="game-card" role="listitem" key={game.id}><span className="game-card-icon" aria-hidden="true">{game.symbol}</span><h3>{game.title}</h3><p>{game.description}</p><p className="save-status">{status === 'completed' ? 'Completed story available' : hasSave ? 'Saved game available' : 'No saved game'}</p><div className="game-card-actions"><Button onClick={() => { window.location.href = game.route; }}>{hasSave ? `Open ${game.title}` : `Play ${game.title}`}</Button>{hasSave && status !== 'completed' && <Button className="secondary-button" onClick={() => { window.location.href = `${game.route}?resume=1`; }}>Resume {game.title}</Button>}</div></article>;
  })}</div><p className="library-help">Open any game to start its voice companion. Every game also works with keyboard or typed commands.</p></main></div>;
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/games/chess') return <ChessPage />;
  if (path === '/games/ludo') return <LudoPage />;
  if (path === '/games/intercept') return <Suspense fallback={<main className="intercept-main" aria-busy="true"><p>Loading The Intercept…</p></main>}><InterceptPage /></Suspense>;
  if (path === '/games/tic-tac-toe') return <Suspense fallback={<main className="tic-tac-toe-main" aria-busy="true"><p>Loading Tic-Tac-Toe…</p></main>}><TicTacToePage /></Suspense>;
  return <LibraryPage />;
}

