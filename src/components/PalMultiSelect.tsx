import { useRef, useState } from "react";
import PalIcon from "./PalIcon";
import { pals, searchPals, dexLabel } from "../lib/data";

interface Props {
  values: number[];
  onChange: (indexes: number[]) => void;
  placeholder?: string;
}

export default function PalMultiSelect({ values, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = open
    ? searchPals(query).filter((i) => !values.includes(i)).slice(0, 80)
    : [];

  const add = (index: number) => {
    onChange([...values, index]);
    setQuery("");
    setHighlight(0);
  };

  const remove = (index: number) => {
    onChange(values.filter((v) => v !== index));
  };

  return (
    <div className="pal-multi">
      {values.length > 0 && (
        <div className="chips">
          {values.map((v) => (
            <span key={pals[v].id} className="chip">
              <PalIcon pal={v} size={18} />
              {pals[v].fr}
              {pals[v].variant ? " ◆" : ""}
              <button
                type="button"
                aria-label={`Retirer ${pals[v].fr}`}
                onClick={() => remove(v)}
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
          placeholder={placeholder ?? "Ajouter un pal…"}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && results[highlight] !== undefined) {
              e.preventDefault();
              add(results[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {open && (
          <ul className="pal-select-dropdown" role="listbox">
            {results.length === 0 && (
              <li className="pal-select-empty">Aucun résultat</li>
            )}
            {results.map((idx, k) => (
              <li
                key={pals[idx].id}
                role="option"
                aria-selected={false}
                className={
                  "pal-select-option" + (k === highlight ? " highlighted" : "")
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(idx);
                }}
                onMouseEnter={() => setHighlight(k)}
              >
                <PalIcon pal={idx} />
                <span className="pal-dex">{dexLabel(idx)}</span>
                {pals[idx].fr}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
