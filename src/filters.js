// The filters, written as one WebGL fragment shader. Each filter is a function of a position in the
// camera image, so the same code serves both modes: "window" filters what is behind the frame,
// "portal" squeezes the whole camera image into the frame.

export const FILTERS = [
  { id: "sketch", label: "Sketch" },
  { id: "pixelate", label: "Pixelate" },
  { id: "edge", label: "Edge" },
  { id: "invert", label: "Invert" },
  { id: "duotone", label: "Dual-tone" },
  { id: "rainbow", label: "Rainbow wave" },
  { id: "glitch", label: "Glitch" },
  { id: "neon", label: "Neon outline" },
  { id: "thermal", label: "Thermal" },
];

export const MODES = [
  { id: "window", label: "Window" },
  { id: "portal", label: "Portal" },
];

export const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); // (0,0) is the top-left of the screen
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;     // size of one camera pixel in uv units
uniform vec2 u_q0, u_q1, u_q2, u_q3; // frame corners: TL, TR, BR, BL
uniform mat3 u_invH;      // screen position -> position inside the frame (0..1)
uniform bool u_active;
uniform int u_filter;
uniform int u_mode;       // 0 window, 1 portal
uniform float u_time;

// The camera image, mirrored so it behaves like a mirror.
vec3 cam(vec2 uv) { return texture2D(u_tex, vec2(1.0 - uv.x, uv.y)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

vec3 hsv(float h, float s, float v) {
  vec3 k = abs(fract(vec3(h) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(k - 1.0, 0.0, 1.0), s);
}

// Sobel edge strength at uv.
float edgeAt(vec2 uv) {
  vec2 t = u_texel * 1.5;
  float tl = luma(cam(uv + vec2(-t.x, -t.y))), tc = luma(cam(uv + vec2(0.0, -t.y))), tr = luma(cam(uv + vec2(t.x, -t.y)));
  float ml = luma(cam(uv + vec2(-t.x, 0.0))), mr = luma(cam(uv + vec2(t.x, 0.0)));
  float bl = luma(cam(uv + vec2(-t.x, t.y))), bc = luma(cam(uv + vec2(0.0, t.y))), br = luma(cam(uv + vec2(t.x, t.y)));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

vec3 thermalRamp(float t) {
  vec3 c = mix(vec3(0.02, 0.0, 0.2), vec3(0.3, 0.0, 0.75), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.9, 0.1, 0.45), smoothstep(0.25, 0.5, t));
  c = mix(c, vec3(1.0, 0.6, 0.05), smoothstep(0.5, 0.75, t));
  return mix(c, vec3(1.0, 1.0, 0.85), smoothstep(0.75, 1.0, t));
}

vec3 applyFilter(vec2 uv) {
  vec3 c = cam(uv);
  if (u_filter == 0) {            // sketch: dark pencil lines on paper
    float ink = smoothstep(0.12, 0.5, edgeAt(uv));
    float shade = 0.72 + 0.28 * smoothstep(0.15, 0.8, luma(c));
    return mix(vec3(0.96, 0.94, 0.88) * shade, vec3(0.12, 0.12, 0.16), ink);
  }
  if (u_filter == 1) {            // pixelate
    vec2 block = u_texel * 16.0;
    return cam((floor(uv / block) + 0.5) * block);
  }
  if (u_filter == 2) {            // edge: white lines on black
    return vec3(smoothstep(0.1, 0.55, edgeAt(uv)));
  }
  if (u_filter == 3) {            // invert
    return 1.0 - c;
  }
  if (u_filter == 4) {            // dual-tone poster
    return mix(vec3(0.93, 0.08, 0.72), vec3(1.0, 0.58, 0.0), step(0.42, luma(c)));
  }
  if (u_filter == 5) {            // rainbow wave
    float stripe = (uv.x + uv.y) * 9.0 + sin(uv.y * 12.0 + u_time * 2.0) * 0.35 - u_time * 0.6;
    return mix(hsv(fract(stripe), 0.85, 1.0), vec3(luma(c)), 0.28);
  }
  if (u_filter == 6) {            // glitch: torn rows and split colour channels
    float row = floor(uv.y * 36.0);
    float r = hash(row + floor(u_time * 9.0) * 7.0);
    float shift = r > 0.6 ? (r - 0.8) * 0.3 : 0.0;
    vec2 p = uv + vec2(shift, 0.0);
    float split = 0.012 + 0.014 * hash(floor(u_time * 6.0));
    vec3 g = vec3(cam(p + vec2(split, 0.0)).r, cam(p).g, cam(p - vec2(split, 0.0)).b);
    return g * (0.92 + 0.08 * sin(uv.y * 700.0));
  }
  if (u_filter == 7) {            // neon outline
    float e = smoothstep(0.08, 0.5, edgeAt(uv));
    vec3 glow = hsv(fract(0.52 + 0.18 * sin(u_time * 0.7 + uv.x * 3.0 + uv.y * 2.0)), 0.9, 1.0);
    return c * 0.12 + glow * e * 1.4;
  }
  return thermalRamp(smoothstep(0.05, 0.95, luma(c))); // thermal
}

float side(vec2 a, vec2 b, vec2 p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }

bool insideFrame(vec2 p) {
  float s0 = side(u_q0, u_q1, p), s1 = side(u_q1, u_q2, p), s2 = side(u_q2, u_q3, p), s3 = side(u_q3, u_q0, p);
  return (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
}

void main() {
  vec3 color = cam(v_uv);
  if (u_active && insideFrame(v_uv)) {
    vec2 uv = v_uv;
    if (u_mode == 1) {
      vec3 st = u_invH * vec3(v_uv, 1.0);
      uv = clamp(st.xy / st.z, 0.0, 1.0);
    }
    color = applyFilter(uv);
  } else if (u_active) {
    color *= 0.82; // dim the outside a little so the frame stands out
  }
  gl_FragColor = vec4(color, 1.0);
}`;
