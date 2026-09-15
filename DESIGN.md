# Dynamic 3D Museum — Design Doc

## Problem statement

Build a virtual 3D museum, walkable in-browser, using Babylon.js. "Dynamic"
means: exhibits (models, images, text, room layout) are **not hardcoded** —
they're driven by data (JSON/CMS/API) so new exhibits, rooms, or a rotating
collection can be published without shipping new client code.

## Feasibility research (2026-09-15)

Confirmed via Babylon.js docs, forum, and Babylon 8.0 release notes:

- **Babylon.js 8.x** (current stable line) supports programmatic glTF/GLB
  loading via `SceneLoader`/`ImportMeshAsync` with LOD control, and its glTF
  loader/serializer track the format's extension updates closely.
  [Babylon.js 8.0 — glTF, USDZ, WebXR](https://blogs.windows.com/windowsdeveloper/2025/04/03/part-3-babylon-js-8-0-gltf-usdz-and-webxr-advancements/)
- **Dynamic load/dispose at runtime** is a documented, supported pattern —
  meshes can be imported and `.dispose()`d based on camera position /
  frustum, which is exactly the "walk into a new room, stream its exhibits"
  behavior a museum needs.
  [Babylon forum — dynamic asset loading/disposing](https://forum.babylonjs.com/t/dynamic-asset-loading-disposing/9012)
- **Threading caveat (real constraint, not a blocker):** Babylon's scene
  graph mutations run on the main thread — loading many assets while the
  render loop is live can cause hitches. Documented mitigation: use
  `AssetsManager`/background `fetch` + decode off the hot path, load
  progressively (nearest room first), and call
  `scene.freezeActiveMeshes()` / `mesh.freezeWorldMatrix()` on static
  geometry once placed.
  [Babylon forum — streaming asset loading to prevent lag](https://forum.babylonjs.com/t/streaming-asset-loading-outside-of-babylon-to-prevent-scene-lag/10127)
- **Data-driven scene assembly** (JSON describes entities → loader
  instantiates them) is an established Babylon.js pattern, not something
  being invented here.
  [Data-driven asset loading with Babylon.js](https://lawrencewhiteside.com/courses/babylon-js-ecs/dynamically-loading-game-assets-with-babylonjs-assetmanager/)
- **WebXR** (VR walkthrough) is supported out of the box, including newer
  depth-sensing features in 8.0 — optional stretch goal, not required for v1.

**Conclusion: feasible with well-trodden, documented Babylon.js patterns.**
No custom engine work is required. The interesting engineering is in the
*data model* and *streaming strategy*, not the renderer.

## Scope (v1)

In scope:
- Static building shell (a handful of rooms/galleries), authored once as a
  `.glb`.
- Exhibits (per room) defined entirely by data: model/image URL, transform,
  title, wall/plinth placement, description.
- A JSON schema + local content API (`GET /api/museum/:roomId`) standing in
  for a future CMS — swappable later without touching the renderer.
- Progressive loading: load the room the visitor is in + adjacent rooms;
  dispose far rooms.
- Desktop first-person walk controls (WASD + mouse look / touch joystick).
- Basic click-to-inspect exhibit (camera dolly + info panel).

Explicitly NOT in scope for v1 (flag, don't silently drop):
- WebXR/VR mode (documented as feasible; deferred — separate feature).
- Multi-user/shared presence.
- Real CMS integration (headless CMS swap-in) — v1 ships a local JSON API
  behind the same interface so the swap is a config change, not a rewrite.
- Procedurally generated room layouts (v1 rooms are hand-authored).
- Build/publish pipeline for distributing the app as a packaged artifact
  (v1 targets a normal web deploy, not a downloadable binary).

## Architecture

```
                        ┌─────────────────────────┐
                        │   Content source (v1:    │
                        │   local JSON; v2: CMS)    │
                        └────────────┬─────────────┘
                                     │ GET /api/museum/:roomId
                                     ▼
┌────────────────────────────────────────────────────────────┐
│                        Client (browser)                     │
│                                                              │
│  ┌───────────────┐    ┌────────────────────┐                │
│  │ RoomManager   │───▶│ ExhibitLoader        │               │
│  │ (tracks which │    │ (AssetsManager,      │               │
│  │  room visitor │    │  async glTF import,  │               │
│  │  is in)       │    │  dispose far rooms)  │               │
│  └───────┬───────┘    └──────────┬───────────┘               │
│          │ camera position       │ meshes + metadata          │
│          ▼                       ▼                            │
│  ┌────────────────────────────────────────────┐               │
│  │              Babylon.js Scene                │              │
│  │  building shell (static, frozen) + exhibits  │              │
│  │  (dynamic, per-room)                          │              │
│  └───────────────────┬────────────────────────┘               │
│                       │ pointer pick                            │
│                       ▼                                          │
│              ┌─────────────────┐                                 │
│              │ InspectPanel UI  │  (DOM overlay: title, desc)     │
│              └─────────────────┘                                 │
└────────────────────────────────────────────────────────────┘
```

### Data flow — entering a room

```
visitor crosses room boundary
        │
        ▼
RoomManager detects new roomId (trigger volume / distance check)
        │
        ▼
ExhibitLoader.loadRoom(roomId)
        │  fetch /api/museum/:roomId  (exhibit list: model URL, transform, text)
        ▼
for each exhibit → ImportMeshAsync (background, progressive)
        │
        ▼
attach metadata (title/desc) to mesh via mesh.metadata
        │
        ▼
ExhibitLoader.unloadRoom(farRoomId) → dispose meshes, free textures
```

### Key decisions

1. **Content interface is the CMS abstraction, not a CMS SDK.** v1 hits a
   local JSON API with the exact shape a real headless CMS (Contentful/
   Sanity/etc.) would return. Swapping backends later is a fetch-URL +
   mapping change, not a rewrite. [Layer 1 — boring, reversible.]
2. **Room-based streaming, not global load.** Matches Babylon's documented
   frustum/proximity dispose pattern; keeps memory bounded regardless of
   total museum size — this is what makes it "dynamic" at scale (curators
   can add rooms without a bigger initial download).
3. **Static shell frozen, exhibits dynamic.** `freezeActiveMeshes()` /
   `freezeWorldMatrix()` on the building; only exhibit meshes are
   created/disposed at runtime. Keeps the perf-sensitive path small.
4. **No physics engine for v1.** Simple capsule-vs-navmesh or bounding-box
   collision (Babylon built-in `scene.collisionsEnabled`) — a full physics
   engine (Havok/Cannon) is an added dependency v1 doesn't need.

## Edge cases

- Exhibit model fails to load (404, bad glTF) → placeholder mesh + visible
  "content unavailable" marker, logged, does not block room load.
- Visitor moves fast enough to skip a room boundary trigger → distance-based
  fallback check each frame (cheap), not trigger-volume-only.
- Two rooms loaded simultaneously at a doorway → both stay resident until
  visitor is unambiguously in one (hysteresis band on the boundary check,
  not a hard line) to avoid load/unload thrashing.
- Slow network mid-room-entry → loading placeholder per exhibit slot,
  swapped in when ready; visitor is never blocked from moving.
- Content API returns a room with 0 exhibits → render empty room, no error.

## Testing strategy

- Unit: RoomManager boundary/hysteresis logic, ExhibitLoader load/dispose
  bookkeeping (mock Babylon scene).
- Integration: content API contract test (schema validation on the JSON
  shape RoomManager expects).
- Manual/visual: walk the full museum in a real browser, verify no
  frame hitch on room transitions, verify disposed rooms actually free
  memory (heap snapshot before/after a full loop).

## Tech stack

- Babylon.js 8.x (ESM), TypeScript, Vite for dev/build.
- Local JSON content API: a tiny Express (or Vite dev middleware) endpoint
  reading from a `content/` directory of JSON files — this IS the CMS
  interface, not a mock of one.
