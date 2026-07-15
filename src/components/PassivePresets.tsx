import { useState } from "react";
import { passives } from "../lib/data";
import { loadPresets, savePresets, type PassivePreset } from "../lib/presets";

interface Props {
  /** Sélection courante (indexes dans la liste des passifs). */
  current: number[];
  onApply: (indexes: number[]) => void;
}

const indexById = new Map(passives.map((p, i) => [p.id, i]));

export default function PassivePresets({ current, onApply }: Props) {
  const [presets, setPresets] = useState<PassivePreset[]>(loadPresets);
  const [name, setName] = useState("");

  const update = (list: PassivePreset[]) => {
    setPresets(list);
    savePresets(list);
  };

  const apply = (preset: PassivePreset) => {
    onApply(
      preset.passives
        .map((id) => indexById.get(id))
        .filter((i): i is number => i !== undefined)
    );
  };

  const remove = (presetName: string) => {
    update(presets.filter((p) => p.name !== presetName));
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (trimmed === "" || current.length === 0) return;
    const preset: PassivePreset = {
      name: trimmed,
      passives: current.map((i) => passives[i].id),
    };
    update([...presets.filter((p) => p.name !== trimmed), preset]);
    setName("");
  };

  return (
    <div className="presets">
      {presets.map((p) => (
        <span
          key={p.name}
          className="preset-chip"
          title={p.passives
            .map((id) => passives[indexById.get(id) ?? -1]?.fr ?? id)
            .join(", ")}
        >
          <button type="button" className="preset-apply" onClick={() => apply(p)}>
            {p.name}
          </button>
          <button
            type="button"
            className="preset-delete"
            aria-label={`Supprimer le preset ${p.name}`}
            onClick={() => remove(p.name)}
          >
            ×
          </button>
        </span>
      ))}
      <span className="preset-save">
        <input
          type="text"
          placeholder="Nom du preset…"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveCurrent();
          }}
        />
        <button
          type="button"
          disabled={name.trim() === "" || current.length === 0}
          onClick={saveCurrent}
          title={
            current.length === 0
              ? "Sélectionne d'abord des passifs"
              : "Enregistrer la sélection courante"
          }
        >
          + Enregistrer
        </button>
      </span>
    </div>
  );
}
