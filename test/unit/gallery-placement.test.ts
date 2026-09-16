import { describe, expect, it } from "vitest";
import { computeNewRoomBoundary, findChainEnd } from "../../scripts/gallery-placement.mjs";

const THREE_ROOM_LINE = {
  lobby: { boundary: { minX: -6, maxX: 6, minZ: -10, maxZ: 0 } },
  "gallery-1": { boundary: { minX: -6, maxX: 6, minZ: 0, maxZ: 10 } },
  "gallery-2": { boundary: { minX: -6, maxX: 6, minZ: 10, maxZ: 20 } },
};

describe("findChainEnd", () => {
  it("picks the room with the largest boundary.maxZ", () => {
    expect(findChainEnd(THREE_ROOM_LINE)).toBe("gallery-2");
  });

  it("works with a single room", () => {
    expect(findChainEnd({ lobby: THREE_ROOM_LINE.lobby })).toBe("lobby");
  });

  it("throws on an empty room set", () => {
    expect(() => findChainEnd({})).toThrow();
  });
});

describe("computeNewRoomBoundary", () => {
  it("appends past the anchor's maxZ with the same width and depth", () => {
    const boundary = computeNewRoomBoundary(THREE_ROOM_LINE, "gallery-2");
    expect(boundary).toEqual({ minX: -6, maxX: 6, minZ: 20, maxZ: 30 });
  });

  it("touches the anchor's far wall without overlapping it", () => {
    const boundary = computeNewRoomBoundary(THREE_ROOM_LINE, "gallery-2");
    expect(boundary.minZ).toBe(THREE_ROOM_LINE["gallery-2"].boundary.maxZ);
  });

  it("throws on an unknown anchor room", () => {
    expect(() => computeNewRoomBoundary(THREE_ROOM_LINE, "nope")).toThrow();
  });
});
