// @ts-nocheck -- vendored upstream JavaScript; see adjacent LICENSE and root NOTICE.

/* =========================================================================
 * Thinking-orb engine — original reimplementation.
 * Pure 2D canvas, math-only frame functions. Shape-pluggable: the renderer
 * is shape-agnostic and consumes a cloud of 3D points {x,y,z,u,v} (u/v are
 * normalized surface parameters used by geometry-aware animations).
 * ========================================================================= */

function fib(n) {
  const pts = [];
  if (n <= 0) return pts;
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = phi * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
}

// rotate a 3D point: first around Y (spin), then around X (camera tilt)
function rotate(p, ax, ay) {
  const [x, y, z] = p;
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  return [x1, y1, z2];
}

// Default depth-contrast exponent multiplier. Higher = steeper front/back
// falloff (bolder 3D separation). Exposed as a global "Contrast" slider.
const DEFAULT_CONTRAST = 0.6;
const BASE_TILT = -0.45; // shared camera tilt so every orb faces the same way
const BASE_SPIN = 0.2; // shared rotation speed so every orb spins at the same rate
const BASE_ALPHA = 0.85; // shared base brightness so every orb reads as the same family
const DEFAULT_DEPTH = 0.34; // extrusion thickness for logo/svg cutouts

// Live per-render view overrides, assigned by renderOrb before building a
// frame. Module-level but safe: renderOrb is fully synchronous — it sets
// these, builds the frame, and draws before any other orb's rAF can interleave.
let CUR_TILT = BASE_TILT;
let CUR_PHASE = 0;
let CUR_DOTSCALE = 1;

// depth shading: front dots brighter & larger, back dots dim & small.
// `contrast` steepens the falloff so light-mode spheres read with more punch.
function shade(z, baseR, contrast) {
  const f = (z + 1) / 2; // 0 = back, 1 = front
  const ff = Math.pow(f, 2 * (contrast == null ? 1 : contrast)); // steeper with contrast
  return { a: 0.06 + 0.94 * ff, r: baseR * (0.28 + 0.72 * ff) };
}

function countFor(size) {
  return Math.round(Math.min(420, Math.max(14, size * 1.6)));
}
function dotRFor(size, shape) {
  // Proportional to size so large orbs keep the same relative dot size; the
  // old 2.4px cap is dropped so 512px orbs don't render with invisible dots.
  var r = Math.max(0.8, size / 42);
  if (shape === "logo" || shape === "svg") r *= 0.5; // flat cutouts read cleaner with finer dots
  return r;
}

const clamp = (v) => Math.max(-1, Math.min(1, v));

// ---- shape generators -----------------------------------------------------

// Sphere: Fibonacci distribution. u = normalized longitude, v = normalized
// latitude, so geometry animations reproduce the original look exactly.
function spherePoints(count) {
  return fib(count).map(([x, y, z]) => ({
    x,
    y,
    z,
    u: (Math.atan2(z, x) + Math.PI) / (2 * Math.PI),
    v: (Math.asin(clamp(y)) + Math.PI / 2) / Math.PI,
  }));
}

// Logo / text: render a string to an offscreen canvas, then build an
// **extruded 3D** point cloud — front face + back face + edge rim +
// interior volume — so the text reads as solid 3D letterforms with real
// thickness when it rotates, NOT as a flat decal pasted on a sphere.
// Shared by text glyphs and uploaded SVG: turn a list of covered pixels into
// an extruded 3D point cloud — front face + back face + edge rim + interior
// volume — using blue-noise (best-candidate) sampling for even coverage.
function buildExtrudedPoints(covIn, W, H, count, depth, layers) {
  var out = [];
  if (covIn.length === 0) {
    for (var i = 0; i < count; i++) {
      var a = (i / count) * 2 * Math.PI;
      var r = Math.sqrt((i + 0.5) / count);
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      out.push({ x: x, y: y, z: 0, u: (x + 1) / 2, v: (y + 1) / 2 });
    }
    return out;
  }

  // Coverage mask (O(1) lookup) + glyph bounding box.
  var mask = new Uint8Array(W * H);
  var minX = W, minY = H, maxX = 0, maxY = 0;
  for (var ci = 0; ci < covIn.length; ci++) {
    var cp = covIn[ci];
    mask[cp[1] * W + cp[0]] = 1;
    if (cp[0] < minX) minX = cp[0];
    if (cp[0] > maxX) maxX = cp[0];
    if (cp[1] < minY) minY = cp[1];
    if (cp[1] > maxY) maxY = cp[1];
  }
  function covered(px, py) {
    return px >= 0 && px < W && py >= 0 && py < H && mask[py * W + px] === 1;
  }

  var s = Math.min(W, H);
  function toPoint(px, py, z) {
    var nx = (px - W / 2) / (s / 2);
    var ny = (py - H / 2) / (s / 2);
    return { x: nx, y: -ny, z: z, u: (nx + 1) / 2, v: (-ny + 1) / 2 };
  }

  // ---- regular matrix sampling with N parallel z-slices -----------------
  // Lay a uniform grid over the glyph bbox; every covered cell becomes a
  // vertical column of dots spanning the extrusion depth. With `layers`
  // evenly spaced z-levels (from -depth to +depth) the column reads as a
  // solid stratified 3D body whose strata separate on screen as it rotates.
  // Replaces the old 3-layer scheme (front / back / edge-mid).
  var bw = maxX - minX + 1, bh = maxY - minY + 1;
  var fBox = covIn.length / (bw * bh); // covered fraction inside the bbox
  var cellsPerAxis = Math.max(
    6,
    Math.min(120, Math.round(Math.sqrt(count / Math.max(0.02, fBox)))),
  );
  var step = Math.max(bw, bh) / cellsPerAxis;
  var L = Math.max(2, Math.floor(layers));
  for (var gi = 0; gi <= cellsPerAxis; gi++) {
    var px = minX + (gi + 0.5) * step;
    if (px > maxX) break;
    for (var gj = 0; gj <= cellsPerAxis; gj++) {
      var py = minY + (gj + 0.5) * step;
      if (py > maxY) break;
      var ix = Math.round(px), iy = Math.round(py);
      if (!covered(ix, iy)) continue;
      for (var k = 0; k < L; k++) {
        var z = L === 1 ? 0 : -depth + (2 * depth * k) / (L - 1);
        out.push(toPoint(ix, iy, z));
      }
    }
  }
  return out;
}

// Uploaded SVG: rasterize to a canvas (browser fills the vector paths), then
// feed the covered pixels into the same extruded-point pipeline as text.
const _svgCache = new Map();
function setSvgPoints(key, points) {
  _svgCache.set(key, points);
}
function getSvgPoints(key) {
  return _svgCache.get(key);
}

function loadSvgPoints(file, key, count, layers, depth) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var W = 256, H = 256;
        var cv = document.createElement("canvas");
        cv.width = W;
        cv.height = H;
        var c = cv.getContext("2d");
        c.clearRect(0, 0, W, H);
        var iw = img.width || W, ih = img.height || H;
        var scale = Math.min(W / iw, H / ih) * 0.92;
        var dw = iw * scale, dh = ih * scale;
        c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        var data = c.getImageData(0, 0, W, H).data;
        var cov = [];
        for (var py = 0; py < H; py++) {
          for (var px = 0; px < W; px++) {
            if (data[(py * W + px) * 4 + 3] > 128) cov.push([px, py]);
          }
        }
        setSvgPoints(
          key,
          buildExtrudedPoints(
            cov,
            W,
            H,
            count,
            depth == null ? DEFAULT_DEPTH : depth,
            layers,
          ),
        );
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("SVG failed to load"));
    };
    img.src = url;
  });
}

const _logoCache = new Map();
function logoPoints(count, text, layers, depth) {
  const key = text + "|" + count + "|" + layers + "|" +
    (depth == null ? DEFAULT_DEPTH : depth);
  if (_logoCache.has(key)) return _logoCache.get(key);
  const pts = sampleTextPoints(text || "AI", count, layers, depth);
  _logoCache.set(key, pts);
  return pts;
}

function sampleTextPoints(text, count, layers, depth) {
  var W = 256, H = 256;
  var cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  var c = cv.getContext("2d");
  c.clearRect(0, 0, W, H);
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  var fam = 'bold {S}px "Arial", "Helvetica", "PingFang SC", sans-serif';
  var fs = 220;
  c.font = fam.replace("{S}", String(fs));
  while (fs > 12 && c.measureText(text).width > W * 0.84) {
    fs -= 4;
    c.font = fam.replace("{S}", String(fs));
  }
  fs = Math.min(fs, Math.floor(H * 0.82));
  c.font = fam.replace("{S}", String(fs));
  c.fillText(text, W / 2, H / 2 + fs * 0.02);
  var data = c.getImageData(0, 0, W, H).data;
  var cov = [];
  for (var py = 0; py < H; py++) {
    for (var px = 0; px < W; px++) {
      if (data[(py * W + px) * 4 + 3] > 128) cov.push([px, py]);
    }
  }
  return buildExtrudedPoints(
    cov,
    W,
    H,
    count,
    depth == null ? DEFAULT_DEPTH : depth,
    layers,
  );
}

// ---- generic shape renderer ----------------------------------------------
// Replaces the old addSphere. Takes a precomputed point cloud so ANY shape can
// be fed in. Signature animations receive (point, index, [u,v]).
function addShape(frame, size, t, opts) {
  const R = size * 0.42, cx = size / 2, cy = size / 2;
  const tilt = opts.tilt != null ? opts.tilt : CUR_TILT;
  const phase = opts.phase != null ? opts.phase : CUR_PHASE;
  const scramble = opts.scramble != null ? opts.scramble : 0;
  const alpha = opts.alpha != null ? opts.alpha : 1;
  const scale = opts.scale != null ? opts.scale : 1;
  const contrast = opts.contrast != null ? opts.contrast : 1;
  const displace = opts.displace;
  const modulate = opts.modulate;
  const twist = opts.twist != null ? opts.twist : 0;
  const swirl = twist * (1 + 0.3 * Math.sin(t * 0.8));
  const pts = opts.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let qx = p.x, qz = p.z;
    if (twist !== 0) {
      const ang = swirl * p.y;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = qx * ca + qz * sa;
      const nz = -qx * sa + qz * ca;
      qx = nx;
      qz = nz;
    }
    const rp = rotate([qx, p.y, qz], tilt, t * opts.spin + phase);
    const disp = displace ? displace(p) : 1;
    const rr = R * scale * disp;
    let sx = cx + rp[0] * rr;
    let sy = cy - rp[1] * rr;
    if (scramble > 0) {
      sx += Math.sin(i * 12.9898 + t * 1.5) * scramble;
      sy += Math.cos(i * 78.233 + t * 1.7) * scramble;
    }
    const s = shade(
      rp[2],
      opts.dotR * (opts.dotScale != null ? opts.dotScale : CUR_DOTSCALE),
      contrast,
    );
    let a = s.a * alpha;
    let r = s.r;
    if (modulate) {
      const f = modulate(p, i, [p.u, p.v]);
      a *= 0.3 + 0.7 * f;
      r *= 0.55 + 0.7 * f;
    }
    frame.dots.push({ x: sx, y: sy, r, a });
  }
}

// ---- sphere geometry-aware modulation (unchanged visuals) -----------------
function mSweep(p, t) {
  const lon0 = Math.atan2(p.z, p.x);
  let d = t * 1.2 - (lon0 + BASE_SPIN * t);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const w = 0.42;
  return Math.exp(-(d * d) / (2 * w * w));
}
function mListening(p, t) {
  const lat = Math.asin(clamp(p.y));
  const lon = Math.atan2(p.z, p.x);
  return 0.5 + 0.5 * Math.sin(lat * 5 - t * 3.2 + lon * 2.5);
}
function mPulse(p, t) {
  const z = clamp(p.z);
  const polar = Math.acos(z); // 0 at +z pole, PI at -z pole
  const u = (t * 0.5) % 2;
  const wf = u < 1 ? u * Math.PI : (2 - u) * Math.PI;
  const width = 0.45;
  const d = Math.abs(polar - wf);
  return Math.exp(-(d * d) / (2 * width * width));
}
function mTide(p, t) {
  const lat = Math.asin(clamp(p.y));
  const band = Math.sin(t * 0.9) * (Math.PI / 2 - 0.2);
  const d = lat - band;
  const near = Math.exp(-(d * d) / (2 * 0.5 * 0.5));
  return 0.25 + 0.95 * near;
}
function mAurora(p, t) {
  const lon = Math.atan2(p.z, p.x);
  let d = lon - t * 1.0;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const near = Math.exp(-(d * d) / (2 * 1.0 * 1.0));
  let d2 = lon - t * 1.0 - Math.PI;
  d2 = Math.atan2(Math.sin(d2), Math.cos(d2));
  const near2 = Math.exp(-(d2 * d2) / (2 * 1.0 * 1.0));
  return Math.max(near, near2);
}
function mSpiral(p, t) {
  const lon = Math.atan2(p.z, p.x);
  const lat = Math.asin(clamp(p.y));
  let s = lon - 2.4 * lat - t * 0.8;
  s = Math.atan2(Math.sin(s), Math.cos(s));
  const arm = Math.min(Math.abs(s), Math.abs(s - Math.PI));
  return Math.exp(-(arm * arm) / (2 * 0.3 * 0.3));
}

// ---- logo (2D) geometry-aware modulation ---------------------------------
// uv are normalized [0,1] glyph coordinates (u = horizontal, v = vertical up).
function logoEffect(state, u, v, t) {
  const cx = 0.5, cy = 0.5;
  const ang = Math.atan2(v - cy, u - cx);
  const rad = Math.hypot(u - cx, v - cy);
  switch (state) {
    case "sweep": {
      let d = u - (t * 1.2) % 1;
      d = d - Math.round(d);
      const w = 0.16;
      return Math.exp(-(d * d) / (2 * w * w));
    }
    case "listening":
      return 0.5 + 0.5 * Math.sin((u - 0.5) * 6 - t * 3.2 + (v - 0.5) * 4);
    case "pulse": {
      const uu = (t * 0.5) % 2;
      const wf = uu < 1 ? uu * 0.7 : (2 - uu) * 0.7;
      const width = 0.18;
      const d = Math.abs(rad - wf);
      return Math.exp(-(d * d) / (2 * width * width));
    }
    case "tide": {
      const s = (u + v) / 2;
      const band = 0.5 + 0.5 * Math.sin(t * 0.9);
      const d = s - band;
      return 0.25 + 0.95 * Math.exp(-(d * d) / (2 * 0.18 * 0.18));
    }
    case "aurora": {
      const width = 0.6;
      let d = ang - t * 1.0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const n1 = Math.exp(-(d * d) / (2 * width * width));
      let d2 = ang - t * 1.0 - (Math.PI * 2) / 3;
      d2 = Math.atan2(Math.sin(d2), Math.cos(d2));
      const n2 = Math.exp(-(d2 * d2) / (2 * width * width));
      return Math.max(n1, n2);
    }
    case "spiral": {
      let s = ang - 6 * rad - t * 0.8;
      s = Math.atan2(Math.sin(s), Math.cos(s));
      const arm = Math.min(Math.abs(s), Math.abs(s - Math.PI));
      return Math.exp(-(arm * arm) / (2 * 0.3 * 0.3));
    }
    default:
      return 1; // non-geometric states: no extra modulation
  }
}

// helper to pick the right modulation per shape
function modFor(state, shape, t) {
  if (shape === "logo" || shape === "svg") {
    return (_p, _i, uv) => logoEffect(state, uv[0], uv[1], t);
  }
  switch (state) {
    case "sweep":
      return (p) => mSweep(p, t);
    case "listening":
      return (p) => mListening(p, t);
    case "pulse":
      return (p) => mPulse(p, t);
    case "tide":
      return (p) => mTide(p, t);
    case "aurora":
      return (p) => mAurora(p, t);
    case "spiral":
      return (p) => mSpiral(p, t);
    default:
      return () => 1;
  }
}

// ---- per-state frame builders --------------------------------------------
function frameWorking(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  // sphere-only flourish: 3 orbiting comet trails around the ball
  if (shape === "sphere") {
    addShape(frame, size, t, {
      points,
      dotR,
      spin: BASE_SPIN,
      tilt: CUR_TILT,
      alpha: BASE_ALPHA,
      contrast,
    });
    const R = size * 0.42, cx = size / 2, cy = size / 2;
    for (let k = 0; k < 3; k++) {
      const orbitR = R * (1.12 + k * 0.08);
      const tilt = CUR_TILT + k * 0.4;
      const ang = t * 1.4 * (1 + k * 0.25) + k * 2.1;
      // a bright leading dot followed by a short fading tail (no faint scatter)
      for (let tr = 0; tr < 6; tr++) {
        const a = ang - tr * 0.12;
        const ex = Math.cos(a) * orbitR;
        const ey = Math.sin(a) * orbitR * Math.sin(tilt);
        frame.dots.push({
          x: cx + ex,
          y: cy + ey,
          r: dotR * CUR_DOTSCALE * (1.4 - tr * 0.15),
          a: 0.9 - tr * 0.13,
        });
      }
    }
    return frame;
  }
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
  });
  return frame;
}

function frameSweep(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: modFor("sweep", shape, t),
  });
  return frame;
}

function frameShake(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  const cycle = (t * 0.08) % 1;
  const puff = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;
  const scramble = puff * size * 0.05;
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    scramble,
    alpha: BASE_ALPHA,
    contrast,
  });
  return frame;
}

function frameListening(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: modFor("listening", shape, t),
  });
  return frame;
}

function frameNetwork(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  const R = size * 0.42, cx = size / 2, cy = size / 2;
  // logo / svg: a flat cutout doesn't grow chords meaningfully — keep the global base
  if (shape !== "sphere") {
    addShape(frame, size, t, {
      points,
      dotR,
      spin: BASE_SPIN,
      tilt: CUR_TILT,
      alpha: BASE_ALPHA,
      contrast,
    });
    return frame;
  }
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
  });
  const nodes = fib(11);
  const n = nodes.length;
  const proj = [];
  for (let i = 0; i < n; i++) {
    const rp = rotate(nodes[i], CUR_TILT, t * BASE_SPIN);
    proj.push(rp);
    const s = shade(rp[2], dotR * CUR_DOTSCALE * 2.0, contrast);
    const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i);
    frame.dots.push({
      x: cx + rp[0] * R,
      y: cy - rp[1] * R,
      r: s.r,
      a: Math.min(1, s.a * (0.55 + 0.45 * tw)),
    });
  }
  const reveal = (t * 0.32) % 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = proj[i], b = proj[j];
      const ax = cx + a[0] * R, ay = cy - a[1] * R;
      const bx = cx + b[0] * R, by = cy - b[1] * R;
      const d = Math.hypot(ax - bx, ay - by);
      if (d < R * 1.05) {
        const idx = ((i * 31 + j * 17) % 100) / 100;
        // persistent gentle web + softer building reveal on top
        const build = Math.max(0, (1 - (reveal - idx) / 0.3) * 0.175);
        const la = Math.min(0.375, 0.2 + build);
        frame.lines.push({ x1: ax, y1: ay, x2: bx, y2: by, a: la, w: dotR * 0.75 });
      }
    }
  }
  return frame;
}

function frameSpin(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  addShape(frame, size, t, {
    points,
    dotR: dotRFor(size, shape),
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
  });
  return frame;
}

function frameBreathing(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  const pulse = 1 + 0.08 * Math.sin(t * 1.5);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA + 0.18 * Math.sin(t * 1.5),
    scale: pulse,
    contrast,
  });
  return frame;
}

function frameTwinkle(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: (_p, i) => {
      const phase = (i * 1.7) % (Math.PI * 2);
      const tw = Math.max(0, Math.sin(t * 2.4 + phase));
      return tw * tw;
    },
  });
  return frame;
}

function framePulse(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: modFor("pulse", shape, t),
  });
  return frame;
}

function frameTide(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: modFor("tide", shape, t),
  });
  return frame;
}

function frameAurora(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: modFor("aurora", shape, t),
  });
  return frame;
}

function frameSpiral(size, t, contrast, shape, points) {
  const frame = { dots: [], lines: [] };
  const dotR = dotRFor(size, shape);
  addShape(frame, size, t, {
    points,
    dotR,
    spin: BASE_SPIN,
    tilt: CUR_TILT,
    alpha: BASE_ALPHA,
    contrast,
    modulate: modFor("spiral", shape, t),
  });
  return frame;
}

const BUILDERS = {
  working: frameWorking,
  sweep: frameSweep,
  shake: frameShake,
  listening: frameListening,
  network: frameNetwork,
  spin: frameSpin,
  breathing: frameBreathing,
  twinkle: frameTwinkle,
  pulse: framePulse,
  tide: frameTide,
  aurora: frameAurora,
  spiral: frameSpiral,
};

function renderOrb(
  ctx,
  size,
  t,
  state,
  speed,
  ink,
  contrast,
  shape,
  text,
  density,
  layers,
  dotScale,
  tilt,
  phase,
  depth,
) {
  CUR_TILT = tilt == null ? BASE_TILT : tilt;
  CUR_PHASE = phase == null ? 0 : phase;
  CUR_DOTSCALE = dotScale == null ? 1 : dotScale;
  const tt = t * speed;
  const c = contrast == null ? DEFAULT_CONTRAST : contrast;
  const sh = shape || "sphere";
  const d = density == null ? 1 : density;
  const L = layers == null ? 5 : layers;
  const dp = depth == null ? DEFAULT_DEPTH : depth;
  const dense = sh === "logo" || sh === "svg";
  const base = countFor(size);
  const count = Math.round(base * (dense ? 1.8 : 1) * d);
  const points = sh === "logo"
    ? logoPoints(count, text || "AI", L, dp)
    : sh === "svg"
    ? (getSvgPoints(text) || spherePoints(count))
    : spherePoints(count);
  const frame = BUILDERS[state](size, tt, c, sh, points);
  ctx.clearRect(0, 0, size, size);
  // Global 15% safety margin: scale every point/line inward from the center
  // so no state (e.g. working's comet trails) can ever clip the canvas edge.
  const SAFE = 0.85;
  const _cx = size / 2, _cy = size / 2;
  for (const ln of frame.lines) {
    ctx.strokeStyle = `rgba(${ink},${ln.a})`;
    ctx.lineWidth = ln.w * SAFE;
    ctx.beginPath();
    ctx.moveTo(_cx + (ln.x1 - _cx) * SAFE, _cy + (ln.y1 - _cy) * SAFE);
    ctx.lineTo(_cx + (ln.x2 - _cx) * SAFE, _cy + (ln.y2 - _cy) * SAFE);
    ctx.stroke();
  }
  for (const d of frame.dots) {
    ctx.fillStyle = `rgba(${ink},${d.a})`;
    ctx.beginPath();
    ctx.arc(
      _cx + (d.x - _cx) * SAFE,
      _cy + (d.y - _cy) * SAFE,
      d.r * SAFE,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

export { renderOrb };
