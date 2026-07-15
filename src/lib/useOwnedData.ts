import { useEffect, useState } from "react";

export interface OwnedPalRow {
  id: string;
  gender: "MALE" | "FEMALE" | null;
  level: number;
  ivs: { hp: number; attack: number; defense: number } | null;
  nickname: string | null;
  /** Libellé de localisation (« Palbox (X) », « Base 1 », « Équipe (X) »…). */
  location: string | null;
  passives: string[];
}

export interface OwnedPlayer {
  uid: string;
  name: string;
  pals: OwnedPalRow[];
}

export interface OwnedData {
  generatedAt: string;
  players: OwnedPlayer[];
}

/** Charge public/owned.json (produit par `npm run sync-owned`), ou null. */
export function useOwnedData(): OwnedData | null {
  const [data, setData] = useState<OwnedData | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}owned.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OwnedData | null) => {
        if (d && Array.isArray(d.players) && d.players.length > 0) setData(d);
      })
      .catch(() => {});
  }, []);
  return data;
}
