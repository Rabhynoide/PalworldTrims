import { passiveById, passiveRankClass, passiveRankArrows } from "../lib/data";

/** Chips compactes de passifs, colorées selon le rang. */
export default function PassiveChipList({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <span className="passive-chips">
      {ids.map((id) => {
        const p = passiveById.get(id);
        return (
          <span
            key={id}
            className={`mini-chip ${p ? passiveRankClass(p.rank) : ""}`}
            title={p ? `Rang ${p.rank > 0 ? "+" : ""}${p.rank}` : undefined}
          >
            {p?.fr ?? id}
            {p && <span className="rank-arrows">{passiveRankArrows(p.rank)}</span>}
          </span>
        );
      })}
    </span>
  );
}
