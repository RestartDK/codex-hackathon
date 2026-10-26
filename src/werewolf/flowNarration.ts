import type { GameView, VoteResult } from "../../server/game/types.js";
import { ROLE_LABELS } from "../../server/game/rules.js";
import { nextRoleAction } from "../../server/game/role-guidance.js";

export type FlowOverlay = {
  vote?: { result: VoteResult; revealing: boolean };
  finding?: GameView["me"]["investigations"][number];
};

/** Only accepts the viewer-scoped state; overlays are UI acknowledgements, not actions. */
export function flowGuidance(game: GameView, { vote, finding }: FlowOverlay = {}): string {
  if (game.paused) return nextRoleAction(game);
  if (game.phase === "setup" || game.phase === "prologue") return nextRoleAction(game);
  if (vote) {
    const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "Unknown player";
    const exiled = game.players.find((p) => p.id === vote.result.exiledPlayerId);
    if (vote.revealing) {
      return `${exiled?.name ?? "The exiled player"} was ${exiled?.revealedRole ? `the ${ROLE_LABELS[exiled.revealedRole]}` : "eliminated; their role is not available"}. Say continue to ${game.phase === "over" ? "hear the final result" : "return to the village"}.`;
    }
    const tally = vote.result.tally
      .map(
        (entry) => `${name(entry.target)}: ${entry.votes} ${entry.votes === 1 ? "vote" : "votes"}`,
      )
      .join(". ");
    const tied = vote.result.tiedTargetIds.length > 1;
    return [
      `The village has voted. ${tally}.`,
      tied
        ? `The highest count was tied. ${exiled ? "The selected tie rule randomly exiles one of the tied players." : "The selected tie rule exiles no one."}`
        : "",
      exiled
        ? `${exiled.name} was eliminated. Say continue to reveal their role.`
        : "Say continue to return to the village.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (finding)
    return `Private finding: ${finding.name} is ${finding.result === "wolf" ? "a Werewolf" : "not a Werewolf"}. Only you received this finding. Say continue to return to the village.`;
  if (game.phase === "over") {
    const won =
      game.winner === "lovers"
        ? game.me.alive && Boolean(game.me.lover)
        : game.winner === (game.me.role === "werewolf" ? "wolves" : "village");
    return `${game.winner === "lovers" ? "The cross-faction lovers win" : game.winner === "wolves" ? "The Werewolves win" : "The village wins"}. ${won ? "You win" : "You lose"}. ${game.me.alive ? "You survived" : "You were eliminated"}. Say play again to set up another village, or go home.`;
  }
  const targets = game.players.filter(
    (p) =>
      p.alive &&
      p.id !== game.me.id &&
      (game.phase !== "night" ||
        game.me.role !== "werewolf" ||
        !game.me.werewolfTeam?.includes(p.name)) &&
      (game.phase !== "night" ||
        game.me.role !== "seer" ||
        !game.me.investigations.some((i) => i.name === p.name)),
  );
  return [
    `Day ${game.day}. ${game.phase === "day" ? "Discussion" : game.phase === "vote" ? "Voting" : game.phase === "hunter" ? "The Hunter's final shot" : game.phase === "cupid" ? "Cupid's opening choice" : "Night"}.`,
    nextRoleAction(game),
    !game.me.alive && !game.me.hunterActionPending
      ? "The NPCs will continue after narration. Say pause game to stop and resume game to continue."
      : "",
    ["night", "vote", "hunter", "cupid"].includes(game.phase) &&
    (game.me.alive || game.me.hunterActionPending)
      ? `Living choices: ${targets.map((p) => p.name).join(", ") || "none"}.${game.phase === "cupid" ? " You may also include yourself." : ""}`
      : "",
    game.phase === "vote"
      ? `Votes received so far: ${game.players
          .filter((p) => p.alive)
          .map((p) => `${p.name}, ${game.voteTally?.[p.id] ?? 0}`)
          .join("; ")}.`
      : "",
    game.phase === "vote"
      ? `Every living player must vote for someone else; no abstention. ${game.tieRule === "no-exile" ? "A tie means no exile." : "A tie randomly exiles one of the tied players."}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
