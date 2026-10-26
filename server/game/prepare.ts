import { chooseTarget } from "./agents.js";
import { chooseLovers, player, submitNightAction } from "./engine.js";
import type { Game } from "./types.js";

export async function prepareGame(game: Game) {
  if (game.phase === "cupid") {
    const cupid = player(game, game.cupidPlayerId ?? "");
    if (cupid && cupid.controller !== "human") {
      const choices = game.players.filter((p) => p.alive && p.id !== cupid.id);
      const first = await chooseTarget(game, cupid, choices, "choose a lover");
      const second = await chooseTarget(
        game,
        cupid,
        choices.filter((p) => p.id !== first?.id),
        "choose a second lover",
      );
      if (first && second) chooseLovers(game, cupid.id, first.id, second.id);
    }
  }
  if (game.phase !== "night") return;
  const wolves = game.players.filter((p) => p.alive && p.role === "werewolf");
  if (
    !wolves.some((p) => p.controller === "human") &&
    !wolves.some((p) => p.nightAction?.kind === "wolf")
  ) {
    const wolf = wolves[0];
    if (wolf) {
      const teammates = new Set(wolves.map((p) => p.id));
      const target = await chooseTarget(
        game,
        wolf,
        game.players.filter((p) => p.alive && !teammates.has(p.id)),
        "hunt",
      );
      if (target) {
        wolves.forEach((p) => {
          p.nightAction = { kind: "wolf", targetId: target.id };
        });
        game.wolfVictimId = target.id;
      }
    }
  }
  const seer = game.players.find(
    (p) => p.alive && p.role === "seer" && p.controller !== "human" && !p.nightAction,
  );
  if (seer) {
    const target = await chooseTarget(
      game,
      seer,
      game.players.filter(
        (p) => p.alive && p.id !== seer.id && !seer.investigations.some((i) => i.targetId === p.id),
      ),
      "investigate",
    );
    if (target) submitNightAction(game, seer.id, { kind: "seer", targetId: target.id });
  }
  const witch = game.players.find(
    (p) =>
      p.alive &&
      p.role === "witch" &&
      p.controller !== "human" &&
      !p.nightAction &&
      game.wolfVictimId,
  );
  if (witch) {
    submitNightAction(game, witch.id, {
      kind: "witch",
      heal: Boolean(game.wolfVictimId && game.witchHealAvailable),
    });
  }
}
