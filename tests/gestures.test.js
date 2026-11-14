import { describe, expect, it } from "vitest";
import { GestureTracker, pinchRatio } from "../src/gestures.js";

// A flat hand: wrist at the bottom, middle knuckle 0.2 above it, tips apart.
const makeHand = ({ middle = 1, ring = 1 } = {}) => {
  const h = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  h[0] = { x: 0.5, y: 0.8 };
  h[9] = { x: 0.5, y: 0.6 }; // hand size 0.2
  h[4] = { x: 0.4, y: 0.5 };
  h[12] = { x: 0.4 + middle * 0.2, y: 0.5 };
  h[16] = { x: 0.4 + ring * 0.2, y: 0.5 };
  return h;
};

describe("pinchRatio", () => {
  it("is fingertip distance over hand size", () => {
    expect(pinchRatio(makeHand({ middle: 0.5 }), 12)).toBeCloseTo(0.5);
    expect(pinchRatio(makeHand({ middle: 0 }), 12)).toBeCloseTo(0);
  });

  it("is infinite for a degenerate hand", () => {
    const h = makeHand();
    h[9] = { ...h[0] };
    expect(pinchRatio(h, 12)).toBe(Infinity);
  });
});

describe("GestureTracker", () => {
  it("fires once when the middle finger pinches, not on every frame", () => {
    const g = new GestureTracker();
    expect(g.update([makeHand({ middle: 1 })], 0)).toEqual([]);
    expect(g.update([makeHand({ middle: 0.1 })], 100)).toEqual(["next"]);
    expect(g.update([makeHand({ middle: 0.1 })], 200)).toEqual([]);
    expect(g.update([makeHand({ middle: 0.1 })], 300)).toEqual([]);
  });

  it("must open again before it fires again", () => {
    const g = new GestureTracker({ cooldownMs: 0 });
    g.update([makeHand({ middle: 0.1 })], 0);
    expect(g.update([makeHand({ middle: 0.4 })], 100)).toEqual([]); // between thresholds: still closed
    expect(g.update([makeHand({ middle: 0.1 })], 200)).toEqual([]);
    g.update([makeHand({ middle: 1 })], 300);
    expect(g.update([makeHand({ middle: 0.1 })], 400)).toEqual(["next"]);
  });

  it("ignores a quick second pinch inside the cooldown", () => {
    const g = new GestureTracker({ cooldownMs: 700 });
    expect(g.update([makeHand({ middle: 0.1 })], 0)).toEqual(["next"]);
    g.update([makeHand({ middle: 1 })], 100);
    expect(g.update([makeHand({ middle: 0.1 })], 200)).toEqual([]);
    g.update([makeHand({ middle: 1 })], 300);
    expect(g.update([makeHand({ middle: 0.1 })], 900)).toEqual(["next"]);
  });

  it("uses the ring finger for the photo gesture", () => {
    const g = new GestureTracker();
    expect(g.update([makeHand({ ring: 0.1 })], 0)).toEqual(["snap"]);
  });

  it("works with either hand and with no hands", () => {
    const g = new GestureTracker();
    expect(g.update([makeHand({ middle: 1 }), makeHand({ middle: 0.1 })], 0)).toEqual(["next"]);
    expect(g.update([], 100)).toEqual([]);
  });
});
