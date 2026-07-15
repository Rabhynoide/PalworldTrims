import { useState } from "react";
import PalSelect from "./PalSelect";
import { pals, dexLabel } from "../lib/data";
import { resultsFor } from "../lib/breeding";

const genderSymbol = { MALE: "♂", FEMALE: "♀" } as const;

export default function ChildTab() {
  const [p1, setP1] = useState<number | null>(null);
  const [p2, setP2] = useState<number | null>(null);

  const outcomes = p1 !== null && p2 !== null ? resultsFor(p1, p2) : [];

  return (
    <section>
      <p className="tab-intro">
        Sélectionne deux parents pour connaître l'enfant issu de leur
        reproduction.
      </p>
      <div className="parents-row">
        <div className="field">
          <label>Parent 1</label>
          <PalSelect value={p1} onChange={setP1} />
        </div>
        <span className="cross">×</span>
        <div className="field">
          <label>Parent 2</label>
          <PalSelect value={p2} onChange={setP2} />
        </div>
      </div>

      {p1 !== null && p2 !== null && (
        <div className="results">
          {outcomes.length === 0 && (
            <p className="notice">Aucun résultat pour cette paire.</p>
          )}
          {outcomes.map((o, k) => {
            const child = pals[o.child];
            return (
              <div key={k} className="result-card">
                {o.condition && (
                  <p className="condition">
                    Uniquement si {pals[p1].fr} {genderSymbol[o.condition.g1]}{" "}
                    et {pals[p2].fr} {genderSymbol[o.condition.g2]}
                  </p>
                )}
                <div className="child-name">
                  <span className="pal-dex">{dexLabel(o.child)}</span>
                  <strong>{child.fr}</strong>
                </div>
                <p className="child-meta">
                  Genre de l'enfant : ♂ {Math.round(child.maleProb * 100)} % /
                  ♀ {Math.round((1 - child.maleProb) * 100)} %
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
