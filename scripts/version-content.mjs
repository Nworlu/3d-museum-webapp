#!/usr/bin/env node
// Build step for Key Decision #7 (DESIGN.md): content URLs are content-hash
// versioned so a curator's publish reaches visitors past CDN/browser caching.
//
// Reads authored source from content/ (museum-manifest.src.json + one JSON
// file per room) and generates public/content/, which is what the app
// actually fetches at runtime:
//   content/lobby.json  --(hash of its bytes)-->  public/content/lobby.<hash>.json
// museum-manifest.json's contentUrl for each room points at that hashed
// filename, so editing a room's content changes its URL — a stale CDN/browser
// cache entry for the OLD url is simply irrelevant.
//
// Run before dev/build (wired as npm's predev/prebuild); safe to re-run any
// time, always regenerates public/content/ from the current source.
//
// Exported as regenerateContent() so server/index.mjs (the admin API) can
// call the exact same logic after writing a new exhibit — one implementation
// of "source -> served content", not two that could drift.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SRC_DIR = join(ROOT, "content");
export const OUT_DIR = join(ROOT, "public", "content");
const HASH_LENGTH = 8;

function hashOf(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, HASH_LENGTH);
}

export function regenerateContent() {
  const srcManifestPath = join(SRC_DIR, "museum-manifest.src.json");
  const srcManifest = JSON.parse(readFileSync(srcManifestPath, "utf-8"));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const outRooms = {};
  for (const [roomId, room] of Object.entries(srcManifest.rooms)) {
    const { contentFile, ...rest } = room;
    const srcPath = join(SRC_DIR, contentFile);
    const bytes = readFileSync(srcPath);
    const hash = hashOf(bytes);
    const base = contentFile.replace(/\.json$/, "");
    const hashedFilename = `${base}.${hash}.json`;
    writeFileSync(join(OUT_DIR, hashedFilename), bytes);
    outRooms[roomId] = { ...rest, contentUrl: `/content/${hashedFilename}` };
  }

  const outManifest = {
    entryRoomId: srcManifest.entryRoomId,
    spawnPoint: srcManifest.spawnPoint,
    rooms: outRooms,
  };
  writeFileSync(join(OUT_DIR, "museum-manifest.json"), JSON.stringify(outManifest, null, 2) + "\n");

  return { roomCount: Object.keys(outRooms).length };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { roomCount } = regenerateContent();
  console.log(`[version-content] wrote ${roomCount} room file(s) + museum-manifest.json to public/content/`);
}
