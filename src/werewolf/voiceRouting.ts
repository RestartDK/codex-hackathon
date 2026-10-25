const CONTROL_REQUEST = /^(set|change|turn|switch|put|use|enable|disable|adjust|reset|pause|resume|unpause|stop|start|open|close|read|repeat|mute|unmute|increase|decrease|raise|lower)\b/iu;
const CONTROL_SUBJECT = /\b(volume|speed|rate|audio|narration|microphone|mic|voice|speech|reading|settings?|preferences?|tutorial|explanations?|player count|village size|auto.read|game|match|setup|dialog|help)\b/iu;
const EXACT_CONTROL = /^(cancel|cancel that|never mind|undo|back|go back|close|mute|unmute|volume|speed|rate)$/iu;

export function looksLikeControlCommand(text: string): boolean {
  const command = text.trim();
  return EXACT_CONTROL.test(command) || (CONTROL_REQUEST.test(command) && CONTROL_SUBJECT.test(command));
}
