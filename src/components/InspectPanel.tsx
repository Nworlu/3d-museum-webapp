import { useEffect } from "react";
import type { ExhibitInfo } from "../babylon/bootMuseum";

interface InspectPanelProps extends ExhibitInfo {
  onClose: () => void;
}

/**
 * DOM-overlay wall label shown when the visitor clicks an exhibit — styled
 * to match the landing page (Cambria title, brass accent rule, IBM Plex Mono
 * meta line), so the app and the marketing site read as one product.
 */
export function InspectPanel({ title, description, onClose }: InspectPanelProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        right: 28,
        bottom: 28,
        width: 320,
        maxWidth: "calc(100vw - 40px)",
        background: "var(--card)",
        border: "1px solid var(--stone-line)",
        borderLeft: "3px solid var(--brass)",
        borderRadius: 3,
        boxShadow: "0 20px 44px var(--shadow)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 22px 18px" }}>
        <div
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--stone)",
            marginBottom: 8,
          }}
        >
          On view
        </div>
        <h2
          style={{
            margin: "0 0 10px",
            fontFamily: "Cambria, Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 19,
            lineHeight: 1.25,
            color: "var(--ink)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--ink-soft)",
          }}
        >
          {description}
        </p>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid var(--stone-line)",
            color: "var(--ink-soft)",
            borderRadius: 3,
            padding: "7px 14px",
            fontSize: 12,
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brass)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--stone-line)")}
        >
          Close · Esc
        </button>
      </div>
    </div>
  );
}
