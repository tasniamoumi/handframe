// Draws the camera image with the filter applied inside the hand frame, using WebGL.
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./filters.js";
import { invert3, squareToQuad, toColumnMajor } from "./frame.js";

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader program failed to link: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const u = {};
  for (const name of ["u_texel", "u_q0", "u_q1", "u_q2", "u_q3", "u_invH", "u_active", "u_filter", "u_mode", "u_time"]) {
    u[name] = gl.getUniformLocation(program, name);
  }
  const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  return {
    /**
     * image: a <video> or <canvas>; quad: four corners in display space or null;
     * filter and mode: indexes into FILTERS and MODES; time: seconds.
     */
    draw({ image, width, height, quad, filter, mode, time }) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);

      const inverse = quad ? invert3(squareToQuad(quad)) : null;
      const active = Boolean(quad && inverse);
      gl.uniform2f(u.u_texel, 1 / width, 1 / height);
      gl.uniform1i(u.u_active, active ? 1 : 0);
      gl.uniform1i(u.u_filter, filter);
      gl.uniform1i(u.u_mode, mode);
      gl.uniform1f(u.u_time, time);
      if (active) {
        quad.forEach((p, i) => gl.uniform2f(u[`u_q${i}`], p.x, p.y));
        gl.uniformMatrix3fv(u.u_invH, false, toColumnMajor(inverse));
      } else {
        gl.uniformMatrix3fv(u.u_invH, false, identity);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
