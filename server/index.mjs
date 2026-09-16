#!/usr/bin/env node
// Admin API — the one write path in an otherwise fully static app (DESIGN.md
// Key Decision #1: content served from the app's own static host). Visitors
// never hit this server; only the /admin curator page does, to add or remove
// exhibits without hand-editing JSON files.
//
// This process must be running (npm run server) for the admin page to work.
// It is NOT part of the deployed static museum — a real deployment runs this
// on a small always-on host (or a serverless function) separately from the
// CDN/static host serving the museum itself.

import crypto from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import multer from "multer";
import { imageSize } from "image-size";
import { ROOT, SRC_DIR, regenerateContent } from "../scripts/version-content.mjs";
import {
  clampHeightAboveFloor,
  computeExhibitTransform,
  computeFrameSize,
  computeSculptureTransform,
  slugify,
  uniqueId,
} from "../scripts/exhibit-placement.mjs";
import { computeNewRoomBoundary, computeReorderedLayout, findChainEnd } from "../scripts/gallery-placement.mjs";

const PORT = process.env.ADMIN_PORT || 3001;
const ART_DIR = join(ROOT, "public", "art");
const MODEL_DIR = join(ROOT, "public", "models");
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_MODEL_UPLOAD_BYTES = 30 * 1024 * 1024; // .glb files run larger than a painting jpeg

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(9).toString("base64url");
  console.log("\n  No ADMIN_PASSWORD set — generated one for this session:");
  console.log(`  \x1b[1m${ADMIN_PASSWORD}\x1b[0m`);
  console.log("  Set ADMIN_PASSWORD yourself to keep a stable password across restarts.\n");
}

mkdirSync(ART_DIR, { recursive: true });
mkdirSync(MODEL_DIR, { recursive: true });

// Recent-activity feed for the dashboard's "History" panel — in-memory only
// (resets on server restart). A curator's admin process is short-lived and
// single-instance, so this doesn't need to survive a restart or be shared
// across processes; it's a nicety, not a system of record.
const ACTIVITY_LIMIT = 30;
const activityLog = [];
function logActivity(type, message) {
  activityLog.unshift({ type, message, at: new Date().toISOString() });
  activityLog.length = Math.min(activityLog.length, ACTIVITY_LIMIT);
}

const app = express();
app.use(express.json());

function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  // Compare against a fixed-length buffer first so mismatched lengths don't
  // short-circuit crypto.timingSafeEqual (which throws on unequal lengths)
  // in a way that leaks length via a thrown-vs-not-thrown timing difference.
  const padded = Buffer.alloc(aBuf.length, 0);
  bBuf.copy(padded);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, padded);
}

// Deliberately never sends a WWW-Authenticate response header: that header is
// what tells the BROWSER (not just our own client code) to pop up its own
// native username/password dialog on top of the page — for any request that
// gets a 401 with it, including a fetch() that already sent a correct-looking
// Authorization header. We use "Basic" purely as a credential-encoding format
// between our own LoginForm and this middleware, not as an HTTP auth
// challenge/response protocol, so that native prompt would only ever hijack
// the custom login UI, never replace it usefully.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");
  const password = separatorIndex === -1 ? "" : decoded.slice(separatorIndex + 1);
  if (!timingSafeStringEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Wrong password." });
  }
  next();
}

app.use("/api/admin", requireAuth);

function loadManifestSrc() {
  return JSON.parse(readFileSync(join(SRC_DIR, "museum-manifest.src.json"), "utf-8"));
}

function saveManifestSrc(manifest) {
  writeFileSync(join(SRC_DIR, "museum-manifest.src.json"), JSON.stringify(manifest, null, 2) + "\n");
}

function loadRoomContent(contentFile) {
  return JSON.parse(readFileSync(join(SRC_DIR, contentFile), "utf-8"));
}

function saveRoomContent(contentFile, content) {
  writeFileSync(join(SRC_DIR, contentFile), JSON.stringify(content, null, 2) + "\n");
}

// GET /api/admin/rooms — room list + current exhibits, for the admin UI.
app.get("/api/admin/rooms", (req, res) => {
  const manifest = loadManifestSrc();
  const rooms = Object.entries(manifest.rooms).map(([roomId, room]) => {
    const content = loadRoomContent(room.contentFile);
    return {
      roomId,
      boundary: room.boundary,
      pillar: room.pillar ?? false,
      exhibits: content.exhibits.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        description: e.description,
        imageUrl: e.kind === "painting" ? e.imageUrl : undefined,
      })),
    };
  });
  res.json({ rooms });
});

// GET /api/admin/activity — recent curator actions, newest first.
app.get("/api/admin/activity", (req, res) => {
  res.json({ activity: activityLog });
});

// POST /api/admin/rooms — add a new gallery at the end of the building. Body:
// { name: string }. The new room is appended past whichever existing room
// currently has the largest boundary.maxZ, matching that room's width and
// depth, and wired into the adjacency chain (shared archway) automatically —
// a curator never has to think in world coordinates.
app.post("/api/admin/rooms", (req, res) => {
  try {
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }

    const manifest = loadManifestSrc();
    const roomId = uniqueId(slugify(name), Object.keys(manifest.rooms));
    const anchorRoomId = findChainEnd(manifest.rooms);
    const boundary = computeNewRoomBoundary(manifest.rooms, anchorRoomId);
    const contentFile = `${roomId}.json`;

    manifest.rooms[anchorRoomId].adjacent.push(roomId);
    manifest.rooms[roomId] = { boundary, adjacent: [anchorRoomId], contentFile };
    saveManifestSrc(manifest);
    saveRoomContent(contentFile, { exhibits: [] });
    regenerateContent();
    logActivity("room-added", `Opened gallery "${roomId}"`);

    res.status(201).json({ roomId, boundary, pillar: false, exhibits: [] });
  } catch (err) {
    console.error("[admin] failed to add room:", err);
    res.status(500).json({ error: "Failed to add gallery. See server logs." });
  }
});

// PATCH /api/admin/rooms/:roomId — currently only toggles the decorative
// center pillar. Body: { pillar: boolean }.
app.patch("/api/admin/rooms/:roomId", (req, res) => {
  try {
    const { roomId } = req.params;
    const { pillar } = req.body ?? {};
    if (typeof pillar !== "boolean") {
      return res.status(400).json({ error: "pillar must be a boolean." });
    }
    const manifest = loadManifestSrc();
    const room = manifest.rooms[roomId];
    if (!room) return res.status(404).json({ error: `Unknown room "${roomId}".` });

    room.pillar = pillar;
    saveManifestSrc(manifest);
    regenerateContent();
    logActivity("room-updated", `${pillar ? "Added" : "Removed"} the center pillar in ${roomId}`);

    res.json({ roomId, pillar });
  } catch (err) {
    console.error("[admin] failed to update room:", err);
    res.status(500).json({ error: "Failed to update gallery. See server logs." });
  }
});

// POST /api/admin/rooms/reorder — body: { order: string[] }, a permutation
// of every room id. Recomputes every room's boundary/adjacency to match the
// new sequence and shifts each room's exhibits' absolute z by the same
// amount its room moved, so nothing drifts off its wall.
app.post("/api/admin/rooms/reorder", (req, res) => {
  try {
    const { order } = req.body ?? {};
    if (!Array.isArray(order) || !order.every((id) => typeof id === "string")) {
      return res.status(400).json({ error: "order must be an array of room ids." });
    }

    const manifest = loadManifestSrc();
    const originalEntryRoom = manifest.rooms[manifest.entryRoomId];
    const entryOffset = manifest.spawnPoint.z - originalEntryRoom.boundary.minZ;

    const { boundaries, adjacent, zDeltaByRoomId, firstRoomId } = computeReorderedLayout(manifest.rooms, order);

    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      room.boundary = boundaries[roomId];
      room.adjacent = adjacent[roomId];
      const delta = zDeltaByRoomId[roomId];
      if (delta !== 0) {
        const content = loadRoomContent(room.contentFile);
        content.exhibits.forEach((e) => {
          e.position.z += delta;
        });
        saveRoomContent(room.contentFile, content);
      }
    }
    // JS object key insertion order IS the display/iteration order everywhere
    // this manifest is read (GET /api/admin/rooms, version-content.mjs) — the
    // loop above only updated each room's fields in place, so without this
    // rebuild the dashboard's gallery tiles would never visually reorder even
    // though the underlying boundaries/adjacency are already correct.
    const reordered = {};
    for (const roomId of order) reordered[roomId] = manifest.rooms[roomId];
    manifest.rooms = reordered;
    manifest.entryRoomId = firstRoomId;
    manifest.spawnPoint.z = boundaries[firstRoomId].minZ + entryOffset;
    saveManifestSrc(manifest);
    regenerateContent();
    logActivity("rooms-reordered", `Reordered galleries: ${order.join(" → ")}`);

    res.json({ ok: true });
  } catch (err) {
    console.error("[admin] failed to reorder galleries:", err);
    res.status(500).json({ error: "Failed to reorder galleries. See server logs." });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, or WebP images are accepted."));
    }
    cb(null, true);
  },
});

// POST /api/admin/exhibits — add a painting exhibit. multipart/form-data:
// image (file), roomId, wall ("west"|"east"), offsetFraction (-1..1),
// height, title, description.
app.post("/api/admin/exhibits", upload.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "An image file is required." });
    const { roomId, wall, title, description } = req.body;
    const offsetFraction = Number(req.body.offsetFraction);
    const height = Number(req.body.height);
    if (!roomId || !title || !description) {
      return res.status(400).json({ error: "roomId, title, and description are required." });
    }
    if (wall !== "west" && wall !== "east") {
      return res.status(400).json({ error: 'wall must be "west" or "east".' });
    }
    if (!Number.isFinite(offsetFraction) || !Number.isFinite(height)) {
      return res.status(400).json({ error: "offsetFraction and height must be numbers." });
    }

    const manifest = loadManifestSrc();
    const room = manifest.rooms[roomId];
    if (!room) return res.status(404).json({ error: `Unknown room "${roomId}".` });

    const content = loadRoomContent(room.contentFile);
    const existingIds = content.exhibits.map((e) => e.id);
    const id = uniqueId(slugify(title), existingIds);

    let dims;
    try {
      dims = imageSize(req.file.buffer);
    } catch {
      return res.status(400).json({ error: "Could not read image dimensions — file may be corrupt." });
    }
    const { width, height: frameHeight } = computeFrameSize(dims.width, dims.height);
    const safeHeight = clampHeightAboveFloor(height, frameHeight);
    const { x, y, z, rotationY } = computeExhibitTransform(room.boundary, wall, offsetFraction, safeHeight);

    const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[req.file.mimetype];
    const imageFilename = `${id}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    writeFileSync(join(ART_DIR, imageFilename), req.file.buffer);

    const exhibit = {
      id,
      kind: "painting",
      imageUrl: `/art/${imageFilename}`,
      position: { x, y, z },
      rotationY,
      width,
      height: frameHeight,
      title,
      description,
    };
    content.exhibits.push(exhibit);
    saveRoomContent(room.contentFile, content);
    regenerateContent();
    logActivity("exhibit-added", `Added "${title}" to ${roomId}`);

    res.status(201).json({ exhibit });
  } catch (err) {
    console.error("[admin] failed to add exhibit:", err);
    res.status(500).json({ error: "Failed to add exhibit. See server logs." });
  }
});

const modelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MODEL_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    // Browsers report inconsistent (often empty or generic) MIME types for
    // .glb, so the extension is the reliable check here, same as a curator
    // would judge the file by its name.
    if (!/\.glb$/i.test(file.originalname)) {
      return cb(new Error("Only .glb files are accepted."));
    }
    cb(null, true);
  },
});

// POST /api/admin/sculptures — add a floor-standing sculpture (a "model"
// exhibit). multipart/form-data: model (file, .glb), roomId, side
// ("left"|"right" of the room's center aisle), offsetFraction (-1..1),
// scale, title, description. Rendered on an automatic pedestal
// (ExhibitLoader) — no wall or height to pick, unlike a painting.
app.post("/api/admin/sculptures", modelUpload.single("model"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "A .glb model file is required." });
    const { roomId, side, title, description } = req.body;
    const offsetFraction = Number(req.body.offsetFraction);
    const scale = Number(req.body.scale);
    if (!roomId || !title || !description) {
      return res.status(400).json({ error: "roomId, title, and description are required." });
    }
    if (side !== "left" && side !== "right") {
      return res.status(400).json({ error: 'side must be "left" or "right".' });
    }
    if (!Number.isFinite(offsetFraction) || !Number.isFinite(scale) || scale <= 0) {
      return res.status(400).json({ error: "offsetFraction must be a number and scale must be a positive number." });
    }

    const manifest = loadManifestSrc();
    const room = manifest.rooms[roomId];
    if (!room) return res.status(404).json({ error: `Unknown room "${roomId}".` });

    const content = loadRoomContent(room.contentFile);
    const existingIds = content.exhibits.map((e) => e.id);
    const id = uniqueId(slugify(title), existingIds);

    const { x, y, z } = computeSculptureTransform(room.boundary, side, offsetFraction);

    const modelFilename = `${id}-${crypto.randomBytes(4).toString("hex")}.glb`;
    writeFileSync(join(MODEL_DIR, modelFilename), req.file.buffer);

    const exhibit = {
      id,
      kind: "model",
      modelUrl: `/models/${modelFilename}`,
      position: { x, y, z },
      scale,
      title,
      description,
    };
    content.exhibits.push(exhibit);
    saveRoomContent(room.contentFile, content);
    regenerateContent();
    logActivity("exhibit-added", `Added sculpture "${title}" to ${roomId}`);

    res.status(201).json({ exhibit });
  } catch (err) {
    console.error("[admin] failed to add sculpture:", err);
    res.status(500).json({ error: "Failed to add sculpture. See server logs." });
  }
});

// DELETE /api/admin/exhibits/:roomId/:exhibitId
app.delete("/api/admin/exhibits/:roomId/:exhibitId", (req, res) => {
  try {
    const { roomId, exhibitId } = req.params;
    const manifest = loadManifestSrc();
    const room = manifest.rooms[roomId];
    if (!room) return res.status(404).json({ error: `Unknown room "${roomId}".` });

    const content = loadRoomContent(room.contentFile);
    const before = content.exhibits.length;
    const removed = content.exhibits.find((e) => e.id === exhibitId);
    content.exhibits = content.exhibits.filter((e) => e.id !== exhibitId);
    if (content.exhibits.length === before) {
      return res.status(404).json({ error: `No exhibit "${exhibitId}" in room "${roomId}".` });
    }
    saveRoomContent(room.contentFile, content);

    // Best-effort cleanup: only delete the asset file if this was the last
    // exhibit in the whole museum referencing it (a reused image, like the
    // duck-reprise pattern in the seed content, must survive).
    const urlField = removed?.kind === "painting" ? "imageUrl" : removed?.kind === "model" ? "modelUrl" : null;
    const removedUrl = urlField ? removed[urlField] : null;
    if (removedUrl && (removedUrl.startsWith("/art/") || removedUrl.startsWith("/models/"))) {
      const stillReferenced = Object.values(manifest.rooms).some((r) => {
        const c = r.contentFile === room.contentFile ? content : loadRoomContent(r.contentFile);
        return c.exhibits.some((e) => e.kind === removed.kind && e[urlField] === removedUrl);
      });
      if (!stillReferenced) {
        try {
          unlinkSync(join(ROOT, "public", removedUrl.replace(/^\//, "")));
        } catch {
          // non-fatal — an orphaned file under public/art/ or public/models/ is a cheap cost
        }
      }
    }

    regenerateContent();
    logActivity("exhibit-removed", `Removed "${removed?.title ?? exhibitId}" from ${roomId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin] failed to delete exhibit:", err);
    res.status(500).json({ error: "Failed to delete exhibit. See server logs." });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`[admin] listening on http://localhost:${PORT}`);
});
