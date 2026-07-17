/**
 * Planificateur de breeding avec passifs et genres.
 *
 * On cherche le chemin le moins coûteux (en œufs estimés) pour obtenir un
 * pal cible portant un ensemble de passifs souhaités (0 à 4), à partir des
 * pals possédés (passifs et genre réels).
 *
 * Modèle : un état = (espèce, sous-ensemble des passifs souhaités, genre),
 * le genre étant « indifférent », ♂ ou ♀. Chaque croisement exige un parent
 * ♂ et un parent ♀ ; obtenir un enfant d'un genre précis multiplie le nombre
 * d'œufs par 1 / P(genre). Si un genre manque parmi les pals possédés, le
 * solveur intègre donc naturellement le coût pour l'élever — ou déclare le
 * plan impossible s'il n'existe aucun couple viable.
 *
 * Approximations volontaires (estimation) :
 * - les intermédiaires sont supposés n'avoir hérité que des passifs voulus ;
 * - les passifs aléatoires ajoutés à l'éclosion sont ignorés ;
 * - quand les deux genres d'un couple sont libres, on fixe l'assignation la
 *   moins chère au lieu de modéliser l'appariement opportuniste.
 */

import { palCount, childOf, gendered, pals } from "./data";
import { probAtLeastDesired } from "./passives";
import type { Gender } from "../types";

export interface OwnedInstance {
  pal: number;
  passives: string[];
  gender?: Gender | null;
  level?: number;
  ivs?: { hp: number; attack: number; defense: number } | null;
  nickname?: string | null;
}

export type PlanRef =
  | { type: "step"; index: number }
  | { type: "source"; index: number };

export interface PlanStep {
  p1: number;
  p1Mask: number;
  p1Gender: Gender | null;
  p1Ref: PlanRef;
  p2: number;
  p2Mask: number;
  p2Gender: Gender | null;
  p2Ref: PlanRef;
  child: number;
  childMask: number;
  /** Genre requis de l'enfant pour la suite du plan (null si indifférent). */
  childGender: Gender | null;
  /** Combo unique dépendant du genre (Katress ♀ × Wixen ♂…). */
  condition?: { g1: Gender; g2: Gender };
  /** Probabilité d'hériter des passifs requis (par œuf, hors genre). */
  prob: number;
  /** Nombre moyen d'œufs, genre inclus. */
  eggs: number;
  /** Facteur multiplicatif dû au genre requis de l'enfant. */
  genderFactor: number;
}

export interface PlanSource {
  pal: number;
  mask: number;
  instance: number;
}

export interface PlanResult {
  steps: PlanStep[];
  sources: PlanSource[];
  totalEggs: number;
  /** Passifs souhaités à ajouter via la table d'opération en fin de plan. */
  surgeries: string[];
  warnings: string[];
  /** La cible est déjà possédée : steps est alors un plan de duplication
   *  (vide si la duplication est impossible). */
  alreadyOwned: boolean;
}

const POPCOUNT = new Uint8Array(1 << 16);
for (let i = 1; i < 1 << 16; i++) POPCOUNT[i] = POPCOUNT[i >> 1] + (i & 1);

// Créneaux de genre d'un état : 0 = indifférent, 1 = ♂, 2 = ♀.
const ANY = 0;
const MALE = 1;
const FEMALE = 2;
const SLOT_GENDER: (Gender | null)[] = [null, "MALE", "FEMALE"];

const ivSum = (inst: OwnedInstance) =>
  inst.ivs ? inst.ivs.hp + inst.ivs.attack + inst.ivs.defense : -1;

export function findPassivePlan(
  owned: OwnedInstance[],
  target: number,
  desired: string[],
  /** Appelé pendant le calcul : numéro de passe et avancement 0-1 dans la passe. */
  onProgress?: (sweep: number, fraction: number) => void,
  /** Passifs souhaités pouvant être ajoutés via la table d'opération. */
  surgeryAllowed?: string[]
): PlanResult | null {
  if (owned.length === 0) return null;
  const m = desired.length;
  const M = 1 << m;
  const FULL = M - 1;
  const size = palCount * M * 3;

  const INF = Number.POSITIVE_INFINITY;
  const cost = new Float64Array(size).fill(INF);
  // Passifs « parasites » de l'état représentatif (gonflent le pool du
  // prochain croisement) : pour les pals possédés, leurs autres passifs.
  const junk = new Int16Array(size);
  const fromP1 = new Int32Array(size).fill(-1); // index d'état parent (avec créneau)
  const fromP2 = new Int32Array(size).fill(-1);
  const fromCondIdx = new Int32Array(size).fill(-1); // index dans gendered
  const sourceOf = new Int32Array(size).fill(-1);
  const stepProb = new Float64Array(size).fill(1);

  const stateIdx = (pal: number, mask: number, slot: number) =>
    (pal * M + mask) * 3 + slot;

  const genderProbOf = (species: number, slot: number): number => {
    if (slot === MALE) return pals[species].maleProb;
    if (slot === FEMALE) return 1 - pals[species].maleProb;
    return 1;
  };

  const desiredIndex = new Map(desired.map((id, k) => [id, k]));

  // États initiaux : chaque instance couvre tous les sous-ensembles de ses
  // passifs souhaités, dans son genre (+ « indifférent »). À couverture
  // égale : moins de parasites, puis meilleure somme d'IVs.
  for (let k = 0; k < owned.length; k++) {
    const inst = owned[k];
    let mask = 0;
    for (const p of inst.passives) {
      const bit = desiredIndex.get(p);
      if (bit !== undefined) mask |= 1 << bit;
    }
    const slots =
      inst.gender === "MALE"
        ? [ANY, MALE]
        : inst.gender === "FEMALE"
          ? [ANY, FEMALE]
          : [ANY, MALE, FEMALE]; // genre inconnu (ajout manuel) : optimiste
    for (let sub = mask; ; sub = (sub - 1) & mask) {
      const j = inst.passives.length - POPCOUNT[sub];
      for (const slot of slots) {
        const id = stateIdx(inst.pal, sub, slot);
        const better =
          cost[id] > 0 ||
          junk[id] > j ||
          (junk[id] === j &&
            sourceOf[id] !== -1 &&
            ivSum(owned[sourceOf[id]]) < ivSum(inst));
        if (better) {
          cost[id] = 0;
          junk[id] = j;
          sourceOf[id] = k;
        }
      }
      if (sub === 0) break;
    }
  }

  // Table des probabilités d'héritage : pool ≤ 12 (4 souhaités + 2×4
  // parasites), nombre souhaité ≤ 4.
  const MAX_POOL = 12;
  const probTable = new Float64Array((MAX_POOL + 1) * (m + 1));
  for (let pool = 0; pool <= MAX_POOL; pool++) {
    for (let d = 0; d <= m; d++) {
      probTable[pool * (m + 1) + d] = probAtLeastDesired(pool, d);
    }
  }

  // Masques actifs par espèce (au moins un créneau de coût fini).
  const activeMasks: number[][] = Array.from({ length: palCount }, () => []);
  const refreshActive = () => {
    for (let i = 0; i < palCount; i++) {
      activeMasks[i].length = 0;
      for (let s = 0; s < M; s++) {
        const base = (i * M + s) * 3;
        if (cost[base] !== INF || cost[base + 1] !== INF || cost[base + 2] !== INF) {
          activeMasks[i].push(s);
        }
      }
    }
  };
  refreshActive();

  // Balayage incrémental : au tour suivant, seules les paires dont une
  // espèce a été améliorée sont recombinées (worklist à la Bellman-Ford).
  let dirtyPrev = new Uint8Array(palCount).fill(1);
  let dirtyNext = new Uint8Array(palCount);
  let changed = true;

  // Coûts « élevé » de l'espèce cible, jamais court-circuités par la
  // possession (cost[] tombe à 0 dès qu'on possède l'état) : nécessaires
  // pour proposer un plan de duplication d'un pal déjà possédé.
  const bredCost = new Float64Array(M * 3).fill(INF);
  const bredP1 = new Int32Array(M * 3).fill(-1);
  const bredP2 = new Int32Array(M * 3).fill(-1);
  const bredCondIdx = new Int32Array(M * 3).fill(-1);
  const bredProb = new Float64Array(M * 3).fill(1);

  // Relaxe l'enfant (toutes variantes de genre) pour une paire de parents
  // donnée avec leurs créneaux de genre fixés.
  const relaxChild = (
    child: number,
    u: number,
    pairCost: number,
    prob: number,
    p1Idx: number,
    p2Idx: number,
    condIdx: number
  ) => {
    const baseEggs = 1 / prob;
    for (let slot = 0; slot < 3; slot++) {
      const gp = genderProbOf(child, slot);
      if (gp <= 0) continue;
      const cand = pairCost + baseEggs / gp;
      // Obtenir u couvre aussi tous ses sous-ensembles (borne supérieure).
      for (let t = u; ; t = (t - 1) & u) {
        const idT = stateIdx(child, t, slot);
        if (cand < cost[idT] - 1e-9) {
          cost[idT] = cand;
          junk[idT] = 0;
          fromP1[idT] = p1Idx;
          fromP2[idT] = p2Idx;
          fromCondIdx[idT] = condIdx;
          sourceOf[idT] = -1;
          stepProb[idT] = prob;
          changed = true;
          dirtyNext[child] = 1;
        }
        if (child === target) {
          const idB = t * 3 + slot;
          if (cand < bredCost[idB] - 1e-9) {
            bredCost[idB] = cand;
            bredP1[idB] = p1Idx;
            bredP2[idB] = p2Idx;
            bredCondIdx[idB] = condIdx;
            bredProb[idB] = prob;
          }
        }
        if (t === 0) break;
      }
    }
  };

  const combine = (i: number, j: number, child: number, condIdx: number) => {
    const masksI = activeMasks[i];
    const masksJ = activeMasks[j];
    // Assignations de genre possibles pour (parent i, parent j).
    const edge = condIdx !== -1 ? gendered[condIdx] : null;
    const assignments: [number, number][] = edge
      ? [
          [
            edge.g1 === "MALE" ? MALE : FEMALE,
            edge.g2 === "MALE" ? MALE : FEMALE,
          ],
        ]
      : [
          [MALE, FEMALE],
          [FEMALE, MALE],
        ];
    for (const s1 of masksI) {
      for (const s2 of masksJ) {
        const u = s1 | s2;
        for (const [slot1, slot2] of assignments) {
          const id1 = stateIdx(i, s1, slot1);
          const id2 = stateIdx(j, s2, slot2);
          const pairCost = cost[id1] + cost[id2];
          if (pairCost === INF) continue;
          const pool = Math.min(POPCOUNT[u] + junk[id1] + junk[id2], MAX_POOL);
          const prob = probTable[pool * (m + 1) + POPCOUNT[u]];
          if (prob <= 0) continue;
          relaxChild(child, u, pairCost, prob, id1, id2, condIdx);
        }
      }
    }
  };

  let sweep = 0;
  while (changed) {
    changed = false;
    sweep++;
    dirtyNext.fill(0);
    for (let i = 0; i < palCount; i++) {
      if ((i & 15) === 0) onProgress?.(sweep, i / palCount);
      if (activeMasks[i].length === 0) continue;
      for (let j = i; j < palCount; j++) {
        if (activeMasks[j].length === 0) continue;
        if (!dirtyPrev[i] && !dirtyPrev[j]) continue;
        const c = childOf(i, j);
        if (c !== -1) combine(i, j, c, -1);
      }
    }
    for (let g = 0; g < gendered.length; g++) {
      const edge = gendered[g];
      if (
        (dirtyPrev[edge.p1] || dirtyPrev[edge.p2]) &&
        activeMasks[edge.p1].length > 0 &&
        activeMasks[edge.p2].length > 0
      ) {
        combine(edge.p1, edge.p2, edge.child, g);
      }
    }
    if (changed) {
      refreshActive();
      [dirtyPrev, dirtyNext] = [dirtyNext, dirtyPrev];
    }
  }

  // Masque des passifs qui doivent impérativement être hérités : ceux
  // autorisés en chirurgie peuvent manquer à l'éclosion (ajoutés ensuite).
  let operableMask = 0;
  if (surgeryAllowed) {
    for (const id of surgeryAllowed) {
      const bit = desiredIndex.get(id);
      if (bit !== undefined) operableMask |= 1 << bit;
    }
  }
  const requiredMask = FULL & ~operableMask;

  // Meilleur état cible : masque couvrant au moins les passifs requis, au
  // coût en œufs minimal ; à coût égal, le moins de chirurgies.
  let targetIdx = -1;
  let bestCost = INF;
  let bestSurgeries = Infinity;
  for (let u = 0; u < M; u++) {
    if ((u & requiredMask) !== requiredMask) continue;
    const idx = stateIdx(target, u, ANY);
    const c = cost[idx];
    if (c === INF) continue;
    const numSurgeries = POPCOUNT[FULL & ~u];
    if (c < bestCost - 1e-9 || (c < bestCost + 1e-9 && numSurgeries < bestSurgeries)) {
      bestCost = c;
      bestSurgeries = numSurgeries;
      targetIdx = idx;
    }
  }
  if (targetIdx === -1) return null;

  // Cible déjà possédée : on propose un plan de duplication — reproduire un
  // exemplaire équivalent, en utilisant les pals possédés (dont l'original)
  // comme reproducteurs. Sélection sur les coûts « élevé » uniquement.
  const alreadyOwned = sourceOf[targetIdx] !== -1;
  let dupIdx = -1;
  if (alreadyOwned) {
    let dupBest = INF;
    let dupSurgeries = Infinity;
    for (let u = 0; u < M; u++) {
      if ((u & requiredMask) !== requiredMask) continue;
      const idx = u * 3 + ANY;
      const c = bredCost[idx];
      if (c === INF) continue;
      const numSurgeries = POPCOUNT[FULL & ~u];
      if (c < dupBest - 1e-9 || (c < dupBest + 1e-9 && numSurgeries < dupSurgeries)) {
        dupBest = c;
        dupSurgeries = numSurgeries;
        dupIdx = idx;
      }
    }
    if (dupIdx === -1) {
      // Possédé mais impossible à reproduire (ex. légendaire unique).
      return {
        steps: [],
        sources: [],
        totalEggs: 0,
        surgeries: [],
        warnings: [],
        alreadyOwned: true,
      };
    }
  }

  const targetMask = alreadyOwned
    ? Math.floor(dupIdx / 3)
    : Math.floor(targetIdx / 3) % M;
  const surgeries = desired.filter((_, k) => (FULL & ~targetMask) & (1 << k));

  // --- Reconstruction post-ordre --------------------------------------------
  // Un état déjà produit couvre les demandes de masque inclus et de genre
  // identique (ou indifférent) ; il est alors référencé, pas reproduit.
  const steps: PlanStep[] = [];
  const sources: PlanSource[] = [];
  const sourceRefByInstance = new Map<number, number>();
  const producedSteps = new Map<number, { mask: number; slot: number; step: number }[]>();

  const visit = (idx: number): PlanRef => {
    const slot = idx % 3;
    const stateId = (idx - slot) / 3;
    const pal = Math.floor(stateId / M);
    const mask = stateId % M;

    if (sourceOf[idx] !== -1) {
      const inst = sourceOf[idx];
      let refIdx = sourceRefByInstance.get(inst);
      if (refIdx === undefined) {
        refIdx = sources.length;
        sourceRefByInstance.set(inst, refIdx);
        sources.push({ pal, mask, instance: inst });
      }
      return { type: "source", index: refIdx };
    }

    const produced = producedSteps.get(pal);
    const covering = produced?.find(
      (p) => (p.mask & mask) === mask && (slot === ANY || p.slot === slot)
    );
    if (covering) return { type: "step", index: covering.step };

    const p1 = fromP1[idx];
    const p2 = fromP2[idx];
    const p1Ref = visit(p1);
    const p2Ref = visit(p2);

    const condIdx = fromCondIdx[idx];
    const gp = genderProbOf(pal, slot);
    const genderFactor = slot === ANY ? 1 : 1 / Math.max(gp, 1e-6);

    const stepIndex = steps.length;
    const p1Slot = p1 % 3;
    const p2Slot = p2 % 3;
    const p1State = (p1 - p1Slot) / 3;
    const p2State = (p2 - p2Slot) / 3;
    steps.push({
      p1: Math.floor(p1State / M),
      p1Mask: p1State % M,
      p1Gender: SLOT_GENDER[p1Slot],
      p1Ref,
      p2: Math.floor(p2State / M),
      p2Mask: p2State % M,
      p2Gender: SLOT_GENDER[p2Slot],
      p2Ref,
      child: pal,
      childMask: mask,
      childGender: SLOT_GENDER[slot],
      condition:
        condIdx !== -1
          ? { g1: gendered[condIdx].g1, g2: gendered[condIdx].g2 }
          : undefined,
      prob: stepProb[idx],
      eggs: genderFactor / stepProb[idx],
      genderFactor,
    });
    if (!producedSteps.has(pal)) producedSteps.set(pal, []);
    producedSteps.get(pal)!.push({ mask, slot, step: stepIndex });
    return { type: "step", index: stepIndex };
  };
  if (!alreadyOwned) {
    visit(targetIdx);
  } else {
    // Étape finale de duplication : parents reconstruits normalement (dont
    // l'exemplaire possédé), enfant sans contrainte de genre.
    const p1 = bredP1[dupIdx];
    const p2 = bredP2[dupIdx];
    const p1Ref = visit(p1);
    const p2Ref = visit(p2);
    const condIdx = bredCondIdx[dupIdx];
    const p1Slot = p1 % 3;
    const p2Slot = p2 % 3;
    const p1State = (p1 - p1Slot) / 3;
    const p2State = (p2 - p2Slot) / 3;
    steps.push({
      p1: Math.floor(p1State / M),
      p1Mask: p1State % M,
      p1Gender: SLOT_GENDER[p1Slot],
      p1Ref,
      p2: Math.floor(p2State / M),
      p2Mask: p2State % M,
      p2Gender: SLOT_GENDER[p2Slot],
      p2Ref,
      child: target,
      childMask: targetMask,
      childGender: null,
      condition:
        condIdx !== -1
          ? { g1: gendered[condIdx].g1, g2: gendered[condIdx].g2 }
          : undefined,
      prob: bredProb[dupIdx],
      eggs: 1 / bredProb[dupIdx],
      genderFactor: 1,
    });
  }

  const totalEggs = steps.reduce((sum, s) => sum + s.eggs, 0);
  return { steps, sources, totalEggs, surgeries, warnings: [], alreadyOwned };
}
