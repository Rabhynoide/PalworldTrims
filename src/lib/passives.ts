/**
 * Calcul des probabilités d'héritage des talents passifs.
 *
 * Mécanique (données extraites du jeu, cf. PalCalc GameConstants.cs) :
 * l'enfant hérite de n passifs tirés au hasard parmi l'union des passifs
 * des deux parents, avec P(n=1)=40 %, P(n=2)=30 %, P(n=3)=20 %, P(n=4)=10 %.
 * Si n dépasse la taille de l'union, tous les passifs sont hérités.
 * Des passifs aléatoires peuvent ensuite s'ajouter (jusqu'à 4 au total),
 * ce qui n'empêche jamais d'obtenir les passifs souhaités.
 */

const INHERIT_COUNT_PROB: ReadonlyArray<[number, number]> = [
  [1, 0.4],
  [2, 0.3],
  [3, 0.2],
  [4, 0.1],
];

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * Probabilité que l'enfant hérite d'au moins tous les passifs souhaités.
 * @param poolSize taille de l'union des passifs des deux parents
 * @param desiredCount nombre de passifs souhaités (sous-ensemble du pool)
 */
export function probAtLeastDesired(
  poolSize: number,
  desiredCount: number
): number {
  if (desiredCount === 0) return 1;
  if (desiredCount > poolSize || desiredCount > 4) return 0;

  let total = 0;
  for (const [n, p] of INHERIT_COUNT_PROB) {
    if (n >= poolSize) {
      // Tous les passifs du pool sont hérités.
      total += p;
    } else if (n >= desiredCount) {
      total +=
        (p * binomial(poolSize - desiredCount, n - desiredCount)) /
        binomial(poolSize, n);
    }
  }
  return total;
}

/** Nombre moyen d'œufs nécessaires pour une probabilité p par œuf. */
export function expectedEggs(p: number): number {
  return p > 0 ? 1 / p : Infinity;
}
