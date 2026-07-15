import { useMemo, useState } from "react";
import PalSelect from "./PalSelect";
import { pals, normalize } from "../lib/data";
import { combosFor } from "../lib/breeding";

const genderSymbol = { MALE: "♂", FEMALE: "♀" } as const;

export default function ParentsTab() {
  const [target, setTarget] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  const combos = useMemo(
    () => (target !== null ? combosFor(target) : []),
    [target]
  );

  const q = normalize(filter.trim());
  const filtered =
    q === ""
      ? combos
      : combos.filter(
          (c) =>
            normalize(pals[c.p1].fr).includes(q) ||
            normalize(pals[c.p1].en).includes(q) ||
            normalize(pals[c.p2].fr).includes(q) ||
            normalize(pals[c.p2].en).includes(q)
        );

  return (
    <section>
      <p className="tab-intro">
        Choisis un pal cible pour lister toutes les paires de parents qui le
        produisent.
      </p>
      <div className="field">
        <label>Pal cible</label>
        <PalSelect value={target} onChange={setTarget} />
      </div>

      {target !== null && (
        <div className="results">
          <div className="results-header">
            <h3>
              {combos.length} combinaison{combos.length > 1 ? "s" : ""} pour{" "}
              {pals[target].fr}
            </h3>
            {combos.length > 10 && (
              <input
                type="text"
                className="filter-input"
                placeholder="Filtrer par parent…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
          </div>
          {combos.length === 0 && (
            <p className="notice">
              Aucune paire ne produit ce pal : il doit être capturé dans la
              nature (ou éclos d'un œuf trouvé).
            </p>
          )}
          <ul className="combo-list">
            {filtered.map((c, k) => (
              <li key={k} className="combo-row">
                <span>
                  {pals[c.p1].fr}
                  {c.condition ? ` ${genderSymbol[c.condition.g1]}` : ""}
                </span>
                <span className="cross">×</span>
                <span>
                  {pals[c.p2].fr}
                  {c.condition ? ` ${genderSymbol[c.condition.g2]}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
