import { useEffect, useRef, useState } from "react";
import { bootMuseum, type ExhibitInfo, type MuseumController } from "./babylon/bootMuseum";
import { BootError } from "./components/BootError";
import { InspectPanel } from "./components/InspectPanel";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<MuseumController | null>(null);
  const [inspecting, setInspecting] = useState<ExhibitInfo | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const controller = bootMuseum(canvasRef.current, {
      onInspectOpen: (exhibit) => setInspecting(exhibit),
      onInspectForceClose: () => setInspecting(null),
      onBootError: (message) => setBootError(message),
    });
    controllerRef.current = controller;
    return () => controller.dispose();
  }, []);

  function handleClose(): void {
    controllerRef.current?.closeInspect();
    setInspecting(null);
  }

  if (bootError) return <BootError message={bootError} />;

  return (
    <>
      <canvas ref={canvasRef} id="renderCanvas" />
      <div id="crosshair" />
      {!inspecting && <div id="hint">Click to look around · WASD to walk · click an exhibit to inspect · Esc to release mouse</div>}
      {inspecting && (
        <InspectPanel title={inspecting.title} description={inspecting.description} onClose={handleClose} />
      )}
    </>
  );
}
