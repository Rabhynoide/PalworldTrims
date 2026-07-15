import { passives } from "./data";

export interface PassivePreset {
  name: string;
  /** Identifiants internes des passifs (max 4). */
  passives: string[];
}

const STORAGE_KEY = "palworld-breeding.passive-presets";

const DEFAULT_PRESETS: PassivePreset[] = [
  {
    name: "Travailleur",
    passives: ["CraftSpeed_up2", "CraftSpeed_up1", "PAL_CorporateSlave", "PAL_Sanity_Down_2"],
  },
  {
    name: "Combat",
    passives: ["Legend", "PAL_ALLAttack_up3", "PAL_ALLAttack_up2", "Deffence_up2"],
  },
  {
    name: "Monture",
    passives: ["Legend", "MoveSpeed_up_3", "MoveSpeed_up_2", "MoveSpeed_up_1"],
  },
];

const validIds = new Set(passives.map((p) => p.id));

function sanitize(list: PassivePreset[]): PassivePreset[] {
  return list
    .filter((p) => typeof p.name === "string" && Array.isArray(p.passives))
    .map((p) => ({
      name: p.name.slice(0, 40),
      passives: p.passives.filter((id) => validIds.has(id)).slice(0, 4),
    }));
}

export function loadPresets(): PassivePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Premier lancement : installe les presets par défaut.
      const defaults = sanitize(DEFAULT_PRESETS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    return sanitize(JSON.parse(raw));
  } catch {
    return sanitize(DEFAULT_PRESETS);
  }
}

export function savePresets(list: PassivePreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(list)));
  } catch {
    // stockage indisponible (mode privé…) : les presets restent en mémoire
  }
}
