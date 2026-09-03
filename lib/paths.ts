import os from "node:os";
import path from "node:path";

const home = os.homedir();
export const ROOT = path.resolve(import.meta.dirname, "..");
export const CATALOG = path.join(ROOT, "catalog");
export const OUT = path.join(ROOT, "out");
export const LIVE_CORE = "C:/ProgramData/Ableton/Live 12 Suite/Resources/Core Library";
export const USER_LIBRARY = path.join(home, "Documents/Ableton/User Library");
export const FACTORY_PACKS = path.join(home, "Documents/Ableton/Factory Packs");
export const VST3_DIRS = ["C:/Program Files/Common Files/VST3"];
export const VST2_DIRS = ["C:/Program Files/VSTPlugins", "C:/Program Files/Steinberg/VSTPlugins"];
