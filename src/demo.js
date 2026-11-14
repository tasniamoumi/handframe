// Demo mode: a moving scene and a pair of simulated hands, for trying the filters without a camera.
// The hands are 21-point skeletons in the same format the tracker produces, so the demo exercises
// the same frame, smoothing and gesture code as the real thing.

const W = 960;
const H = 540;

// Finger directions in degrees from "up", for a right hand seen in the mirror; and where each
// finger starts on the palm (x across the knuckles, y up from the wrist), in hand-size units.
const FINGERS = [
  { first: 1, angle: -62, base: [-0.55, 0.35], length: 1.0 },  // thumb
  { first: 5, angle: -12, base: [-0.38, 1.0], length: 1.15 },  // index
  { first: 9, angle: 2, base: [-0.08, 1.05], length: 1.25 },   // middle
  { first: 13, angle: 14, base: [0.2, 1.0], length: 1.15 },    // ring
  { first: 17, angle: 28, base: [0.44, 0.88], length: 0.9 },   // little
];

/** Build a hand skeleton. side: +1 thumb points left (right-hand side of screen), -1 mirrored. */
export function makeHand({ x, y, size, side, tilt = 0, pinch = null }) {
  const points = new Array(21);
  const rot = (px, py) => {
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    return { x: x + (px * c - py * s) * size * side * (H / W), y: y - (px * s + py * c) * size };
  };
  points[0] = rot(0, 0);
  for (const f of FINGERS) {
    const a = (f.angle * Math.PI) / 180;
    for (let j = 0; j < 4; j++) {
      const d = (f.length * j) / 3;
      points[f.first + j] = rot(f.base[0] + Math.sin(a) * d, f.base[1] + Math.cos(a) * d);
    }
  }
  if (pinch !== null) points[pinch] = { ...points[4] }; // fingertip touches the thumb tip
  return points;
}

export function createDemoSource() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  function drawScene(t) {
    const sky = ctx.createLinearGradient(0, 0, W, H);
    sky.addColorStop(0, "#1b2a4a");
    sky.addColorStop(0.55, "#b5506b");
    sky.addColorStop(1, "#f2b45c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ffe9b0";
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.36 + Math.sin(t * 0.4) * 14, 62, 0, Math.PI * 2);
    ctx.fill();

    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ["#3a2f52", "#2a2340", "#17152b"][layer];
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let px = 0; px <= W; px += 12) {
        const ridge = Math.sin(px * 0.008 * (layer + 1) + t * 0.15 * (layer + 1) + layer * 2) * 34;
        ctx.lineTo(px, H * (0.56 + layer * 0.13) + ridge);
      }
      ctx.lineTo(W, H);
      ctx.fill();
    }

    for (let i = 0; i < 7; i++) {
      const bx = ((i * 173 + t * (28 + i * 9)) % (W + 160)) - 80;
      const by = H * 0.2 + ((i * 97) % 180) + Math.sin(t * 1.3 + i) * 10;
      ctx.fillStyle = `hsl(${(i * 47 + 20) % 360} 80% 66%)`;
      ctx.beginPath();
      ctx.arc(bx, by, 16 + (i % 3) * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // The scene is drawn mirrored on screen, so flip the text here to read correctly there.
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "700 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("handframe", W / 2, H * 0.52);
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.fillText("demo scene: no camera in use", W / 2, H * 0.52 + 34);
    ctx.restore();
  }

  return {
    kind: "demo",
    image: canvas,
    width: W,
    height: H,
    /** Simulated hands that drift, tilt and pinch every few seconds to change the filter. */
    hands(nowMs) {
      const t = nowMs / 1000;
      drawScene(t);
      const pinching = t % 4.5 > 4.1 ? 12 : null; // middle-finger pinch
      const left = makeHand({
        x: 0.24 + Math.sin(t * 0.7) * 0.05,
        y: 0.74 + Math.cos(t * 0.9) * 0.07,
        size: 0.15 + Math.sin(t * 0.5) * 0.02,
        side: -1,
        tilt: Math.sin(t * 0.6) * 0.18,
      });
      const right = makeHand({
        x: 0.76 + Math.cos(t * 0.6) * 0.05,
        y: 0.72 + Math.sin(t * 0.8) * 0.08,
        size: 0.15 - Math.sin(t * 0.5) * 0.03,
        side: 1,
        tilt: Math.cos(t * 0.5) * 0.18,
        pinch: pinching,
      });
      return [left, right];
    },
    stop() {},
  };
}
