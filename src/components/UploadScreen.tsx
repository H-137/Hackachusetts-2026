import { useCallback, useRef, useState } from "react";

interface Props {
  onParsed: (text: string) => void;
  onCancel: () => void;
}

/**
 * Local-only upload screen. The selected file is read with the browser
 * FileReader API and its text is handed to the parser in-memory. It is never
 * sent over the network and never persisted.
 */
export function UploadScreen({ onParsed, onCancel }: Props) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(
    (file: File) => {
      setBusy(true);
      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        setBusy(false);
        const text = typeof reader.result === "string" ? reader.result : "";
        onParsed(text);
      };
      reader.onerror = () => {
        setBusy(false);
        setError("Could not read the file.");
      };
      reader.readAsText(file);
    },
    [onParsed],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) readFile(file);
    },
    [readFile],
  );

  return (
    <section aria-label="Upload AncestryDNA file">
      <h2>Upload AncestryDNA text</h2>
      <p className="subtitle">
        Processing happens locally. Nothing leaves your browser.
      </p>

      <div
        className={`dropzone${dragging ? " drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        {busy ? "Reading file…" : "Drop a .txt file here, or click to choose"}
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
      </div>

      {error && (
        <p className="badge bad" role="alert">
          {error}
        </p>
      )}

      <div className="toolbar">
        <button className="secondary" onClick={onCancel}>
          Back
        </button>
      </div>
    </section>
  );
}
