import { describe, expect, it } from "vite-plus/test";
import { isSetupStartConfirmation } from "./setupVoice";

describe("Loups-Garous setup voice confirmation", () => {
  it.each([
    "confirm",
    "yes",
    "yes please",
    "start",
    "start it",
    "start game",
    "start the game",
    "begin",
  ])("accepts %s while confirmation is pending", (command) => {
    expect(isSetupStartConfirmation(command)).toBe(true);
  });

  it.each(["use the defaults", "six players", "go back", "confirm the role"])(
    "does not mistake %s for final confirmation",
    (command) => expect(isSetupStartConfirmation(command)).toBe(false),
  );
});
