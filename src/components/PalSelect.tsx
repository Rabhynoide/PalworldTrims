import { useRef, useState } from "react";
import PalIcon from "./PalIcon";
import { pals, searchPals, dexLabel } from "../lib/data";

interface Props {
  value: number | null;
  onChange: (index: number | null) => void;
  placeholder?: string;
}

function palLabel(index: number): string {
  const p = pals[index];
  return `${p.fr}${p.variant ? " ◆" : ""}`;
}

export default function PalSelect({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = open ? searchPals(query).slice(0, 80) : [];

  const select = (index: number) => {
    onChange(index);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className="pal-select">
      <input
        ref={inputRef}
        type="text"
        className="pal-select-input"
        value={open ? query : value !== null ? palLabel(value) : ""}
        placeholder={placeholder ?? "Rechercher un pal…"}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
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
            select(results[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {value !== null && !open && (
        <button
          type="button"
          className="pal-select-clear"
          aria-label="Effacer"
          onClick={() => onChange(null)}
        >
          ×
        </button>
      )}
      {open && (
        <ul className="pal-select-dropdown" role="listbox">
          {results.length === 0 && (
            <li className="pal-select-empty">Aucun résultat</li>
          )}
          {results.map((idx, k) => (
            <li
              key={pals[idx].id}
              role="option"
              aria-selected={idx === value}
              className={
                "pal-select-option" + (k === highlight ? " highlighted" : "")
              }
              onMouseDown={(e) => {
                e.preventDefault();
                select(idx);
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
  );
}
