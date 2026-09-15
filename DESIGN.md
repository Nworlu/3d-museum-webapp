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
- **Mobile GPU/texture-memory (outside-voice finding, researched
  2026-09-15):** the desktop research above doesn't cover mobile, which
  typically hits texture-memory limits before main-thread hitching becomes
  the issue. Mitigation: author exhibit textures as KTX2/Basis Universal
  (`KHR_texture_basisu`), which Babylon.js loads natively and which cuts
  GPU memory footprint vs. PNG/JPG significantly. Caveat: KTX2 transcoding
  itself can OOM on older/low-end phones, so smaller compressed bytes
  don't guarantee lower peak memory — this needs verification on real
  target devices, not just assumed from the format choice.
  [Babylon.js KTX2 docs](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression),
  [Khronos KTX 2.0 overview](https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets)

**Conclusion: feasible with well-trodden, documented Babylon.js patterns.**
No custom engine work is required. The interesting engineering is in the
*data model* and *streaming strategy*, not the renderer.

## Scope (v1)

In scope:
- Static building shell (a handful of rooms/galleries), authored once as a
  `.glb`.
- Exhibits (per room) defined entirely by data: model/image URL, transform,
  title, wall/plinth placement, description.
- A JSON schema for exhibit data, served as static files
  (`/content/<roomId>.json`, content-hash-versioned e.g.
  `/content/gallery-1.a1b2c3.json`) from the same static host as the app —
  swappable for a real CMS later (fetch URL + mapping change only), without
  touching the renderer. Versioning ensures a curator's content update
  actually reaches visitors past CDN/browser caching — see Key Decision #7.
- A `museum-manifest.json` defining room topology: every room id, its
  adjacency list, its boundary volume in world space, and the entry room —
  fetched once at boot so RoomManager has a single source of truth for
  "what room am I in" and "what's adjacent."
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
                        ┌─────────────────────────┐    ┌──────────────────────────┐
                        │  Static JSON files (v1)  │    │  museum-manifest.json     │
                        │  /content/<roomId>.json  │    │  room ids, adjacency,     │
                        │  (v2: swap for real CMS) │    │  boundaries, entry room   │
                        └────────────┬─────────────┘    └─────────────┬────────────┘
                                     │ fetch('/content/<roomId>.json')  │ fetched once at boot
                                     ▼                                 ▼
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
app boot
        │
        ▼
fetch museum-manifest.json (once)  →  RoomManager loads entryRoomId + spawn point
        │
        ▼
visitor crosses room boundary (boundary/adjacency read from manifest)
        │
        ▼
RoomManager detects new roomId (trigger volume / distance check)
        │
        ▼
ExhibitLoader.loadRoom(roomId)
        │  fetch /content/<roomId>.json  (exhibit list: model URL, transform, text)
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

1. **Content interface is a static JSON contract, not a custom API server.**
   v1 serves `/content/<roomId>.json` as plain static files, shaped exactly
   like a real headless CMS (Contentful/Sanity/etc.) response. No backend
   process to write, deploy, or maintain for v1; swapping to a live CMS
   later is a fetch-URL + mapping change, not a rewrite. **[Scope reduction,
   decided in eng review]:** an earlier draft of this plan had a local
   Express/Vite-middleware API server standing in for the CMS — cut because
   static hosting already serves JSON with zero code, and it added a service
   with no functional benefit over a file for v1's needs. [Layer 1 — boring,
   reversible.]
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
5. **Exhibit assets are de-duplicated via a URL-keyed `AssetContainer`
   cache.** `ExhibitLoader` keeps a `Map<url, AssetContainer>`; a repeated
   model URL (a recurring plinth, frame, or placeholder asset reused
   across rooms) calls `container.instantiateModelsToScene()` instead of
   re-fetching and re-parsing the glTF from scratch. Babylon-native
   mechanism (`AssetContainer`/`LoadAssetContainerAsync`), not a custom
   cache — matters because it directly serves the "dynamic at scale"
   scaling goal from Key Decision #2: without it, bandwidth/GPU cost for
   repeated assets grows with room count instead of staying flat.
6. **Room topology lives in one manifest file, not in the 3D asset.**
   `museum-manifest.json` (room ids, adjacency, boundary volumes, entry
   room) is the single source of truth RoomManager reads at boot. Rejected
   alternative: deriving topology from named trigger-volume nodes inside
   the building `.glb` — couples application logic to 3D-authoring-tool
   node-naming conventions, which breaks silently if an artist renames a
   node in Blender. An explicit JSON file is the boring, explicit choice.
7. **Content URLs are content-hash-versioned, not just static paths**
   (outside-voice finding). `museum-manifest.json` (fetched with a
   short/no-cache header so it's always fresh) carries each room's
   current content URL, e.g. `/content/gallery-1.a1b2c3.json`; publishing
   an update changes the hash, so the CDN's cached copy of the *old* URL
   is simply irrelevant — visitors get fresh content on their next
   manifest fetch. Without this, the plan's core pitch ("publish without
   shipping new client code") could silently fail to reach visitors
   behind normal static-hosting/CDN caching. Standard static-site
   cache-busting pattern. [Layer 1]

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
- `museum-manifest.json` fails to load at boot → hard error screen with
  retry (there is no meaningful degraded state without a room graph —
  RoomManager cannot resolve an entry room or any adjacency).
- Visitor crosses two room boundaries before the first `loadRoom` call's
  fetch+import finishes (normal fast movement, not just hysteresis-band
  edge cases) → **stale-response race**: `ExhibitLoader` tracks a
  monotonic generation counter per `loadRoom` call; when a load resolves,
  it checks it's still the current generation before attaching meshes to
  the scene, disposing them instead if a newer `loadRoom` has superseded
  it. Without this, a far room's exhibits can visibly pop in/out after the
  visitor has already left it.
- Click-to-inspect dollies the camera toward an exhibit near a room
  boundary while RoomManager's per-frame check keys off camera position →
  **inspect-mode race** (outside-voice finding): RoomManager tracks an
  `inspecting` flag (set when InspectPanel opens, cleared on close) and
  skips boundary/dispose evaluation while true — the visitor's true
  position hasn't changed, only the camera's framing has, so the exhibit
  being inspected can't be disposed out from under the open panel.

## Testing strategy

**Frameworks:** Vitest (unit/integration — pairs with Vite, zero extra
config) + Playwright (E2E — drives a real browser, needed to verify actual
WebGL rendering and frame-timing behavior a unit test can't see).

### Coverage diagram

```
CODE PATHS                                              USER FLOWS
[+] boot / manifest                                     [+] First visit
  ├── [GAP] fetch museum-manifest.json success            ├── [GAP][→E2E] Boot → spawn in entry room, exhibits render
  │         → RoomManager init (entry room, spawn pt)     └── [GAP]        Manifest fetch fails → error screen + retry
  └── [GAP] fetch museum-manifest.json fails
            → hard error screen + retry               [+] Walking between rooms
                                                          ├── [GAP][→E2E] Adjacent room preloads on boundary cross
[+] RoomManager                                          ├── [GAP]        Doorway straddle → no load/unload thrash
  ├── [GAP] boundary/hysteresis: normal cross              │              (hysteresis band)
  ├── [GAP] boundary/hysteresis: straddle (no thrash)     └── [GAP]        Fast walk across 2+ boundaries →
  └── [GAP] per-frame distance fallback (fast movement)                   stale loadRoom discarded, no pop-in/out

[+] ExhibitLoader.loadRoom(roomId)                       [+] Inspecting an exhibit
  ├── [GAP] fetch content JSON success → import each       ├── [GAP][→E2E] Click exhibit → camera dolly + panel opens
  ├── [GAP] exhibit model 404/bad glTF                     └── [GAP]        Close panel → camera returns, walk resumes
  │         → placeholder mesh + marker, room still loads
  ├── [GAP] room JSON has 0 exhibits → empty room, no error [+] Network conditions
  ├── [GAP] generation guard: stale result discarded +      ├── [GAP]        Slow network → per-exhibit loading
  │         disposed when a newer loadRoom supersedes it    │              placeholder, movement never blocked
  └── [GAP] ExhibitLoader.unloadRoom → meshes/textures       └── [GAP]        Manifest or content 404 → visible,
            disposed, memory actually freed                                recoverable error, not silent

[+] Controls / collision                                 [+] Mobile parity
  ├── [GAP] WASD + mouse-look (desktop)                    └── [GAP][→E2E] Touch joystick reaches same rooms/exhibits
  ├── [GAP] touch joystick (mobile)                                       as desktop controls
  └── [GAP] bounding-box collision vs building shell
            (can't walk through walls)

COVERAGE: 0/19 paths tested (0% — pre-implementation)  |  Code paths: 0/13  |  User flows: 0/9 (+ 4 E2E-worthy)
QUALITY: none yet  |  GAPS: 19 (4 marked [→E2E])
```

Legend: ★★★ behavior + edge + error | ★★ happy path | ★ smoke check | [→E2E] = needs Playwright, not just a unit test.

### Test plan (fills every GAP above before implementation is considered done)

- **Unit (Vitest):**
  - RoomManager: boundary/hysteresis transitions (cross, straddle, fast
    multi-boundary skip), manifest parsing (valid + malformed manifest).
  - ExhibitLoader: generation-guard correctness (a resolved-but-stale
    `loadRoom` call must dispose its meshes and never attach them);
    `unloadRoom` bookkeeping (mock Babylon `Scene`/`Mesh`, assert
    `.dispose()` called); exhibit-fetch-404 → placeholder path; 0-exhibit
    room → no error.
- **Build-time sanity check (outside-voice finding):** boundary volumes in
  `museum-manifest.json` are hand-authored separately from the building
  `.glb` they must spatially match, and nothing catches drift when the
  shell changes but the manifest doesn't. A script (run in CI and locally)
  loads both together and flags boundaries that fall outside the shell's
  overall bounding volume, or rooms with no matching geometry nearby —
  cheap sanity net, not full geometric validation.
- **Integration (Vitest):** schema validation for every file under
  `content/` and for `museum-manifest.json` itself, against the shape
  RoomManager/ExhibitLoader expect — catches a bad hand-authored file
  before it ships.
- **E2E (Playwright), the 4 flows marked `[→E2E]` above:** boot-to-render,
  room-transition-preloads-adjacent, click-to-inspect open/close,
  touch-control parity with desktop. These are the flows where mocking
  Babylon would hide the actual failure (real glTF import, real frame
  timing, real WebGL context) — unit tests alone would give false
  confidence here.
- **Perf regression (Playwright, outside-voice finding):** the feasibility
  research names main-thread hitching during asset load as a real risk
  with documented mitigations (background loading, `freezeActiveMeshes`,
  progressive load) — that risk needs an automated check, not just a
  manual eyeball. A room-transition test asserts worst-frame-time during
  `ExhibitLoader.loadRoom` stays under a budget (e.g. captured via
  `requestAnimationFrame` deltas), turning "verify no frame hitch" into
  something CI catches on regression instead of a human noticing it later.
- **Manual/visual (supplements, not a substitute for the above):** walk
  the full museum, verify no frame hitch on room transitions, verify
  disposed rooms actually free memory (heap snapshot before/after a full
  loop).

No regression tests apply — this is a greenfield plan with no prior
shipped behavior.

## Tech stack

- Babylon.js 8.x (ESM), TypeScript, Vite for dev/build.
- Vitest for unit/integration tests, Playwright for E2E (see Testing
  strategy).
- Content: a `content/` directory of static JSON files (one per room),
  served as-is by Vite/static hosting at `/content/<roomId>.json` — this
  IS the CMS interface, not a mock of one. No custom server code.
- Exhibit textures authored/exported as KTX2 (Basis Universal) for GPU
  memory budget on mobile — verify peak transcode memory on real
  low-end-target devices before locking this in as the only path (see
  Feasibility research).
