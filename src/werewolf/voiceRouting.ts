/**
 * Day speech is public, but a sentence that opens like an app control must never be
 * posted to the village when the command was not recognized.
 */
export function looksLikeControlCommand(text: string): boolean {
  return /^(set|change|turn|switch|put|use|enable|disable|adjust|reset|pause|resume|unpause|stop|start|open|close|back|cancel|undo|read|repeat|mute|unmute|volume|speed|rate|auto|explain|help|new|load|save|go)\b/iu.test(
    text.trim(),
  );
}
