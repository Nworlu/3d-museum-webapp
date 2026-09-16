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
        <div style={pageStyles.eyebrow}>Backstage</div>
        <h1 style={pageStyles.h1}>Museum Admin</h1>
        <p style={pageStyles.sub}>Add or remove exhibits. Changes take effect on the next page load of the museum.</p>
      </header>

      {loadError && <p style={pageStyles.loadError}>{loadError}</p>}

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
                      {exhibit.imageUrl && <img src={exhibit.imageUrl} alt="" style={pageStyles.thumb} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={pageStyles.exhibitTitle}>{exhibit.title}</div>
                        <div style={pageStyles.exhibitDesc}>{exhibit.description}</div>
                      </div>
                      <button
                        style={pageStyles.deleteBtn}
                        onClick={() => handleDelete(room.roomId, exhibit.id)}
                        aria-label={`Remove ${exhibit.title}`}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--oxblood)")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--stone-line)")}
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
        !loadError && <p style={pageStyles.loading}>Loading rooms…</p>
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
      setError(
        err instanceof AdminApiError && err.status === 401
          ? "Wrong password."
          : "Could not reach the admin server. Is it running (npm run server)?",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={loginStyles.wrap}>
      <form onSubmit={handleSubmit} style={loginStyles.form}>
        <div style={loginStyles.mark}>
          <svg width="28" height="28" viewBox="0 0 26 26" fill="none">
            <path
              d="M13 2 24 9v2H2V9L13 2Z"
              stroke="var(--brass)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M4 12v10M9 12v10M13 12v10M17 12v10M22 12v10" stroke="var(--brass)" strokeWidth="1.6" />
            <path d="M2 24h22" stroke="var(--brass)" strokeWidth="1.6" />
          </svg>
        </div>
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

const FONT_DISPLAY = "Cambria, Georgia, 'Times New Roman', serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

const pageStyles = {
  page: {
    minHeight: "100%",
    background: "var(--wall)",
    color: "var(--ink)",
    padding: "40px 44px 60px",
    fontFamily: "'Work Sans', system-ui, sans-serif",
  },
  header: { marginBottom: 32, maxWidth: 640 },
  eyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--stone)",
    marginBottom: 10,
  },
  h1: { margin: 0, fontSize: 30, fontFamily: FONT_DISPLAY, fontWeight: 500 },
  sub: { color: "var(--ink-soft)", fontSize: 14, marginTop: 10, lineHeight: 1.5 },
  loadError: { color: "var(--oxblood)", fontSize: 14 },
  loading: { color: "var(--stone)", fontSize: 14 },
  columns: { display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" as const },
  roomsColumn: { display: "flex", flexDirection: "column" as const, gap: 20, flex: "1 1 480px", minWidth: 320 },
  roomCard: { background: "var(--card)", border: "1px solid var(--stone-line)", borderRadius: 4, padding: 22 },
  roomTitle: {
    margin: "0 0 14px",
    fontSize: 13,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "var(--brass-bright)",
  },
  empty: { color: "var(--stone)", fontSize: 13, fontStyle: "italic" as const },
  exhibitList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" as const, gap: 12 },
  exhibitRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    borderTop: "1px solid var(--stone-line)",
    paddingTop: 12,
  },
  thumb: { width: 46, height: 46, objectFit: "cover" as const, borderRadius: 2, flex: "none", border: "1px solid var(--stone-line)" },
  exhibitTitle: { fontSize: 14, fontFamily: FONT_DISPLAY, fontStyle: "italic" as const, color: "var(--ink)" },
  exhibitDesc: {
    fontSize: 12,
    color: "var(--stone)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    marginTop: 2,
  },
  deleteBtn: {
    background: "none",
    border: "1px solid var(--stone-line)",
    color: "var(--ink-soft)",
    borderRadius: 3,
    padding: "6px 12px",
    fontSize: 11,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    cursor: "pointer",
    flex: "none",
    transition: "border-color 0.15s ease",
  },
};

const loginStyles = {
  wrap: { minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--wall)", fontFamily: "'Work Sans', system-ui, sans-serif" },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    width: 300,
    background: "var(--card)",
    border: "1px solid var(--stone-line)",
    borderRadius: 4,
    padding: "32px 28px",
  },
  mark: { display: "flex", justifyContent: "center", marginBottom: 4 },
  h1: { color: "var(--ink)", fontSize: 20, fontFamily: FONT_DISPLAY, fontWeight: 500, margin: "0 0 6px", textAlign: "center" as const },
  input: {
    background: "var(--wall-raised)",
    border: "1px solid var(--stone-line)",
    borderRadius: 3,
    color: "var(--ink)",
    padding: "11px 13px",
    fontSize: 14,
    fontFamily: "inherit",
  },
  error: { color: "var(--oxblood)", fontSize: 13, margin: 0 },
  submitBtn: {
    background: "var(--oxblood)",
    color: "#f5ede3",
    border: "none",
    borderRadius: 3,
    padding: "11px 16px",
    fontSize: 14,
    fontFamily: "inherit",
    cursor: "pointer",
  },
};
