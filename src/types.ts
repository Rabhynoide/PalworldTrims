export interface Pal {
  id: string;
  /** Numéro Paldex ; -1 pour les pals sans entrée (collab Terraria). */
  dex: number;
  variant: boolean;
  en: string;
  fr: string;
  /** CombiRank du jeu. */
  power: number;
  /** Peut être obtenu par la formule générale de breeding. */
  breedable: boolean;
  elements: string[];
  rarity: number;
  nocturnal: boolean;
  maleProb: number;
  /** Aptitudes de travail non nulles (niveaux 1-5), clés courtes en anglais. */
  work: Record<string, number>;
}

export interface Passive {
  id: string;
  en: string;
  fr: string;
  rank: number;
  frDesc: string | null;
  inheritable: boolean;
  /** Ajoutable via la table d'opération (null sinon). */
  surgery: { price: number; item: string | null; itemFr: string | null } | null;
}

export type Gender = "MALE" | "FEMALE";

export interface GenderedCombo {
  p1: number;
  g1: Gender;
  p2: number;
  g2: Gender;
  child: number;
}
