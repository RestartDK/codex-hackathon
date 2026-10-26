import { parseGuidanceCommand } from "../voice/guidance";

/** Commands that accept the final, already-presented Loups-Garous setup summary. */
export function isSetupStartConfirmation(command: string): boolean {
  const value = command
    .trim()
    .toLowerCase()
    .replace(/[,.!?]/g, "")
    .replace(/\s+/g, " ");
  return (
    parseGuidanceCommand(value) === "start" || /^(?:yes|yes please|start|start it)$/u.test(value)
  );
}

/** Main's richer setup commands still require the reviewed summary before play. */
export function setupStartDecision(
  command: string,
  awaitingConfirmation: boolean,
  quickTest = false,
) {
  if (quickTest) return "quick-test";
  return awaitingConfirmation && isSetupStartConfirmation(command) ? "confirm" : "review";
}
