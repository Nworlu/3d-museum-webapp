export function BootError({ message }: { message: string }) {
  return (
    <div style={{ color: "#fff", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h2>Could not load the museum</h2>
      <p>{message}</p>
      <button onClick={() => location.reload()}>Retry</button>
    </div>
  );
}
