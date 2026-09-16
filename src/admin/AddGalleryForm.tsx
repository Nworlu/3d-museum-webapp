import { useState, type FormEvent } from "react";
import { addRoom, AdminApiError, type RoomSummary } from "./api";

interface AddGalleryFormProps {
  authHeader: string;
  onAdded: (room: RoomSummary) => void;
}

export function AddGalleryForm({ authHeader, onAdded }: AddGalleryFormProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const room = await addRoom(authHeader, name);
      onAdded(room);
      setName("");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong adding the gallery.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.eyebrow}>Expand the building</div>
      <h2 style={styles.h2}>Add a gallery</h2>
      <p style={styles.hint}>
        Appends a new room past the last one in the building, wired into the walkway automatically.
      </p>

      <label style={styles.label} htmlFor="gallery-name">
        Gallery name
      </label>
      <input
        id="gallery-name"
        style={styles.input}
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Modern Wing"
      />

      {error && <p style={styles.error}>{error}</p>}

      <button type="submit" style={styles.submitBtn} disabled={submitting}>
        {submitting ? "Building…" : "Add gallery"}
      </button>
    </form>
  );
}

const FONT_DISPLAY = "Cambria, Georgia, 'Times New Roman', serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

const styles = {
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    background: "var(--card)",
    border: "1px solid var(--stone-line)",
    padding: "24px 26px 28px",
    borderRadius: 4,
  },
  eyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--stone)",
    marginBottom: 6,
  },
  h2: { color: "var(--ink)", fontSize: 19, fontFamily: FONT_DISPLAY, fontWeight: 500, margin: "0 0 8px" },
  hint: { color: "var(--stone)", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 8px" },
  label: { color: "var(--stone)", fontSize: 12, fontFamily: FONT_MONO, letterSpacing: "0.03em", marginTop: 6 },
  input: {
    background: "var(--wall-raised)",
    border: "1px solid var(--stone-line)",
    borderRadius: 3,
    color: "var(--ink)",
    padding: "9px 11px",
    fontSize: 14,
    fontFamily: "'Work Sans', system-ui, sans-serif",
  },
  error: { color: "var(--oxblood)", fontSize: 13, marginTop: 8 },
  submitBtn: {
    marginTop: 14,
    background: "var(--wall-raised)",
    color: "var(--ink)",
    border: "1px solid var(--brass)",
    borderRadius: 3,
    padding: "11px 16px",
    fontSize: 14,
    fontFamily: "'Work Sans', system-ui, sans-serif",
    cursor: "pointer",
  },
};
