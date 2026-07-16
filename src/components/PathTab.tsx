import { useEffect, useMemo, useRef, useState } from "react";
import PalSelect from "./PalSelect";
import PalMultiSelect from "./PalMultiSelect";
import PassivePicker from "./PassivePicker";
import PassivePresets from "./PassivePresets";
import PlanTree from "./PlanTree";
import PalIcon from "./PalIcon";
import PassiveChips from "./PassiveChipList";
import { pals, passives } from "../lib/data";
import { useOwnedData } from "../lib/useOwnedData";
import type { OwnedInstance, PlanResult, PlanStep } from "../lib/passivePathfinder";
import type { PlanRequest, PlanWorkerMessage } from "../lib/planWorker";
import {
  createActivePlan,
  loadActivePlan,
  saveActivePlan,
  type ActivePlan,
} from "../lib/activePlan";

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

const maskIdsOf = (desired: string[], mask: number) =>
  desired.filter((_, k) => mask & (1 << k));

/** Ligne d'étape de croisement, avec case à cocher optionnelle (checklist). */
function StepLine({
  step: s,
  desired,
  checked,
  onToggle,
}: {
  step: PlanStep;
  desired: string[];
  checked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <li className={"step-row" + (checked ? " done" : "")}>
      {onToggle && (
        <input
          type="checkbox"
          className="step-check"
          checked={checked ?? false}
          onChange={onToggle}
        />
      )}
      <span>
        <PalIcon pal={s.p1} size={20} /> {pals[s.p1].fr}
        {s.p1Gender ? ` ${genderSymbol[s.p1Gender]}` : ""}
        <PassiveChips ids={maskIdsOf(desired, s.p1Mask)} />
      </span>
      <span className="cross">×</span>
      <span>
        <PalIcon pal={s.p2} size={20} /> {pals[s.p2].fr}
        {s.p2Gender ? ` ${genderSymbol[s.p2Gender]}` : ""}
        <PassiveChips ids={maskIdsOf(desired, s.p2Mask)} />
      </span>
      <span className="arrow">→</span>
      <strong>
        <PalIcon pal={s.child} size={20} /> {pals[s.child].fr}
        {s.childGender ? ` ${genderSymbol[s.childGender]}` : ""}
      </strong>
      <PassiveChips ids={maskIdsOf(desired, s.childMask)} />
      {s.eggs > 1.01 && (
        <span className="eggs-estimate">
          ~{s.eggs < 10 ? s.eggs.toFixed(1) : Math.round(s.eggs)} œufs
        </span>
      )}
    </li>
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

  // Plan suivi (checklist persistée entre les sessions).
  const [active, setActive] = useState<ActivePlan | null>(loadActivePlan);

  const updateActive = (next: ActivePlan | null) => {
    setActive(next);
    saveActivePlan(next);
  };

  const toggleActiveStep = (index: number) => {
    if (!active) return;
    const checkedSteps = active.checkedSteps.map((c, k) => (k === index ? !c : c));
    updateActive({ ...active, checkedSteps });
  };

  const toggleActiveSurgery = (index: number) => {
    if (!active) return;
    const checkedSurgeries = active.checkedSurgeries.map((c, k) =>
      k === index ? !c : c
    );
    updateActive({ ...active, checkedSurgeries });
  };

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

  const followPlan = () => {
    if (!plan || target === null) return;
    updateActive(createActivePlan(plan, instances, target, desired));
  };

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

      {active &&
        (() => {
          const targetIdx = pals.findIndex((p) => p.id === active.targetId);
          const done =
            active.checkedSteps.filter(Boolean).length +
            active.checkedSurgeries.filter(Boolean).length;
          const total =
            active.checkedSteps.length + active.checkedSurgeries.length;
          return (
            <div className="checklist-panel">
              <div className="checklist-header">
                <h3>
                  📌 Plan en cours :{" "}
                  {targetIdx !== -1 ? pals[targetIdx].fr : active.targetId}
                  <PassiveChips ids={active.desired} />
                </h3>
                <span className="checklist-progress">
                  {done}/{total}
                </span>
                <button
                  type="button"
                  className="work-filter-clear"
                  onClick={() => updateActive(null)}
                >
                  Abandonner
                </button>
              </div>
              {active.plan.sources.length > 0 && (
                <p className="sources-line">
                  Pals de départ :{" "}
                  {active.plan.sources.map((s, k) => {
                    const inst = active.owned[s.instance];
                    return (
                      <span key={k} className="source-item">
                        {k > 0 && " · "}
                        <PalIcon pal={s.pal} size={18} />{" "}
                        <strong>{pals[s.pal].fr}</strong>
                        {inst?.gender ? ` ${genderSymbol[inst.gender]}` : ""}
                        {inst?.level ? ` niv.${inst.level}` : ""}
                        {inst?.nickname ? ` « ${inst.nickname} »` : ""}
                        <PassiveChips ids={maskIdsOf(active.desired, s.mask)} />
                      </span>
                    );
                  })}
                </p>
              )}
              <ol className="steps-list">
                {active.plan.steps.map((s, k) => (
                  <StepLine
                    key={k}
                    step={s}
                    desired={active.desired}
                    checked={active.checkedSteps[k]}
                    onToggle={() => toggleActiveStep(k)}
                  />
                ))}
              </ol>
              {active.plan.surgeries.length > 0 && (
                <ul className="surgery-list">
                  {active.plan.surgeries.map((id, k) => {
                    const sg = passiveSurgery.get(id);
                    return (
                      <li
                        key={id}
                        className={
                          "surgery-row" +
                          (active.checkedSurgeries[k] ? " done" : "")
                        }
                      >
                        <input
                          type="checkbox"
                          className="step-check"
                          checked={active.checkedSurgeries[k]}
                          onChange={() => toggleActiveSurgery(k)}
                        />
                        🛠 Ajouter <PassiveChips ids={[id]} /> —{" "}
                        {sg?.price
                          ? `${sg.price.toLocaleString("fr-FR")} or`
                          : "gratuit"}
                        {sg?.item ? ` + ${sg.itemFr ?? sg.item}` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
              {total > 0 && done === total && (
                <p className="notice success">
                  Plan terminé, bien joué ! 🎉 Pense à resynchroniser tes pals.
                </p>
              )}
            </div>
          );
        })()}

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
        <>
          <SurgeryList surgeries={plan.surgeries} />
          <button type="button" className="follow-btn" onClick={followPlan}>
            📌 Suivre ce plan
          </button>
        </>
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
              <button type="button" className="follow-btn" onClick={followPlan}>
                📌 Suivre ce plan
              </button>
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
                        <PalIcon pal={s.pal} size={18} />{" "}
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
                  <StepLine key={k} step={s} desired={desired} />
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
