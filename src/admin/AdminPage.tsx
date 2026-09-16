import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { AddExhibitForm } from "./AddExhibitForm";
import { AddGalleryForm } from "./AddGalleryForm";
import { AddSculptureForm } from "./AddSculptureForm";
import {
  basicAuthHeader,
  deleteExhibit,
  getActivity,
  getRooms,
  reorderRooms,
  setRoomPillar,
  AdminApiError,
  type ActivityEvent,
  type RoomSummary,
} from "./api";
import { ArchIcon, ColumnsIcon, FrameIcon, LayoutIcon, PlusFrameIcon, type IconProps } from "../icons/MuseumIcons";

const STORAGE_KEY = "museum-admin-auth";

const NAV_ITEMS: Array<{ id: string; label: string; icon: ComponentType<IconProps> }> = [
  { id: "top", label: "Dashboard", icon: LayoutIcon },
  { id: "galleries", label: "Galleries", icon: ColumnsIcon },
  { id: "exhibits", label: "Exhibits", icon: FrameIcon },
  { id: "add-exhibit", label: "Add Exhibit", icon: PlusFrameIcon },
];

const ROOM_GRADIENTS = [
  "linear-gradient(135deg, var(--brass) 0%, var(--oxblood) 100%)",
  "linear-gradient(135deg, var(--oxblood) 0%, var(--stone) 100%)",
  "linear-gradient(135deg, var(--stone) 0%, var(--brass-bright) 100%)",
  "linear-gradient(135deg, var(--brass-bright) 0%, var(--oxblood) 100%)",
];

function gradientForRoom(roomId: string): string {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) hash = (hash * 31 + roomId.charCodeAt(i)) >>> 0;
  return ROOM_GRADIENTS[hash % ROOM_GRADIENTS.length];
}

function formatRelativeTime(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 5) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const ACTIVITY_DOT: Record<ActivityEvent["type"], string> = {
  "room-added": "var(--brass)",
  "room-updated": "var(--stone)",
  "rooms-reordered": "var(--stone)",
  "exhibit-added": "var(--brass-bright)",
  "exhibit-removed": "var(--oxblood)",
};

export function AdminPage() {
  const [authHeader, setAuthHeader] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState<string>("all");

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
    getActivity(authHeader)
      .then(({ activity }) => {
        if (!cancelled) setActivity(activity);
      })
      .catch(() => {
        /* the activity panel is a nicety — a failed fetch just leaves it empty */
      });
    return () => {
      cancelled = true;
    };
  }, [authHeader]);

  function pushActivity(type: ActivityEvent["type"], message: string) {
    setActivity((prev) => [{ type, message, at: new Date().toISOString() }, ...prev].slice(0, 30));
  }

  function handleLogin(header: string) {
    sessionStorage.setItem(STORAGE_KEY, header);
    setAuthHeader(header);
    setLoadError(null);
  }

  function handleLogout() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthHeader(null);
    setRooms(null);
    setActivity([]);
  }

  async function handleDelete(roomId: string, exhibitId: string, title: string) {
    if (!authHeader) return;
    if (!confirm(`Remove "${title}" from ${roomId}? This can't be undone.`)) return;
    try {
      await deleteExhibit(authHeader, roomId, exhibitId);
      setRooms(
        (prev) =>
          prev?.map((r) =>
            r.roomId === roomId ? { ...r, exhibits: r.exhibits.filter((e) => e.id !== exhibitId) } : r,
          ) ?? null,
      );
      pushActivity("exhibit-removed", `Removed "${title}" from ${roomId}`);
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Failed to delete exhibit.");
    }
  }

  async function handleMoveGallery(index: number, direction: -1 | 1) {
    if (!authHeader || !rooms) return;
    const target = index + direction;
    if (target < 0 || target >= rooms.length) return;
    const order = rooms.map((r) => r.roomId);
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await reorderRooms(authHeader, order);
      const { rooms: fresh } = await getRooms(authHeader);
      setRooms(fresh);
      pushActivity("rooms-reordered", `Reordered galleries: ${order.join(" → ")}`);
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Failed to reorder galleries.");
    }
  }

  async function handleTogglePillar(roomId: string, next: boolean) {
    if (!authHeader) return;
    try {
      await setRoomPillar(authHeader, roomId, next);
      setRooms((prev) => prev?.map((r) => (r.roomId === roomId ? { ...r, pillar: next } : r)) ?? null);
      pushActivity("room-updated", `${next ? "Added" : "Removed"} the center pillar in ${roomId}`);
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Failed to update the gallery.");
    }
  }

  const exhibitCount = rooms?.reduce((sum, r) => sum + r.exhibits.length, 0) ?? 0;

  const visibleExhibits = useMemo(() => {
    if (!rooms) return [];
    const q = search.trim().toLowerCase();
    return rooms
      .filter((r) => roomFilter === "all" || r.roomId === roomFilter)
      .flatMap((r) => r.exhibits.map((exhibit) => ({ roomId: r.roomId, exhibit })))
      .filter(
        ({ exhibit }) => !q || exhibit.title.toLowerCase().includes(q) || exhibit.description.toLowerCase().includes(q),
      );
  }, [rooms, search, roomFilter]);

  if (!authHeader) return <LoginForm onLogin={handleLogin} />;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={pageStyles.shell}>
      <aside style={pageStyles.sidebar}>
        <div style={pageStyles.brand}>
          <svg width="24" height="24" viewBox="0 0 26 26" fill="none">
            <path d="M13 2 24 9v2H2V9L13 2Z" stroke="var(--brass)" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M4 12v10M9 12v10M13 12v10M17 12v10M22 12v10" stroke="var(--brass)" strokeWidth="1.6" />
            <path d="M2 24h22" stroke="var(--brass)" strokeWidth="1.6" />
          </svg>
          <span style={pageStyles.brandLabel}>Museum Admin</span>
        </div>
        <nav style={pageStyles.nav}>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} style={pageStyles.navItem} onClick={() => scrollTo(item.id)}>
              <item.icon size={17} style={pageStyles.navIcon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <button style={pageStyles.logoutBtn} onClick={handleLogout}>
          Log out
        </button>
      </aside>

      <div style={pageStyles.main}>
        <div style={pageStyles.topbar}>
          <div style={pageStyles.searchBox}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flex: "none" }}>
              <circle cx="7" cy="7" r="5" stroke="var(--stone)" strokeWidth="1.4" />
              <path d="M11 11 15 15" stroke="var(--stone)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search exhibits"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={pageStyles.searchInput}
            />
          </div>
          <div style={pageStyles.topbarRight}>
            <div style={pageStyles.statChip}>
              {exhibitCount} <span style={pageStyles.statChipLabel}>on view</span>
            </div>
            <div style={pageStyles.adminBadge}>
              <div style={pageStyles.adminAvatar}>A</div>
              <span>Admin</span>
            </div>
          </div>
        </div>

        <div id="top" style={pageStyles.content}>
          <div style={pageStyles.pageHeading}>
            <div style={pageStyles.eyebrow}>Backstage</div>
            <h1 style={pageStyles.h1}>Museum Admin</h1>
            <p style={pageStyles.sub}>
              Add exhibits, open new galleries, and remove pieces — live on the next page load.
            </p>
          </div>

          {loadError && <p style={pageStyles.loadError}>{loadError}</p>}

          {rooms ? (
            <>
              <div style={pageStyles.statsRow}>
                <div style={pageStyles.statCard}>
                  <ColumnsIcon size={22} style={pageStyles.statIcon} />
                  <div>
                    <div style={pageStyles.statNum}>{rooms.length}</div>
                    <div style={pageStyles.statCap}>Galleries</div>
                  </div>
                </div>
                <div style={pageStyles.statCard}>
                  <FrameIcon size={22} style={pageStyles.statIcon} />
                  <div>
                    <div style={pageStyles.statNum}>{exhibitCount}</div>
                    <div style={pageStyles.statCap}>Exhibits on view</div>
                  </div>
                </div>
                <div style={pageStyles.statCard}>
                  <ArchIcon size={22} style={pageStyles.statIcon} />
                  <div>
                    <div style={pageStyles.statNum}>{rooms.filter((r) => r.exhibits.length === 0).length}</div>
                    <div style={pageStyles.statCap}>Empty galleries</div>
                  </div>
                </div>
              </div>

              <section id="galleries" style={pageStyles.section}>
                <div style={pageStyles.sectionHeader}>
                  <h2 style={pageStyles.sectionTitle}>Galleries</h2>
                </div>
                <div style={pageStyles.galleryRow}>
                  {rooms.map((room, index) => (
                    <div key={room.roomId} style={pageStyles.galleryTile}>
                      <button
                        style={pageStyles.galleryTileButton}
                        onClick={() => {
                          setRoomFilter(room.roomId);
                          scrollTo("exhibits");
                        }}
                      >
                        <div style={{ ...pageStyles.galleryAvatar, background: gradientForRoom(room.roomId) }}>
                          {room.roomId.slice(0, 2).toUpperCase()}
                          <span style={pageStyles.galleryBadge}>{room.exhibits.length}</span>
                        </div>
                        <div style={pageStyles.galleryName}>{room.roomId}</div>
                        <div style={pageStyles.galleryMeta}>
                          z {room.boundary.minZ} to {room.boundary.maxZ}
                        </div>
                      </button>
                      <div style={pageStyles.galleryOrderRow}>
                        <button
                          style={pageStyles.orderBtn}
                          disabled={index === 0}
                          aria-label={`Move ${room.roomId} earlier`}
                          onClick={() => handleMoveGallery(index, -1)}
                        >
                          &lsaquo;
                        </button>
                        <button
                          style={pageStyles.orderBtn}
                          disabled={index === rooms.length - 1}
                          aria-label={`Move ${room.roomId} later`}
                          onClick={() => handleMoveGallery(index, 1)}
                        >
                          &rsaquo;
                        </button>
                      </div>
                      <button
                        style={room.pillar ? pageStyles.pillarToggleOn : pageStyles.pillarToggleOff}
                        onClick={() => handleTogglePillar(room.roomId, !room.pillar)}
                      >
                        Pillar {room.pillar ? "On" : "Off"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section id="exhibits" style={pageStyles.section}>
                <div style={pageStyles.sectionHeader}>
                  <h2 style={pageStyles.sectionTitle}>Exhibits</h2>
                  <div style={pageStyles.tabs}>
                    <button
                      style={roomFilter === "all" ? pageStyles.tabActive : pageStyles.tab}
                      onClick={() => setRoomFilter("all")}
                    >
                      All
                    </button>
                    {rooms.map((room) => (
                      <button
                        key={room.roomId}
                        style={roomFilter === room.roomId ? pageStyles.tabActive : pageStyles.tab}
                        onClick={() => setRoomFilter(room.roomId)}
                      >
                        {room.roomId}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleExhibits.length === 0 && <p style={pageStyles.empty}>No exhibits match.</p>}
                <div style={pageStyles.exhibitGrid}>
                  {visibleExhibits.map(({ roomId, exhibit }) => (
                    <div key={`${roomId}-${exhibit.id}`} style={pageStyles.exhibitCard}>
                      <div style={pageStyles.exhibitFrame}>
                        {exhibit.imageUrl ? (
                          <img src={exhibit.imageUrl} alt="" style={pageStyles.exhibitImg} />
                        ) : exhibit.kind === "model" ? (
                          <div style={pageStyles.sculpturePlaceholder}>Sculpture</div>
                        ) : null}
                      </div>
                      <div style={pageStyles.exhibitCardBody}>
                        <div style={pageStyles.exhibitTitle}>{exhibit.title}</div>
                        <div style={pageStyles.exhibitDesc}>{exhibit.description}</div>
                        <div style={pageStyles.exhibitCardFooter}>
                          <span style={pageStyles.exhibitRoomTag}>{roomId}</span>
                          <button
                            style={pageStyles.deleteBtn}
                            onClick={() => handleDelete(roomId, exhibit.id, exhibit.title)}
                            aria-label={`Remove ${exhibit.title}`}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--oxblood)")}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--stone-line)")}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section id="add-exhibit" style={pageStyles.section}>
                <div style={pageStyles.sectionHeader}>
                  <h2 style={pageStyles.sectionTitle}>Add an exhibit</h2>
                </div>
                <div style={pageStyles.formsRow}>
                  <AddExhibitForm
                    authHeader={authHeader}
                    rooms={rooms}
                    onAdded={(roomId, exhibit) => {
                      setRooms(
                        (prev) =>
                          prev?.map((r) =>
                            r.roomId === roomId ? { ...r, exhibits: [...r.exhibits, exhibit] } : r,
                          ) ?? null,
                      );
                      pushActivity("exhibit-added", `Added "${exhibit.title}" to ${roomId}`);
                    }}
                  />
                  <AddSculptureForm
                    authHeader={authHeader}
                    rooms={rooms}
                    onAdded={(roomId, exhibit) => {
                      setRooms(
                        (prev) =>
                          prev?.map((r) =>
                            r.roomId === roomId ? { ...r, exhibits: [...r.exhibits, exhibit] } : r,
                          ) ?? null,
                      );
                      pushActivity("exhibit-added", `Added sculpture "${exhibit.title}" to ${roomId}`);
                    }}
                  />
                </div>
              </section>
            </>
          ) : (
            !loadError && <p style={pageStyles.loading}>Loading rooms…</p>
          )}
        </div>
      </div>

      <aside style={pageStyles.rightSidebar}>
        {rooms && (
          <AddGalleryForm
            authHeader={authHeader}
            onAdded={(room) => {
              setRooms((prev) => [...(prev ?? []), room]);
              pushActivity("room-added", `Opened gallery "${room.roomId}"`);
            }}
          />
        )}

        <div style={pageStyles.activityCard}>
          <div style={pageStyles.sectionHeaderTight}>
            <h2 style={pageStyles.sectionTitle}>Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <p style={pageStyles.empty}>Nothing yet this session.</p>
          ) : (
            <ul style={pageStyles.activityList}>
              {activity.map((event, i) => (
                <li key={i} style={pageStyles.activityRow}>
                  <span style={{ ...pageStyles.activityDot, background: ACTIVITY_DOT[event.type] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={pageStyles.activityMessage}>{event.message}</div>
                    <div style={pageStyles.activityTime}>{formatRelativeTime(event.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
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
  shell: {
    display: "flex",
    minHeight: "100%",
    background: "var(--wall)",
    color: "var(--ink)",
    fontFamily: "'Work Sans', system-ui, sans-serif",
  },
  sidebar: {
    flex: "0 0 220px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    padding: "26px 16px",
    borderRight: "1px solid var(--stone-line)",
    position: "sticky" as const,
    top: 0,
    height: "100vh",
  },
  brand: { display: "flex", alignItems: "center", gap: 9, padding: "0 10px", marginBottom: 22 },
  brandLabel: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 500, color: "var(--ink)" },
  nav: { display: "flex", flexDirection: "column" as const, gap: 2 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left" as const,
    background: "none",
    border: "none",
    color: "var(--ink-soft)",
    padding: "10px 10px",
    borderRadius: 4,
    fontSize: 13.5,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  navIcon: { color: "var(--brass)", flex: "none" },
  logoutBtn: {
    background: "none",
    border: "1px solid var(--stone-line)",
    color: "var(--ink-soft)",
    borderRadius: 3,
    padding: "9px 10px",
    fontSize: 12,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    cursor: "pointer",
  },
  main: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" as const },
  topbar: {
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "16px 32px",
    borderBottom: "1px solid var(--stone-line)",
    background: "color-mix(in srgb, var(--wall) 92%, transparent)",
    backdropFilter: "blur(6px)",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "var(--wall-raised)",
    border: "1px solid var(--stone-line)",
    borderRadius: 20,
    padding: "8px 16px",
    flex: "1 1 320px",
    maxWidth: 420,
  },
  searchInput: {
    border: "none",
    background: "none",
    outline: "none",
    color: "var(--ink)",
    fontSize: 13.5,
    fontFamily: "inherit",
    width: "100%",
  },
  topbarRight: { display: "flex", alignItems: "center", gap: 16, flex: "none" },
  statChip: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    background: "var(--wall-raised)",
    border: "1px solid var(--stone-line)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 14,
    fontFamily: FONT_DISPLAY,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums" as const,
    whiteSpace: "nowrap" as const,
  },
  statChipLabel: { fontFamily: FONT_MONO, fontSize: 10, textTransform: "uppercase" as const, color: "var(--stone)" },
  adminBadge: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)" },
  adminAvatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "var(--brass)",
    color: "var(--wall)",
    display: "grid",
    placeItems: "center",
    fontFamily: FONT_DISPLAY,
    fontSize: 13,
    fontWeight: 600,
    flex: "none",
  },
  content: { padding: "28px 32px 60px", flex: 1 },
  pageHeading: { marginBottom: 24, maxWidth: 640 },
  eyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--stone)",
    marginBottom: 8,
  },
  h1: { margin: 0, fontSize: 26, fontFamily: FONT_DISPLAY, fontWeight: 500 },
  sub: { color: "var(--ink-soft)", fontSize: 13.5, marginTop: 8, lineHeight: 1.5 },
  loadError: { color: "var(--oxblood)", fontSize: 14 },
  loading: { color: "var(--stone)", fontSize: 14 },
  statsRow: {
    display: "flex",
    gap: 1,
    marginBottom: 36,
    background: "var(--stone-line)",
    borderRadius: 4,
    overflow: "hidden",
    flexWrap: "wrap" as const,
  },
  statCard: { flex: "1 1 160px", background: "var(--card)", padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 },
  statIcon: { color: "var(--brass)", flex: "none" },
  statNum: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    fontWeight: 500,
    color: "var(--ink)",
    fontVariantNumeric: "tabular-nums" as const,
  },
  statCap: {
    marginTop: 4,
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "var(--stone)",
  },
  section: { marginBottom: 40 },
  formsRow: { display: "flex", gap: 24, flexWrap: "wrap" as const },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" as const },
  sectionHeaderTight: { marginBottom: 12 },
  sectionTitle: { margin: 0, fontSize: 17, fontFamily: FONT_DISPLAY, fontWeight: 500 },
  galleryRow: { display: "flex", gap: 18, overflowX: "auto" as const, paddingBottom: 4 },
  galleryTile: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    flex: "none",
    width: 108,
  },
  galleryTileButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
    padding: 0,
    fontFamily: "inherit",
  },
  galleryOrderRow: { display: "flex", gap: 6 },
  orderBtn: {
    background: "none",
    border: "1px solid var(--stone-line)",
    color: "var(--ink-soft)",
    borderRadius: 3,
    width: 26,
    height: 22,
    lineHeight: 1,
    fontSize: 14,
    cursor: "pointer",
  },
  pillarToggleOn: {
    background: "var(--brass)",
    border: "1px solid var(--brass)",
    color: "var(--wall)",
    borderRadius: 12,
    padding: "3px 10px",
    fontSize: 10.5,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },
  pillarToggleOff: {
    background: "none",
    border: "1px solid var(--stone-line)",
    color: "var(--stone)",
    borderRadius: 12,
    padding: "3px 10px",
    fontSize: 10.5,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },
  galleryAvatar: {
    position: "relative" as const,
    width: 72,
    height: 72,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    color: "#fff",
    fontFamily: FONT_DISPLAY,
    fontWeight: 600,
    fontSize: 20,
    border: "2px solid var(--stone-line)",
  },
  galleryBadge: {
    position: "absolute" as const,
    bottom: -4,
    right: -4,
    background: "var(--card)",
    border: "1px solid var(--stone-line)",
    color: "var(--ink)",
    borderRadius: 10,
    padding: "1px 7px",
    fontSize: 11,
    fontFamily: FONT_MONO,
  },
  galleryName: { fontSize: 13, color: "var(--ink)", fontWeight: 500 },
  galleryMeta: { fontSize: 10.5, fontFamily: FONT_MONO, color: "var(--stone)" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  tab: {
    background: "none",
    border: "1px solid var(--stone-line)",
    color: "var(--ink-soft)",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },
  tabActive: {
    background: "var(--brass)",
    border: "1px solid var(--brass)",
    color: "var(--wall)",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },
  empty: { color: "var(--stone)", fontSize: 13, fontStyle: "italic" as const },
  exhibitGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 },
  exhibitCard: {
    background: "var(--card)",
    border: "1px solid var(--stone-line)",
    borderRadius: 4,
    overflow: "hidden",
  },
  exhibitFrame: { aspectRatio: "4 / 3", background: "var(--wall-raised)" },
  exhibitImg: { width: "100%", height: "100%", objectFit: "cover" as const, display: "block" },
  sculpturePlaceholder: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    color: "var(--stone)",
    fontFamily: FONT_MONO,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  exhibitCardBody: { padding: "14px 16px 16px" },
  exhibitTitle: { fontSize: 14, fontFamily: FONT_DISPLAY, fontStyle: "italic" as const, color: "var(--ink)" },
  exhibitDesc: {
    fontSize: 12,
    color: "var(--stone)",
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
  },
  exhibitCardFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  exhibitRoomTag: {
    fontSize: 10.5,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    color: "var(--brass-bright)",
    letterSpacing: "0.05em",
  },
  deleteBtn: {
    background: "none",
    border: "1px solid var(--stone-line)",
    color: "var(--ink-soft)",
    borderRadius: 3,
    padding: "5px 11px",
    fontSize: 11,
    fontFamily: FONT_MONO,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "border-color 0.15s ease",
  },
  rightSidebar: {
    flex: "0 0 320px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
    padding: "26px 24px",
    borderLeft: "1px solid var(--stone-line)",
    position: "sticky" as const,
    top: 0,
    height: "100vh",
    overflowY: "auto" as const,
  },
  activityCard: { background: "var(--card)", border: "1px solid var(--stone-line)", borderRadius: 4, padding: "20px 22px" },
  activityList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" as const, gap: 14 },
  activityRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  activityDot: { width: 8, height: 8, borderRadius: "50%", marginTop: 5, flex: "none" },
  activityMessage: { fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 },
  activityTime: { fontSize: 11, color: "var(--stone)", fontFamily: FONT_MONO, marginTop: 2 },
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
