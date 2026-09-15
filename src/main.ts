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
import { ExhibitLoader } from "./loader/ExhibitLoader";
import { RoomManager } from "./room/RoomManager";
import { InspectPanel } from "./ui/InspectPanel";
import type { MuseumManifest } from "./types";

const DOLLY_DURATION_MS = 450;
const DOLLY_STAND_BACK = 2.2;
const EYE_HEIGHT = 1.7;

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
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

/**
 * PLACEHOLDER building shell — a flat, color-zoned floor standing in for
 * the hand-authored .glb the design doc calls for (DESIGN.md, Scope v1).
 * No 3D artist/asset pipeline exists in this environment yet; this floor
 * only needs to match the manifest's room boundaries closely enough to
 * walk around and see room transitions happen. Replace wholesale once a
 * real building shell asset exists — nothing else in this file depends on
 * how the shell is built, only on museum-manifest.json's boundary data.
 */
function buildPlaceholderShell(manifest: MuseumManifest): void {
  const roomColors: Record<string, Color3> = {
    lobby: new Color3(0.22, 0.22, 0.26),
    "gallery-1": new Color3(0.18, 0.22, 0.2),
    "gallery-2": new Color3(0.22, 0.19, 0.18),
  };

  for (const [roomId, room] of Object.entries(manifest.rooms)) {
    const { minX, maxX, minZ, maxZ } = room.boundary;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const floor = MeshBuilder.CreateGround(
      `floor:${roomId}`,
      { width, height: depth },
      scene,
    );
    floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    floor.checkCollisions = true;
    const mat = new StandardMaterial(`floor-mat:${roomId}`, scene);
    mat.diffuseColor = roomColors[roomId] ?? new Color3(0.2, 0.2, 0.2);
    floor.material = mat;
  }
}

async function main(): Promise<void> {
  const manifestRes = await fetch("/content/museum-manifest.json");
  const manifest = (await manifestRes.json()) as MuseumManifest;
  buildPlaceholderShell(manifest);

  const loader = new ExhibitLoader(scene);
  const roomManager = new RoomManager(loader);
  const inspectPanel = new InspectPanel();

  const { spawn } = await roomManager.boot("/content/museum-manifest.json");
  camera.position.set(spawn.x, spawn.y, spawn.z);
  camera.setTarget(new Vector3(spawn.x, EYE_HEIGHT, spawn.z + 1));

  let dolly: { from: Vector3; to: Vector3; t: number; returning: boolean } | null = null;
  let preInspectPosition: Vector3 | null = null;

  function startDolly(to: Vector3, returning: boolean): void {
    dolly = { from: camera.position.clone(), to, t: 0, returning };
  }

  scene.onPointerDown = (evt) => {
    if (evt.button !== 0) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
      return;
    }
    if (dolly || inspectPanel.isOpen) return;

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
    startDolly(target, false);

    inspectPanel.open(title, description, () => {
      if (preInspectPosition) startDolly(preInspectPosition, true);
    });
  };

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== canvas && inspectPanel.isOpen) {
      inspectPanel.close();
    }
  });

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

  window.addEventListener("resize", () => engine.resize());
}

main().catch((err) => {
  console.error("Failed to boot museum:", err);
  document.body.innerHTML = `<div style="color:#fff;font-family:system-ui;padding:24px">
    <h2>Could not load the museum</h2>
    <p>${(err as Error).message}</p>
    <button onclick="location.reload()">Retry</button>
  </div>`;
});
