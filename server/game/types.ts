export const ROLES = ["werewolf", "villager", "seer", "witch", "hunter", "cupid"] as const;
export type Role = (typeof ROLES)[number];
export type RoleCounts = Record<Role, number>;
export type Phase = "setup" | "prologue" | "cupid" | "night" | "day" | "vote" | "hunter" | "over";
export type Winner = "village" | "wolves" | "lovers";
export type Controller = "human" | "agent" | "bot";
export type TieRule = "no-exile" | "random-among-tied";
export type FeedKind = "speech" | "event" | "private";

export interface AgentMemory {
  suspicion: Record<string, number>;
  notes: string[];
  lastSeenFeedId?: string;
}

export interface CharacterProfile {
  archetype: string;
  speakingStyle: string;
  introduction: string;
  voiceKey: string;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  controller: Controller;
  alive: boolean;
  bio: string;
  profile: CharacterProfile;
  traits: { caution: number; confidence: number; talkativeness: number };
  memory: AgentMemory;
  loverId?: string;
  voteId?: string;
  nightAction?: NightAction;
  investigations: Array<{ targetId: string; result: "wolf" | "clear"; day: number }>;
  agentMode?: "llm" | "fallback";
}

export interface NightAction {
  kind: "wolf" | "seer" | "witch" | "pass";
  targetId?: string;
  heal?: boolean;
  poisonTargetId?: string;
}

export interface FeedEntry {
  id: string;
  day: number;
  speaker: string;
  text: string;
  kind: FeedKind;
  recipientId?: string;
}

/** A public record of the most recently resolved village vote. */
export interface VoteResult {
  day: number;
  ballots: Array<{ voter: string; target: string }>;
  tally: Array<{ target: string; votes: number }>;
  tiedTargetIds: string[];
  exiledPlayerId?: string;
}

export interface Game {
  id: string;
  testMode: boolean;
  paused: boolean;
  phase: Phase;
  day: number;
  hasDawned: boolean;
  players: Player[];
  feed: FeedEntry[];
  roleCounts: RoleCounts;
  tieRule: TieRule;
  lovers?: [string, string];
  cupidPlayerId?: string;
  witchHealAvailable: boolean;
  witchPoisonAvailable: boolean;
  wolfVictimId?: string;
  pendingHunters: string[];
  resumeAfterHunter: "day" | "night";
  discussionDay?: number;
  lastVotes?: Array<{ voter: string; target: string }>;
  lastVoteResult?: VoteResult;
  winner?: Winner;
  processedFeedIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PublicPlayerView {
  id: string;
  name: string;
  alive: boolean;
  controller: Controller;
  bio: string;
  profile: CharacterProfile;
  revealedRole?: Role;
  agentMode?: "llm" | "fallback";
}

export interface PlayerPrivateView {
  id: string;
  role: Role;
  alive: boolean;
  werewolfTeam?: string[];
  lover?: string;
  investigations: Array<{ name: string; result: "wolf" | "clear"; day: number }>;
  witchHealAvailable: boolean;
  witchPoisonAvailable: boolean;
  wolfVictim?: string;
  hunterActionPending: boolean;
}

export interface GameView {
  id: string;
  gameType: string;
  testMode: boolean;
  paused: boolean;
  phase: Phase;
  day: number;
  players: PublicPlayerView[];
  me: PlayerPrivateView;
  feed: FeedEntry[];
  lastVotes?: Array<{ voter: string; target: string }>;
  lastVoteResult?: VoteResult;
  winner?: Winner;
  tieRule: TieRule;
  modelMode: "llm" | "fallback";
}
