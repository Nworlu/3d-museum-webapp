# TODOS

## Content Authoring

### Exhibit transform-sanity checker

**What:** A build-time script that checks each exhibit's authored transform
(position/rotation from `content/<roomId>.json`) against its room's boundary
volume (from `museum-manifest.json`) and flags obvious placement errors
(model floating outside the boundary, overlapping another exhibit) before
content ships.

**Why:** v1's curator workflow is hand-editing JSON directly — same trust
level as the person authoring the building shell. Nothing currently catches
a bad transform (an exhibit placed inside a wall, or off-boundary) before
it's live; the existing schema-shape validation only checks the JSON is
well-formed, not that the numbers inside it are spatially sane.

**Context:** Surfaced during `/plan-eng-review`'s outside-voice pass on the
initial museum design doc (2026-09-15) — flagged as the plan's actual
differentiator ("publish new exhibits without a code change") having zero
validation tooling around it. Deferred out of v1 because it's real scope
(a proper authoring/validation tool), not a quick add, and the data it
needs (room boundary volumes, exhibit transforms) already exists once v1
ships — this is a checker built on top of existing data, not new
infrastructure. Start from the same boundary-volume data the
build-time manifest/glb drift check (DESIGN.md, Testing strategy) already
loads; the two checks likely share a "does this point/volume fall inside
this room's boundary" utility.

**Effort:** M
**Priority:** P2
**Depends on:** v1 shipped (needs `museum-manifest.json` boundary volumes
and the `content/` schema to exist first).

## Performance

### Real-device KTX2 memory verification

**What:** Run the museum on real low-end-target mobile devices (not just
desktop Chrome) and measure peak GPU/texture memory during a room
transition, once real (non-placeholder) exhibit assets exist. Confirm
KTX2/Basis Universal textures (via `npm run optimize-model`) actually stay
within budget, and specifically check for the transcode-time OOM risk
documented in DESIGN.md's Feasibility research — smaller compressed bytes
don't guarantee lower peak memory during decode.

**Why:** T9 from the eng review's outside-voice pass (mobile GPU/texture
memory was a feasibility risk taken for granted by omission in the
original research). The KTX2 tooling is wired up
(`npm run optimize-model`), but "the format choice is a mitigation" is not
the same as "verified on real hardware" — no CI or headless-browser
equivalent exists for this; it requires physical low-end devices.

**Context:** Deferred because (1) the current exhibits are external public
sample models this project doesn't own, so re-encoding them is throwaway
work, and (2) no physical device was available in the environment this
plan was built in. Do this once real exhibit assets exist and before
calling mobile support "verified" rather than "designed for."

**Effort:** S (once real assets + a device exist)
**Priority:** P1
**Depends on:** Real (non-placeholder) exhibit assets; access to a
low-end-target physical device.
