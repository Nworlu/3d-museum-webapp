import { describe, expect, it } from "vitest";
import {
  clampHeightAboveFloor,
  computeExhibitTransform,
  computeFrameSize,
  computeSculptureTransform,
  slugify,
  uniqueId,
} from "../../scripts/exhibit-placement.mjs";

const LOBBY_BOUNDARY = { minX: -6, maxX: 6, minZ: -10, maxZ: 0 };

describe("computeExhibitTransform", () => {
  it("places a west-wall exhibit inset from minX, facing +X", () => {
    const t = computeExhibitTransform(LOBBY_BOUNDARY, "west", 0, 1.6);
    expect(t.x).toBeCloseTo(-5.8);
    expect(t.y).toBe(1.6);
    expect(t.rotationY).toBeCloseTo(-Math.PI / 2);
  });

  it("places an east-wall exhibit inset from maxX, facing -X", () => {
    const t = computeExhibitTransform(LOBBY_BOUNDARY, "east", 0, 1.6);
    expect(t.x).toBeCloseTo(5.8);
    expect(t.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("maps offsetFraction -1..1 onto the room's minZ..maxZ", () => {
    expect(computeExhibitTransform(LOBBY_BOUNDARY, "west", -1, 1.6).z).toBeCloseTo(-10);
    expect(computeExhibitTransform(LOBBY_BOUNDARY, "west", 0, 1.6).z).toBeCloseTo(-5);
    expect(computeExhibitTransform(LOBBY_BOUNDARY, "west", 1, 1.6).z).toBeCloseTo(0);
  });

  it("clamps offsetFraction outside -1..1", () => {
    expect(computeExhibitTransform(LOBBY_BOUNDARY, "west", 5, 1.6).z).toBeCloseTo(0);
    expect(computeExhibitTransform(LOBBY_BOUNDARY, "west", -5, 1.6).z).toBeCloseTo(-10);
  });

  it("rejects a wall value that isn't west or east", () => {
    expect(() => computeExhibitTransform(LOBBY_BOUNDARY, "north" as never, 0, 1.6)).toThrow();
  });
});

describe("clampHeightAboveFloor", () => {
  it("leaves a height untouched when it already clears the floor", () => {
    expect(clampHeightAboveFloor(1.6, 1.4)).toBe(1.6);
  });

  it("raises a too-low center so a tall frame's bottom edge clears the floor", () => {
    // frameHeight 1.4 centered at 0.5 would put the bottom edge at -0.2 (below the floor)
    expect(clampHeightAboveFloor(0.5, 1.4)).toBeCloseTo(0.75);
  });

  it("is a no-op for a short frame even at a low requested height", () => {
    // frameHeight 0.2 centered at 0.5 already clears the floor (bottom edge at 0.4)
    expect(clampHeightAboveFloor(0.5, 0.2)).toBe(0.5);
  });
});

describe("computeSculptureTransform", () => {
  it("places a left-side sculpture west of the room's center line", () => {
    const t = computeSculptureTransform(LOBBY_BOUNDARY, "left", 0);
    expect(t.x).toBeCloseTo(-1.5); // center (0) - 1.5m offset
    expect(t.y).toBe(0);
    expect(t.rotationY).toBe(0);
  });

  it("places a right-side sculpture east of the room's center line", () => {
    const t = computeSculptureTransform(LOBBY_BOUNDARY, "right", 0);
    expect(t.x).toBeCloseTo(1.5);
  });

  it("maps offsetFraction -1..1 onto the room's minZ..maxZ, same as a painting", () => {
    expect(computeSculptureTransform(LOBBY_BOUNDARY, "left", -1).z).toBeCloseTo(-10);
    expect(computeSculptureTransform(LOBBY_BOUNDARY, "left", 1).z).toBeCloseTo(0);
  });

  it("rejects a side value that isn't left or right", () => {
    expect(() => computeSculptureTransform(LOBBY_BOUNDARY, "north" as never, 0)).toThrow();
  });
});

describe("computeFrameSize", () => {
  it("keeps the long edge at 1.4m for a landscape image", () => {
    const { width, height } = computeFrameSize(1600, 1000);
    expect(width).toBe(1.4);
    expect(height).toBeCloseTo(1.4 * (1000 / 1600));
  });

  it("keeps the long edge at 1.4m for a portrait image", () => {
    const { width, height } = computeFrameSize(1000, 1600);
    expect(height).toBe(1.4);
    expect(width).toBeCloseTo(1.4 * (1000 / 1600));
  });

  it("handles a square image", () => {
    const { width, height } = computeFrameSize(500, 500);
    expect(width).toBe(1.4);
    expect(height).toBe(1.4);
  });

  it("rejects zero or negative dimensions", () => {
    expect(() => computeFrameSize(0, 100)).toThrow();
    expect(() => computeFrameSize(100, -1)).toThrow();
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Night Café")).toBe("the-night-cafe");
  });

  it("strips accents before slugifying", () => {
    expect(slugify("Café des Artistes")).toBe("cafe-des-artistes");
  });

  it("collapses non-alphanumeric runs into one hyphen", () => {
    expect(slugify("A, B & C!!")).toBe("a-b-c");
  });

  it("falls back to a placeholder for an empty/unusable title", () => {
    expect(slugify("   ")).toBe("exhibit");
    expect(slugify("???")).toBe("exhibit");
  });
});

describe("uniqueId", () => {
  it("returns the base slug when there is no collision", () => {
    expect(uniqueId("starry-night", ["mona-lisa"])).toBe("starry-night");
  });

  it("appends -2 on a first collision", () => {
    expect(uniqueId("starry-night", ["starry-night"])).toBe("starry-night-2");
  });

  it("keeps incrementing past multiple collisions", () => {
    expect(uniqueId("starry-night", ["starry-night", "starry-night-2", "starry-night-3"])).toBe("starry-night-4");
  });
});
