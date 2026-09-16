// Pure placement math for the admin API — kept dependency-free and separate
// from server/index.mjs so it's trivially unit-testable (test/unit/exhibit-placement.test.ts).

const WALL_INSET = 0.2; // meters in from the wall surface, matches the 6 hand-authored paintings (-5.8/5.8 on a -6/6 boundary)
const TARGET_LONG_EDGE = 1.4; // meters, matches the hand-authored paintings
const MIN_FLOOR_CLEARANCE = 0.05; // meters between a painting's bottom edge and the floor

/**
 * `height` is the exhibit's vertical CENTER, so a curator-entered height
 * that's low relative to a tall frame can put the bottom edge below the
 * floor (y=0) — the painting appears to sink into the ground. Raises the
 * center just enough to keep MIN_FLOOR_CLEARANCE between the frame's
 * bottom edge and the floor; leaves height untouched otherwise.
 */
export function clampHeightAboveFloor(height, frameHeight) {
  return Math.max(height, frameHeight / 2 + MIN_FLOOR_CLEARANCE);
}

/**
 * Maps a curator-friendly {wall, offsetFraction, height} into the world-space
 * transform ExhibitLoader/PaintingExhibit expects, so nobody has to know the
 * room's actual world coordinates to hang a painting.
 *
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} boundary
 * @param {"west"|"east"} wall
 * @param {number} offsetFraction -1 (start of the wall) to 1 (end of the wall)
 * @param {number} height meters, eye-level default is 1.6 — the exhibit's vertical center
 */
export function computeExhibitTransform(boundary, wall, offsetFraction, height) {
  if (wall !== "west" && wall !== "east") {
    throw new Error(`wall must be "west" or "east", got ${JSON.stringify(wall)}`);
  }
  const clampedFraction = Math.max(-1, Math.min(1, offsetFraction));
  const z = boundary.minZ + ((clampedFraction + 1) / 2) * (boundary.maxZ - boundary.minZ);
  const x = wall === "west" ? boundary.minX + WALL_INSET : boundary.maxX - WALL_INSET;
  const rotationY = wall === "west" ? -Math.PI / 2 : Math.PI / 2;
  return { x, y: height, z, rotationY };
}

/**
 * Scales a picture's physical size (meters) from its pixel aspect ratio,
 * keeping the longer edge at TARGET_LONG_EDGE — the same rule used to size
 * the six hand-authored paintings.
 */
export function computeFrameSize(pixelWidth, pixelHeight) {
  if (pixelWidth <= 0 || pixelHeight <= 0) {
    throw new Error(`invalid image dimensions ${pixelWidth}x${pixelHeight}`);
  }
  const aspect = pixelWidth / pixelHeight;
  if (aspect >= 1) {
    return { width: TARGET_LONG_EDGE, height: TARGET_LONG_EDGE / aspect };
  }
  return { width: TARGET_LONG_EDGE * aspect, height: TARGET_LONG_EDGE };
}

/** Lowercase, hyphenated, alnum-only slug — e.g. "The Night Café" -> "the-night-cafe". */
export function slugify(title) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "exhibit";
}

/** Appends -2, -3, ... until the slug doesn't collide with an existing exhibit id. */
export function uniqueId(baseSlug, existingIds) {
  if (!existingIds.includes(baseSlug)) return baseSlug;
  let n = 2;
  while (existingIds.includes(`${baseSlug}-${n}`)) n++;
  return `${baseSlug}-${n}`;
}
