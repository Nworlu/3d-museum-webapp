import {
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  UniversalCamera,
  Vector3,
} from "@babylonjs/core";
import { ExhibitLoader } from "../loader/ExhibitLoader";
import { RoomManager } from "../room/RoomManager";
import type { MuseumManifest } from "../types";

const DOLLY_DURATION_MS = 450;
const DOLLY_STAND_BACK = 2.2;
const EYE_HEIGHT = 1.7;

export interface ExhibitInfo {
  title: string;
  description: string;
}

export interface MuseumCallbacks {
  /** An exhibit was picked; the camera has started dollying toward it. */
  onInspectOpen: (exhibit: ExhibitInfo) => void;
  /** Inspect mode ended for a reason the UI didn't initiate (e.g. pointer lock lost). */
  onInspectForceClose: () => void;
  /** Boot failed (manifest fetch, etc.) — render an error state instead of the canvas. */
  onBootError: (message: string) => void;
}

export interface MuseumController {
  /** Begin the return dolly and re-enable camera control. Call when the UI closes the panel. */
  closeInspect: () => void;
  /** Tear down the engine/scene and all listeners. Call on unmount. */
  dispose: () => void;
}

/**
 * Owns the Babylon engine/scene/camera and the RoomManager/ExhibitLoader
 * lifecycle. Framework-agnostic on purpose: React (src/App.tsx) drives it
 * through `callbacks` and the returned `MuseumController`, but nothing in
 * here depends on React — RoomManager/ExhibitLoader don't change when the
 * UI layer changes.
 */
export function bootMuseum(canvas: HTMLCanvasElement, callbacks: MuseumCallbacks): MuseumController {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.05, 0.07, 1);
  scene.collisionsEnabled = true;
  scene.gravity = new Vector3(0, -0.6, 0);

  const light = new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.9;

  const camera = new UniversalCamera("camera", new Vector3(0, EYE_HEIGHT, -4), scene);
  camera.minZ = 0.05;
  camera.speed = 0.08;
  camera.angularSensibility = 2500;
  camera.keysUp = [87]; // W
  camera.keysDown = [83]; // S
  camera.keysLeft = [65]; // A
  camera.keysRight = [68]; // D
  camera.checkCollisions = true;
  camera.applyGravity = true;
  camera.ellipsoid = new Vector3(0.4, EYE_HEIGHT / 2, 0.4);
  camera.attachControl(canvas, true);

  const loader = new ExhibitLoader(scene);
  const roomManager = new RoomManager(loader);

  let dolly: { from: Vector3; to: Vector3; t: number; returning: boolean } | null = null;
  let preInspectPosition: Vector3 | null = null;
  let inspecting = false;
  let disposed = false;

  function startDolly(to: Vector3, returning: boolean): void {
    dolly = { from: camera.position.clone(), to, t: 0, returning };
  }

  function closeInspect(): void {
    if (!inspecting || !preInspectPosition) return;
    inspecting = false;
    startDolly(preInspectPosition, true);
  }

  scene.onPointerDown = (evt) => {
    if (evt.button !== 0) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
      return;
    }
    if (dolly || inspecting) return;

    const pick = scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
    const mesh = pick?.pickedMesh;
    const title = mesh?.metadata?.exhibitTitle as string | undefined;
    if (!mesh || !title) return;

    const description = (mesh.metadata?.exhibitDescription as string) ?? "";
    const exhibitPos = mesh.getAbsolutePosition();
    const toExhibit = exhibitPos.subtract(camera.position);
    toExhibit.y = 0;
    const dir = toExhibit.normalize();
    const target = exhibitPos.subtract(dir.scale(DOLLY_STAND_BACK));
    target.y = EYE_HEIGHT;

    preInspectPosition = camera.position.clone();
    camera.detachControl();
    roomManager.onInspectStart();
    inspecting = true;
    startDolly(target, false);
    callbacks.onInspectOpen({ title, description });
  };

  const onPointerLockChange = () => {
    if (document.pointerLockElement !== canvas && inspecting) {
      closeInspect();
      callbacks.onInspectForceClose();
    }
  };
  document.addEventListener("pointerlockchange", onPointerLockChange);

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  function buildPlaceholderShell(manifest: MuseumManifest): void {
    const roomColors: Record<string, Color3> = {
      lobby: new Color3(0.22, 0.22, 0.26),
      "gallery-1": new Color3(0.18, 0.22, 0.2),
      "gallery-2": new Color3(0.22, 0.19, 0.18),
    };

    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      const { minX, maxX, minZ, maxZ } = room.boundary;
      const floor = MeshBuilder.CreateGround(
        `floor:${roomId}`,
        { width: maxX - minX, height: maxZ - minZ },
        scene,
      );
      floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      floor.checkCollisions = true;
      const mat = new StandardMaterial(`floor-mat:${roomId}`, scene);
      mat.diffuseColor = roomColors[roomId] ?? new Color3(0.2, 0.2, 0.2);
      floor.material = mat;
    }
  }

  (async () => {
    try {
      const manifestRes = await fetch("/content/museum-manifest.json");
      if (!manifestRes.ok) throw new Error(`museum-manifest.json failed to load (${manifestRes.status})`);
      const manifest = (await manifestRes.json()) as MuseumManifest;
      if (disposed) return;
      buildPlaceholderShell(manifest);

      const { spawn } = await roomManager.boot("/content/museum-manifest.json");
      if (disposed) return;
      camera.position.set(spawn.x, spawn.y, spawn.z);
      camera.setTarget(new Vector3(spawn.x, EYE_HEIGHT, spawn.z + 1));

      engine.runRenderLoop(async () => {
        const dt = engine.getDeltaTime();

        if (dolly) {
          dolly.t += dt / DOLLY_DURATION_MS;
          const t = Math.min(dolly.t, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          camera.position = Vector3.Lerp(dolly.from, dolly.to, eased);
          if (t >= 1) {
            const wasReturning = dolly.returning;
            dolly = null;
            if (wasReturning) {
              camera.attachControl(canvas, true);
              roomManager.onInspectEnd();
              preInspectPosition = null;
            }
          }
        } else {
          await roomManager.update(camera.position.x, camera.position.z);
        }

        scene.render();
      });
    } catch (err) {
      console.error("Failed to boot museum:", err);
      callbacks.onBootError((err as Error).message);
    }
  })();

  return {
    closeInspect,
    dispose: () => {
      disposed = true;
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
