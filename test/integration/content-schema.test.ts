import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExhibitData, MuseumManifest, RoomContent } from "../../src/types";

const CONTENT_DIR = join(__dirname, "../../public/content");

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(CONTENT_DIR, filename), "utf-8")) as T;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function assertExhibitShape(exhibit: ExhibitData, context: string): void {
  expect(typeof exhibit.id, `${context}: id`).toBe("string");
  expect(exhibit.id.length, `${context}: id must be non-empty`).toBeGreaterThan(0);
  expect(typeof exhibit.title, `${context}: title`).toBe("string");
  expect(typeof exhibit.description, `${context}: description`).toBe("string");
  for (const axis of ["x", "y", "z"] as const) {
    expect(isFiniteNumber(exhibit.position?.[axis]), `${context}: position.${axis} must be a finite number`).toBe(
      true,
    );
  }

  if (exhibit.kind === "model") {
    expect(typeof exhibit.modelUrl, `${context}: modelUrl`).toBe("string");
    expect(isFiniteNumber(exhibit.scale), `${context}: scale must be a finite number`).toBe(true);
    expect(exhibit.scale, `${context}: scale must be positive`).toBeGreaterThan(0);
  } else if (exhibit.kind === "painting") {
    expect(typeof exhibit.imageUrl, `${context}: imageUrl`).toBe("string");
    expect(isFiniteNumber(exhibit.width), `${context}: width must be a finite number`).toBe(true);
    expect(exhibit.width, `${context}: width must be positive`).toBeGreaterThan(0);
    expect(isFiniteNumber(exhibit.height), `${context}: height must be a finite number`).toBe(true);
    expect(exhibit.height, `${context}: height must be positive`).toBeGreaterThan(0);
    expect(isFiniteNumber(exhibit.rotationY), `${context}: rotationY must be a finite number`).toBe(true);
  } else {
    expect.fail(`${context}: unknown exhibit kind "${(exhibit as ExhibitData).kind}"`);
  }
}

describe("museum-manifest.json", () => {
  const manifest = readJson<MuseumManifest>("museum-manifest.json");

  it("has an entryRoomId that exists in rooms", () => {
    expect(manifest.rooms).toHaveProperty(manifest.entryRoomId);
  });

  it("has a spawnPoint with finite x/y/z", () => {
    for (const axis of ["x", "y", "z"] as const) {
      expect(isFiniteNumber(manifest.spawnPoint?.[axis]), `spawnPoint.${axis}`).toBe(true);
    }
  });

  it("every room's adjacency list references rooms that exist", () => {
    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      for (const neighborId of room.adjacent) {
        expect(manifest.rooms, `${roomId} lists unknown adjacent room "${neighborId}"`).toHaveProperty(neighborId);
      }
    }
  });

  it("adjacency is symmetric (if A lists B, B lists A) — catches one-sided drift", () => {
    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      for (const neighborId of room.adjacent) {
        const neighbor = manifest.rooms[neighborId];
        expect(
          neighbor.adjacent,
          `${roomId} lists ${neighborId} as adjacent, but ${neighborId} does not list ${roomId} back`,
        ).toContain(roomId);
      }
    }
  });

  it("every room's boundary is well-formed (min < max on both axes)", () => {
    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      expect(room.boundary.minX, `${roomId} boundary.minX < maxX`).toBeLessThan(room.boundary.maxX);
      expect(room.boundary.minZ, `${roomId} boundary.minZ < maxZ`).toBeLessThan(room.boundary.maxZ);
    }
  });

  it("no two rooms' boundaries overlap (each point belongs to at most one room)", () => {
    const rooms = Object.entries(manifest.rooms);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const [idA, a] = rooms[i];
        const [idB, b] = rooms[j];
        const overlapsX = a.boundary.minX < b.boundary.maxX && b.boundary.minX < a.boundary.maxX;
        const overlapsZ = a.boundary.minZ < b.boundary.maxZ && b.boundary.minZ < a.boundary.maxZ;
        expect(overlapsX && overlapsZ, `${idA} and ${idB} boundaries overlap`).toBe(false);
      }
    }
  });

  it("every room's contentUrl points at a file that exists and parses", () => {
    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      const filename = room.contentUrl.replace(/^\/content\//, "");
      expect(() => readJson<RoomContent>(filename), `${roomId}'s contentUrl (${room.contentUrl})`).not.toThrow();
    }
  });
});

describe("room content files", () => {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json") && f !== "museum-manifest.json");

  it("found at least one room content file to validate", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: has a well-formed exhibits array`, () => {
      const content = readJson<RoomContent>(file);
      expect(Array.isArray(content.exhibits), `${file}: exhibits must be an array`).toBe(true);
      content.exhibits.forEach((exhibit, i) => assertExhibitShape(exhibit, `${file} exhibits[${i}]`));
    });

    it(`${file}: exhibit ids are unique within the room`, () => {
      const content = readJson<RoomContent>(file);
      const ids = content.exhibits.map((e) => e.id);
      expect(new Set(ids).size, `${file}: duplicate exhibit id`).toBe(ids.length);
    });
  }
});
