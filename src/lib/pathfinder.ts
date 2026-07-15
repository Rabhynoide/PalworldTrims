import { palCount, childOf, gendered } from "./data";
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
  /** Coût estimé (nombre de croisements, sous-arbres partagés dédupliqués). */
  totalBreedings: number;
}

interface Origin {
  p1: number;
  p2: number;
  condition?: { g1: Gender; g2: Gender };
}

/**
 * Cherche la suite de croisements la plus courte pour obtenir `target`
 * à partir des pals possédés. Retourne null si impossible.
 *
 * Relaxation de type Bellman-Ford sur l'hypergraphe de breeding :
 * coût(enfant) = coût(parent1) + coût(parent2) + 1.
 */
export function findPath(owned: number[], target: number): PathResult | null {
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[] = new Array(palCount).fill(INF);
  const from: (Origin | null)[] = new Array(palCount).fill(null);
  for (const o of owned) cost[o] = 0;

  if (cost[target] === 0) return { steps: [], totalBreedings: 0 };
  if (owned.length === 0) return null;

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < palCount; i++) {
      if (cost[i] === INF) continue;
      for (let j = i; j < palCount; j++) {
        if (cost[j] === INF) continue;
        const c = childOf(i, j);
        if (c === -1) continue;
        const cand = cost[i] + cost[j] + 1;
        if (cand < cost[c]) {
          cost[c] = cand;
          from[c] = { p1: i, p2: j };
          changed = true;
        }
      }
    }
    for (const g of gendered) {
      if (cost[g.p1] === INF || cost[g.p2] === INF) continue;
      const cand = cost[g.p1] + cost[g.p2] + 1;
      if (cand < cost[g.child]) {
        cost[g.child] = cand;
        from[g.child] = {
          p1: g.p1,
          p2: g.p2,
          condition: { g1: g.g1, g2: g.g2 },
        };
        changed = true;
      }
    }
  }

  if (cost[target] === INF) return null;

  // Reconstruction post-ordre ; un même pal intermédiaire n'est produit qu'une fois.
  const steps: BreedStep[] = [];
  const produced = new Set<number>(owned);
  const visit = (pal: number) => {
    if (produced.has(pal)) return;
    const origin = from[pal];
    if (!origin) return;
    visit(origin.p1);
    visit(origin.p2);
    produced.add(pal);
    steps.push({ ...origin, child: pal });
  };
  visit(target);

  return { steps, totalBreedings: steps.length };
}
