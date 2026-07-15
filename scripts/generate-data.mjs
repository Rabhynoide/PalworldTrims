// Génère les fichiers de données compacts de l'app à partir des datasets PalCalc
// (https://github.com/tylercamp/palcalc, licence MIT).
//
// Usage :
//   node scripts/generate-data.mjs [dossier-cache]
//
// Si un dossier-cache est fourni et contient palcalc-db.json / palcalc-breeding.json,
// ils sont utilisés ; sinon les fichiers sont téléchargés depuis GitHub.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_URL =
  "https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.Model/db.json";
const BREEDING_URL =
  "https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.Model/breeding.json";

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data"
);

async function loadJson(url, cacheFile) {
  if (cacheFile && fs.existsSync(cacheFile)) {
    console.log(`Lecture du cache : ${cacheFile}`);
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }
  console.log(`Téléchargement : ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return res.json();
}

const cacheDir = process.argv[2];
const db = await loadJson(
  DB_URL,
  cacheDir && path.join(cacheDir, "palcalc-db.json")
);
const breedingRaw = await loadJson(
  BREEDING_URL,
  cacheDir && path.join(cacheDir, "palcalc-breeding.json")
);

// ---- Pals ----------------------------------------------------------------

const genderProbs = db.BreedingGenderProbability;

const pals = db.Pals.map((p) => ({
  id: p.InternalName,
  dex: p.Id.PalDexNo,
  variant: p.Id.IsVariant,
  en: p.LocalizedNames["en"] ?? p.Name,
  fr: p.LocalizedNames["fr"] ?? p.Name,
  power: p.BreedingPower,
  rarity: p.Rarity,
  nocturnal: p.Nocturnal,
  maleProb: genderProbs?.[p.InternalName]?.MALE ?? 0.5,
})).sort((a, b) => a.dex - b.dex || (a.variant ? 1 : 0) - (b.variant ? 1 : 0));

const indexById = new Map(pals.map((p, i) => [p.id, i]));

// ---- Table de breeding ----------------------------------------------------

const entries = breedingRaw.Breeding;
console.log(`Entrées de breeding : ${entries.length}`);

const n = pals.length;
// Table triangulaire : pour i <= j, l'index du pal enfant (-1 si inconnu)
const table = new Int16Array((n * (n + 1)) / 2).fill(-1);
const triIndex = (i, j) => {
  if (i > j) [i, j] = [j, i];
  return i * n - (i * (i - 1)) / 2 + (j - i);
};

const gendered = [];
let unknownParents = 0;

for (const e of entries) {
  const i = indexById.get(e.Parent1InternalName);
  const j = indexById.get(e.Parent2InternalName);
  const c = indexById.get(e.ChildInternalName);
  if (i === undefined || j === undefined || c === undefined) {
    unknownParents++;
    continue;
  }
  if (e.Parent1Gender === "WILDCARD" && e.Parent2Gender === "WILDCARD") {
    const t = triIndex(i, j);
    if (table[t] !== -1 && table[t] !== c) {
      console.warn(
        `Conflit pour ${e.Parent1InternalName} x ${e.Parent2InternalName}: ` +
          `${pals[table[t]].id} vs ${pals[c].id}`
      );
    }
    table[t] = c;
  } else {
    gendered.push({
      p1: i,
      g1: e.Parent1Gender,
      p2: j,
      g2: e.Parent2Gender,
      child: c,
    });
  }
}

if (unknownParents > 0)
  console.warn(`${unknownParents} entrées avec un pal inconnu ignorées`);

const missing = table.filter((v) => v === -1).length;
console.log(
  `Table : ${table.length} paires, ${missing} sans résultat, ${gendered.length} combos genrés`
);

// ---- Passifs ---------------------------------------------------------------

const passives = db.PassiveSkills.filter((s) => s.IsStandardPassiveSkill)
  .map((s) => ({
    id: s.InternalName,
    en: s.LocalizedNames?.["en"] ?? s.Name,
    fr: s.LocalizedNames?.["fr"] ?? s.Name,
    rank: s.Rank,
    frDesc: s.LocalizedDescriptions?.["fr"] ?? null,
    inheritable: s.RandomInheritanceAllowed,
  }))
  .sort((a, b) => a.fr.localeCompare(b.fr, "fr"));

console.log(`Passifs standards : ${passives.length}`);

// ---- Écriture ---------------------------------------------------------------

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pals.json"), JSON.stringify(pals));
fs.writeFileSync(
  path.join(outDir, "breeding.json"),
  JSON.stringify({ table: Array.from(table), gendered })
);
fs.writeFileSync(path.join(outDir, "passives.json"), JSON.stringify(passives));

console.log(`Fichiers écrits dans ${outDir}`);
