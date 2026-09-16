import { expect, test } from "@playwright/test";
import type { MuseumDebugHandle } from "../../src/babylon/bootMuseum";

declare global {
  interface Window {
    __museumDebug?: MuseumDebugHandle;
  }
}

/**
 * Outside-voice / Failure-modes finding (DESIGN.md): the coverage diagram
 * flagged "bounding-box collision vs building shell" as a codepath with no
 * assigned test. Naive collision can tunnel through geometry at high
 * velocity/low frame rate, and this project's placeholder shell had NO
 * wall geometry at all until this test's own gap analysis prompted adding
 * a perimeter wall (src/babylon/bootMuseum.ts) — without it, a visitor
 * walking fast enough could fall off the edge of the world entirely
 * (observed manually during MVP verification).
 */
test("fast movement toward the perimeter wall does not tunnel through it", async ({ page }) => {
  await page.goto("/museum");
  await page.waitForTimeout(3000);

  const canvas = page.locator("#renderCanvas");
  await canvas.click({ position: { x: 512, y: 384 } });

  // Spawn is at z=-4; the lobby's (and the building's) far wall sits at
  // z=-10. Walk forward for long enough that, without collision, the
  // camera would travel well past it.
  await page.keyboard.down("s"); // camera looks toward +z at spawn; walk -z (toward the near wall) with S
  await page.waitForTimeout(6000);
  await page.keyboard.up("s");
  await page.waitForTimeout(300);

  const position = await page.evaluate(() => window.__museumDebug!.getCameraPosition());

  // The building's overall bounding box spans z: -10 to 20. A visitor
  // should never end up outside it — collision should have stopped them
  // at the wall (with a small tolerance for the camera's ellipsoid radius).
  expect(position.z, `camera ended up at z=${position.z}, outside the building`).toBeGreaterThan(-10.5);
});
