import palsJson from "../data/pals.json";
import breedingJson from "../data/breeding.json";
import passivesJson from "../data/passives.json";
import type { Pal, Passive, GenderedCombo } from "../types";

export const pals = palsJson as Pal[];
export const passives = passivesJson as Passive[];

const breeding = breedingJson as { table: number[]; gendered: GenderedCombo[] };

export const table = breeding.table;
export const gendered = breeding.gendered;

const N = pals.length;
export const palCount = N;

/** Index dans la table triangulaire pour la paire (i, j), ordre indifférent. */
export function triIndex(i: number, j: number): number {
  if (i > j) [i, j] = [j, i];
  return i * N - (i * (i - 1)) / 2 + (j - i);
}

/** Enfant produit par la paire (i, j) hors combos genrés, ou -1. */
export function childOf(i: number, j: number): number {
  return table[triIndex(i, j)];
}

/** Combos genrés applicables à la paire (i, j). */
export function genderedResultsOf(i: number, j: number): GenderedCombo[] {
  const a = Math.min(i, j);
  const b = Math.max(i, j);
  return gendered.filter(
    (g) => Math.min(g.p1, g.p2) === a && Math.max(g.p1, g.p2) === b
  );
}

/** Normalise une chaîne pour la recherche (minuscules, sans accents). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Recherche de pals par nom français ou anglais. */
export function searchPals(query: string): number[] {
  const q = normalize(query.trim());
  const result: number[] = [];
  for (let i = 0; i < N; i++) {
    if (q === "" || normalize(pals[i].fr).includes(q) || normalize(pals[i].en).includes(q)) {
      result.push(i);
    }
  }
  return result;
}
