import { describe, expect, it } from "vite-plus/test";
import type { PublicPlayerView } from "../../server/game/types.js";
import { buildVillageIntroduction, VillageIntroductionSequence } from "./villageIntroduction";

const player = (id: string, name: string, introduction: string): PublicPlayerView => ({
  id,
  name,
  alive: true,
  controller: id === "human" ? "human" : "bot",
  bio: `${name} lives in Valombre.`,
  profile: {
    archetype: "Villager",
    speakingStyle: "calm",
    introduction,
    voiceKey: "assistant",
  },
});

describe("village introduction sequence", () => {
  it("uses only public roster information and retains every character", () => {
    const lines = buildVillageIntroduction(
      "village-1",
      [player("human", "You", ""), player("emma", "Emma", "I am Emma. I keep the village bakery.")],
      "human",
    );
    expect(lines.map((line) => line.kind)).toEqual([
      "opening",
      "character",
      "character",
      "guidance",
    ]);
    expect(lines[1]?.text).toBe("You are part of this village. Your role remains private.");
    expect(lines[2]?.text).toBe("Emma. I keep the village bakery.");
    expect(lines.map((line) => line.text).join(" ")).not.toMatch(/werewolf|seer|witch|hunter/iu);
  });

  it("advances one line per completed playback instead of completing the sequence", () => {
    const sequence = new VillageIntroductionSequence();
    const lines = buildVillageIntroduction(
      "village-1",
      [player("human", "You", ""), player("emma", "Emma", "I keep the village bakery.")],
      "human",
    );
    sequence.start("village-1", lines);
    expect(sequence.request(1, 4)?.kind).toBe("opening");
    expect(sequence.finishPlayback(false)).toBe(false);
    expect(sequence.confirmPlayback(5)).toBe(true);
    expect(sequence.finishPlayback(true)).toBe(false);
    expect(sequence.finishPlayback(false)).toBe(true);
    expect(sequence.current()?.text).toContain("You are part");
    expect(sequence.isActive()).toBe(true);
  });

  it("supports repeat, next character, skip, and a fresh village", () => {
    const sequence = new VillageIntroductionSequence();
    const first = buildVillageIntroduction(
      "village-1",
      [player("human", "You", ""), player("emma", "Emma", "I bake bread.")],
      "human",
    );
    sequence.start("village-1", first);
    expect(sequence.nextCharacter()?.text).toContain("You are part");
    expect(sequence.repeat()?.text).toContain("You are part");
    expect(sequence.nextCharacter()?.text).toContain("Emma");
    sequence.skip();
    expect(sequence.isActive()).toBe(false);

    const second = buildVillageIntroduction(
      "village-2",
      [player("human", "You", ""), player("lucas", "Lucas", "I tend the fields.")],
      "human",
    );
    expect(sequence.start("village-2", second)).toBe(true);
    expect(sequence.current()?.kind).toBe("opening");
  });
});
