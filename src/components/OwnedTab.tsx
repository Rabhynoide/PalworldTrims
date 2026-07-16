import { useMemo, useState } from "react";
import PalIcon from "./PalIcon";
import PassiveChips from "./PassiveChipList";
import { pals, passiveById, normalize, dexLabel } from "../lib/data";
import { useOwnedData, type OwnedPalRow } from "../lib/useOwnedData";

const genderSymbol = { MALE: "♂", FEMALE: "♀" } as const;

const ELEMENT_FR: Record<string, string> = {
  Normal: "Neutre",
  Fire: "Feu",
  Water: "Eau",
  Electricity: "Électrique",
  Leaf: "Plante",
  Dark: "Ténèbres",
  Dragon: "Dragon",
  Earth: "Sol",
  Ice: "Glace",
};

const WORK_FR: Record<string, { label: string; icon: string }> = {
  kindling: { label: "Allumage", icon: "🔥" },
  watering: { label: "Arrosage", icon: "💧" },
  planting: { label: "Plantation", icon: "🌱" },
  electricity: { label: "Électricité", icon: "⚡" },
  handiwork: { label: "Travail manuel", icon: "🔨" },
  gathering: { label: "Collecte", icon: "🧺" },
  lumbering: { label: "Abattage", icon: "🪓" },
  mining: { label: "Minage", icon: "⛏️" },
  oil: { label: "Forage pétrolier", icon: "🛢️" },
  medicine: { label: "Médecine", icon: "💊" },
  cooling: { label: "Réfrigération", icon: "❄️" },
  transport: { label: "Transport", icon: "📦" },
  farming: { label: "Élevage", icon: "🐄" },
};

function WorkBadges({ palIndex }: { palIndex: number }) {
  const work = Object.entries(pals[palIndex].work).sort((a, b) => b[1] - a[1]);
  if (work.length === 0) return <span className="owned-nowork">–</span>;
  return (
    <span className="work-badges">
      {work.map(([key, lvl]) => {
        const w = WORK_FR[key] ?? { label: key, icon: "❔" };
        return (
          <span key={key} className="work-badge" title={`${w.label} niv. ${lvl}`}>
            {w.icon}
            {lvl}
          </span>
        );
      })}
    </span>
  );
}

type SortKey =
  | "species"
  | "level"
  | "gender"
  | "hp"
  | "attack"
  | "defense"
  | "ivTotal"
  | "passives"
  | "location"
  | "work";

interface Row extends OwnedPalRow {
  palIndex: number;
}

const ivTotal = (r: Row) => (r.ivs ? r.ivs.hp + r.ivs.attack + r.ivs.defense : -1);

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "species", label: "Pal" },
  { key: "location", label: "Lieu" },
  { key: "gender", label: "Genre" },
  { key: "level", label: "Niv." },
  { key: "hp", label: "PV", title: "IV points de vie" },
  { key: "attack", label: "Att.", title: "IV attaque" },
  { key: "defense", label: "Déf.", title: "IV défense" },
  { key: "ivTotal", label: "Σ IV", title: "Somme des IVs" },
  { key: "work", label: "Métiers", title: "Aptitudes de travail de l'espèce" },
  { key: "passives", label: "Passifs" },
];

export default function OwnedTab() {
  const data = useOwnedData();
  const [playerUid, setPlayerUid] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("species");
  const [sortAsc, setSortAsc] = useState(true);
  const [workFilter, setWorkFilter] = useState<string[]>([]);
  const [minWork, setMinWork] = useState(1);

  const toggleWork = (key: string) => {
    setWorkFilter((f) =>
      f.includes(key) ? f.filter((x) => x !== key) : [...f, key]
    );
  };

  const player =
    data?.players.find((p) => p.uid === playerUid) ?? data?.players[0];

  const rows = useMemo<Row[]>(() => {
    if (!player) return [];
    const byId = new Map(pals.map((p, i) => [p.id, i]));
    const list: Row[] = [];
    for (const op of player.pals) {
      const palIndex = byId.get(op.id);
      if (palIndex !== undefined) list.push({ ...op, palIndex });
    }
    return list;
  }, [player]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    let result = rows;
    if (q !== "") {
      result = rows.filter((r) => {
        const p = pals[r.palIndex];
        return (
          normalize(p.fr).includes(q) ||
          normalize(p.en).includes(q) ||
          (r.nickname !== null && normalize(r.nickname).includes(q)) ||
          (r.location !== null && normalize(r.location).includes(q)) ||
          r.passives.some((id) => {
            const ps = passiveById.get(id);
            return ps !== undefined && normalize(ps.fr).includes(q);
          })
        );
      });
    }
    if (workFilter.length > 0) {
      result = result.filter((r) =>
        workFilter.every((w) => (pals[r.palIndex].work[w] ?? 0) >= minWork)
      );
    }

    const dir = sortAsc ? 1 : -1;
    const value = (r: Row): string | number => {
      switch (sortKey) {
        case "species":
          return pals[r.palIndex].fr;
        case "gender":
          return r.gender ?? "";
        case "level":
          return r.level;
        case "hp":
          return r.ivs?.hp ?? -1;
        case "attack":
          return r.ivs?.attack ?? -1;
        case "defense":
          return r.ivs?.defense ?? -1;
        case "ivTotal":
          return ivTotal(r);
        case "passives":
          return r.passives.length;
        case "location":
          return r.location ?? "";
        case "work":
          // Avec un filtre métier actif, on trie sur le niveau de ce métier.
          return workFilter.length > 0
            ? Math.min(...workFilter.map((w) => pals[r.palIndex].work[w] ?? 0))
            : Math.max(0, ...Object.values(pals[r.palIndex].work));
      }
    };
    return [...result].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp =
        typeof va === "string"
          ? va.localeCompare(vb as string, "fr")
          : (va as number) - (vb as number);
      return cmp !== 0 ? dir * cmp : pals[a.palIndex].fr.localeCompare(pals[b.palIndex].fr, "fr");
    });
  }, [rows, query, sortKey, sortAsc, workFilter, minWork]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      // Par défaut : croissant pour le texte, décroissant pour les nombres.
      setSortAsc(key === "species" || key === "gender" || key === "location");
    }
  };

  if (!data) {
    return (
      <section>
        <p className="notice">
          Aucune donnée serveur : lance <code>npm run sync-owned</code> pour
          importer tes pals (voir README).
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="owned-toolbar">
        <select
          value={player?.uid ?? ""}
          onChange={(e) => setPlayerUid(e.target.value)}
        >
          {data.players.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.name} ({p.pals.length} pals)
            </option>
          ))}
        </select>
        <input
          type="text"
          className="filter-input"
          placeholder="Filtrer par pal, surnom ou passif…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="owned-count">
          {filtered.length}/{rows.length} pals — synchro du{" "}
          {new Date(data.generatedAt).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      </div>

      <div className="work-filter">
        {Object.entries(WORK_FR).map(([key, w]) => (
          <button
            key={key}
            type="button"
            className={
              "work-filter-btn" + (workFilter.includes(key) ? " active" : "")
            }
            title={w.label}
            onClick={() => toggleWork(key)}
          >
            {w.icon} {w.label}
          </button>
        ))}
        {workFilter.length > 0 && (
          <>
            <label className="minutes-input">
              niv. ≥
              <select
                value={minWork}
                onChange={(e) => setMinWork(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="work-filter-clear"
              onClick={() => setWorkFilter([])}
            >
              Effacer
            </button>
          </>
        )}
      </div>

      <div className="owned-table-wrap">
        <table className="owned-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  onClick={() => toggleSort(c.key)}
                  className={sortKey === c.key ? "sorted" : ""}
                >
                  {c.label}
                  {sortKey === c.key ? (sortAsc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, k) => {
              const p = pals[r.palIndex];
              return (
                <tr key={k}>
                  <td>
                    <PalIcon pal={r.palIndex} size={26} />{" "}
                    <span className="pal-dex">{dexLabel(r.palIndex)}</span>{" "}
                    <strong>{p.fr}</strong>
                    {r.nickname !== null && (
                      <span className="owned-nickname"> « {r.nickname} »</span>
                    )}
                    <span className="owned-elements">
                      {p.elements.map((e) => (
                        <span key={e} className={`element-badge el-${e}`}>
                          {ELEMENT_FR[e] ?? e}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="owned-location">{r.location ?? "?"}</td>
                  <td className="center">
                    {r.gender ? genderSymbol[r.gender] : "?"}
                  </td>
                  <td className="num">{r.level}</td>
                  <td className="num">{r.ivs?.hp ?? "–"}</td>
                  <td className="num">{r.ivs?.attack ?? "–"}</td>
                  <td className="num">{r.ivs?.defense ?? "–"}</td>
                  <td className="num">{r.ivs ? ivTotal(r) : "–"}</td>
                  <td>
                    <WorkBadges palIndex={r.palIndex} />
                  </td>
                  <td>
                    <PassiveChips ids={r.passives} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="notice">Aucun pal ne correspond au filtre.</p>
        )}
      </div>
    </section>
  );
}
