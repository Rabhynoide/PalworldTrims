import { findPassivePlan } from "./passivePathfinder";
import type { Gender } from "../types";

export interface BreedStep {
  p1: number;
  p2: number;
  child: number;
  condition?: { g1: Gender; g2: Gender };
}

export interface PathResult {
  /** Étapes dans l'ordre d'exécution (les parents sont produits avant l'enfant). */
  steps: BreedStep[];
  totalBreedings: number;
}

/**
 * Chemin de breeding le plus court sans contrainte de passifs.
 * Cas particulier du planificateur général (findPassivePlan).
 */
export function findPath(owned: number[], target: number): PathResult | null {
  const plan = findPassivePlan(
    owned.map((pal) => ({ pal, passives: [] })),
    target,
    []
  );
  if (!plan) return null;
  return {
    steps: plan.steps.map((s) => ({
      p1: s.p1,
      p2: s.p2,
      child: s.child,
      condition: s.condition,
    })),
    totalBreedings: plan.steps.length,
  };
}
