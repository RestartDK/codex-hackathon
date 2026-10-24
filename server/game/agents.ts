import { z } from "zod";
import type { Game, Player } from "./types.js";

const config = () => ({
  key: process.env.OPENAI_API_KEY,
  // The NPC provider is intentionally separate from the player-facing guide configuration.
  model: process.env.OPENAI_NPC_MODEL || "gpt-6-luna",
  url: process.env.OPENAI_NPC_URL || "https://api.openai.com/v1/responses",
});
const publicState = (game: Game) => ({
  day: game.day,
  phase: game.phase,
  living: game.players.filter((p) => p.alive).map((p) => ({ id: p.id, name: p.name })),
  recentDiscussion: game.feed
    .filter((e) => e.kind === "speech")
    .slice(-8)
    .map((e) => `${e.speaker}: ${e.text}`),
});
const timedFetch = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
async function completion(system: string, payload: unknown): Promise<unknown> {
  const { key, model, url } = config();
  if (!key) throw new Error("No model key configured");
  const response = await timedFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "none" },
      max_output_tokens: 240,
      instructions: `${system}\nReturn only valid JSON, without Markdown fences.`,
      input: JSON.stringify(payload),
    }),
  });
  if (!response.ok) throw new Error(`Model returned ${response.status}`);
  const envelope = z
    .object({
      output_text: z.string().optional(),
      output: z
        .array(
          z.object({
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional() }))
              .optional(),
          }),
        )
        .optional(),
      choices: z.array(z.object({ message: z.object({ content: z.string() }) })).optional(),
    })
    .parse(await response.json());
  const text =
    envelope.output_text ??
    envelope.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text ??
    envelope.choices?.[0]?.message.content;
  if (!text) throw new Error("Model response had no text");
  return JSON.parse(text);
}

export async function chooseTarget(game: Game, actor: Player, candidates: Player[], kind: string) {
  if (!candidates.length) return undefined;
  if (actor.controller === "agent" && config().key) {
    try {
      const wolfTeammates =
        actor.role === "werewolf"
          ? game.players
              .filter((p) => p.alive && p.role === "werewolf" && p.id !== actor.id)
              .map((p) => p.name)
          : undefined;
      const output = z.object({ target: z.string() }).parse(
        await completion(
          'Play a social deduction game as one NPC. Pick one candidate ID and return JSON {"target":"id"}. Never invent IDs. Use only the information provided.',
          {
            action: kind,
            role: actor.role,
            personality: actor.profile,
            public: publicState(game),
            candidates: candidates.map((p) => ({ id: p.id, name: p.name })),
            ...(wolfTeammates ? { pack: wolfTeammates } : {}),
            investigations: actor.investigations.map((i) => ({
              player: game.players.find((p) => p.id === i.targetId)?.name,
              result: i.result,
            })),
          },
        ),
      );
      const selected = candidates.find((p) => p.id === output.target);
      if (!selected) throw new Error("Illegal target");
      actor.agentMode = "llm";
      return selected;
    } catch {
      actor.agentMode = "fallback";
    }
  } else if (actor.controller === "agent") actor.agentMode = "fallback";
  const sorted = [...candidates].sort(
    (a, b) => (actor.memory.suspicion[b.id] ?? 0) - (actor.memory.suspicion[a.id] ?? 0),
  );
  return sorted[0];
}

export async function generateSpeech(game: Game, actor: Player) {
  if (actor.controller === "agent" && config().key) {
    try {
      const result = z.object({ text: z.string().trim().min(1).max(320) }).parse(
        await completion(
          'You are one NPC in a social deduction game. Write one concise, natural in-character line. Respond directly to the latest public discussion when there is one. You may accuse, question, defend yourself, agree, or revise an earlier view, but never claim secret information you do not have. Werewolves must protect their identity. Return {"text":"..."}.',
          {
            role: actor.role,
            personality: actor.profile,
            public: publicState(game),
            memories: actor.memory.notes.slice(-6),
            suspicions: Object.entries(actor.memory.suspicion)
              .sort(([, first], [, second]) => second - first)
              .slice(0, 3)
              .map(([id, score]) => ({
                name: game.players.find((candidate) => candidate.id === id)?.name,
                score,
              })),
          },
        ),
      );
      actor.agentMode = "llm";
      return result.text;
    } catch {
      actor.agentMode = "fallback";
    }
  } else if (actor.controller === "agent") actor.agentMode = "fallback";
  const target = game.players
    .filter((candidate) => candidate.alive && candidate.id !== actor.id)
    .sort(
      (first, second) =>
        (actor.memory.suspicion[second.id] ?? 0) - (actor.memory.suspicion[first.id] ?? 0),
    )[0];
  const latest = [...game.feed]
    .reverse()
    .find((entry) => entry.kind === "speech" && entry.speaker !== actor.name);
  if (latest && target)
    return `${latest.speaker}, I heard you. Still, I want ${target.name} to explain what does not fit with the rest of the village.`;
  if (target)
    return `${actor.profile.speakingStyle} Right now, I need a clearer answer from ${target.name}.`;
  return `${actor.profile.speakingStyle} Let us compare the details before we decide whom to trust.`;
}
