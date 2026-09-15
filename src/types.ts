export interface RoomBoundary {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ManifestRoom {
  boundary: RoomBoundary;
  adjacent: string[];
  contentUrl: string;
}

export interface MuseumManifest {
  entryRoomId: string;
  spawnPoint: { x: number; y: number; z: number };
  rooms: Record<string, ManifestRoom>;
}

export interface ExhibitData {
  id: string;
  modelUrl: string;
  position: { x: number; y: number; z: number };
  scale: number;
  title: string;
  description: string;
}

export interface RoomContent {
  exhibits: ExhibitData[];
}

export function pointInBoundary(x: number, z: number, b: RoomBoundary): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}
