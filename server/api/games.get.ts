import { defineHandler } from "nitro";
import { listGameModules } from "../game/registry.js";

export default defineHandler(() => ({ games: listGameModules() }));
