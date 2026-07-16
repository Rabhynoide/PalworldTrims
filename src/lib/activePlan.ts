/**
 * Plan « suivi » : le plan de breeding que le joueur est en train d'exécuter,
 * persisté en localStorage avec l'état d'avancement de chaque étape.
 */

import { pals } from "./data";
import type { OwnedInstance, PlanResult } from "./passivePathfinder";

export interface ActivePlan {
  /** Identifiant interne de l'espèce cible (robuste aux régénérations de données). */
  targetId: string;
  desired: string[];
  plan: PlanResult;
  /** Instances possédées référencées par les sources du plan (indices remappés). */
  owned: OwnedInstance[];
  checkedSteps: boolean[];
  checkedSurgeries: boolean[];
  createdAt: string;
}

const STORAGE_KEY = "palworld-breeding.active-plan";

export function createActivePlan(
  plan: PlanResult,
  ownedAll: OwnedInstance[],
  target: number,
  desired: string[]
): ActivePlan {
  // Ne conserve que les instances réellement utilisées par le plan.
  const used: OwnedInstance[] = [];
  const remapped: PlanResult = {
    ...plan,
    sources: plan.sources.map((s) => {
      const idx = used.length;
      used.push(ownedAll[s.instance]);
      return { ...s, instance: idx };
    }),
  };
  return {
    targetId: pals[target].id,
    desired,
    plan: remapped,
    owned: used,
    checkedSteps: plan.steps.map(() => false),
    checkedSurgeries: plan.surgeries.map(() => false),
    createdAt: new Date().toISOString(),
  };
}

export function saveActivePlan(active: ActivePlan | null): void {
  try {
    if (active === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  } catch {
    // stockage indisponible : le suivi restera en mémoire pour la session
  }
}

/** Charge le plan suivi ; retourne null s'il est absent ou périmé. */
export function loadActivePlan(): ActivePlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const active = JSON.parse(raw) as ActivePlan;

    // Validation : les indices d'espèces doivent être valides et la cible
    // retrouver son espèce — sinon les données du jeu ont changé entre-temps.
    if (pals.findIndex((p) => p.id === active.targetId) === -1) return null;
    const steps = active.plan?.steps;
    if (!Array.isArray(steps)) return null;
    const inBounds = (i: number) => Number.isInteger(i) && i >= 0 && i < pals.length;
    if (!steps.every((s) => inBounds(s.p1) && inBounds(s.p2) && inBounds(s.child)))
      return null;
    const last = steps[steps.length - 1];
    if (last && pals[last.child].id !== active.targetId) return null;
    if (active.checkedSteps.length !== steps.length) return null;

    return active;
  } catch {
    return null;
  }
}
