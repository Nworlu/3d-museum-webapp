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
