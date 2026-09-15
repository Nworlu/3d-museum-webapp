import type { Scene } from "@babylonjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExhibitLoader } from "../../src/loader/ExhibitLoader";
import { RoomManager } from "../../src/room/RoomManager";
import type { MuseumManifest } from "../../src/types";

vi.mock("../../src/loader/ExhibitLoader");

function manifest(overrides: Partial<MuseumManifest> = {}): MuseumManifest {
  return {
    entryRoomId: "lobby",
    spawnPoint: { x: 0, y: 1.7, z: -4 },
    rooms: {
      lobby: { boundary: { minX: -6, maxX: 6, minZ: -10, maxZ: 0 }, adjacent: ["gallery-1"], contentUrl: "/content/lobby.json" },
      "gallery-1": {
        boundary: { minX: -6, maxX: 6, minZ: 0, maxZ: 10 },
        adjacent: ["lobby", "gallery-2"],
        contentUrl: "/content/gallery-1.json",
      },
      "gallery-2": { boundary: { minX: -6, maxX: 6, minZ: 10, maxZ: 20 }, adjacent: ["gallery-1"], contentUrl: "/content/gallery-2.json" },
    },
    ...overrides,
  };
}

describe("RoomManager", () => {
  let loader: ExhibitLoader;
  let loadedRooms: Set<string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loader = new ExhibitLoader({} as Scene);
    loadedRooms = new Set();
    vi.mocked(loader.loadRoom).mockImplementation(async (roomId) => {
      loadedRooms.add(roomId);
    });
    vi.mocked(loader.unloadRoom).mockImplementation((roomId) => {
      loadedRooms.delete(roomId);
    });
    vi.mocked(loader.isLoaded).mockImplementation((roomId) => loadedRooms.has(roomId));

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockManifestFetch(m: MuseumManifest) {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => m });
  }

  it("boots by loading the entry room and its adjacent rooms, resolving the spawn point", async () => {
    mockManifestFetch(manifest());
    const rm = new RoomManager(loader);

    const { spawn } = await rm.boot("/content/museum-manifest.json");

    expect(spawn).toEqual({ x: 0, y: 1.7, z: -4 });
    expect(rm.currentRoom).toBe("lobby");
    expect(loadedRooms).toEqual(new Set(["lobby", "gallery-1"]));
  });

  it("throws when the manifest fails to load", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const rm = new RoomManager(loader);

    await expect(rm.boot("/content/museum-manifest.json")).rejects.toThrow(/museum-manifest\.json failed to load/);
  });

  it("loads the next room and unloads a now-far room when the visitor crosses a boundary", async () => {
    mockManifestFetch(manifest());
    const rm = new RoomManager(loader);
    await rm.boot("/content/museum-manifest.json");

    // Walk deep into gallery-1, away from the lobby boundary (even with hysteresis).
    await rm.update(0, 5);

    expect(rm.currentRoom).toBe("gallery-1");
    expect(loadedRooms).toEqual(new Set(["gallery-1", "lobby", "gallery-2"]));
  });

  it("does not thrash load/unload when the visitor straddles a doorway (hysteresis)", async () => {
    mockManifestFetch(manifest());
    const rm = new RoomManager(loader);
    await rm.boot("/content/museum-manifest.json");
    vi.mocked(loader.loadRoom).mockClear();
    vi.mocked(loader.unloadRoom).mockClear();

    // z=0.2 is technically inside gallery-1's un-expanded boundary, but well
    // within the hysteresis-expanded current room (lobby) boundary.
    await rm.update(0, 0.2);

    expect(rm.currentRoom).toBe("lobby");
    expect(loader.loadRoom).not.toHaveBeenCalled();
    expect(loader.unloadRoom).not.toHaveBeenCalled();
  });

  it("suspends room transitions while inspecting, even if the camera crosses a boundary", async () => {
    mockManifestFetch(manifest());
    const rm = new RoomManager(loader);
    await rm.boot("/content/museum-manifest.json");

    rm.onInspectStart();
    await rm.update(0, 5); // deep in gallery-1 — would normally trigger a transition

    expect(rm.currentRoom).toBe("lobby");
    expect(loadedRooms).toEqual(new Set(["lobby", "gallery-1"]));

    rm.onInspectEnd();
    await rm.update(0, 5);
    expect(rm.currentRoom).toBe("gallery-1");
  });

  it("stays in the current room when the visitor is outside every known boundary", async () => {
    mockManifestFetch(manifest());
    const rm = new RoomManager(loader);
    await rm.boot("/content/museum-manifest.json");

    await rm.update(0, 500); // nowhere near any room

    expect(rm.currentRoom).toBe("lobby");
  });
});
