import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { ChessCompanion } from "../../voice/useChessCompanion";

export default function Help({
  companion,
  onBack,
}: {
  companion: ChessCompanion;
  onBack: () => void;
}) {
  return (
    <section className="help-page" aria-labelledby="page-heading">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> Go back
      </button>
      <h1 id="page-heading" tabIndex={-1}>
        A little help, whenever you need it.
      </h1>
      <p className="page-intro">
        Talk naturally. Your companion handles the controls, and you stay in charge.
      </p>
      <div className="help-sections">
        <section>
          <h2>Start with your voice</h2>
          <p>
            Select the orb, allow microphone access, and say "Play chess." You only need one voice
            connection as you move around the app. Select the orb again to mute your microphone. Use
            the stop button to end voice.
          </p>
        </section>
        <section>
          <h2>Make your first move</h2>
          <p>
            Try "Move my pawn from e2 to e4." Your companion reads it back. Say "yes" to play it, or
            "cancel" to leave the board unchanged. The computer then takes its turn.
          </p>
        </section>
        <section>
          <h2>Ask for what you need</h2>
          <ul>
            <li>"What is on e4?"</li>
            <li>"Where are my knights?"</li>
            <li>"Describe the board."</li>
            <li>"What should I play next?"</li>
            <li>"Choose a move for me."</li>
            <li>"What did the computer play?"</li>
            <li>"Undo", "pause", "resume", or "new game".</li>
          </ul>
        </section>
        <section>
          <h2>No microphone? No problem.</h2>
          <p>
            Open the keyboard button beside the orb to type commands. Try "e2 to e4", then "yes".
            You can also play directly on the board. Tab into it, use the arrow keys to explore, and
            press Enter or Space to select a piece and destination.
          </p>
        </section>
        <section>
          <h2>Pick up later</h2>
          <p>
            Your chess position and preferences stay on this device. Leaving a game saves and pauses
            it. Return to Chess and select Resume. Loups-Garous and Tic-Tac-Toe are previews, not
            playable games yet.
          </p>
        </section>
      </div>
      <div className="help-actions">
        <button className="pill-button primary" onClick={companion.guide}>
          Hear the quick guide
        </button>
        <button
          className="pill-button"
          onClick={() => {
            void companion.navigate("chess");
          }}
        >
          Play chess <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
