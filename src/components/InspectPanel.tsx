import { useEffect } from "react";
import type { ExhibitInfo } from "../babylon/bootMuseum";

interface InspectPanelProps extends ExhibitInfo {
  onClose: () => void;
}

/** DOM-overlay info panel shown when the visitor clicks an exhibit. */
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
        right: 24,
        bottom: 24,
        maxWidth: 320,
        padding: "16px 18px",
        background: "rgba(20,20,20,0.88)",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <h2 style={{ margin: "0 0 8px 0", fontSize: 16 }}>{title}</h2>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, lineHeight: 1.4, opacity: 0.85 }}>{description}</p>
      <button
        onClick={onClose}
        style={{
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "6px 12px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Close (Esc)
      </button>
    </div>
  );
}
