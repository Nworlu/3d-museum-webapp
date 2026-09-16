export function BootError({ message }: { message: string }) {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        background: "var(--wall)",
        color: "var(--ink)",
        fontFamily: '"Work Sans", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
        <div
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--oxblood)",
            marginBottom: 14,
          }}
        >
          Doors closed
        </div>
        <h2
          style={{
            margin: "0 0 12px",
            fontFamily: "Cambria, Georgia, 'Times New Roman', serif",
            fontWeight: 500,
            fontSize: 24,
          }}
        >
          Could not load the museum
        </h2>
        <p style={{ margin: "0 0 24px", color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        <button
          onClick={() => location.reload()}
          style={{
            background: "var(--oxblood)",
            color: "#f5ede3",
            border: "none",
            borderRadius: 3,
            padding: "11px 24px",
            fontSize: 14,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
