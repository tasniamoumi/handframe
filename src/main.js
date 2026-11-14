import { createDemoSource } from "./demo.js";
import { FILTERS, MODES } from "./filters.js";
import { QuadSmoother, cornersFromHands, isValidQuad } from "./frame.js";
import { GestureTracker } from "./gestures.js";
import { drawOverlay } from "./overlay.js";
import { createRenderer } from "./renderer.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const overlay = $("overlay");
const video = $("video");

const MODE_NOTES = {
  window: "The frame filters what is behind it, like a lens.",
  portal: "The whole camera view is squeezed into the frame.",
};
const HOLD_MS = 250; // keep the last frame this long if a hand drops out for a moment
const MAX_SHOTS = 8;

const state = {
  source: null, // { kind, image, width, height, hands(nowMs), stop() }
  filter: 0,
  mode: 0,
  showHands: true,
  snapRequested: false,
  quad: null,
  lastQuadAt: -Infinity,
  fps: 0,
  lastFrameAt: 0,
  running: false,
};
const smoother = new QuadSmoother();
const gestures = new GestureTracker();
let renderer = null;

/* ---------- controls ---------- */

function buildChips(container, items, getIndex, setIndex) {
  items.forEach((item, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.setAttribute("role", "radio");
    chip.textContent = item.label;
    chip.addEventListener("click", () => setIndex(i));
    container.append(chip);
  });
  return () => {
    [...container.children].forEach((chip, i) => {
      const on = i === getIndex();
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
  };
}

const paintFilters = buildChips($("filters"), FILTERS, () => state.filter, setFilter);
const paintModes = buildChips($("modes"), MODES, () => state.mode, setMode);

function setFilter(index) {
  state.filter = (index + FILTERS.length) % FILTERS.length;
  paintFilters();
}
function setMode(index) {
  state.mode = (index + MODES.length) % MODES.length;
  paintModes();
  $("mode-note").textContent = MODE_NOTES[MODES[state.mode].id];
}
function setShowHands(on) {
  state.showHands = on;
  $("show-hands").checked = on;
}

// Arrow keys move within a chip group, as in a native radio group.
for (const [id, get, set, count] of [
  ["filters", () => state.filter, setFilter, FILTERS.length],
  ["modes", () => state.mode, setMode, MODES.length],
]) {
  $(id).addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    set(get() + step);
    $(id).children[(get() + count) % count].focus();
  });
}

$("show-hands").addEventListener("change", (e) => setShowHands(e.target.checked));
$("snap").addEventListener("click", () => (state.snapRequested = true));
$("stop").addEventListener("click", stop);
$("start-camera").addEventListener("click", startCamera);
$("start-demo").addEventListener("click", startDemo);

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = e.target instanceof HTMLInputElement && e.target.type !== "checkbox";
  if (typing) return;
  const key = e.key.toLowerCase();
  if (key === "arrowright" || (key === " " && !(e.target instanceof HTMLButtonElement))) {
    e.preventDefault();
    setFilter(state.filter + 1);
  } else if (key === "arrowleft") {
    e.preventDefault();
    setFilter(state.filter - 1);
  } else if (key === "m") setMode(state.mode + 1);
  else if (key === "s" && state.running) state.snapRequested = true;
  else if (key === "h") setShowHands(!state.showHands);
  else if (/^[1-9]$/.test(key) && Number(key) <= FILTERS.length) setFilter(Number(key) - 1);
});

/* ---------- starting and stopping ---------- */

function showError(message) {
  const el = $("error");
  el.textContent = message;
  el.hidden = !message;
}

function setBusy(busy, label) {
  $("start-camera").disabled = busy;
  $("start-demo").disabled = busy;
  $("start-camera").textContent = busy ? label : "Use my camera";
}

function cameraErrorMessage(err) {
  if (err?.name === "NotAllowedError") return "Camera access was blocked. Allow the camera for this page in your browser, then try again.";
  if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") return "No camera was found. You can still watch the demo.";
  if (err?.name === "NotReadableError") return "The camera is in use by another app. Close it there, then try again.";
  return "The camera could not be started. You can still watch the demo.";
}

async function startCamera() {
  showError("");
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("This browser cannot open the camera here. Use a recent browser over https, or watch the demo.");
    return;
  }
  let stream;
  try {
    setBusy(true, "Waiting for camera…");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    setBusy(true, "Loading hand tracking…");
    const { createTracker } = await import("./tracking.js");
    const tracker = await createTracker();
    begin({
      kind: "camera",
      image: video,
      get width() {
        return video.videoWidth;
      },
      get height() {
        return video.videoHeight;
      },
      hands: (nowMs) => tracker.detect(video, nowMs),
      stop() {
        for (const track of stream.getTracks()) track.stop();
        video.srcObject = null;
        tracker.close();
      },
    });
  } catch (err) {
    console.error(err);
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
      showError("Hand tracking could not be loaded. Check your connection and try again, or watch the demo.");
    } else {
      showError(cameraErrorMessage(err));
    }
  } finally {
    setBusy(false);
  }
}

function startDemo() {
  showError("");
  begin(createDemoSource());
}

function begin(source) {
  try {
    renderer ??= createRenderer(view);
  } catch (err) {
    console.error(err);
    source.stop();
    showError("This browser cannot draw the filters (WebGL is unavailable).");
    return;
  }
  state.source = source;
  state.running = true;
  state.quad = null;
  smoother.reset();
  gestures.reset();
  $("stage").style.aspectRatio = `${source.width} / ${source.height}`;
  $("start").hidden = true;
  $("hint").hidden = false;
  $("readout").hidden = false;
  $("stop").hidden = false;
  $("snap").disabled = false;
  requestAnimationFrame(frame);
}

function stop() {
  state.running = false;
  state.source?.stop();
  state.source = null;
  $("start").hidden = false;
  $("hint").hidden = true;
  $("readout").hidden = true;
  $("stop").hidden = true;
  $("snap").disabled = true;
  overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
}

/* ---------- the frame loop ---------- */

function hintFor(handCount, hasQuad, kind) {
  if (kind === "demo") return "Demo with simulated hands";
  if (hasQuad) return "Middle finger to thumb: next filter. Ring finger to thumb: photo.";
  if (handCount === 0) return "Hold up both hands to make a frame.";
  if (handCount === 1) return "Now show your other hand.";
  return "Move your hands apart a little.";
}

function frame(nowMs) {
  if (!state.running) return;
  const source = state.source;
  const { width, height } = source;
  if (!width || !height) {
    requestAnimationFrame(frame);
    return;
  }

  const hands = source.hands(nowMs);
  for (const event of gestures.update(hands, nowMs, width / height)) {
    if (event === "next") setFilter(state.filter + 1);
    if (event === "snap") state.snapRequested = true;
  }

  const corners = cornersFromHands(hands);
  if (corners && isValidQuad(corners)) {
    state.quad = smoother.update(corners, nowMs);
    state.lastQuadAt = nowMs;
  } else if (nowMs - state.lastQuadAt > HOLD_MS) {
    state.quad = null;
    smoother.reset();
  }

  renderer.draw({ image: source.image, width, height, quad: state.quad, filter: state.filter, mode: state.mode, time: nowMs / 1000 });
  if (state.snapRequested) {
    state.snapRequested = false;
    takePhoto(width, height); // must run right after draw, before the browser clears the WebGL buffer
  }
  drawOverlay(overlay, { width, height, hands, quad: state.quad, showHands: state.showHands });

  if (state.lastFrameAt) {
    const instant = 1000 / Math.max(nowMs - state.lastFrameAt, 1);
    state.fps += (instant - state.fps) * 0.08;
  }
  state.lastFrameAt = nowMs;
  $("readout").textContent = `${Math.round(state.fps)} fps · ${hands.length} hand${hands.length === 1 ? "" : "s"} · ${FILTERS[state.filter].label}`;
  const hint = hintFor(hands.length, Boolean(state.quad), source.kind);
  if ($("hint").textContent !== hint) $("hint").textContent = hint;

  requestAnimationFrame(frame);
}

/* ---------- photos ---------- */

function takePhoto(width, height) {
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  copy.getContext("2d").drawImage(view, 0, 0);

  const flash = $("flash");
  flash.classList.remove("on");
  void flash.offsetWidth; // restart the animation
  flash.classList.add("on");

  copy.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const name = `handframe-${FILTERS[state.filter].id}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.title = `Download ${name}`;
    const img = document.createElement("img");
    img.src = url;
    img.alt = `Photo with the ${FILTERS[state.filter].label} filter`;
    link.append(img);
    const shots = $("shots");
    shots.prepend(link);
    while (shots.children.length > MAX_SHOTS) {
      URL.revokeObjectURL(shots.lastChild.href);
      shots.lastChild.remove();
    }
    $("shots-group").hidden = false;
  }, "image/png");
}

/* ---------- initial paint ---------- */

setFilter(0);
setMode(0);
window.__handframe = state; // handy for debugging in the console
