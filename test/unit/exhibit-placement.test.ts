import { describe, expect, it } from "vitest";
import {
  computeExhibitTransform,
  computeFrameSize,
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
