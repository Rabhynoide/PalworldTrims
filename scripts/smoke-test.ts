// Test de fumée de la logique de breeding : node scripts/smoke-test.ts (via tsx)
import { pals } from "../src/lib/data";
import { resultsFor, combosFor } from "../src/lib/breeding";
import { findPath } from "../src/lib/pathfinder";
import { probAtLeastDesired } from "../src/lib/passives";

const byEn = new Map(pals.map((p, i) => [p.en, i]));
const idx = (en: string): number => {
  const i = byEn.get(en);
  if (i === undefined) throw new Error(`Pal inconnu : ${en}`);
  return i;
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
}

// resultsFor : combo genré Katress x Wixen → 2 résultats
const kw = resultsFor(idx("Katress"), idx("Wixen"));
check(
  "Katress x Wixen a 2 résultats genrés",
  kw.length === 2 && kw.every((o) => o.condition),
  kw.map((o) => pals[o.child].en).join(", ")
);

// combosFor : Jetragon uniquement lui-même
const jet = combosFor(idx("Jetragon"));
check("Jetragon : 1 seul combo (lui-même)", jet.length === 1);

// Cible déjà possédée → plan de duplication (l'exemplaire sert de parent)
const owned = [idx("Lamball"), idx("Cattiva"), idx("Chikipi")];
const pDup = findPassivePlan(
  owned.map((pal) => ({ pal, passives: [] })),
  idx("Lamball"),
  []
);
check(
  "Cible possédée → plan de duplication",
  pDup !== null &&
    pDup.alreadyOwned &&
    pDup.steps.length >= 1 &&
    pDup.steps[pDup.steps.length - 1].child === idx("Lamball"),
  pDup ? `${pDup.steps.length} étape(s)` : "null"
);

// findPath : chemin vers Anubis depuis des pals de départ
const pAnubis = findPath(owned, idx("Anubis"));
check(
  "Chemin vers Anubis trouvé",
  pAnubis !== null && pAnubis.steps.length > 0,
  pAnubis
    ? pAnubis.steps
        .map((s) => `${pals[s.p1].en} x ${pals[s.p2].en} -> ${pals[s.child].en}`)
        .join(" ; ")
    : "aucun"
);
// Chaque étape n'utilise que des pals déjà disponibles
if (pAnubis) {
  const avail = new Set(owned);
  let valid = true;
  for (const s of pAnubis.steps) {
    if (!avail.has(s.p1) || !avail.has(s.p2)) valid = false;
    avail.add(s.child);
  }
  check("Étapes dans un ordre valide", valid && avail.has(idx("Anubis")));
}

// findPath : Jetragon inaccessible sans le posséder
check("Jetragon inaccessible", findPath(owned, idx("Jetragon")) === null);

// Planificateur avec passifs
import { findPassivePlan } from "../src/lib/passivePathfinder";

const instances = [
  { pal: idx("Lamball"), passives: ["Legend", "PAL_rude"] },
  { pal: idx("Cattiva"), passives: [] },
  { pal: idx("Chikipi"), passives: ["Nocturnal"] },
];

// Cible avec passif porté par Lamball : le plan doit exister et propager Legend
const planLegend = findPassivePlan(instances, idx("Daedream"), ["Legend"]);
check(
  "Plan Daedream [Legend] trouvé",
  planLegend !== null && planLegend.steps.length > 0,
  planLegend ? `${planLegend.steps.length} étapes, ~${Math.ceil(planLegend.totalEggs)} œufs` : "null"
);
if (planLegend) {
  const last = planLegend.steps[planLegend.steps.length - 1];
  check(
    "Dernière étape : Daedream avec Legend",
    last.child === idx("Daedream") && last.childMask === 1
  );
  check(
    "Coût en œufs > nombre d'étapes (probabilités)",
    planLegend.totalEggs > planLegend.steps.length
  );
}

// Passif porté par personne → plan impossible
check(
  "Passif sans porteur → null",
  findPassivePlan(instances, idx("Daedream"), ["Musclehead"]) === null
);

// Sans passif souhaité : cohérent avec findPath
const planPlain = findPassivePlan(instances, idx("Anubis"), []);
check(
  "Plan sans passifs cohérent avec findPath",
  planPlain !== null && pAnubis !== null && planPlain.steps.length === pAnubis.steps.length
);

// Genres : deux femelles seulement → aucun couple possible → null
const twoFemales = [
  { pal: idx("Katress"), passives: [], gender: "FEMALE" as const },
  { pal: idx("Wixen"), passives: [], gender: "FEMALE" as const },
];
check(
  "Deux ♀ seulement → plan impossible",
  findPassivePlan(twoFemales, idx("Katress Ignis"), []) === null
);

// Genres corrects → combo genré en 1 étape
const goodPair = [
  { pal: idx("Katress"), passives: [], gender: "FEMALE" as const },
  { pal: idx("Wixen"), passives: [], gender: "MALE" as const },
];
const planIgnis = findPassivePlan(goodPair, idx("Katress Ignis"), []);
check(
  "Katress ♀ × Wixen ♂ → Katress Ignis en 1 étape",
  planIgnis !== null &&
    planIgnis.steps.length === 1 &&
    planIgnis.steps[0].condition !== undefined,
  planIgnis ? `${planIgnis.steps.length} étape(s)` : "null"
);

// Genre manquant élevable : ♂ A + ♀ B, cible exige ♂ B → le solveur doit
// d'abord élever un B ♂ (via A♂ × B♀) puis faire le combo.
const needMale = [
  { pal: idx("Katress"), passives: [], gender: "MALE" as const },
  { pal: idx("Wixen"), passives: [], gender: "FEMALE" as const },
];
const planNoct = findPassivePlan(needMale, idx("Katress Ignis"), []);
check(
  "Genre manquant élevé par le solveur (étapes > 1, coût genre inclus)",
  planNoct !== null &&
    planNoct.steps.length > 1 &&
    planNoct.steps.some((s) => s.childGender !== null && s.genderFactor > 1),
  planNoct
    ? planNoct.steps
        .map(
          (s) =>
            `${pals[s.p1].en} x ${pals[s.p2].en} -> ${pals[s.child].en}` +
            `${s.childGender ? "(" + s.childGender + ")" : ""}`
        )
        .join(" ; ") + ` ~${Math.ceil(planNoct.totalEggs)} œufs`
    : "null"
);

// Duplication : un légendaire seul ne peut pas être reproduit
const soloJet = findPassivePlan(
  [{ pal: idx("Jetragon"), passives: [], gender: "MALE" as const }],
  idx("Jetragon"),
  []
);
check(
  "Légendaire seul → possédé mais non duplicable",
  soloJet !== null && soloJet.alreadyOwned && soloJet.steps.length === 0
);

// Duplication avec passif : l'exemplaire possédé sert de porteur
const dupOwned = [
  { pal: idx("Daedream"), passives: ["Legend"], gender: "MALE" as const },
  { pal: idx("Lamball"), passives: [], gender: "MALE" as const },
  { pal: idx("Cattiva"), passives: [], gender: "FEMALE" as const },
];
const pDupLegend = findPassivePlan(dupOwned, idx("Daedream"), ["Legend"]);
check(
  "Duplication d'un pal possédé avec son passif",
  pDupLegend !== null &&
    pDupLegend.alreadyOwned &&
    pDupLegend.steps.length >= 2 &&
    pDupLegend.steps[pDupLegend.steps.length - 1].child === idx("Daedream") &&
    pDupLegend.steps[pDupLegend.steps.length - 1].childMask === 1,
  pDupLegend
    ? pDupLegend.steps
        .map((s) => `${pals[s.p1].en} x ${pals[s.p2].en} -> ${pals[s.child].en}`)
        .join(" ; ") + ` (~${Math.ceil(pDupLegend.totalEggs)} œufs)`
    : "null"
);

// Table d'opération : passif sans porteur mais opérable → plan + chirurgie
const noCarrier = [
  { pal: idx("Lamball"), passives: [], gender: "MALE" as const },
  { pal: idx("Cattiva"), passives: [], gender: "FEMALE" as const },
];
check(
  "Sans chirurgie : passif sans porteur → null",
  findPassivePlan(noCarrier, idx("Daedream"), ["Noukin"]) === null
);
const planSurgery = findPassivePlan(
  noCarrier,
  idx("Daedream"),
  ["Noukin"],
  undefined,
  ["Noukin"]
);
check(
  "Avec chirurgie : plan trouvé + Noukin en chirurgie",
  planSurgery !== null &&
    planSurgery.steps.length > 0 &&
    planSurgery.surgeries.length === 1 &&
    planSurgery.surgeries[0] === "Noukin",
  planSurgery
    ? `${planSurgery.steps.length} étape(s), chirurgies: ${planSurgery.surgeries.join(",")}`
    : "null"
);

// Passifs : 1 souhaité parmi 1 → 40%+30%+20%+10% = 100 %
check("1 passif sur 1 → 100 %", Math.abs(probAtLeastDesired(1, 1) - 1) < 1e-9);
// 4 souhaités parmi 8 → 10 % * C(4,0)/C(8,4) = 0.1/70
check(
  "4 passifs sur 8 → ~0,143 %",
  Math.abs(probAtLeastDesired(8, 4) - 0.1 / 70) < 1e-9,
  (probAtLeastDesired(8, 4) * 100).toFixed(3) + " %"
);
// 2 souhaités parmi 2 → 30%*1 + 20%*1 + 10%*1 = 60 %
check(
  "2 passifs sur 2 → 60 %",
  Math.abs(probAtLeastDesired(2, 2) - 0.6) < 1e-9
);

process.exit(failures > 0 ? 1 : 0);
