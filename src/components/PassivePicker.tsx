import { useRef, useState } from "react";
import { passives, normalize } from "../lib/data";

interface Props {
  values: number[]; // index dans la liste des passifs
  onChange: (indexes: number[]) => void;
  max?: number;
}

export default function PassivePicker({ values, onChange, max = 4 }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const q = normalize(query.trim());
  const results = open
    ? passives
        .map((_, i) => i)
        .filter(
          (i) =>
            !values.includes(i) &&
            (q === "" ||
              normalize(passives[i].fr).includes(q) ||
              normalize(passives[i].en).includes(q))
        )
        .slice(0, 60)
    : [];

  const full = values.length >= max;

  return (
    <div className="pal-multi">
      {values.length > 0 && (
        <div className="chips">
          {values.map((v) => (
            <span
              key={passives[v].id}
              className={
                "chip " + (passives[v].rank >= 0 ? "chip-good" : "chip-bad")
              }
            >
              {passives[v].fr}
              <button
                type="button"
                aria-label={`Retirer ${passives[v].fr}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="pal-select">
        <input
          ref={inputRef}
          type="text"
          className="pal-select-input"
          value={query}
          disabled={full}
          placeholder={
            full ? `Maximum ${max} passifs` : "Ajouter un passif…"
          }
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0] !== undefined) {
              e.preventDefault();
              onChange([...values, results[0]]);
              setQuery("");
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {open && !full && (
          <ul className="pal-select-dropdown" role="listbox">
            {results.length === 0 && (
              <li className="pal-select-empty">Aucun résultat</li>
            )}
            {results.map((idx) => (
              <li
                key={passives[idx].id}
                role="option"
                aria-selected={false}
                className="pal-select-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange([...values, idx]);
                  setQuery("");
                }}
              >
                <span
                  className={
                    "passive-rank " +
                    (passives[idx].rank >= 0 ? "rank-good" : "rank-bad")
                  }
                >
                  {passives[idx].rank >= 0 ? "+" : "−"}
                </span>
                {passives[idx].fr}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
