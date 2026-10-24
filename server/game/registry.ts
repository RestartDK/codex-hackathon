import { loupsGarous } from "./modules/loups-garous.js";
import { eraseGameModule } from "./module.js";
import type { RuntimeGameModule } from "./module.js";

const modules = new Map<string, RuntimeGameModule>();

export function registerGameModule(module: RuntimeGameModule) {
  if (modules.has(module.id)) throw new Error(`Game module "${module.id}" is already registered.`);
  if (module.capabilities.voiceCommands !== (typeof module.parseCommand === "function"))
    throw new Error(
      `Game module "${module.id}" must match its voice-command capability to parseCommand.`,
    );
  if (module.capabilities.undo !== (typeof module.undoAction === "function"))
    throw new Error(`Game module "${module.id}" must match its undo capability to undoAction.`);
  modules.set(module.id, module);
}

registerGameModule(eraseGameModule(loupsGarous));

export function getGameModule(id: string) {
  return modules.get(id);
}

export function listGameModules() {
  return [...modules.values()].map(
    ({ id, name, description, minPlayers, maxPlayers, capabilities }) => ({
      id,
      name,
      description,
      minPlayers,
      maxPlayers,
      capabilities,
    }),
  );
}
