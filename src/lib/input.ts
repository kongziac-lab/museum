"use client";

/**
 * Shared mutable input state for touch / virtual-joystick controls.
 * The mobile HUD writes here; the first-person controller reads it every
 * frame. Kept as a plain module singleton to avoid per-frame React updates.
 */
export const touchInput = {
  /** Normalized move vector from the virtual joystick, -1..1. */
  moveX: 0,
  moveY: 0,
  /** Accumulated look delta from touch-drag on the camera side. */
  lookDX: 0,
  lookDY: 0,
  /** Whether a touch camera drag is active. */
  active: false,
};

export function consumeLookDelta() {
  const dx = touchInput.lookDX;
  const dy = touchInput.lookDY;
  touchInput.lookDX = 0;
  touchInput.lookDY = 0;
  return [dx, dy] as const;
}
