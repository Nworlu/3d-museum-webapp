import { useRef, useState, type Touch, type TouchEvent } from "react";

const RADIUS = 52;

interface TouchJoystickProps {
  /** x: strafe (-1 left .. 1 right), z: forward/back (-1 back .. 1 forward), both camera-relative. */
  onMove: (x: number, z: number) => void;
}

/**
 * Virtual joystick for walking on touch devices — Babylon's own camera
 * input already handles touch-drag-to-look on the canvas (see
 * bootMuseum.ts), so this only needs to cover movement. Deliberately its
 * own DOM element off to one side rather than living on the canvas: a
 * touch starting here never reaches Babylon's pointer handling, so a
 * two-thumb hold (left thumb walks, right thumb looks) works without any
 * touch-target math to keep them from fighting each other.
 */
export function TouchJoystick({ onMove }: TouchJoystickProps) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);

  function updateFromTouch(touch: Touch) {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    // Screen-up (negative dy) is forward (positive local z); see
    // bootMuseum.ts's setMoveVector doc for the camera-relative axes.
    onMove(dx / RADIUS, -dy / RADIUS);
  }

  function handleStart(e: TouchEvent) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    activeTouchId.current = touch.identifier;
    updateFromTouch(touch);
  }

  function handleMove(e: TouchEvent) {
    e.preventDefault();
    const touch = Array.from(e.touches).find((t) => t.identifier === activeTouchId.current);
    if (touch) updateFromTouch(touch);
  }

  function handleEnd(e: TouchEvent) {
    e.preventDefault();
    const stillDown = Array.from(e.touches).some((t) => t.identifier === activeTouchId.current);
    if (stillDown) return;
    activeTouchId.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }

  return (
    <div
      ref={baseRef}
      id="touchJoystick"
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
    >
      <div
        id="touchJoystickKnob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
