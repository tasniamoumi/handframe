// Pinch gestures. Thumb and index fingers are busy holding the frame, so the gestures use the thumb
// with the middle finger (next filter) and with the ring finger (take a photo).

export const WRIST = 0;
export const THUMB_TIP = 4;
export const MIDDLE_KNUCKLE = 9;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;

const GESTURES = [
  { name: "next", tip: MIDDLE_TIP },
  { name: "snap", tip: RING_TIP },
];

const dist = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/** Fingertip distance divided by hand size (wrist to middle knuckle), so it works near or far. */
export function pinchRatio(hand, tip, aspect = 1) {
  const size = dist(hand[WRIST], hand[MIDDLE_KNUCKLE], aspect);
  if (size < 1e-6) return Infinity;
  return dist(hand[THUMB_TIP], hand[tip], aspect) / size;
}

/**
 * Turns hand positions into one-off events. A pinch fires once when the fingers close, must open
 * again before it can fire again (hysteresis), and has a short cooldown against flicker.
 */
export class GestureTracker {
  constructor({ closeBelow = 0.3, openAbove = 0.5, cooldownMs = 700 } = {}) {
    this.closeBelow = closeBelow;
    this.openAbove = openAbove;
    this.cooldownMs = cooldownMs;
    this.closed = new Map();
    this.lastFired = new Map();
  }

  reset() {
    this.closed.clear();
  }

  /** hands: arrays of 21 points. Returns the names of gestures that fired now, e.g. ["next"]. */
  update(hands, nowMs, aspect = 1) {
    const events = [];
    for (const { name, tip } of GESTURES) {
      const best = hands.length ? Math.min(...hands.map((h) => pinchRatio(h, tip, aspect))) : Infinity;
      const wasClosed = this.closed.get(name) === true;
      if (!wasClosed && best < this.closeBelow) {
        this.closed.set(name, true);
        const last = this.lastFired.get(name) ?? -Infinity;
        if (nowMs - last >= this.cooldownMs) {
          this.lastFired.set(name, nowMs);
          events.push(name);
        }
      } else if (wasClosed && best > this.openAbove) {
        this.closed.set(name, false);
      }
    }
    return events;
  }
}
