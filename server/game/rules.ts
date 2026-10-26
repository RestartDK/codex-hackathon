import type { Role, RoleCounts, TieRule } from "./types.js";

export const ROLE_LABELS: Record<Role, string> = {
  werewolf: "Werewolf",
  villager: "Villager",
  seer: "Seer",
  witch: "Witch",
  hunter: "Hunter",
  cupid: "Cupid",
};

export const DEFAULT_ROLE_COUNTS: Record<number, RoleCounts> = {
  4: { werewolf: 1, villager: 1, seer: 1, witch: 1, hunter: 0, cupid: 0 },
  5: { werewolf: 1, villager: 2, seer: 1, witch: 1, hunter: 0, cupid: 0 },
  6: { werewolf: 1, villager: 2, seer: 1, witch: 1, hunter: 1, cupid: 0 },
  7: { werewolf: 1, villager: 3, seer: 1, witch: 1, hunter: 1, cupid: 0 },
  8: { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 1, cupid: 0 },
  9: { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 1, cupid: 1 },
  10: { werewolf: 2, villager: 4, seer: 1, witch: 1, hunter: 1, cupid: 1 },
  11: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1, cupid: 1 },
  12: { werewolf: 3, villager: 5, seer: 1, witch: 1, hunter: 1, cupid: 1 },
};

export const RULES = [
  "The human player receives one secret role; every other seat is controlled by an NPC.",
  "The opening Cupid chooses two distinct living players. If either lover dies, the other dies immediately.",
  "At night, living Werewolves choose one shared target; the Seer investigates one living player; the Witch may save the wolf target and/or poison one different living player.",
  "The Witch has one healing potion and one poison potion for the whole game. Both may be used on the same night, but never on the same person.",
  "At day, the living village may discuss and each living player votes once. Ties follow the selected rule: no exile, or random exile among tied targets.",
  "A living Hunter eliminated at night or by vote gets one final shot before the next phase. Lover deaths also trigger a living Hunter's shot.",
  "The village wins when all Werewolves are eliminated. Werewolves win when they equal or outnumber every other living player. Cross-faction lovers win together if they are the only two living players.",
  "An eliminated player's role is revealed publicly; surviving roles stay hidden until the game ends. Each player and each agent receives only its authorized private information before then.",
] as const;

export function defaultRoleCounts(count: number): RoleCounts {
  const roles = DEFAULT_ROLE_COUNTS[count];
  if (!roles) throw new Error("Choose a village size from 4 to 12.");
  return { ...roles };
}

export function validateRoleCounts(count: number, roles: RoleCounts): void {
  if (!Number.isInteger(count) || count < 4 || count > 12)
    throw new Error("Choose a village size from 4 to 12.");
  if (Object.values(roles).some((value) => !Number.isInteger(value) || value < 0))
    throw new Error("Role counts must be non-negative whole numbers.");
  if (roles.werewolf < 1) throw new Error("A game needs at least one Werewolf.");
  if (roles.werewolf >= count) throw new Error("The village needs at least one non-Werewolf.");
  if (Object.values(roles).reduce((sum, value) => sum + value, 0) !== count)
    throw new Error("Role counts must add up to the village size.");
  if (roles.witch > 1 || roles.seer > 1 || roles.hunter > 1 || roles.cupid > 1)
    throw new Error("This ruleset supports at most one Witch, Seer, Hunter, and Cupid.");
}

export function tieRuleLabel(rule: TieRule) {
  return rule === "random-among-tied" ? "Random exile among tied targets" : "No exile on a tie";
}
