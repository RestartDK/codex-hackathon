import { useMemo, useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board/Board';
import GamePanel from '../components/GamePanel/GamePanel';
import PromotionDialog from '../components/PromotionDialog/PromotionDialog';
import SettingsPanel from '../components/Settings/SettingsPanel';
import PlayerPanel from '../components/PlayerPanel/PlayerPanel';
import GameEndModal from '../components/GameEndModal/GameEndModal';
import VoiceCompanion from '../components/VoiceCompanion/VoiceCompanion';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import type { GameMode } from '../types';
import { useChessGame } from '../hooks/useChessGame';
import { useSettings } from '../hooks/useSettings';
import { isDebugEnabled, getDebugInfo, type EngineDebugInfo } from '../chess/engineDebug';
import './App.css';
import '../components/GamePanel/GamePanel.css';
import '../components/Settings/SettingsPanel.css';
import '../components/VoiceCompanion/VoiceCompanion.css';

export default function App() {
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
              turn={game.turn() as 'w' | 'b'}
              status={status}
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
            />
          </section>

          <GamePanel
            status={status}
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

