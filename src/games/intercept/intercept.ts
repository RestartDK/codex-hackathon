import { Story as InkStoryConstructor } from "../../vendor/inkjs-runtime.js";
import storyJson from "./content/TheIntercept.json?raw";

export const INTERCEPT_SAVE_KEY = "voice-game-companion-intercept-save";
export const INTERCEPT_SOURCE_REVISION = "2a816b56e61ce4bf02bec1c638074645bdd871e3";
export const INTERCEPT_SAVE_VERSION = 1;
export const INTERCEPT_INTRODUCTION =
  "The Intercept is a choice-based mystery set at Bletchley Park in 1942. You play a cryptographer held for questioning after a component from the Bombe code-breaking machine disappears. Listen to each scene, then decide what your character says or does. Your goal is to navigate the investigation and shape your character’s fate. There is no score or single official victory: the story has multiple endings, and some outcomes are safer or more favorable for your character than others. Reaching any ending completes a playthrough, and you can replay to discover a different outcome.";

interface InkChoice {
  index: number;
  text: string;
}

interface InkState {
  ToJson(): string;
  LoadJson(json: string): void;
}

interface InkStory {
  canContinue: boolean;
  currentChoices: InkChoice[];
  Continue(): string;
  ChooseChoiceIndex(index: number): void;
  state: InkState;
}

interface InkRuntime {
  Story: new (content: string) => InkStory;
}

declare global {
  var inkjs: InkRuntime | undefined;
}

export interface InterceptChoice {
  id: string;
  index: number;
  number: number;
  text: string;
}

export interface InterceptTranscriptEntry {
  kind: "passage" | "choice";
  text: string;
}

export interface InterceptState {
  passage: string[];
  choices: InterceptChoice[];
  transcript: InterceptTranscriptEntry[];
  status: "playing" | "paused" | "finished";
  revision: number;
}

interface InterceptCheckpoint {
  inkState: string;
  passage: string[];
  transcript: InterceptTranscriptEntry[];
  status: InterceptState["status"];
}

interface InterceptSaveV1 {
  version: 1;
  sourceRevision: string;
  inkState: string;
  state: InterceptState;
  checkpoint: InterceptCheckpoint | null;
  savedAt: number;
}

export interface InterceptActionResult {
  ok: boolean;
  message: string;
}

function cloneTranscript(entries: InterceptTranscriptEntry[]): InterceptTranscriptEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function storyRuntime(): InkStory {
  if (!InkStoryConstructor) throw new Error("The Intercept story runtime did not load.");
  return new InkStoryConstructor(storyJson.replace(/^\uFEFF/, "")) as InkStory;
}

function isTranscript(value: unknown): value is InterceptTranscriptEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      return (
        (item.kind === "passage" || item.kind === "choice") &&
        typeof item.text === "string" &&
        item.text.length <= 10_000
      );
    })
  );
}

function parseSave(raw: string | null): InterceptSaveV1 | null {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const save = JSON.parse(raw) as Partial<InterceptSaveV1>;
    const state = save.state as Partial<InterceptState> | undefined;
    if (
      save.version !== INTERCEPT_SAVE_VERSION ||
      save.sourceRevision !== INTERCEPT_SOURCE_REVISION ||
      typeof save.inkState !== "string" ||
      !state ||
      !Array.isArray(state.passage) ||
      !state.passage.every((line) => typeof line === "string") ||
      !isTranscript(state.transcript) ||
      !Number.isInteger(state.revision) ||
      !["playing", "paused", "finished"].includes(String(state.status))
    )
      return null;
    const checkpoint = save.checkpoint;
    if (
      checkpoint != null &&
      (typeof checkpoint.inkState !== "string" ||
        !Array.isArray(checkpoint.passage) ||
        !checkpoint.passage.every((line) => typeof line === "string") ||
        !isTranscript(checkpoint.transcript) ||
        !["playing", "paused", "finished"].includes(checkpoint.status))
    )
      return null;
    return save as InterceptSaveV1;
  } catch {
    return null;
  }
}

export class InterceptGame {
  private story: InkStory;
  private storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  private checkpoint: InterceptCheckpoint | null = null;
  private listeners = new Set<(state: InterceptState) => void>();
  private busy = false;
  private loadedSave = false;
  private stateValue: InterceptState;

  constructor(
    storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = typeof localStorage ===
    "undefined"
      ? null
      : localStorage,
  ) {
    this.storage = storage;
    this.story = storyRuntime();
    this.stateValue = { passage: [], choices: [], transcript: [], status: "playing", revision: 0 };
    let save: InterceptSaveV1 | null = null;
    try {
      save = parseSave(storage?.getItem(INTERCEPT_SAVE_KEY) ?? null);
    } catch {
      save = null;
    }
    if (save) {
      try {
        this.story.state.LoadJson(save.inkState);
        this.stateValue = {
          ...save.state,
          passage: [...save.state.passage],
          choices: this.currentChoices(save.state.revision),
          transcript: cloneTranscript(save.state.transcript),
        };
        this.checkpoint = save.checkpoint
          ? {
              ...save.checkpoint,
              passage: [...save.checkpoint.passage],
              transcript: cloneTranscript(save.checkpoint.transcript),
            }
          : null;
        this.loadedSave = true;
        return;
      } catch {
        try {
          storage?.removeItem(INTERCEPT_SAVE_KEY);
        } catch {
          /* Storage can be unavailable. */
        }
        this.story = storyRuntime();
      }
    }
    this.advanceToDecision();
    this.persist();
  }

  get state(): InterceptState {
    return this.stateValue;
  }

  get awaitingStartChoice(): boolean {
    return this.loadedSave;
  }

  get canUndo(): boolean {
    return this.checkpoint !== null && !this.loadedSave;
  }

  subscribe(listener: (state: InterceptState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  choose(choiceId: string): InterceptActionResult {
    if (this.loadedSave) return { ok: false, message: "Choose Resume or New Story first." };
    if (this.stateValue.status === "paused")
      return { ok: false, message: "The story is paused. Resume it before choosing." };
    if (this.stateValue.status === "finished")
      return { ok: false, message: "The story has ended. Start a new story to play again." };
    if (this.busy) return { ok: false, message: "That choice is already being processed." };
    const choice = this.stateValue.choices.find((item) => item.id === choiceId);
    if (!choice)
      return {
        ok: false,
        message: "That choice is no longer available. Ask me to repeat the current choices.",
      };
    this.busy = true;
    try {
      this.checkpoint = {
        inkState: this.story.state.ToJson(),
        passage: [...this.stateValue.passage],
        transcript: cloneTranscript(this.stateValue.transcript),
        status: this.stateValue.status,
      };
      this.story.ChooseChoiceIndex(choice.index);
      const revision = this.stateValue.revision + 1;
      this.stateValue = {
        ...this.stateValue,
        revision,
        passage: [],
        choices: [],
        transcript: [...this.stateValue.transcript, { kind: "choice", text: choice.text }],
      };
      this.advanceToDecision();
      this.persistAndNotify();
      return { ok: true, message: this.currentNarration() };
    } catch {
      return {
        ok: false,
        message:
          "The story could not apply that choice. Your previous position is still available through undo.",
      };
    } finally {
      this.busy = false;
    }
  }

  chooseNumber(number: number): InterceptActionResult {
    if (!Number.isInteger(number) || number < 1)
      return { ok: false, message: "Choose one of the numbered options." };
    const choice = this.stateValue.choices.find((item) => item.number === number);
    return choice
      ? this.choose(choice.id)
      : { ok: false, message: `Choice ${number} is not available. ${this.choiceList()}` };
  }

  undo(): InterceptActionResult {
    if (this.loadedSave) return { ok: false, message: "Resume the saved story before undoing." };
    if (!this.checkpoint)
      return { ok: false, message: "There is no previous story choice to undo." };
    try {
      const checkpoint = this.checkpoint;
      const revision = this.stateValue.revision + 1;
      this.story.state.LoadJson(checkpoint.inkState);
      this.stateValue = {
        passage: [...checkpoint.passage],
        choices: [],
        transcript: cloneTranscript(checkpoint.transcript),
        status: checkpoint.status,
        revision,
      };
      this.stateValue = { ...this.stateValue, choices: this.currentChoices(revision) };
      this.checkpoint = null;
      this.persistAndNotify();
      return { ok: true, message: `Your last choice was undone. ${this.currentNarration()}` };
    } catch {
      return { ok: false, message: "The previous choice could not be restored." };
    }
  }

  pause(): InterceptActionResult {
    if (this.loadedSave) return { ok: false, message: "Choose Resume or New Story first." };
    if (this.stateValue.status === "finished")
      return { ok: false, message: "The story has already ended." };
    if (this.stateValue.status === "paused")
      return { ok: true, message: "The story is already paused." };
    this.stateValue = {
      ...this.stateValue,
      status: "paused",
      revision: this.stateValue.revision + 1,
    };
    this.stateValue = {
      ...this.stateValue,
      choices: this.currentChoices(this.stateValue.revision),
    };
    this.persistAndNotify();
    return { ok: true, message: "The story is paused." };
  }

  resume(): InterceptActionResult {
    if (this.loadedSave) this.loadedSave = false;
    if (this.stateValue.status === "paused")
      this.stateValue = {
        ...this.stateValue,
        status: "playing",
        revision: this.stateValue.revision + 1,
      };
    this.stateValue = {
      ...this.stateValue,
      choices: this.currentChoices(this.stateValue.revision),
    };
    this.persistAndNotify();
    return { ok: true, message: `The story is resumed. ${this.currentNarration()}` };
  }

  newGame(): InterceptActionResult {
    this.story = storyRuntime();
    this.checkpoint = null;
    this.loadedSave = false;
    this.stateValue = {
      passage: [],
      choices: [],
      transcript: [],
      status: "playing",
      revision: this.stateValue.revision + 1,
    };
    this.advanceToDecision();
    this.persistAndNotify();
    return { ok: true, message: `A new story has started. ${this.currentNarration()}` };
  }

  currentNarration(): string {
    const passage = this.stateValue.passage.join(" ").trim();
    if (this.stateValue.status === "finished") return `${passage} The story has ended.`.trim();
    return `${passage} ${this.choiceList()}`.trim();
  }

  choiceList(): string {
    return this.stateValue.choices.length
      ? `Your choices are: ${this.stateValue.choices.map((choice) => `${choice.number}, ${choice.text}`).join(". ")}`
      : "There are no choices available.";
  }

  recap(): string {
    const recent = this.stateValue.transcript.slice(-5);
    if (!recent.length) return this.currentNarration();
    return `Recent story: ${recent.map((entry) => (entry.kind === "choice" ? `You chose ${entry.text}.` : entry.text)).join(" ")} ${this.choiceList()}`;
  }

  private currentChoices(revision: number): InterceptChoice[] {
    return this.story.currentChoices.map((choice, position) => ({
      id: `${revision}:${choice.index}:${position}`,
      index: choice.index,
      number: position + 1,
      text: choice.text.trim(),
    }));
  }

  private advanceToDecision(): void {
    const passage: string[] = [];
    let automaticChoices = 0;
    for (;;) {
      while (this.story.canContinue) {
        const text = this.story.Continue().replace(/\s+/g, " ").trim();
        if (text) passage.push(text);
      }
      // A single option is a continuation rather than a meaningful decision.
      // Advancing it removes needless spoken steps without changing agency.
      if (this.story.currentChoices.length !== 1) break;
      if (++automaticChoices > 100) throw new Error("The story entered an automatic-choice loop.");
      this.story.ChooseChoiceIndex(this.story.currentChoices[0].index);
    }
    const transcript = passage.length
      ? [
          ...this.stateValue.transcript,
          ...passage.map((text): InterceptTranscriptEntry => ({ kind: "passage", text })),
        ]
      : this.stateValue.transcript;
    const choices = this.currentChoices(this.stateValue.revision);
    this.stateValue = {
      ...this.stateValue,
      passage,
      choices,
      transcript,
      status: choices.length === 0 ? "finished" : "playing",
    };
  }

  private persist(): void {
    const save: InterceptSaveV1 = {
      version: INTERCEPT_SAVE_VERSION,
      sourceRevision: INTERCEPT_SOURCE_REVISION,
      inkState: this.story.state.ToJson(),
      state: this.stateValue,
      checkpoint: this.checkpoint,
      savedAt: Date.now(),
    };
    try {
      this.storage?.setItem(INTERCEPT_SAVE_KEY, JSON.stringify(save));
    } catch {
      /* The game remains playable if storage is full. */
    }
  }

  private persistAndNotify(): void {
    this.persist();
    for (const listener of this.listeners) listener(this.stateValue);
  }
}

export function matchInterceptChoice(
  command: string,
  choices: readonly InterceptChoice[],
): InterceptChoice | null {
  const normalized = command
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ");
  const words: Record<string, number> = {
    one: 1,
    first: 1,
    two: 2,
    second: 2,
    three: 3,
    third: 3,
    four: 4,
    fourth: 4,
    five: 5,
    fifth: 5,
    six: 6,
    sixth: 6,
  };
  const numeric = normalized.match(/^(?:choice|option)?\s*(\d+)$/)?.[1];
  const word = normalized.match(
    /^(?:choice|option)?\s*(one|first|two|second|three|third|four|fourth|five|fifth|six|sixth)$/,
  )?.[1];
  const number = numeric ? Number(numeric) : word ? words[word] : null;
  if (number != null) return choices.find((choice) => choice.number === number) ?? null;
  const exact = choices.filter(
    (choice) =>
      choice.text
        .toLowerCase()
        .replace(/[.,!?]/g, "")
        .replace(/\s+/g, " ") === normalized,
  );
  return exact.length === 1 ? exact[0] : null;
}
