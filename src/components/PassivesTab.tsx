import { useMemo, useState } from "react";
import PassivePicker from "./PassivePicker";
import { passives, passiveRankClass, passiveRankArrows } from "../lib/data";
import { probAtLeastDesired, expectedEggs } from "../lib/passives";

export default function PassivesTab() {
  const [parent1, setParent1] = useState<number[]>([]);
  const [parent2, setParent2] = useState<number[]>([]);
  const [desired, setDesired] = useState<number[]>([]);

  const pool = useMemo(
    () => Array.from(new Set([...parent1, ...parent2])),
    [parent1, parent2]
  );

  // Les passifs souhaités doivent rester dans le pool des parents.
  const validDesired = desired.filter((d) => pool.includes(d));

  const prob = probAtLeastDesired(pool.length, validDesired.length);
  const eggs = expectedEggs(prob);

  const toggleDesired = (idx: number) => {
    setDesired((d) =>
      d.includes(idx) ? d.filter((x) => x !== idx) : [...d, idx]
    );
  };

  return (
    <section>
      <p className="tab-intro">
        Renseigne les passifs de chaque parent, puis coche ceux que tu veux
        transmettre à l'enfant.
      </p>
      <div className="parents-row">
        <div className="field">
          <label>Passifs du parent 1 ({parent1.length}/4)</label>
          <PassivePicker values={parent1} onChange={setParent1} />
        </div>
        <div className="field">
          <label>Passifs du parent 2 ({parent2.length}/4)</label>
          <PassivePicker values={parent2} onChange={setParent2} />
        </div>
      </div>

      {pool.length > 0 && (
        <div className="field">
          <label>Passifs souhaités chez l'enfant</label>
          <div className="desired-grid">
            {pool.map((idx) => (
              <label
                key={passives[idx].id}
                className={`desired-item ${passiveRankClass(passives[idx].rank)}`}
                title={`Rang ${passives[idx].rank > 0 ? "+" : ""}${passives[idx].rank}`}
              >
                <input
                  type="checkbox"
                  checked={validDesired.includes(idx)}
                  onChange={() => toggleDesired(idx)}
                />
                {passives[idx].fr}
                <span className="rank-arrows">
                  {passiveRankArrows(passives[idx].rank)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {pool.length > 0 && validDesired.length > 0 && (
        <div className="results">
          <div className="result-card">
            <p className="prob-main">
              {(prob * 100).toFixed(1).replace(".", ",")} %
            </p>
            <p className="child-meta">
              de chance par œuf d'obtenir au moins{" "}
              {validDesired.length > 1
                ? `ces ${validDesired.length} passifs`
                : "ce passif"}{" "}
              — soit en moyenne 1 œuf sur{" "}
              {eggs === Infinity ? "∞" : Math.ceil(eggs)}.
            </p>
          </div>
          <p className="notice">
            Mécanique : l'enfant hérite de 1 à 4 passifs tirés parmi l'union
            des passifs des parents (40 % pour 1, 30 % pour 2, 20 % pour 3,
            10 % pour 4). Des passifs aléatoires peuvent s'ajouter mais
            n'empêchent pas d'obtenir ceux souhaités. Astuce : moins les
            parents ont de passifs parasites, meilleures sont les chances.
          </p>
        </div>
      )}
    </section>
  );
}
