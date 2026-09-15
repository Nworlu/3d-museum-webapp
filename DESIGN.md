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
- WebXR/VR mode — documented as feasible (Babylon.js 8.0 WebXR support),
  deferred as a separate feature since v1's walk-controls scope is desktop
  + touch only.
- Multi-user/shared presence — no requirement for it in the problem
  statement; adding it would mean a whole new networking/state-sync
  architecture this plan doesn't need to solve.
- Real CMS integration (headless CMS swap-in) — v1 ships content-hash-
  versioned static JSON files behind the same interface a real CMS would
  serve, so the swap is a config/fetch-URL change later, not a rewrite now.
- Procedurally generated room layouts — v1 rooms are hand-authored; no
  generation algorithm to design or validate yet.
- Build/publish pipeline for distributing the app as a packaged artifact —
  v1 targets a normal web deploy (static hosting), not a downloadable
  binary, so no CI/CD artifact pipeline is needed.
- Exhibit transform-sanity checker (validating authored placements against
  room boundaries before publish) — deferred to `TODOS.md`; real scope on
  top of an already-scoped v1, buildable later on data v1 already produces.

## What already exists

None — this is a greenfield project (new repo, no prior code). Nothing to
reuse or check for accidental duplication against.

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
- **E2E (Playwright), the 4 flows marked `[→E2E]` above, plus one closed
  during Failure Modes review below:** boot-to-render,
  room-transition-preloads-adjacent, click-to-inspect open/close,
  touch-control parity with desktop, and **collision-vs-wall** (fast
  movement toward a wall must stop at the boundary, not tunnel through
  it — a known failure mode of naive bounding-box collision at high
  velocity/low frame rate). These are the flows where mocking Babylon
  would hide the actual failure (real glTF import, real frame timing,
  real WebGL context, real collision resolution) — unit tests alone would
  give false confidence here.
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

## Failure modes

For each codepath from the coverage diagram, one realistic production
failure and its current coverage:

| Codepath | Realistic failure | Test? | Error handling? | User sees |
|---|---|---|---|---|
| Manifest fetch | Network drop at boot | Yes (unit) | Yes (edge case) | Clear error + retry |
| Content fetch (per room) | 404 / bad JSON | Yes (integration) | Yes (edge case) | Clear placeholder marker |
| ExhibitLoader race | Overlapping loads from fast movement | Yes (unit, generation guard) | Yes | Silent (by design — the fix *is* silence, correctly) |
| Inspect-mode dispose race | Exhibit disposed mid-inspection | Yes (unit, inspecting flag) | Yes | N/A — prevented, not surfaced |
| Manifest/glb drift | Boundary edited without matching shell edit | Yes (build-time sanity check) | Yes (build fails) | Developer sees it at build time, not a visitor |
| Content caching | Stale cached content after publish | Yes (via versioned URLs, verify in QA) | Yes (hash-versioning) | Visitor gets fresh content on next manifest fetch |
| Collision | Fast movement tunnels through a wall | Yes (E2E, added above) | Babylon `collisionsEnabled` (needs velocity clamping if E2E finds tunneling) | Visible immediately (not silent) — no critical-gap flag, but the E2E test above is the actual verification, not an assumption |
| Frame hitch during load | Main-thread stall on heavy room | Yes (perf regression test, added above) | Mitigations already in Key Decisions 2-5 | Visible stutter if mitigations fail — now caught by CI |
| Mobile texture memory | KTX2 transcode OOM on low-end device | No automated test yet (needs real-device lab, not CI) | Partial — format choice, not runtime fallback | Tab crash/reload if it happens — **flagged below, not a silent-and-untested critical gap because it's visible, but has no runtime fallback** |

**One item worth calling out, not a blocking critical gap (it's visible, not silent):** mobile texture-memory OOM has no runtime fallback (e.g., falling back to lower-resolution textures if transcode fails) — only the format choice (KTX2) as mitigation. Real-device verification (already scoped above) will show whether a fallback is actually needed; premature to design one before that data exists.

## Worktree parallelization strategy

**Dependency table:**

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Manifest + content schema, build-time sanity check | `content/`, `scripts/` (validation) | — |
| RoomManager + ExhibitLoader (streaming, generation guard, asset cache) | `src/room/`, `src/loader/` | Manifest/content schema shape |
| Controls + collision (WASD/touch, bounding-box vs shell) | `src/controls/` | — |
| InspectPanel UI + inspect-mode flag | `src/ui/`, hooks into `src/room/` | RoomManager's `inspecting` flag contract |
| Test harness (Vitest + Playwright setup, perf regression test) | `test/` | RoomManager/ExhibitLoader/Controls exist to test against |

**Parallel lanes:**
- Lane A: Manifest + content schema + build-time sanity check (independent, no other module dependency)
- Lane B: RoomManager + ExhibitLoader (sequential internally — same module, tight coupling) → depends on Lane A's schema shape being settled first
- Lane C: Controls + collision (independent of A/B — different module, only shares the Scene)
- Lane D: InspectPanel UI (depends on Lane B for the `inspecting` flag contract, otherwise independent)
- Lane E: Test harness setup (depends on B, C, D existing to have something to test)

**Execution order:** Launch A + C in parallel first (no shared modules, no dependency). Once A lands, launch B. Once B lands, launch D. E waits on B, C, D.

**Conflict flags:** none — A, B, C, D each own distinct module directories (`content/`+`scripts/`, `src/room/`+`src/loader/`, `src/controls/`, `src/ui/`); no two lanes write the same directory.

## Tech stack

- Babylon.js 8.x (ESM), TypeScript, Vite for dev/build.
- React owns the DOM UI overlay (InspectPanel, boot-error screen, future
  HUD/menus) via a canvas ref; Babylon's engine/scene/camera and
  RoomManager/ExhibitLoader stay framework-agnostic imperative code
  (`src/babylon/bootMuseum.ts`), driven by React through a small
  callback/controller interface. This keeps the split from Key Decisions
  1-7 intact — no 3D/streaming logic depends on the UI framework choice.
- Vitest for unit/integration tests, Playwright for E2E (see Testing
  strategy).
- Content: a `content/` directory of static JSON files (one per room),
  served as-is by Vite/static hosting at `/content/<roomId>.json` — this
  IS the CMS interface, not a mock of one. No custom server code.
- Exhibit textures authored/exported as KTX2 (Basis Universal) for GPU
  memory budget on mobile — verify peak transcode memory on real
  low-end-target devices before locking this in as the only path (see
  Feasibility research).
- Tooling: `npm run optimize-model -- <input.glb> <output.glb>` runs
  `gltf-transform optimize --texture-compress ktx2` (T9). **Requires the
  KTX-Software CLI (`ktx`/`toktx`) installed on the machine separately**
  — it's a native binary gltf-transform shells out to, not an npm
  package (installer: https://github.com/KhronosGroup/KTX-Software/releases).
  Verified end-to-end on 2026-09-16 (KTX-Software v4.4.2): a sample glTF
  (120.48 KB) compressed to 46.18 KB with `KHR_texture_basisu` +
  `EXT_meshopt_compression`, both natively supported by
  `@babylonjs/loaders/glTF` — no additional Babylon-side work needed to
  consume the output. Not yet run on the current placeholder exhibits
  (public Khronos sample models this project doesn't own/host —
  re-encoding and re-hosting them is out of scope for throwaway demo
  content); run it on real exhibit assets once they exist. Real-device
  memory verification is tracked in
  `TODOS.md`, not something this environment can perform.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1-2 days / CC: ~2-3h)** — RoomManager — Load
  `museum-manifest.json` at boot; resolve entry room, spawn point, per-room
  adjacency and boundary volumes
  - Surfaced by: Architecture review — Issue 1A (no room topology data source)
  - Files: `content/museum-manifest.json`, `src/room/RoomManager.ts`
  - Verify: unit tests for manifest parsing (valid + malformed), boot flow spawns in `entryRoomId`
- [ ] **T2 (P1, human: ~1-2h / CC: ~15min)** — ExhibitLoader — Add
  monotonic generation counter; discard/dispose stale `loadRoom` results
  - Surfaced by: Code Quality review — Issue 2A (async load race)
  - Files: `src/loader/ExhibitLoader.ts`
  - Verify: unit test simulating overlapping `loadRoom` calls, assert stale meshes never attach and get disposed
- [ ] **T3 (P2, human: ~2-3h / CC: ~15min)** — ExhibitLoader — URL-keyed
  `AssetContainer` cache for repeated exhibit models
  - Surfaced by: Performance review — Issue 3A (no asset de-dup)
  - Files: `src/loader/ExhibitLoader.ts`
  - Verify: unit test — importing the same URL twice hits the cache, not a second fetch
- [ ] **T4 (P1, human: ~2h / CC: ~15min)** — Build pipeline — Content-hash-
  version room content URLs; wire hash into `museum-manifest.json`
  - Surfaced by: Outside voice — point 5 (CMS-swap claim unverified against CDN caching)
  - Files: `content/museum-manifest.json`, build script
  - Verify: manual — publish a content change, confirm the URL (and thus the fetched content) changes
- [ ] **T5 (P2, human: ~2-3h / CC: ~20min)** — Build script — Sanity-check
  `museum-manifest.json` boundaries against building `.glb` bounding volume
  - Surfaced by: Outside voice — point 4 (manifest/glb drift)
  - Files: `scripts/validate-manifest.ts`
  - Verify: script fails on a deliberately mismatched fixture, passes on the real manifest
- [ ] **T6 (P1, human: ~1h / CC: ~10min)** — RoomManager + InspectPanel —
  Add `inspecting` flag; skip boundary/dispose evaluation while inspecting
  - Surfaced by: Outside voice — point 9 (inspect-mode dispose race)
  - Files: `src/room/RoomManager.ts`, `src/ui/InspectPanel.ts`
  - Verify: unit test — room transition does not fire while `inspecting` is true
- [ ] **T7 (P2, human: ~3-4h / CC: ~20min)** — Playwright — Frame-timing
  regression test during room-transition load
  - Surfaced by: Outside voice — point 7 (no automated perf check for the plan's named main-thread-hitch risk)
  - Files: `test/e2e/perf.spec.ts`
  - Verify: test fails if worst-frame-time during load exceeds budget (tune threshold against a real run first)
- [ ] **T8 (P2, human: ~2h / CC: ~15min)** — Playwright — Collision E2E:
  fast movement toward a wall must not tunnel through it
  - Surfaced by: Failure modes review (collision codepath had no assigned test)
  - Files: `test/e2e/collision.spec.ts`
  - Verify: test fails if the visitor's position ends up outside the building bounding volume after a fast approach
- [ ] **T9 (P2, human: ~1 day / CC: ~1h)** — Asset pipeline + manual
  device lab — Export exhibit textures as KTX2/Basis; verify peak
  transcode memory on real low-end target devices
  - Surfaced by: Outside voice — point 8 (mobile feasibility research gap), researched during this review
  - Files: texture export pipeline, `DESIGN.md` Feasibility research
  - Verify: manual device testing (no CI equivalent for GPU memory limits); document the result back into this doc

_No new tasks from Architecture review beyond T1 (all other architecture points confirmed sound as designed)._

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Outside Review | Claude subagent (Codex not installed) | Independent 2nd opinion | 1 | issues_found (resolved) | 9 points raised; 1 architectural tension (streaming vs. load-everything) resolved as keep-streaming, 4 concrete gaps (content caching, manifest/glb drift, perf test, inspect-mode race) folded into plan, 2 more (authoring tooling, mobile research) resolved via TODO-defer and live research respectively |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 3 issues (Architecture 1, Code Quality 1, Performance 1), all resolved; 19 test gaps identified and filled |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

- **OUTSIDE COVERAGE:** provider=Claude subagent (native fallback — Codex CLI not installed), phase=plan-review, completed. 9 findings; all addressed (1 architecture decision confirmed as-is, 6 concrete fixes folded into the plan, 1 deferred to TODOS.md, 1 resolved via live web research folded into Feasibility research).
- **VERDICT:** ENG CLEARED — ready to implement. CEO Review and Design Review not run (optional; this is a technical/architecture-only plan with no product-scope or visual-design surface to review yet — no UI mockups exist, `InspectPanel` styling is TBD at implementation time).

NO UNRESOLVED DECISIONS
