import { useRef, useState, type FormEvent } from "react";
import { addSculpture, AdminApiError, type ExhibitSummary, type RoomSummary } from "./api";

interface AddSculptureFormProps {
  authHeader: string;
  rooms: RoomSummary[];
  onAdded: (roomId: string, exhibit: ExhibitSummary) => void;
}

export function AddSculptureForm({ authHeader, rooms, onAdded }: AddSculptureFormProps) {
  const [roomId, setRoomId] = useState(rooms[0]?.roomId ?? "");
  const [side, setSide] = useState<"left" | "right">("left");
  const [offsetFraction, setOffsetFraction] = useState(0);
  const [scale, setScale] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!model) {
      setError("Choose a .glb model file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { exhibit } = await addSculpture(authHeader, {
        roomId,
        side,
        offsetFraction,
        scale,
        title,
        description,
        model,
      });
      onAdded(roomId, exhibit);
      setTitle("");
      setDescription("");
      setModel(null);
      setOffsetFraction(0);
      if (modelInputRef.current) modelInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong adding the sculpture.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.eyebrow}>New acquisition</div>
      <h2 style={styles.h2}>Add a sculpture</h2>
      <p style={styles.hint}>Placed on a floor pedestal along the room's center aisle — no wall to pick.</p>

      <label style={styles.label} htmlFor="sculpture-room">
        Room
      </label>
      <select id="sculpture-room" style={styles.input} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        {rooms.map((r) => (
          <option key={r.roomId} value={r.roomId}>
            {r.roomId}
          </option>
        ))}
      </select>

      <label style={styles.label}>Side of the center aisle</label>
      <div style={{ display: "flex", gap: 16 }}>
        <label style={styles.radioLabel}>
          <input type="radio" name="side" checked={side === "left"} onChange={() => setSide("left")} /> Left
        </label>
        <label style={styles.radioLabel}>
          <input type="radio" name="side" checked={side === "right"} onChange={() => setSide("right")} /> Right
        </label>
      </div>

      <label style={styles.label} htmlFor="sculpture-offset">
        Position along the room ({offsetFraction.toFixed(2)}, &minus;1 = start, 1 = end)
      </label>
      <input
        id="sculpture-offset"
        style={styles.input}
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={offsetFraction}
        onChange={(e) => setOffsetFraction(Number(e.target.value))}
      />

      <label style={styles.label} htmlFor="sculpture-scale">
        Scale (multiplies the model's authored size)
      </label>
      <input
        id="sculpture-scale"
        style={styles.input}
        type="number"
        step={0.1}
        min={0.1}
        max={10}
        value={scale}
        onChange={(e) => setScale(Number(e.target.value))}
      />

      <label style={styles.label} htmlFor="sculpture-title">
        Title
      </label>
      <input
        id="sculpture-title"
        style={styles.input}
        type="text"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Bust of an Unknown Patron"
      />

      <label style={styles.label} htmlFor="sculpture-description">
        Description (wall label text)
      </label>
      <textarea
        id="sculpture-description"
        style={{ ...styles.input, minHeight: 70, resize: "vertical" as const }}
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Artist, year, medium, collection."
      />

      <label style={styles.label} htmlFor="sculpture-model">
        3D model (.glb)
      </label>
      <input
        id="sculpture-model"
        ref={modelInputRef}
        style={styles.input}
        type="file"
        accept=".glb"
        required
        onChange={(e) => setModel(e.target.files?.[0] ?? null)}
      />

      {error && <p style={styles.error}>{error}</p>}

      <button type="submit" style={styles.submitBtn} disabled={submitting}>
        {submitting ? "Adding…" : "Add sculpture"}
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
    maxWidth: 420,
    flex: "1 1 340px",
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
  h2: { color: "var(--ink)", fontSize: 19, fontFamily: FONT_DISPLAY, fontWeight: 500, margin: "0 0 6px" },
  hint: { color: "var(--stone)", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 8px" },
  label: { color: "var(--stone)", fontSize: 12, fontFamily: FONT_MONO, letterSpacing: "0.03em", marginTop: 12 },
  radioLabel: { color: "var(--ink-soft)", fontSize: 14, display: "flex", alignItems: "center", gap: 6 },
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
    marginTop: 18,
    background: "var(--oxblood)",
    color: "#f5ede3",
    border: "none",
    borderRadius: 3,
    padding: "11px 16px",
    fontSize: 14,
    fontFamily: "'Work Sans', system-ui, sans-serif",
    cursor: "pointer",
  },
};
