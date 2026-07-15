export interface Pal {
  id: string;
  dex: number;
  variant: boolean;
  en: string;
  fr: string;
  power: number;
  rarity: number;
  nocturnal: boolean;
  maleProb: number;
}

export interface Passive {
  id: string;
  en: string;
  fr: string;
  rank: number;
  frDesc: string | null;
  inheritable: boolean;
}

export type Gender = "MALE" | "FEMALE";

export interface GenderedCombo {
  p1: number;
  g1: Gender;
  p2: number;
  g2: Gender;
  child: number;
}
