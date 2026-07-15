// Test de performance ponctuel du planificateur avec les données serveur
// (public/owned.json). Usage : npx tsx scripts/perf-test.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pals, passives } from "../src/lib/data";
import { findPassivePlan, type OwnedInstance } from "../src/lib/passivePathfinder";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const owned = JSON.parse(
  fs.readFileSync(path.join(root, "public", "owned.json"), "utf8")
);
const player = owned.players[owned.players.length > 1 ? 1 : 0];
console.log(`Joueur: ${player.name}`);

const byId = new Map(pals.map((p, i) => [p.id, i]));
const instances: OwnedInstance[] = player.pals
  .map((op: { id: string; passives: string[]; gender?: "MALE" | "FEMALE" | null }) => ({
    pal: byId.get(op.id),
    passives: op.passives,
    gender: op.gender ?? null,
  }))
  .filter((x: { pal: number | undefined }) => x.pal !== undefined);

console.log(`Instances: ${instances.length}`);

const freq = new Map<string, number>();
for (const inst of instances)
  for (const p of inst.passives) freq.set(p, (freq.get(p) ?? 0) + 1);
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(
  "Passifs fréquents:",
  top.map(([id, n]) => `${id}(${n})`).join(", ")
);

const desired = top.slice(0, 4).map(([id]) => id);
const target = byId.get("Anubis")!;
console.log(`Cible: Anubis + [${desired.join(", ")}]`);

const t0 = Date.now();
const plan = findPassivePlan(instances, target, desired);
const dt = Date.now() - t0;

console.log(`\nTemps de calcul: ${dt} ms`);
if (!plan) {
  console.log("Aucun plan");
} else {
  const frOf = (id: string) => passives.find((p) => p.id === id)?.fr ?? id;
  const maskNames = (mask: number) =>
    desired.filter((_, k) => mask & (1 << k)).map(frOf).join("+") || "-";
  console.log(
    `Étapes: ${plan.steps.length}, œufs estimés: ${Math.ceil(plan.totalEggs)}`
  );
  console.log(
    "Sources:",
    plan.sources.map((s) => `${pals[s.pal].en}[${maskNames(s.mask)}]`).join(", ")
  );
  for (const s of plan.steps) {
    console.log(
      `  ${pals[s.p1].en}[${maskNames(s.p1Mask)}] x ${pals[s.p2].en}[${maskNames(s.p2Mask)}]` +
        ` -> ${pals[s.child].en}[${maskNames(s.childMask)}] (~${s.eggs.toFixed(1)} œufs)`
    );
  }
}
