// Génère les fichiers de données de l'app à partir des exports FModel du jeu
// (dossier ExportedData/). Aucune source externe n'est nécessaire.
//
// Usage :
//   node scripts/generate-data.mjs
//
// Tables attendues (export JSON via FModel) :
//   ExportedData/Pal/DataTable/Character/DT_PalMonsterParameter.json
//   ExportedData/Pal/DataTable/Character/DT_PalCombiUnique.json
//   ExportedData/Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main.json
//   ExportedData/L10N/fr/Pal/DataTable/Text/DT_PalNameText_Common.json
//   ExportedData/L10N/fr/Pal/DataTable/Text/DT_SkillNameText_Common.json
//   ExportedData/L10N/fr/Pal/DataTable/Text/DT_SkillDescText_Common.json
// Optionnel (améliore les noms anglais pour la recherche) :
//   ExportedData/L10N/en/... (mêmes tables de texte)
//
// L'enfant d'un croisement est calculé comme dans le jeu :
//   1. deux parents de même espèce donnent la même espèce ;
//   2. les paires listées dans DT_PalCombiUnique donnent leur enfant unique
//      (certaines dépendent du genre des parents) ;
//   3. sinon, rang cible = (rang1 + rang2 + 1) / 2 (flottant), et l'enfant
//      est le candidat au CombiRank le plus proche — les candidats étant les
//      pals avec IgnoreCombi = false qui ne sont pas des enfants de combo
//      unique ; à rang égal, CombiDuplicatePriority le plus bas gagne.
// Cette logique a été validée : elle reproduit à l'identique les 44 850
// paires de la table de référence de PalCalc (version 1.0 du jeu).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportedDir = path.join(root, "ExportedData");
const outDir = path.join(root, "src", "data");

function loadTable(relPath, { optional = false } = {}) {
  const file = path.join(exportedDir, relPath);
  if (!fs.existsSync(file)) {
    if (optional) return null;
    throw new Error(`Fichier manquant : ${file}`);
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return parsed[0].Rows;
}

const stripEnum = (v) => (typeof v === "string" ? v.replace(/^E\w+::/, "") : v);

// ---- Chargement -------------------------------------------------------------

const monsterParams = loadTable(
  "Pal/DataTable/Character/DT_PalMonsterParameter.json"
);
const combiUnique = loadTable("Pal/DataTable/Character/DT_PalCombiUnique.json");
const passiveMain = loadTable(
  "Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main.json"
);

const textTable = (lang, name) =>
  loadTable(`L10N/${lang}/Pal/DataTable/Text/${name}.json`, {
    optional: lang !== "fr",
  });

const palNamesFr = textIndex(textTable("fr", "DT_PalNameText_Common"));
const skillNamesFr = textIndex(textTable("fr", "DT_SkillNameText_Common"));
const skillDescFr = textIndex(textTable("fr", "DT_SkillDescText_Common"));
const palNamesEn = textIndex(textTable("en", "DT_PalNameText_Common"));
const skillNamesEn = textIndex(textTable("en", "DT_SkillNameText_Common"));

// Les clés des tables de texte n'ont pas toujours la même casse que les
// identifiants (ex. WindChimes -> PAL_NAME_Windchimes) : index insensible
// à la casse, valeurs nettoyées des espaces parasites du jeu.
function textIndex(rows) {
  const map = new Map();
  if (!rows) return map;
  for (const [key, value] of Object.entries(rows)) {
    map.set(key.toLowerCase(), {
      localized: value.TextData?.LocalizedString?.trim() ?? null,
      source: value.TextData?.SourceString?.trim() ?? null,
    });
  }
  return map;
}

const localized = (index, key) => index.get(key.toLowerCase())?.localized ?? null;
const sourceOf = (index, key) => index.get(key.toLowerCase())?.source ?? null;

// ---- Pals -------------------------------------------------------------------

const EXCLUDED_KEY = /^(BOSS|RAID|GYM|SUMMON|PREDATOR)_|Quest/;

// Pals référencés par la table des combos uniques (parents ou enfants) :
// certains pals obtenables n'ont pas d'entrée Paldex (ex. collab Terraria,
// ZukanIndex = -1) mais participent au breeding via cette table.
const combiUniqueRefs = new Set();
for (const row of Object.values(combiUnique)) {
  combiUniqueRefs.add(stripEnum(row.ParentTribeA));
  combiUniqueRefs.add(stripEnum(row.ParentTribeB));
  combiUniqueRefs.add(row.ChildCharacterID);
}

const palRows = Object.entries(monsterParams).filter(([key, row]) => {
  if (!row.IsPal || EXCLUDED_KEY.test(key)) return false;
  // Versions ennemies non capturables (boss de tour, plateforme pétrolière…)
  if (row.IsBoss || row.IsTowerBoss || row.IsRaidBoss) return false;
  if (row.CombiRank >= 9999) return false;
  // Placeholder sans type ni genus : boss d'histoire non capturable (Astralym)
  if (
    stripEnum(row.ElementType1) === "None" &&
    stripEnum(row.GenusCategory) === "None"
  )
    return false;
  const inCombiUnique =
    combiUniqueRefs.has(stripEnum(row.Tribe)) || combiUniqueRefs.has(key);
  return row.ZukanIndex > 0 || inCombiUnique;
});

// Aptitudes de travail (niveaux 0-5) ; on ne garde que les non nulles.
const WORK_FIELDS = {
  EmitFlame: "kindling",
  Watering: "watering",
  Seeding: "planting",
  GenerateElectricity: "electricity",
  Handcraft: "handiwork",
  Collection: "gathering",
  Deforest: "lumbering",
  Mining: "mining",
  OilExtraction: "oil",
  ProductMedicine: "medicine",
  Cool: "cooling",
  Transport: "transport",
  MonsterFarm: "farming",
};

const pals = palRows
  .map(([key, row]) => {
    const work = {};
    for (const [suffix, workKey] of Object.entries(WORK_FIELDS)) {
      const v = row[`WorkSuitability_${suffix}`];
      if (v > 0) work[workKey] = v;
    }
    const nameKey =
      stripEnum(row.OverrideNameTextID) !== "None"
        ? row.OverrideNameTextID
        : `PAL_NAME_${key}`;
    const fr = localized(palNamesFr, nameKey) ?? key;
    // Sans export L10N/en, le SourceString du fichier FR sert de repli
    // (c'est en général le texte anglais d'origine).
    const en = localized(palNamesEn, nameKey) ?? sourceOf(palNamesFr, nameKey) ?? key;
    const elements = [row.ElementType1, row.ElementType2]
      .map(stripEnum)
      .filter((e) => e && e !== "None");
    return {
      id: key,
      tribe: stripEnum(row.Tribe),
      dex: row.ZukanIndex,
      variant: row.ZukanIndexSuffix !== "",
      en,
      fr,
      power: row.CombiRank,
      priority: row.CombiDuplicatePriority,
      breedable: !row.IgnoreCombi,
      elements,
      rarity: row.Rarity,
      nocturnal: row.Nocturnal,
      maleProb: row.MaleProbability / 100,
      work,
    };
  })
  .sort((a, b) => {
    // Les pals sans entrée Paldex (dex -1, ex. collab Terraria) en fin de liste.
    const da = a.dex > 0 ? a.dex : Number.MAX_SAFE_INTEGER;
    const db = b.dex > 0 ? b.dex : Number.MAX_SAFE_INTEGER;
    return (
      da - db ||
      (a.variant ? 1 : 0) - (b.variant ? 1 : 0) ||
      a.fr.localeCompare(b.fr, "fr")
    );
  });

const indexById = new Map(pals.map((p, i) => [p.id, i]));
const indexByTribe = new Map(pals.map((p, i) => [p.tribe, i]));
console.log(`Pals : ${pals.length}`);

// ---- Combos uniques ----------------------------------------------------------

const uniqueWildcard = new Map(); // "i|j" (i<=j) -> index enfant
const gendered = []; // combos dépendant du genre
// Enfants de combos uniques : uniquement obtenables via leur combo (ou en
// croisant deux parents de leur espèce), jamais par la formule générale.
const uniqueChildren = new Set();
let skippedUnique = 0;

for (const row of Object.values(combiUnique)) {
  const p1 = indexByTribe.get(stripEnum(row.ParentTribeA));
  const p2 = indexByTribe.get(stripEnum(row.ParentTribeB));
  const child = indexById.get(row.ChildCharacterID);
  const g1 = stripEnum(row.ParentGenderA);
  const g2 = stripEnum(row.ParentGenderB);
  if (child !== undefined) uniqueChildren.add(child);
  if (p1 === undefined || p2 === undefined || child === undefined) {
    skippedUnique++;
    continue;
  }
  if (g1 === "None" && g2 === "None") {
    uniqueWildcard.set(`${Math.min(p1, p2)}|${Math.max(p1, p2)}`, child);
  } else {
    gendered.push({
      p1,
      g1: g1.toUpperCase(),
      p2,
      g2: g2.toUpperCase(),
      child,
    });
  }
}
if (skippedUnique > 0)
  console.warn(`${skippedUnique} combos uniques ignorés (pal hors liste)`);
console.log(
  `Combos uniques : ${uniqueWildcard.size} neutres + ${gendered.length} genrés`
);

// ---- Table de breeding (formule du jeu) ---------------------------------------

// Candidats de la formule : pals reproductibles hors enfants de combo unique.
const candidates = pals
  .map((p, i) => ({ i, power: p.power, priority: p.priority }))
  .filter(({ i }) => pals[i].breedable && !uniqueChildren.has(i))
  .sort((a, b) => a.power - b.power || a.priority - b.priority);
console.log(`Candidats de la formule : ${candidates.length}`);

function formulaChild(i, j) {
  // Cible flottante : toujours en x,5 (les rangs sont pairs), ce qui
  // départage naturellement deux candidats encadrant la moyenne.
  const target = (pals[i].power + pals[j].power + 1) / 2;
  let best = -1;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c.power - target);
    // Les candidats sont triés par (rang, priorité) : à rang égal,
    // le premier rencontré (priorité la plus basse) est conservé.
    if (dist < bestDist) {
      best = c.i;
      bestDist = dist;
    }
  }
  return best;
}

const genderedPairs = new Set(
  gendered.map((g) => `${Math.min(g.p1, g.p2)}|${Math.max(g.p1, g.p2)}`)
);

const n = pals.length;
const table = new Int16Array((n * (n + 1)) / 2).fill(-1);
let k = 0;
for (let i = 0; i < n; i++) {
  for (let j = i; j < n; j++, k++) {
    const key = `${i}|${j}`;
    if (genderedPairs.has(key)) continue; // pas de résultat neutre
    if (i === j) table[k] = i; // même espèce -> même espèce
    else if (uniqueWildcard.has(key)) table[k] = uniqueWildcard.get(key);
    else table[k] = formulaChild(i, j);
  }
}
console.log(`Table : ${table.length} paires calculées`);

// ---- Passifs -------------------------------------------------------------------

// Table d'opération : passifs ajoutables par chirurgie (prix + objet requis).
const surgeryRows = loadTable(
  "Pal/DataTable/MapObject/DT_OperatingTablePassiveSkillDataTable.json",
  { optional: true }
);
const itemNamesFr = textIndex(textTable("fr", "DT_ItemNameText_Common"));
const surgeryByPassive = new Map();
if (surgeryRows) {
  for (const row of Object.values(surgeryRows)) {
    const item = row.RequireItemId !== "None" ? row.RequireItemId : null;
    surgeryByPassive.set(row.PassiveSkill, {
      price: row.Price,
      item,
      itemFr: item ? localized(itemNamesFr, `ITEM_NAME_${item}`) : null,
    });
  }
  console.log(`Passifs opérables (table d'opération) : ${surgeryByPassive.size}`);
} else {
  console.warn(
    "DT_OperatingTablePassiveSkillDataTable.json absent : pas de données de chirurgie"
  );
}

const passives = Object.entries(passiveMain)
  .filter(([id, row]) => {
    return (
      stripEnum(row.Category) === "SortDisplayable" &&
      localized(skillNamesFr, `PASSIVE_${id}`) !== null &&
      !row.AddShotWeapon &&
      !row.AddMeleeWeapon &&
      !row.AddArmor &&
      !row.AddAccessory
    );
  })
  .map(([id, row]) => {
    const nameKey = `PASSIVE_${id}`;
    const descKey =
      stripEnum(row.OverrideDescMsgID) !== "None"
        ? row.OverrideDescMsgID
        : `PASSIVE_${id}_DESC`;
    const rawDesc =
      localized(skillDescFr, descKey) ?? localized(skillDescFr, nameKey);
    const frDesc = rawDesc
      ?.replace(/\{EffectValue(\d)\}/g, (_, n) => String(row[`EffectValue${n}`]))
      .replace(/\r\n/g, "\n");
    return {
      id,
      en:
        localized(skillNamesEn, nameKey) ??
        sourceOf(skillNamesFr, nameKey) ??
        id,
      fr: localized(skillNamesFr, nameKey) ?? id,
      rank: row.Rank,
      frDesc: frDesc ?? null,
      inheritable: row.AddPal,
      surgery: surgeryByPassive.get(id) ?? null,
    };
  })
  .sort((a, b) => a.fr.localeCompare(b.fr, "fr"));

console.log(`Passifs standards : ${passives.length}`);

// ---- Écriture -------------------------------------------------------------------

// Champs internes au générateur retirés de la sortie.
const outPals = pals.map(({ tribe: _t, priority: _p, ...keep }) => keep);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pals.json"), JSON.stringify(outPals));
fs.writeFileSync(
  path.join(outDir, "breeding.json"),
  JSON.stringify({ table: Array.from(table), gendered })
);
fs.writeFileSync(path.join(outDir, "passives.json"), JSON.stringify(passives));

console.log(`Fichiers écrits dans ${outDir}`);
