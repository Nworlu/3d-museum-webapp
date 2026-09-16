import { useRef, useState, type FormEvent } from "react";
import { addExhibit, AdminApiError, type ExhibitSummary, type RoomSummary } from "./api";

interface AddExhibitFormProps {
  authHeader: string;
  rooms: RoomSummary[];
  onAdded: (roomId: string, exhibit: ExhibitSummary) => void;
}

export function AddExhibitForm({ authHeader, rooms, onAdded }: AddExhibitFormProps) {
  const [roomId, setRoomId] = useState(rooms[0]?.roomId ?? "");
  const [wall, setWall] = useState<"west" | "east">("west");
  const [offsetFraction, setOffsetFraction] = useState(0);
  const [height, setHeight] = useState(1.6);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!image) {
      setError("Choose an image file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { exhibit } = await addExhibit(authHeader, {
        roomId,
        wall,
        offsetFraction,
        height,
        title,
        description,
        image,
      });
      onAdded(roomId, exhibit);
      setTitle("");
      setDescription("");
      setImage(null);
      setOffsetFraction(0);
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong adding the exhibit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.h2}>Add an exhibit</h2>

      <label style={styles.label} htmlFor="exhibit-room">
        Room
      </label>
      <select id="exhibit-room" style={styles.input} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        {rooms.map((r) => (
          <option key={r.roomId} value={r.roomId}>
            {r.roomId}
          </option>
        ))}
      </select>

      <label style={styles.label}>Wall</label>
      <div style={{ display: "flex", gap: 16 }}>
        <label style={styles.radioLabel}>
          <input type="radio" name="wall" checked={wall === "west"} onChange={() => setWall("west")} /> West
        </label>
        <label style={styles.radioLabel}>
          <input type="radio" name="wall" checked={wall === "east"} onChange={() => setWall("east")} /> East
        </label>
      </div>

      <label style={styles.label} htmlFor="exhibit-offset">
        Position along wall ({offsetFraction.toFixed(2)}, &minus;1 = start, 1 = end)
      </label>
      <input
        id="exhibit-offset"
        style={styles.input}
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={offsetFraction}
        onChange={(e) => setOffsetFraction(Number(e.target.value))}
      />

      <label style={styles.label} htmlFor="exhibit-height">
        Height (meters, eye level is ~1.6)
      </label>
      <input
        id="exhibit-height"
        style={styles.input}
        type="number"
        step={0.1}
        min={0.5}
        max={2.5}
        value={height}
        onChange={(e) => setHeight(Number(e.target.value))}
      />

      <label style={styles.label} htmlFor="exhibit-title">
        Title
      </label>
      <input
        id="exhibit-title"
        style={styles.input}
        type="text"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. The Night Café"
      />

      <label style={styles.label} htmlFor="exhibit-description">
        Description (wall label text)
      </label>
      <textarea
        id="exhibit-description"
        style={{ ...styles.input, minHeight: 70, resize: "vertical" as const }}
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Artist, year, medium, collection."
      />

      <label style={styles.label} htmlFor="exhibit-image">
        Image (JPEG, PNG, or WebP)
      </label>
      <input
        id="exhibit-image"
        ref={imageInputRef}
        style={styles.input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        onChange={(e) => setImage(e.target.files?.[0] ?? null)}
      />

      {error && <p style={styles.error}>{error}</p>}

      <button type="submit" style={styles.submitBtn} disabled={submitting}>
        {submitting ? "Adding…" : "Add exhibit"}
      </button>
    </form>
  );
}

const styles = {
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    maxWidth: 420,
    background: "#1c1c1c",
    padding: 24,
    borderRadius: 8,
  },
  h2: { color: "#fff", fontSize: 18, margin: "0 0 12px" },
  label: { color: "#bbb", fontSize: 13, marginTop: 10 },
  radioLabel: { color: "#ddd", fontSize: 14, display: "flex", alignItems: "center", gap: 6 },
  input: {
    background: "#0f0f0f",
    border: "1px solid #333",
    borderRadius: 4,
    color: "#fff",
    padding: "8px 10px",
    fontSize: 14,
    fontFamily: "inherit",
  },
  error: { color: "#ff8a80", fontSize: 13, marginTop: 8 },
  submitBtn: {
    marginTop: 16,
    background: "#7a2e2a",
    color: "#f5ede3",
    border: "none",
    borderRadius: 4,
    padding: "10px 16px",
    fontSize: 14,
    cursor: "pointer",
  },
};
