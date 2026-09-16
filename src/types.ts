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
  /** Decorative center column, curator-toggleable per room. Absent = off. */
  pillar?: boolean;
}

export interface MuseumManifest {
  entryRoomId: string;
  spawnPoint: { x: number; y: number; z: number };
  rooms: Record<string, ManifestRoom>;
}

interface ExhibitBase {
  id: string;
  position: { x: number; y: number; z: number };
  title: string;
  description: string;
}

export interface ModelExhibit extends ExhibitBase {
  kind: "model";
  modelUrl: string;
  scale: number;
}

/** A framed image mounted flush against a wall. */
export interface PaintingExhibit extends ExhibitBase {
  kind: "painting";
  imageUrl: string;
  /** Physical size in meters. */
  width: number;
  height: number;
  /** Radians — rotates the picture to face into the room from its wall. */
  rotationY: number;
}

export type ExhibitData = ModelExhibit | PaintingExhibit;

export interface RoomContent {
  exhibits: ExhibitData[];
}

export function pointInBoundary(x: number, z: number, b: RoomBoundary): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}
