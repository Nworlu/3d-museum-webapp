// Pure placement math for adding a new gallery room via the admin API — same
// separation-of-concerns as exhibit-placement.mjs, so it's unit-testable
// without spinning up the server (test/unit/gallery-placement.test.ts).
//
// The museum's rooms form a single line along Z (see museum-manifest.src.json:
// lobby 0-10, gallery-1 10-20, ...). A new gallery is appended past whichever
// room currently has the largest maxZ, using that room's width and depth so
// the shell-building code in bootMuseum.ts (which generalizes to any room
// count) gets a boundary shaped like every other room in the building.

/**
 * @param {Record<string, {boundary:{minX:number,maxX:number,minZ:number,maxZ:number}}>} rooms
 * @returns {string} the roomId of the room at the end of the line (largest boundary.maxZ)
 */
export function findChainEnd(rooms) {
  const entries = Object.entries(rooms);
  if (entries.length === 0) throw new Error("museum has no rooms to extend");
  const [endRoomId] = entries.reduce((end, entry) => (entry[1].boundary.maxZ > end[1].boundary.maxZ ? entry : end));
  return endRoomId;
}

/**
 * A new room's boundary: same X span (width) as the anchor room, and the
 * same Z depth, placed immediately past the anchor's far wall so the two
 * boundaries touch (shared archway) without overlapping.
 */
export function computeNewRoomBoundary(rooms, anchorRoomId) {
  const anchor = rooms[anchorRoomId];
  if (!anchor) throw new Error(`unknown anchor room "${anchorRoomId}"`);
  const { minX, maxX, minZ, maxZ } = anchor.boundary;
  const depth = maxZ - minZ;
  return { minX, maxX, minZ: maxZ, maxZ: maxZ + depth };
}

/**
 * Recomputes the whole building's layout for a new gallery order, keeping
 * each room's own width/depth but repositioning it along the line so the
 * sequence matches `newOrder`. A room's own exhibits keep their local (x,
 * relative-z-within-room) placement — only where the room itself sits
 * along Z changes — so the caller needs to shift every exhibit's absolute
 * position.z by `zDeltaByRoomId[roomId]` when applying this.
 *
 * @param {Record<string, {boundary:{minX:number,maxX:number,minZ:number,maxZ:number}}>} rooms
 * @param {string[]} newOrder a permutation of every key in `rooms`
 */
export function computeReorderedLayout(rooms, newOrder) {
  const roomIds = Object.keys(rooms);
  const isPermutation =
    newOrder.length === roomIds.length &&
    new Set(newOrder).size === roomIds.length &&
    roomIds.every((id) => newOrder.includes(id));
  if (!isPermutation) {
    throw new Error("newOrder must be a permutation of every existing room id");
  }

  const originZ = Math.min(...roomIds.map((id) => rooms[id].boundary.minZ));
  let cursor = originZ;
  /** @type {Record<string, {minX:number,maxX:number,minZ:number,maxZ:number}>} */
  const boundaries = {};
  /** @type {Record<string, string[]>} */
  const adjacent = {};
  /** @type {Record<string, number>} */
  const zDeltaByRoomId = {};

  newOrder.forEach((roomId, i) => {
    const { minX, maxX, minZ, maxZ } = rooms[roomId].boundary;
    const depth = maxZ - minZ;
    const newMinZ = cursor;
    const newMaxZ = cursor + depth;
    boundaries[roomId] = { minX, maxX, minZ: newMinZ, maxZ: newMaxZ };
    zDeltaByRoomId[roomId] = newMinZ - minZ;
    adjacent[roomId] = [newOrder[i - 1], newOrder[i + 1]].filter((id) => id !== undefined);
    cursor = newMaxZ;
  });

  return { boundaries, adjacent, zDeltaByRoomId, firstRoomId: newOrder[0] };
}
