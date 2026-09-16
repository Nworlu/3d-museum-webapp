import { describe, expect, it } from "vitest";
import { computeNewRoomBoundary, computeReorderedLayout, findChainEnd } from "../../scripts/gallery-placement.mjs";

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

describe("computeReorderedLayout", () => {
  it("keeps each room's own depth, repositioned to match the new order", () => {
    const { boundaries } = computeReorderedLayout(THREE_ROOM_LINE, ["gallery-2", "lobby", "gallery-1"]);
    expect(boundaries["gallery-2"]).toEqual({ minX: -6, maxX: 6, minZ: -10, maxZ: 0 });
    expect(boundaries.lobby).toEqual({ minX: -6, maxX: 6, minZ: 0, maxZ: 10 });
    expect(boundaries["gallery-1"]).toEqual({ minX: -6, maxX: 6, minZ: 10, maxZ: 20 });
  });

  it("is a no-op on boundaries when the order doesn't change", () => {
    const { boundaries, zDeltaByRoomId } = computeReorderedLayout(THREE_ROOM_LINE, ["lobby", "gallery-1", "gallery-2"]);
    for (const roomId of Object.keys(THREE_ROOM_LINE) as Array<keyof typeof THREE_ROOM_LINE>) {
      expect(boundaries[roomId]).toEqual(THREE_ROOM_LINE[roomId].boundary);
      expect(zDeltaByRoomId[roomId]).toBe(0);
    }
  });

  it("computes the z-shift each room's exhibits must move by", () => {
    const { zDeltaByRoomId } = computeReorderedLayout(THREE_ROOM_LINE, ["gallery-2", "lobby", "gallery-1"]);
    expect(zDeltaByRoomId["gallery-2"]).toBe(-20); // was minZ 10, now -10
    expect(zDeltaByRoomId.lobby).toBe(10); // was minZ -10, now 0
    expect(zDeltaByRoomId["gallery-1"]).toBe(10); // was minZ 0, now 10
  });

  it("rebuilds adjacency as a sequential chain matching the new order", () => {
    const { adjacent } = computeReorderedLayout(THREE_ROOM_LINE, ["gallery-2", "lobby", "gallery-1"]);
    expect(adjacent["gallery-2"]).toEqual(["lobby"]);
    expect(adjacent.lobby).toEqual(["gallery-2", "gallery-1"]);
    expect(adjacent["gallery-1"]).toEqual(["lobby"]);
  });

  it("reports the new first room in the sequence", () => {
    expect(computeReorderedLayout(THREE_ROOM_LINE, ["gallery-2", "lobby", "gallery-1"]).firstRoomId).toBe("gallery-2");
  });

  it("throws when newOrder is missing a room", () => {
    expect(() => computeReorderedLayout(THREE_ROOM_LINE, ["lobby", "gallery-1"])).toThrow();
  });

  it("throws when newOrder has a duplicate", () => {
    expect(() => computeReorderedLayout(THREE_ROOM_LINE, ["lobby", "lobby", "gallery-1"])).toThrow();
  });

  it("throws when newOrder names an unknown room", () => {
    expect(() => computeReorderedLayout(THREE_ROOM_LINE, ["lobby", "gallery-1", "nope"])).toThrow();
  });
});
