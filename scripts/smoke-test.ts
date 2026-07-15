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

// findPath : cible déjà possédée
const owned = [idx("Lamball"), idx("Cattiva"), idx("Chikipi")];
const p0 = findPath(owned, idx("Lamball"));
check("Cible possédée → 0 étape", p0 !== null && p0.steps.length === 0);

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
