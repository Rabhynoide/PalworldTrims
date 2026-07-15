import { useMemo, useState } from "react";
import PalSelect from "./PalSelect";
import PalMultiSelect from "./PalMultiSelect";
import { pals } from "../lib/data";
import { findPath } from "../lib/pathfinder";

const genderSymbol = { MALE: "♂", FEMALE: "♀" } as const;

export default function PathTab() {
  const [owned, setOwned] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);

  const path = useMemo(
    () => (target !== null && owned.length > 0 ? findPath(owned, target) : undefined),
    [owned, target]
  );

  return (
    <section>
      <p className="tab-intro">
        Indique les pals que tu possèdes et un pal cible : l'outil trouve la
        chaîne de croisements la plus courte pour l'obtenir.
      </p>
      <div className="field">
        <label>Mes pals ({owned.length})</label>
        <PalMultiSelect values={owned} onChange={setOwned} />
      </div>
      <div className="field">
        <label>Pal cible</label>
        <PalSelect value={target} onChange={setTarget} />
      </div>

      {target !== null && owned.length === 0 && (
        <p className="notice">Ajoute d'abord au moins un pal possédé.</p>
      )}

      {path === null && (
        <p className="notice">
          Impossible d'obtenir {target !== null ? pals[target].fr : ""} par
          reproduction depuis tes pals. Il faudra le capturer ou élargir ton
          cheptel.
        </p>
      )}

      {path && path.steps.length === 0 && (
        <p className="notice success">Tu possèdes déjà ce pal ! 🎉</p>
      )}

      {path && path.steps.length > 0 && (
        <div className="results">
          <h3>
            {path.steps.length} croisement{path.steps.length > 1 ? "s" : ""}{" "}
            nécessaire{path.steps.length > 1 ? "s" : ""}
          </h3>
          <ol className="steps-list">
            {path.steps.map((s, k) => (
              <li key={k} className="step-row">
                <span>
                  {pals[s.p1].fr}
                  {s.condition ? ` ${genderSymbol[s.condition.g1]}` : ""}
                </span>
                <span className="cross">×</span>
                <span>
                  {pals[s.p2].fr}
                  {s.condition ? ` ${genderSymbol[s.condition.g2]}` : ""}
                </span>
                <span className="arrow">→</span>
                <strong>{pals[s.child].fr}</strong>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
