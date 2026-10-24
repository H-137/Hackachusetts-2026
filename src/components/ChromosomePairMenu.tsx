import { useEffect, useRef, useState } from "react";
import { AUTOSOME_ORDER, chromLength, formatBp } from "../domain/explorer";

interface Props {
  value: string;
  onChange: (chrom: string) => void;
}

/**
 * A concise menu to choose which chromosome pair (copy 1 + copy 2) to view.
 * A compact trigger opens a plain, scannable list of all 22 autosomes with
 * their lengths. Closes on outside click or Escape; keyboard-operable.
 */
export function ChromosomePairMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (c: string) => {
    onChange(c);
    setOpen(false);
  };

  return (
    <div className="pair-menu" ref={rootRef}>
      <button
        className="pair-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pair-menu-label">Chromosome</span>
        <span className="pair-menu-value">chr{value}</span>
        <span className="pair-menu-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          className="pair-menu-pop"
          role="listbox"
          aria-label="Chromosome"
        >
          {AUTOSOME_ORDER.map((c) => (
            <button
              key={c}
              role="option"
              aria-selected={c === value}
              className={c === value ? "pair-opt active" : "pair-opt"}
              onClick={() => select(c)}
            >
              <span className="pair-opt-num">chr{c}</span>
              <span className="pair-opt-len">{formatBp(chromLength(c))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
