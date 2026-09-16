import { useEffect, useState, type FormEvent } from "react";
import { AddExhibitForm } from "./AddExhibitForm";
import { basicAuthHeader, deleteExhibit, getRooms, AdminApiError, type RoomSummary } from "./api";

const STORAGE_KEY = "museum-admin-auth";

export function AdminPage() {
  const [authHeader, setAuthHeader] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!authHeader) return;
    let cancelled = false;
    getRooms(authHeader)
      .then(({ rooms }) => {
        if (!cancelled) setRooms(rooms);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AdminApiError && err.status === 401) {
          sessionStorage.removeItem(STORAGE_KEY);
          setAuthHeader(null);
        } else {
          setLoadError(err instanceof Error ? err.message : "Failed to load rooms.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authHeader]);

  function handleLogin(header: string) {
    sessionStorage.setItem(STORAGE_KEY, header);
    setAuthHeader(header);
    setLoadError(null);
  }

  async function handleDelete(roomId: string, exhibitId: string) {
    if (!authHeader) return;
    if (!confirm(`Remove "${exhibitId}" from ${roomId}? This can't be undone.`)) return;
    try {
      await deleteExhibit(authHeader, roomId, exhibitId);
      setRooms(
        (prev) =>
          prev?.map((r) =>
            r.roomId === roomId ? { ...r, exhibits: r.exhibits.filter((e) => e.id !== exhibitId) } : r,
          ) ?? null,
      );
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Failed to delete exhibit.");
    }
  }

  if (!authHeader) return <LoginForm onLogin={handleLogin} />;

  return (
    <div style={pageStyles.page}>
      <header style={pageStyles.header}>
        <h1 style={pageStyles.h1}>Museum Admin</h1>
        <p style={pageStyles.sub}>Add or remove exhibits. Changes take effect on the next page load of the museum.</p>
      </header>

      {loadError && <p style={{ color: "#ff8a80" }}>{loadError}</p>}

      {rooms ? (
        <div style={pageStyles.columns}>
          <div style={pageStyles.roomsColumn}>
            {rooms.map((room) => (
              <section key={room.roomId} style={pageStyles.roomCard}>
                <h2 style={pageStyles.roomTitle}>{room.roomId}</h2>
                {room.exhibits.length === 0 && <p style={pageStyles.empty}>No exhibits yet.</p>}
                <ul style={pageStyles.exhibitList}>
                  {room.exhibits.map((exhibit) => (
                    <li key={exhibit.id} style={pageStyles.exhibitRow}>
                      {exhibit.imageUrl && (
                        <img src={exhibit.imageUrl} alt="" style={pageStyles.thumb} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={pageStyles.exhibitTitle}>{exhibit.title}</div>
                        <div style={pageStyles.exhibitDesc}>{exhibit.description}</div>
                      </div>
                      <button
                        style={pageStyles.deleteBtn}
                        onClick={() => handleDelete(room.roomId, exhibit.id)}
                        aria-label={`Remove ${exhibit.title}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <AddExhibitForm
            authHeader={authHeader}
            rooms={rooms}
            onAdded={(roomId, exhibit) =>
              setRooms(
                (prev) =>
                  prev?.map((r) => (r.roomId === roomId ? { ...r, exhibits: [...r.exhibits, exhibit] } : r)) ?? null,
              )
            }
          />
        </div>
      ) : (
        !loadError && <p style={{ color: "#888" }}>Loading rooms…</p>
      )}
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: (header: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const header = basicAuthHeader(password);
    try {
      await getRooms(header);
      onLogin(header);
    } catch (err) {
      setError(err instanceof AdminApiError && err.status === 401 ? "Wrong password." : "Could not reach the admin server. Is it running (npm run server)?");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={loginStyles.wrap}>
      <form onSubmit={handleSubmit} style={loginStyles.form}>
        <h1 style={loginStyles.h1}>Museum Admin</h1>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={loginStyles.input}
        />
        {error && <p style={loginStyles.error}>{error}</p>}
        <button type="submit" style={loginStyles.submitBtn} disabled={checking}>
          {checking ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

const pageStyles = {
  page: { minHeight: "100%", background: "#0f0f0f", color: "#eee", padding: "32px 40px", fontFamily: "system-ui, sans-serif" },
  header: { marginBottom: 28 },
  h1: { margin: 0, fontSize: 24 },
  sub: { color: "#999", fontSize: 14, marginTop: 6 },
  columns: { display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" as const },
  roomsColumn: { display: "flex", flexDirection: "column" as const, gap: 20, flex: "1 1 480px", minWidth: 320 },
  roomCard: { background: "#1c1c1c", borderRadius: 8, padding: 20 },
  roomTitle: { margin: "0 0 12px", fontSize: 16, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#bbb" },
  empty: { color: "#666", fontSize: 13, fontStyle: "italic" as const },
  exhibitList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" as const, gap: 10 },
  exhibitRow: { display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #2a2a2a", paddingTop: 10 },
  thumb: { width: 44, height: 44, objectFit: "cover" as const, borderRadius: 4, flex: "none" },
  exhibitTitle: { fontSize: 14, fontWeight: 500 },
  exhibitDesc: { fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  deleteBtn: { background: "none", border: "1px solid #444", color: "#ccc", borderRadius: 4, padding: "6px 10px", fontSize: 12, cursor: "pointer", flex: "none" },
};

const loginStyles = {
  wrap: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f0f0f", fontFamily: "system-ui, sans-serif" },
  form: { display: "flex", flexDirection: "column" as const, gap: 12, width: 280 },
  h1: { color: "#fff", fontSize: 20, margin: "0 0 8px", textAlign: "center" as const },
  input: { background: "#1c1c1c", border: "1px solid #333", borderRadius: 4, color: "#fff", padding: "10px 12px", fontSize: 14 },
  error: { color: "#ff8a80", fontSize: 13, margin: 0 },
  submitBtn: { background: "#7a2e2a", color: "#f5ede3", border: "none", borderRadius: 4, padding: "10px 16px", fontSize: 14, cursor: "pointer" },
};
