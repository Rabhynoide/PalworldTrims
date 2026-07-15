import { useEffect, useMemo, useRef, useState } from "react";
import PalSelect from "./PalSelect";
import PalMultiSelect from "./PalMultiSelect";
import PassivePicker from "./PassivePicker";
import PassivePresets from "./PassivePresets";
import PlanTree from "./PlanTree";
import PassiveChips from "./PassiveChipList";
import { pals, passives } from "../lib/data";
import { useOwnedData } from "../lib/useOwnedData";
import type { OwnedInstance, PlanResult } from "../lib/passivePathfinder";
import type { PlanRequest, PlanWorkerMessage } from "../lib/planWorker";

const genderSymbol = { MALE: "♂", FEMALE: "♀" } as const;
const MINUTES_KEY = "palworld-breeding.minutes-per-egg";
const SURGERY_KEY = "palworld-breeding.allow-surgery";
const SURGERY_EXCLUDED_KEY = "palworld-breeding.surgery-excluded";

const passiveFr = new Map(passives.map((p) => [p.id, p.fr]));
const passiveSurgery = new Map(passives.map((p) => [p.id, p.surgery]));

function SurgeryList({ surgeries }: { surgeries: string[] }) {
  return (
    <ul className="surgery-list">
      {surgeries.map((id) => {
        const s = passiveSurgery.get(id);
        return (
          <li key={id} className="surgery-row">
            🛠 Ajouter <PassiveChips ids={[id]} /> via la table d'opération —{" "}
            {s?.price ? `${s.price.toLocaleString("fr-FR")} or` : "gratuit"}
            {s?.item ? ` + ${s.itemFr ?? s.item}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return "∞";
  const h = Math.floor(minutes / 60);
  const min = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${min.toString().padStart(2, "0")}` : `${min} min`;
}

export default function PathTab() {
  const [instances, setInstances] = useState<OwnedInstance[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [desiredIdx, setDesiredIdx] = useState<number[]>([]);
  const serverData = useOwnedData();
  const [playerUid, setPlayerUid] = useState<string>("");
  const [plan, setPlan] = useState<PlanResult | null | undefined>(undefined);
  const [progress, setProgress] = useState<{ sweep: number; fraction: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [view, setView] = useState<"tree" | "list">("tree");
  const [minutesPerEgg, setMinutesPerEgg] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MINUTES_KEY));
    return stored > 0 ? stored : 5;
  });
  const [allowSurgery, setAllowSurgery] = useState<boolean>(
    () => localStorage.getItem(SURGERY_KEY) === "1"
  );
  // Passifs opérables que l'utilisateur ne veut PAS faire en chirurgie
  // (composants pas encore débloqués, par exemple).
  const [surgeryExcluded, setSurgeryExcluded] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SURGERY_EXCLUDED_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const toggleSurgeryExcluded = (id: string) => {
    setSurgeryExcluded((list) => {
      const next = list.includes(id)
        ? list.filter((x) => x !== id)
        : [...list, id];
      localStorage.setItem(SURGERY_EXCLUDED_KEY, JSON.stringify(next));
      return next;
    });
    invalidate();
  };

  const stopWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setProgress(null);
  };

  // Termine le worker si l'onglet est démonté en plein calcul.
  useEffect(() => stopWorker, []);

  const invalidate = () => {
    stopWorker();
    setPlan(undefined);
  };

  const importFromServer = () => {
    const player =
      serverData?.players.find((p) => p.uid === playerUid) ??
      serverData?.players[0];
    if (!player) return;
    const imported: OwnedInstance[] = [];
    for (const op of player.pals) {
      const idx = pals.findIndex((p) => p.id === op.id);
      if (idx !== -1) {
        imported.push({
          pal: idx,
          passives: op.passives,
          gender: op.gender,
          level: op.level,
          ivs: op.ivs,
          nickname: op.nickname,
        });
      }
    }
    setInstances(imported);
    invalidate();
  };

  const speciesValues = useMemo(
    () => [...new Set(instances.map((i) => i.pal))].sort((a, b) => a - b),
    [instances]
  );
  const onSpeciesChange = (values: number[]) => {
    const kept = instances.filter((i) => values.includes(i.pal));
    const existing = new Set(instances.map((i) => i.pal));
    const added = values
      .filter((v) => !existing.has(v))
      .map((pal) => ({ pal, passives: [] }));
    setInstances([...kept, ...added]);
    invalidate();
  };

  const desired = desiredIdx.map((i) => passives[i].id);

  // Passifs souhaités opérables, et parmi eux ceux réellement autorisés
  // (la table activée et non exclus individuellement).
  const operableDesired = desired.filter((id) => passiveSurgery.get(id));
  const surgeryAllowed = allowSurgery
    ? operableDesired.filter((id) => !surgeryExcluded.includes(id))
    : [];

  // Un porteur n'est indispensable que si le passif ne peut pas être opéré.
  const missingCarriers = desired.filter(
    (id) =>
      !surgeryAllowed.includes(id) &&
      !instances.some((inst) => inst.passives.includes(id))
  );

  const compute = () => {
    if (target === null) return;
    stopWorker();
    setPlan(undefined);
    setProgress({ sweep: 1, fraction: 0 });
    const worker = new Worker(new URL("../lib/planWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<PlanWorkerMessage>) => {
      if (e.data.type === "progress") {
        setProgress({ sweep: e.data.sweep, fraction: e.data.fraction });
      } else {
        setPlan(e.data.plan);
        stopWorker();
      }
    };
    const request: PlanRequest = {
      owned: instances,
      target,
      desired,
      surgeryAllowed,
    };
    worker.postMessage(request);
  };

  const totalGold = (plan?.surgeries ?? []).reduce(
    (sum, id) => sum + (passiveSurgery.get(id)?.price ?? 0),
    0
  );

  const maskIds = (mask: number) => desired.filter((_, k) => mask & (1 << k));

  const updateMinutes = (v: number) => {
    setMinutesPerEgg(v);
    if (v > 0) localStorage.setItem(MINUTES_KEY, String(v));
  };

  return (
    <section>
      <p className="tab-intro">
        Indique tes pals, un pal cible et les passifs souhaités : l'outil
        calcule le plan de croisements le moins coûteux en œufs.
      </p>

      {serverData && (
        <div className="server-import">
          <span>
            Serveur synchronisé le{" "}
            {new Date(serverData.generatedAt).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
          <select
            value={playerUid || serverData.players[0].uid}
            onChange={(e) => setPlayerUid(e.target.value)}
          >
            {serverData.players.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.name} ({p.pals.length} pals)
              </option>
            ))}
          </select>
          <button type="button" className="import-btn" onClick={importFromServer}>
            Importer ces pals
          </button>
        </div>
      )}

      <div className="field">
        <label>
          Mes pals ({instances.length} individus, {speciesValues.length} espèces)
        </label>
        <PalMultiSelect values={speciesValues} onChange={onSpeciesChange} />
      </div>
      <div className="parents-row">
        <div className="field">
          <label>Pal cible</label>
          <PalSelect
            value={target}
            onChange={(v) => {
              setTarget(v);
              invalidate();
            }}
          />
        </div>
        <div className="field">
          <label>Passifs souhaités ({desiredIdx.length}/4)</label>
          <PassivePicker
            values={desiredIdx}
            onChange={(v) => {
              setDesiredIdx(v);
              invalidate();
            }}
          />
          <PassivePresets
            current={desiredIdx}
            onApply={(v) => {
              setDesiredIdx(v);
              invalidate();
            }}
          />
          <label className="surgery-toggle">
            <input
              type="checkbox"
              checked={allowSurgery}
              onChange={(e) => {
                setAllowSurgery(e.target.checked);
                localStorage.setItem(SURGERY_KEY, e.target.checked ? "1" : "0");
                invalidate();
              }}
            />
            🛠 Autoriser la table d'opération (les passifs opérables pourront
            être ajoutés après le breeding, contre de l'or)
          </label>
          {allowSurgery && operableDesired.length > 0 && (
            <div className="surgery-options">
              {operableDesired.map((id) => {
                const s = passiveSurgery.get(id)!;
                return (
                  <label key={id} className="surgery-option">
                    <input
                      type="checkbox"
                      checked={!surgeryExcluded.includes(id)}
                      onChange={() => toggleSurgeryExcluded(id)}
                    />
                    {passiveFr.get(id) ?? id}
                    <span className="surgery-option-cost">
                      {s.price > 0 ? `${s.price.toLocaleString("fr-FR")} or` : "gratuit"}
                      {s.item ? ` + ${s.itemFr ?? s.item}` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {missingCarriers.length > 0 && (
        <p className="notice">
          Aucun de tes pals ne porte :{" "}
          <strong>
            {missingCarriers.map((id) => passiveFr.get(id) ?? id).join(", ")}
          </strong>
          . Capture ou ajoute un porteur, sinon ce plan est impossible (hors
          mutation aléatoire).
        </p>
      )}

      {progress === null ? (
        <button
          type="button"
          className="import-btn compute-btn"
          disabled={
            target === null || instances.length === 0 || missingCarriers.length > 0
          }
          onClick={compute}
        >
          Calculer le plan
        </button>
      ) : (
        <div className="progress-zone">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
          <span className="progress-label">
            Calcul en cours — passe {progress.sweep}
          </span>
          <button type="button" className="work-filter-clear" onClick={stopWorker}>
            Annuler
          </button>
        </div>
      )}

      {plan === null && (
        <p className="notice">
          Impossible d'obtenir {target !== null ? pals[target].fr : ""}
          {desired.length > 0 ? " avec ces passifs" : ""} par reproduction
          depuis tes pals.
        </p>
      )}

      {plan && plan.steps.length === 0 && (
        <p className="notice success">
          Tu possèdes déjà ce pal
          {desired.length > 0 && plan.surgeries.length === 0
            ? " avec ces passifs"
            : ""}{" "}
          ! 🎉
          {plan.surgeries.length > 0 &&
            " Il ne reste que la table d'opération :"}
        </p>
      )}

      {plan && plan.steps.length === 0 && plan.surgeries.length > 0 && (
        <SurgeryList surgeries={plan.surgeries} />
      )}

      {plan && plan.steps.length > 0 && (
        <div className="results">
          <div className="results-header">
            <h3>
              {plan.steps.length} croisement{plan.steps.length > 1 ? "s" : ""} —
              ≈ {Math.ceil(plan.totalEggs)} œufs — ≈{" "}
              {formatDuration(plan.totalEggs * minutesPerEgg)}
              {totalGold > 0 &&
                ` — ${totalGold.toLocaleString("fr-FR")} or de chirurgie`}
            </h3>
            <div className="view-controls">
              <label className="minutes-input">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={minutesPerEgg}
                  onChange={(e) => updateMinutes(Number(e.target.value))}
                />
                min/œuf
              </label>
              <div className="view-toggle">
                <button
                  type="button"
                  className={view === "tree" ? "active" : ""}
                  onClick={() => setView("tree")}
                >
                  Arbre
                </button>
                <button
                  type="button"
                  className={view === "list" ? "active" : ""}
                  onClick={() => setView("list")}
                >
                  Liste
                </button>
              </div>
            </div>
          </div>

          {plan.warnings.map((w, k) => (
            <p key={k} className="notice warning">
              ⚠ {w}
            </p>
          ))}

          {view === "tree" ? (
            <PlanTree plan={plan} owned={instances} desired={desired} />
          ) : (
            <>
              {plan.sources.length > 0 && (
                <p className="sources-line">
                  Pals de départ :{" "}
                  {plan.sources.map((s, k) => {
                    const inst = instances[s.instance];
                    return (
                      <span key={k} className="source-item">
                        {k > 0 && " · "}
                        <strong>{pals[s.pal].fr}</strong>
                        {inst?.gender ? ` ${genderSymbol[inst.gender]}` : ""}
                        {inst?.level ? ` niv.${inst.level}` : ""}
                        {inst?.nickname ? ` « ${inst.nickname} »` : ""}
                        <PassiveChips ids={maskIds(s.mask)} />
                      </span>
                    );
                  })}
                </p>
              )}
              <ol className="steps-list">
                {plan.steps.map((s, k) => (
                  <li key={k} className="step-row">
                    <span>
                      {pals[s.p1].fr}
                      {s.p1Gender ? ` ${genderSymbol[s.p1Gender]}` : ""}
                      <PassiveChips ids={maskIds(s.p1Mask)} />
                    </span>
                    <span className="cross">×</span>
                    <span>
                      {pals[s.p2].fr}
                      {s.p2Gender ? ` ${genderSymbol[s.p2Gender]}` : ""}
                      <PassiveChips ids={maskIds(s.p2Mask)} />
                    </span>
                    <span className="arrow">→</span>
                    <strong>
                      {pals[s.child].fr}
                      {s.childGender ? ` ${genderSymbol[s.childGender]}` : ""}
                    </strong>
                    <PassiveChips ids={maskIds(s.childMask)} />
                    {s.eggs > 1.01 && (
                      <span className="eggs-estimate">
                        ~{s.eggs < 10 ? s.eggs.toFixed(1) : Math.round(s.eggs)} œufs
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}

          {plan.surgeries.length > 0 && (
            <SurgeryList surgeries={plan.surgeries} />
          )}

          {desired.length > 0 && (
            <p className="notice">
              Estimation : les genres requis (♂/♀ affichés sur chaque étape)
              sont intégrés au coût en œufs, y compris pour élever un genre
              manquant. Les intermédiaires sont supposés n'hériter que des
              passifs voulus et les passifs aléatoires à l'éclosion ne sont
              pas comptés.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
