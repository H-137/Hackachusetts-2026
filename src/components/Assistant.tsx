import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import {
  buildAssistantContext,
  offlineAssistant,
  type AssistantMessage,
} from "../domain/assistant";

interface Props {
  bundle: AnalysisBundle;
  activeTab: string;
}

const SUGGESTIONS = [
  "What's my ancestry composition?",
  "Which conditions were flagged?",
  "Am I at elevated risk for breast cancer?",
  "How does local ancestry inference work?",
  "Why is the CAD score unscorable?",
];

/**
 * In-app assistant: a dockable chat panel present across all explorer tabs. It
 * answers questions about the user's results and the analysis methods using the
 * offline, privacy-preserving engine (no raw genetic data leaves the device).
 */
export function Assistant({ bundle, activeTab }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      text: "Hi — I can explain your results and how the analysis works. Ask about ancestry, flagged conditions, risk, the disease score, or any pipeline step.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const ctx = useMemo(
    () => buildAssistantContext(bundle, activeTab),
    [bundle, activeTab],
  );

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const reply = await offlineAssistant.answer(q, ctx);
      setMessages((m) => [...m, reply]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I could not answer that question. Please try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`assistant${open ? " open" : ""}`}>
      {open ? (
        <div className="assistant-panel" role="dialog" aria-label="Results assistant">
          <div className="assistant-head">
            <div>
              <strong>Assistant</strong>{" "}
              <span className="badge">on-device</span>
            </div>
            <button
              className="icon-btn"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="assistant-msgs" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`amsg amsg-${m.role}`}>
                {m.text.split("\n").map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
                {m.sources && m.sources.length > 0 && (
                  <div className="amsg-sources">
                    {m.sources.map((s, k) => (
                      <span key={s}>
                        {k > 0 && " · "}
                        <a href={s} target="_blank" rel="noopener noreferrer">
                          {hostOf(s)}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="amsg amsg-assistant">…</div>}
          </div>

          {messages.length <= 1 && (
            <div className="assistant-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggest-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your results or the methods…"
              aria-label="Ask the assistant"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>

          <p className="assistant-foot">
            Answers are generated on-device from a non-identifying summary. Not
            medical advice.
          </p>
        </div>
      ) : (
        <button
          className="assistant-fab"
          onClick={() => setOpen(true)}
          aria-label="Open results assistant"
        >
          Ask about your results
        </button>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
