import { palCount, childOf, gendered } from "./data";
import type { Gender } from "../types";

export interface BreedOutcome {
  child: number;
  /** Genres requis des parents, dans l'ordre (p1, p2) passé à resultsFor. */
  condition?: { g1: Gender; g2: Gender };
}

/** Tous les résultats possibles du croisement (i, j). */
export function resultsFor(i: number, j: number): BreedOutcome[] {
  const outcomes: BreedOutcome[] = [];
  const wildcard = childOf(i, j);
  if (wildcard !== -1) outcomes.push({ child: wildcard });
  for (const g of gendered) {
    if (g.p1 === i && g.p2 === j) {
      outcomes.push({ child: g.child, condition: { g1: g.g1, g2: g.g2 } });
    } else if (g.p1 === j && g.p2 === i) {
      outcomes.push({ child: g.child, condition: { g1: g.g2, g2: g.g1 } });
    }
  }
  return outcomes;
}

export interface ParentCombo {
  p1: number;
  p2: number;
  condition?: { g1: Gender; g2: Gender };
}

/** Toutes les paires de parents produisant le pal cible. */
export function combosFor(target: number): ParentCombo[] {
  const combos: ParentCombo[] = [];
  for (let i = 0; i < palCount; i++) {
    for (let j = i; j < palCount; j++) {
      if (childOf(i, j) === target) combos.push({ p1: i, p2: j });
    }
  }
  for (const g of gendered) {
    if (g.child === target) {
      combos.push({ p1: g.p1, p2: g.p2, condition: { g1: g.g1, g2: g.g2 } });
    }
  }
  return combos;
}
