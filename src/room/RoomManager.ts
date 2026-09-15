import { ExhibitLoader } from "../loader/ExhibitLoader";
import { pointInBoundary, type MuseumManifest, type RoomBoundary } from "../types";

const HYSTERESIS_MARGIN = 0.5;

function expand(b: RoomBoundary, margin: number): RoomBoundary {
  return { minX: b.minX - margin, maxX: b.maxX + margin, minZ: b.minZ - margin, maxZ: b.maxZ + margin };
}

/**
 * Tracks which room the visitor is in and keeps the right rooms loaded.
 * Two behaviors were added during the eng review of this project's design
 * doc, on top of the base "load current + adjacent, dispose the rest":
 *  - a hysteresis band on the current room's boundary, so standing at a
 *    doorway doesn't thrash load/unload every frame (Edge case).
 *  - an `inspecting` flag that suspends room transitions while
 *    click-to-inspect has the camera dollied toward an exhibit, since the
 *    room check keys off camera position and an inspect-dolly can cross a
 *    boundary without the visitor actually having moved (Outside voice
 *    point 9 — inspect-mode dispose race).
 */
export class RoomManager {
  private manifest: MuseumManifest | null = null;
  private currentRoomId: string | null = null;
  private inspecting = false;

  constructor(private readonly loader: ExhibitLoader) {}

  async boot(manifestUrl: string): Promise<{ spawn: { x: number; y: number; z: number } }> {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      throw new Error(`museum-manifest.json failed to load (${res.status})`);
    }
    this.manifest = (await res.json()) as MuseumManifest;
    this.currentRoomId = this.manifest.entryRoomId;
    await this.syncLoadedRooms();
    return { spawn: this.manifest.spawnPoint };
  }

  onInspectStart(): void {
    this.inspecting = true;
  }

  onInspectEnd(): void {
    this.inspecting = false;
  }

  /** Call every frame with the visitor's world position. */
  async update(x: number, z: number): Promise<void> {
    if (!this.manifest || this.inspecting) return;

    const resolved = this.resolveRoom(x, z);
    if (resolved !== this.currentRoomId) {
      this.currentRoomId = resolved;
      await this.syncLoadedRooms();
    }
  }

  get currentRoom(): string | null {
    return this.currentRoomId;
  }

  private resolveRoom(x: number, z: number): string {
    const manifest = this.manifest!;
    const current = this.currentRoomId ? manifest.rooms[this.currentRoomId] : undefined;
    if (current && pointInBoundary(x, z, expand(current.boundary, HYSTERESIS_MARGIN))) {
      return this.currentRoomId!;
    }
    for (const [roomId, room] of Object.entries(manifest.rooms)) {
      if (pointInBoundary(x, z, room.boundary)) return roomId;
    }
    // Visitor is outside every known boundary (e.g. spawn edge case) — stay put.
    return this.currentRoomId ?? manifest.entryRoomId;
  }

  private async syncLoadedRooms(): Promise<void> {
    const manifest = this.manifest;
    if (!manifest || !this.currentRoomId) return;

    const current = manifest.rooms[this.currentRoomId];
    const needed = new Set<string>([this.currentRoomId, ...current.adjacent]);

    for (const roomId of Object.keys(manifest.rooms)) {
      if (!needed.has(roomId) && this.loader.isLoaded(roomId)) {
        this.loader.unloadRoom(roomId);
      }
    }

    await Promise.all(
      Array.from(needed)
        .filter((roomId) => !this.loader.isLoaded(roomId))
        .map((roomId) => this.loader.loadRoom(roomId, manifest.rooms[roomId].contentUrl)),
    );
  }
}
