import {
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Matrix,
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
// A touch that moves less than this before lifting is a tap (inspect),
// not a look-drag — mirrors how Babylon's own FreeCameraMouseInput already
// treats touch-drag as camera rotation (it's on by default, no code needed
// for that half); this just distinguishes "tapped" from "looked around".
const TAP_MAX_DRAG_PX = 12;

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
  /**
   * Drive walking from a virtual joystick instead of WASD: x is strafe
   * (-1 left .. 1 right), z is forward/back (-1 back .. 1 forward), both
   * camera-relative. Call with (0, 0) when the joystick is released.
   */
  setMoveVector: (x: number, z: number) => void;
  /** Tear down the engine/scene and all listeners. Call on unmount. */
  dispose: () => void;
}

/** Test/debug hook (Playwright E2E) — never used by app code. */
export interface MuseumDebugHandle {
  getCameraPosition: () => { x: number; y: number; z: number };
  /** Yaw the camera without needing pointer-lock mouse-look (unavailable under headless automation). */
  setCameraRotationY: (radians: number) => void;
}

declare global {
  interface Window {
    __museumDebug?: MuseumDebugHandle;
  }
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
  // HemisphericLight.groundColor defaults to pure black — anything facing
  // away from the light direction (the ceiling's underside, wall backs)
  // would otherwise render black regardless of material color.
  light.groundColor = new Color3(0.35, 0.34, 0.33);

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
  const moveVector = new Vector3(0, 0, 0); // joystick input, camera-relative (x: strafe, z: forward)
  let touchStartX = 0;
  let touchStartY = 0;

  function startDolly(to: Vector3, returning: boolean): void {
    dolly = { from: camera.position.clone(), to, t: 0, returning };
  }

  function closeInspect(): void {
    if (!inspecting || !preInspectPosition) return;
    inspecting = false;
    startDolly(preInspectPosition, true);
  }

  /** Pick whatever's centered on screen (the crosshair) and start the inspect dolly if it's an exhibit. */
  function tryInspect(): void {
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
    // The React-side joystick unmounts while inspecting (no UI for it on
    // the inspect panel), so it never gets a touchend to zero itself out —
    // clear it here instead of leaving a stale vector for movement to
    // suddenly resume from once the return dolly re-attaches control.
    moveVector.set(0, 0, 0);
    startDolly(target, false);
    callbacks.onInspectOpen({ title, description });
  }

  scene.onPointerDown = (evt) => {
    if (evt.button !== 0) return;
    if (evt.pointerType === "touch") {
      // No pointer-lock equivalent on touch — Babylon's own touch-drag
      // already rotates the camera (FreeCameraMouseInput.touchEnabled
      // defaults to true), so this only needs to remember where the touch
      // started to tell a tap from a look-drag on release.
      touchStartX = evt.clientX;
      touchStartY = evt.clientY;
      return;
    }
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
      return;
    }
    tryInspect();
  };

  scene.onPointerUp = (evt) => {
    if (evt.pointerType !== "touch") return;
    const dragDistance = Math.hypot(evt.clientX - touchStartX, evt.clientY - touchStartY);
    if (dragDistance <= TAP_MAX_DRAG_PX) tryInspect();
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

  window.__museumDebug = {
    getCameraPosition: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    setCameraRotationY: (radians) => {
      camera.rotation.y = radians;
    },
  };

  const WALL_HEIGHT = 3;
  const WALL_THICKNESS = 0.3;
  const DOORWAY_WIDTH = 3.2;
  const PILLAR_RADIUS = 0.22;

  /**
   * PLACEHOLDER building shell — still procedural (no hand-authored .glb
   * exists yet, see DESIGN.md Scope), but now a real walled gallery
   * instead of open floor plates: solid perimeter walls, open archway
   * doorways between adjacent rooms, and a ceiling. Generalizes to any
   * *linear* sequence of same-width rooms (this project's layout); a
   * non-linear floor plan would need per-edge adjacency processing
   * instead of the sorted-Z-boundary approach below — real building-shell
   * work, deferred until a hand-authored asset exists.
   */
  function buildGalleryShell(manifest: MuseumManifest): void {
    const roomColors: Record<string, Color3> = {
      lobby: new Color3(0.55, 0.53, 0.5),
      "gallery-1": new Color3(0.5, 0.53, 0.5),
      "gallery-2": new Color3(0.53, 0.5, 0.47),
    };
    const wallColor = new Color3(0.92, 0.91, 0.88);
    const ceilingColor = new Color3(0.85, 0.84, 0.82);

    const rooms = Object.values(manifest.rooms);
    const overallMinX = Math.min(...rooms.map((r) => r.boundary.minX));
    const overallMaxX = Math.max(...rooms.map((r) => r.boundary.maxX));
    const overallMinZ = Math.min(...rooms.map((r) => r.boundary.minZ));
    const overallMaxZ = Math.max(...rooms.map((r) => r.boundary.maxZ));

    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      const { minX, maxX, minZ, maxZ } = room.boundary;
      const floor = MeshBuilder.CreateGround(`floor:${roomId}`, { width: maxX - minX, height: maxZ - minZ }, scene);
      floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      floor.checkCollisions = true;
      const floorMat = new StandardMaterial(`floor-mat:${roomId}`, scene);
      floorMat.diffuseColor = roomColors[roomId] ?? new Color3(0.5, 0.5, 0.5);
      floor.material = floorMat;
    }

    const ceiling = MeshBuilder.CreateGround(
      "ceiling",
      { width: overallMaxX - overallMinX, height: overallMaxZ - overallMinZ },
      scene,
    );
    ceiling.position.set((overallMinX + overallMaxX) / 2, WALL_HEIGHT, (overallMinZ + overallMaxZ) / 2);
    ceiling.rotation.x = Math.PI;
    const ceilingMat = new StandardMaterial("ceiling-mat", scene);
    ceilingMat.diffuseColor = ceilingColor;
    ceilingMat.backFaceCulling = false;
    ceiling.material = ceilingMat;

    const wallMat = new StandardMaterial("wall-mat", scene);
    wallMat.diffuseColor = wallColor;

    // Center pillar: a curator-toggleable decorative column (base, tapered
    // shaft, capital) — classical-gallery detail, and a real physical
    // obstacle (checkCollisions), not just visual.
    const pillarMat = new StandardMaterial("pillar-mat", scene);
    pillarMat.diffuseColor = new Color3(0.66, 0.64, 0.6);
    const pillarAccentMat = new StandardMaterial("pillar-accent-mat", scene);
    pillarAccentMat.diffuseColor = new Color3(0.62, 0.49, 0.26);

    function buildPillar(roomId: string, boundary: MuseumManifest["rooms"][string]["boundary"]): void {
      const cx = (boundary.minX + boundary.maxX) / 2;
      const cz = (boundary.minZ + boundary.maxZ) / 2;
      const baseHeight = 0.15;

      const shaft = MeshBuilder.CreateCylinder(
        `pillar-shaft:${roomId}`,
        { diameterBottom: PILLAR_RADIUS * 2, diameterTop: PILLAR_RADIUS * 1.85, height: WALL_HEIGHT - baseHeight * 2, tessellation: 16 },
        scene,
      );
      shaft.position.set(cx, WALL_HEIGHT / 2, cz);
      shaft.checkCollisions = true;
      shaft.material = pillarMat;

      const base = MeshBuilder.CreateCylinder(
        `pillar-base:${roomId}`,
        { diameter: PILLAR_RADIUS * 2.9, height: baseHeight, tessellation: 16 },
        scene,
      );
      base.position.set(cx, baseHeight / 2, cz);
      base.checkCollisions = true;
      base.material = pillarAccentMat;

      const capital = base.clone(`pillar-capital:${roomId}`);
      capital.position.y = WALL_HEIGHT - baseHeight / 2;
    }

    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      if (room.pillar) buildPillar(roomId, room.boundary);
    }

    function buildWallSegment(name: string, x1: number, z1: number, x2: number, z2: number): void {
      const width = Math.max(Math.abs(x2 - x1), WALL_THICKNESS);
      const depth = Math.max(Math.abs(z2 - z1), WALL_THICKNESS);
      if (width <= WALL_THICKNESS && depth <= WALL_THICKNESS) return; // zero-length segment, doorway ate it all
      const box = MeshBuilder.CreateBox(`wall:${name}`, { width, height: WALL_HEIGHT, depth }, scene);
      box.position.set((x1 + x2) / 2, WALL_HEIGHT / 2, (z1 + z2) / 2);
      box.checkCollisions = true;
      box.material = wallMat;
    }

    // Long side walls spanning the whole building.
    buildWallSegment("west", overallMinX, overallMinZ, overallMinX, overallMaxZ);
    buildWallSegment("east", overallMaxX, overallMinZ, overallMaxX, overallMaxZ);

    // Front/back walls at each distinct room boundary along Z: solid at
    // the two outer ends, an open archway (gap, no lintel) at each
    // internal boundary shared between two adjacent rooms.
    const zBoundaries = Array.from(new Set(rooms.flatMap((r) => [r.boundary.minZ, r.boundary.maxZ]))).sort(
      (a, b) => a - b,
    );
    for (const z of zBoundaries) {
      if (z === overallMinZ || z === overallMaxZ) {
        buildWallSegment(`end-${z}`, overallMinX, z, overallMaxX, z);
      } else {
        const half = DOORWAY_WIDTH / 2;
        buildWallSegment(`door-${z}-a`, overallMinX, z, -half, z);
        buildWallSegment(`door-${z}-b`, half, z, overallMaxX, z);
      }
    }
  }

  (async () => {
    try {
      const manifestRes = await fetch("/content/museum-manifest.json");
      if (!manifestRes.ok) throw new Error(`museum-manifest.json failed to load (${manifestRes.status})`);
      const manifest = (await manifestRes.json()) as MuseumManifest;
      if (disposed) return;
      buildGalleryShell(manifest);

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
          if (moveVector.x !== 0 || moveVector.z !== 0) {
            // Same recipe Babylon's own keyboard input uses internally
            // (FreeCameraKeyboardMoveInput.checkInputs): a local-space
            // move command, transformed into world space by the camera's
            // current orientation, added to cameraDirection — the one
            // public hook the base Camera class integrates into position
            // (with collisions/gravity) every frame, whoever's driving it.
            const localMove = new Vector3(moveVector.x * camera.speed, 0, moveVector.z * camera.speed);
            const invView = Matrix.Invert(camera.getViewMatrix());
            camera.cameraDirection.addInPlace(Vector3.TransformNormal(localMove, invView));
          }
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
    setMoveVector: (x, z) => moveVector.set(x, 0, z),
    dispose: () => {
      disposed = true;
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", onResize);
      delete window.__museumDebug;
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
