import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __frameGaps?: number[];
    __frameGapsRafId?: number;
  }
}

/**
 * Outside-voice finding (DESIGN.md Testing strategy): the feasibility
 * research names main-thread hitching during asset load as a real risk
 * with documented mitigations (background loading, freezeActiveMeshes,
 * progressive load) — this turns "verify no frame hitch" from a manual
 * eyeball into something CI catches on regression.
 *
 * What this checks: walking from the lobby into gallery-1 triggers
 * RoomManager to load gallery-2 for the first time (a live network
 * fetch + glTF import), exercising the exact codepath the mitigations
 * target. The assertion is deliberately loose (a real stall, not a
 * tight fps budget) — CI runners and this project's placeholder content
 * (public sample glTF models over the network) have enough natural
 * latency variance that a tight budget would be flaky. What this test
 * actually catches is a synchronous block: if RoomManager/ExhibitLoader
 * ever became blocking, frame gaps would spike far past this budget,
 * not just drift a little.
 */
test("room transition during WASD movement does not block the render loop", async ({ page }) => {
  await page.goto("/");
  // Let boot settle (manifest + lobby/gallery-1 initial load) before measuring.
  await page.waitForTimeout(3000);

  const canvas = page.locator("#renderCanvas");
  await canvas.click({ position: { x: 512, y: 384 } }); // focuses the page for keyboard input

  await page.evaluate(() => {
    window.__frameGaps = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      window.__frameGaps!.push(now - last);
      last = now;
      window.__frameGapsRafId = requestAnimationFrame(tick);
    };
    window.__frameGapsRafId = requestAnimationFrame(tick);
  });

  // Walk from spawn (lobby, z=-4) through the gallery-1 boundary (z=0),
  // which triggers RoomManager to load gallery-2 for the first time.
  await page.keyboard.down("w");
  await page.waitForTimeout(5000);
  await page.keyboard.up("w");

  const gaps = await page.evaluate(() => {
    cancelAnimationFrame(window.__frameGapsRafId!);
    return window.__frameGaps!;
  });

  expect(gaps.length, "render loop should have produced frames").toBeGreaterThan(10);
  const worstGap = Math.max(...gaps);
  // 800ms is generous — a genuine main-thread block, not network jitter.
  expect(worstGap, `worst frame gap was ${worstGap.toFixed(0)}ms`).toBeLessThan(800);
});
