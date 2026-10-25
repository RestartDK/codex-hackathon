import { z } from "zod";

export const appSettingsSchema = z.object({
  gameMode: z.enum(["computer", "local"]),
  playerColor: z.enum(["w", "b"]),
  difficulty: z.enum(["beginner", "casual", "club", "expert", "nightmare"]),
  boardOrientation: z.enum(["white-bottom", "flip-turn"]),
  boardTheme: z.enum(["classic", "marine", "ember", "forest", "midnight"]),
  pieceSet: z.enum(["unicode", "symbols", "outlined", "merida"]),
  soundEnabled: z.boolean(),
  screenReaderMode: z.boolean(),
  voiceVolume: z.number().min(0).max(100),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export const preferenceNames = appSettingsSchema.keyof().options;
export const preferenceLabels = {
  gameMode: "Opponent",
  playerColor: "Playing side",
  difficulty: "Difficulty",
  boardOrientation: "Board orientation",
  boardTheme: "Board theme",
  pieceSet: "Piece set",
  soundEnabled: "Game sounds",
  screenReaderMode: "Screen-reader mode",
  voiceVolume: "Narrator volume",
} satisfies Record<keyof AppSettings, string>;

export function describePreference(name: keyof AppSettings, settings: AppSettings): string {
  const value = settings[name];
  const spoken =
    typeof value === "boolean"
      ? value
        ? "on"
        : "off"
      : name === "voiceVolume"
        ? `${value} percent`
        : name === "playerColor"
          ? value === "w"
            ? "White"
            : "Black"
          : String(value).replaceAll("-", " ");
  return `${preferenceLabels[name]}: ${spoken}`;
}

export function describePreferences(settings: AppSettings): string {
  return preferenceNames.map((name) => describePreference(name, settings)).join(". ") + ".";
}
