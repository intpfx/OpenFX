/* Built from src/client.js for dsh-ambient-theme. */
window.__ModuleLoader__.load({ id: "dsh-ambient-theme", factory: () => {
  "use strict";
  const module = { exports: {} };
  const exports = module.exports;

/**
 * dsh-ambient-theme browser half.
 *
 * Ports the two background layers of the deepseek.com/harness hero to dsh
 * web as a full-viewport, non-interactive backdrop:
 *   1. a WebGL fluid-aurora field in the harness navy/gold palette;
 *   2. a fine pointer-reactive particle grid (the same visual grammar as the
 *      official hero grid).
 *
 * The plugin deliberately does not reproduce the hero's 3-D fish/whale
 * sculpture: that object is foreground art, not page background, and would
 * fight the chat surface for attention.
 *
 * The shell stays readable by scoping a translucent `bg-base` override to
 * #root only. Portals that leave #root (menus, dialogs) keep the stock
 * opaque theme tokens, and every interactive surface keeps full pointer
 * access because the backdrop container is pointer-events: none.
 *
 * The implementation is dependency-free vanilla DOM/canvas; dsh client
 * plugins are delivered as prebuilt bundles, so this source is wrapped by
 * scripts/build.mjs rather than bundled.
 */

'use strict'

const PLUGIN_ID = 'dsh-ambient-theme'
const STYLE_ID = 'dsh-ambient-theme-style'
const GRID_SPACING = 90
const GRID_POINTER_RADIUS = 140
const FRAME_INTERVAL = 1000 / 30
const MAX_DPR = 2

/** Stable cordis plugin name. */
const name = 'ambient-theme'

/** This plugin mounts DOM directly and needs no framework services. */
const inject = []

/** Dark palette lifted from the official harness hero (fluid + glow colors). */
const DARK = {
  colors: ['#000000', '#1a3870', '#204a7e', '#eed8aa', '#000000'],
  glowColors: ['#fff7d1', '#538dca', '#2d448b'],
  lightX: 0.89,
  lightY: 0.46,
  lightCore: 0.11,
  lightHalo: 0.16,
  vignette: 0.34,
  grain: 0.05,
  gridLineAlpha: 0.09,
  gridDotAlpha: 0.17,
  hostBackground: '#05070d',
}

/** Light-mode equivalent: the same fluid motion, airy blue instead of navy. */
const LIGHT = {
  colors: ['#f8fbff', '#dbeafe', '#bfdbfe', '#93c5fd', '#e0f2fe'],
  glowColors: ['#fff1b8', '#7aa7e8', '#3b6fd4'],
  lightX: 0.82,
  lightY: 0.38,
  lightCore: 0.08,
  lightHalo: 0.1,
  vignette: 0.22,
  grain: 0.025,
  gridLineAlpha: 0.07,
  gridDotAlpha: 0.12,
  hostBackground: '#eef4fb',
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 vUv;

void main() {
  vUv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FLUID_SHADER = `
precision mediump float;

varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec2 u_mouse_velocity;
uniform float u_brush_radius;
uniform float u_brush_strength;

uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform vec3 u_color4;
uniform vec3 u_color5;
uniform vec3 u_glow_color1;
uniform vec3 u_glow_color2;
uniform vec3 u_glow_color3;
uniform vec2 u_light_pos;
uniform float u_light_core;
uniform float u_light_halo;
uniform float u_vignette;
uniform float u_grain;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + 17.31;
    amplitude *= 0.5;
  }
  return value;
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 color = u_color1;
  color = mix(color, u_color2, smoothstep(0.0, 0.35, t));
  color = mix(color, u_color3, smoothstep(0.25, 0.6, t));
  color = mix(color, u_color4, smoothstep(0.55, 0.85, t));
  color = mix(color, u_color5, smoothstep(0.8, 1.0, t));
  return color;
}

void main() {
  vec2 uv = vUv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time;

  // Slowly travelling fluid field: two domain-warped fbm octaves plus a
  // broad swirl term. Low frequency on purpose — the app sits on top of it.
  vec2 q = vec2(
    fbm(p * 1.45 + vec2(t * 0.05, -t * 0.04)),
    fbm(p * 1.45 + vec2(-t * 0.04, t * 0.05) + 4.7)
  );
  vec2 r = vec2(
    fbm(p * 1.15 + q * 1.5 + vec2(t * 0.03, -t * 0.025) + 1.7),
    fbm(p * 1.15 + q.yx * 1.5 + vec2(-t * 0.025, t * 0.03) + 7.3)
  );
  float n = fbm(p * 1.05 + r * 1.25);
  float swirl = sin(p.x * 1.3 + t * 0.22 + n * 2.2) * cos(p.y * 1.2 - t * 0.18 + n * 1.8);
  float mixer = n * 0.64 + swirl * 0.5 * 0.36 + 0.5;

  vec3 color = ramp(mixer);

  // Pointer influence: a soft gaussian brush plus velocity-weighted glow.
  vec2 mouse = vec2((u_mouse.x - 0.5) * aspect, u_mouse.y - 0.5);
  float distance_to_mouse = distance(p, mouse);
  float influence = exp(-distance_to_mouse * distance_to_mouse / (2.0 * u_brush_radius * u_brush_radius));
  influence = max(influence - 0.02, 0.0);
  float speed = length(u_mouse_velocity);
  float total_strength = u_brush_strength * (0.3 + min(speed * 3.0, 0.7));
  float glow = influence * total_strength;

  vec3 glow_mix = mix(u_glow_color3, u_glow_color2, smoothstep(0.0, 0.55, influence));
  glow_mix = mix(glow_mix, u_glow_color1, smoothstep(0.0, 0.9, influence) * (0.55 + 0.45 * noise(uv * 7.0 + t)));
  color = mix(color, glow_mix, clamp(glow, 0.0, 0.55));

  // Warm key light near the lower right, cool halo around it — the same
  // lighting direction as the official hero.
  vec2 light_pos = vec2((u_light_pos.x - 0.5) * aspect, u_light_pos.y - 0.5);
  float light_distance = length(p - light_pos);
  color += vec3(1.0, 0.97, 0.9) * exp(-light_distance * light_distance * 4.5) * u_light_core;
  color += vec3(0.72, 0.8, 1.0) * exp(-light_distance * 1.8) * u_light_halo;

  // Subtle vignette keeps the frame edges quiet behind columns.
  float vig = smoothstep(0.34, 0.8, length(uv - 0.5));
  color *= mix(1.0 - u_vignette, 1.0, vig);

  // Animated grain masks banding on wide-gamut displays.
  color += (hash(gl_FragCoord.xy + fract(u_time) * 61.7) - 0.5) * u_grain;

  gl_FragColor = vec4(color, 1.0);
}
`

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ]
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`dsh-ambient-theme shader compile failed: ${info}`)
  }
  return shader
}

function createProgram(gl) {
  const program = gl.createProgram()
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FLUID_SHADER))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`dsh-ambient-theme program link failed: ${info}`)
  }
  return program
}

/** Current dark/light state; body attribute is owned by ui-theme. */
function isDarkTheme() {
  return document.body.hasAttribute('data-ds-dark-theme')
}

// ---------------------------------------------------------------------------
// Fluid canvas layer
// ---------------------------------------------------------------------------

function createFluidLayer(host) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
  })
  host.appendChild(canvas)

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  }) || canvas.getContext('experimental-webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  })
  if (!gl) {
    canvas.remove()
    return undefined
  }

  let program
  try {
    program = createProgram(gl)
  } catch (error) {
    console.warn('dsh-ambient-theme: WebGL unavailable, using CSS fallback.', error)
    canvas.remove()
    return undefined
  }

  gl.useProgram(program)
  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    mouseVelocity: gl.getUniformLocation(program, 'u_mouse_velocity'),
    brushRadius: gl.getUniformLocation(program, 'u_brush_radius'),
    brushStrength: gl.getUniformLocation(program, 'u_brush_strength'),
    color1: gl.getUniformLocation(program, 'u_color1'),
    color2: gl.getUniformLocation(program, 'u_color2'),
    color3: gl.getUniformLocation(program, 'u_color3'),
    color4: gl.getUniformLocation(program, 'u_color4'),
    color5: gl.getUniformLocation(program, 'u_color5'),
    glowColor1: gl.getUniformLocation(program, 'u_glow_color1'),
    glowColor2: gl.getUniformLocation(program, 'u_glow_color2'),
    glowColor3: gl.getUniformLocation(program, 'u_glow_color3'),
    lightPos: gl.getUniformLocation(program, 'u_light_pos'),
    lightCore: gl.getUniformLocation(program, 'u_light_core'),
    lightHalo: gl.getUniformLocation(program, 'u_light_halo'),
    vignette: gl.getUniformLocation(program, 'u_vignette'),
    grain: gl.getUniformLocation(program, 'u_grain'),
  }

  const pointer = { x: 0.5, y: 0.5, smoothX: 0.5, smoothY: 0.5, vx: 0, vy: 0 }
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startedAt = performance.now()

  let width = 0
  let height = 0
  let raf = 0
  let last = 0
  let running = false

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    width = Math.max(1, Math.round(canvas.clientWidth * dpr))
    height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }
  }

  function applyPalette() {
    const palette = isDarkTheme() ? DARK : LIGHT
    const colors = palette.colors.map(hexToRgb)
    const glowColors = palette.glowColors.map(hexToRgb)
    const locations = [uniforms.color1, uniforms.color2, uniforms.color3, uniforms.color4, uniforms.color5]
    for (let i = 0; i < locations.length; i += 1) {
      gl.uniform3f(locations[i], colors[i][0], colors[i][1], colors[i][2])
    }
    gl.uniform3f(uniforms.glowColor1, glowColors[0][0], glowColors[0][1], glowColors[0][2])
    gl.uniform3f(uniforms.glowColor2, glowColors[1][0], glowColors[1][1], glowColors[1][2])
    gl.uniform3f(uniforms.glowColor3, glowColors[2][0], glowColors[2][1], glowColors[2][2])
    gl.uniform2f(uniforms.lightPos, palette.lightX, palette.lightY)
    gl.uniform1f(uniforms.lightCore, palette.lightCore)
    gl.uniform1f(uniforms.lightHalo, palette.lightHalo)
    gl.uniform1f(uniforms.vignette, palette.vignette)
    gl.uniform1f(uniforms.grain, palette.grain)
  }

  function onPointerMove(event) {
    pointer.x = event.clientX / Math.max(1, window.innerWidth)
    pointer.y = 1 - event.clientY / Math.max(1, window.innerHeight)
  }

  function draw(now) {
    last = now
    resize()

    // Match the official hero's pointer easing: position eases toward the
    // cursor, velocity eases toward the residual delta.
    pointer.smoothX += (pointer.x - pointer.smoothX) * 0.1
    pointer.smoothY += (pointer.y - pointer.smoothY) * 0.1
    pointer.vx += ((pointer.x - pointer.smoothX) * 0.5 - pointer.vx) * 0.2
    pointer.vy += ((pointer.y - pointer.smoothY) * 0.5 - pointer.vy) * 0.2

    applyPalette()

    const time = (now - startedAt) / 1000
    gl.uniform2f(uniforms.resolution, width, height)
    gl.uniform1f(uniforms.time, time)
    gl.uniform2f(uniforms.mouse, pointer.smoothX, pointer.smoothY)
    gl.uniform2f(uniforms.mouseVelocity, pointer.vx, pointer.vy)
    gl.uniform1f(uniforms.brushRadius, 0.32)
    gl.uniform1f(uniforms.brushStrength, finePointer ? 1.4 : 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function frame(now) {
    raf = requestAnimationFrame(frame)
    if (now - last < FRAME_INTERVAL) return
    draw(now)
  }

  function start() {
    if (running) return
    running = true
    draw(performance.now())
    if (!reducedMotion) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  if (finePointer) window.addEventListener('pointermove', onPointerMove, { passive: true })

  const resizeObserver = new ResizeObserver(() => {
    if (running) draw(performance.now())
  })
  resizeObserver.observe(canvas)

  const intersectionObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) start()
    else stop()
  }, { threshold: 0 })
  intersectionObserver.observe(canvas)
  start()

  return {
    refreshTheme() {
      if (running) draw(performance.now())
    },
    dispose() {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      if (finePointer) window.removeEventListener('pointermove', onPointerMove)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      canvas.remove()
    },
  }
}

// ---------------------------------------------------------------------------
// Particle grid canvas layer
// ---------------------------------------------------------------------------

function createGridLayer(host) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    background: 'transparent',
  })
  host.appendChild(canvas)

  const context = canvas.getContext('2d')
  if (!context) {
    canvas.remove()
    return undefined
  }

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let dpr = 1
  let width = 0
  let height = 0
  let cols = 0
  let rows = 0
  let points = []
  let mouseX = Number.NaN
  let mouseY = Number.NaN
  let running = false
  let raf = 0
  let last = 0

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    width = Math.max(1, canvas.clientWidth)
    height = Math.max(1, canvas.clientHeight)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function rebuildGrid() {
    cols = Math.ceil(width / GRID_SPACING) + 1
    rows = Math.ceil(height / GRID_SPACING) + 1
    const offsetX = (width - (cols - 1) * GRID_SPACING) / 2
    const offsetY = (height - (rows - 1) * GRID_SPACING) / 2
    points = []
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const restX = offsetX + GRID_SPACING * col
        const restY = offsetY + GRID_SPACING * row
        points.push({ restX, restY, x: restX, y: restY, vx: 0, vy: 0 })
      }
    }
  }

  function palette() {
    return isDarkTheme() ? DARK : LIGHT
  }

  function strokeStyle(alpha) {
    return isDarkTheme()
      ? `rgba(255, 255, 255, ${alpha})`
      : `rgba(30, 58, 95, ${alpha})`
  }

  function draw(now) {
    last = now
    resizeCanvas()
    const activePalette = palette()
    context.clearRect(0, 0, width, height)

    // Physics tick: cursor repulsion plus a soft spring back to the grid.
    let maxVelocity = 0
    for (const point of points) {
      const dx = point.x - mouseX
      const dy = point.y - mouseY
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < GRID_POINTER_RADIUS && distance > 0.1 && !Number.isNaN(mouseX)) {
        const force = (1 - distance / GRID_POINTER_RADIUS) * 30
        const nx = dx / distance
        const ny = dy / distance
        point.vx += nx * force * 0.1
        point.vy += ny * force * 0.1
      }
      const springX = point.restX - point.x
      const springY = point.restY - point.y
      point.vx += 0.05 * springX
      point.vy += 0.05 * springY
      point.vx *= 0.85
      point.vy *= 0.85
      point.x += point.vx
      point.y += point.vy
      maxVelocity = Math.max(maxVelocity, Math.abs(point.vx) + Math.abs(point.vy))
    }

    const lineAlpha = activePalette.gridLineAlpha
    context.globalAlpha = 1
    context.strokeStyle = strokeStyle(lineAlpha)
    context.lineWidth = 0.5

    // Horizontal links: only the displaced stretches draw (the official grid
    // omits links shorter than 20px, so the resting mesh is dots only).
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        const a = points[row * cols + col]
        const b = points[row * cols + col + 1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 20) continue
        const nx = dx / distance
        const ny = dy / distance
        context.beginPath()
        context.moveTo(a.x + 10 * nx, a.y + 10 * ny)
        context.lineTo(b.x - 10 * nx, b.y - 10 * ny)
        context.stroke()
      }
    }
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows - 1; row += 1) {
        const a = points[row * cols + col]
        const b = points[(row + 1) * cols + col]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 20) continue
        const nx = dx / distance
        const ny = dy / distance
        context.beginPath()
        context.moveTo(a.x + 10 * nx, a.y + 10 * ny)
        context.lineTo(b.x - 10 * nx, b.y - 10 * ny)
        context.stroke()
      }
    }

    // Opaque fill + per-dot globalAlpha: canvas multiplies fill alpha and
    // globalAlpha together, so applying both would make the dots invisible.
    context.fillStyle = strokeStyle(1)
    for (const point of points) {
      let radius = 1.8
      let alpha = activePalette.gridDotAlpha
      if (!Number.isNaN(mouseX) && !Number.isNaN(mouseY)) {
        const dx = point.x - mouseX
        const dy = point.y - mouseY
        const distance = Math.sqrt(dx * dx + dy * dy)
        const proximity = Math.max(0, 1 - distance / GRID_POINTER_RADIUS)
        radius = 1.8 + 2 * proximity
        alpha = activePalette.gridDotAlpha + 0.4 * proximity
      }
      context.globalAlpha = Math.min(1, alpha)
      const size = 2 * radius
      context.fillRect(point.x - radius, point.y - radius, size, size)
    }
    context.globalAlpha = 1

    // Returning keepRunning lets the caller own the single rAF chain. The
    // mesh sleeps once it settles; pointer motion wakes it again.
    return maxVelocity >= 0.01
  }

  function frame(now) {
    if (now - last < FRAME_INTERVAL) {
      raf = requestAnimationFrame(frame)
      return
    }
    const keepRunning = draw(now)
    if (keepRunning) raf = requestAnimationFrame(frame)
    else stop()
  }

  function start() {
    if (running) return
    running = true
    const keepRunning = draw(performance.now())
    if (reducedMotion || !finePointer) {
      // Static mesh on reduced motion / touch devices; no idle loop.
      return
    }
    if (keepRunning) raf = requestAnimationFrame(frame)
    else stop()
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
    raf = 0
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect()
    mouseX = event.clientX - rect.left
    mouseY = event.clientY - rect.top
    if (!running) start()
  }

  if (finePointer && !reducedMotion) {
    window.addEventListener('mousemove', onMouseMove, { passive: true })
  }

  const resizeObserver = new ResizeObserver(() => {
    resizeCanvas()
    rebuildGrid()
    draw(performance.now())
  })
  resizeObserver.observe(canvas)

  const intersectionObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) start()
    else stop()
  }, { threshold: 0 })
  intersectionObserver.observe(canvas)

  resizeCanvas()
  rebuildGrid()
  start()

  return {
    refreshTheme() {
      draw(performance.now())
    },
    dispose() {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      if (finePointer && !reducedMotion) {
        window.removeEventListener('mousemove', onMouseMove)
      }
      canvas.remove()
    },
  }
}

// ---------------------------------------------------------------------------
// Whale point-cloud logo
// ---------------------------------------------------------------------------

const HERO_WHALE_SVG = "<svg width=\"24\" height=\"18\" viewBox=\"0 0 24 18\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746V14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z\" fill=\"#FFFFFF\"/>\n</svg>\n"
const WHALE_SAMPLE_SIZE = 72
const WHALE_ASSEMBLY_DELAY = 0.3
const WHALE_ASSEMBLY_DURATION = 2.5
const WHALE_FRAME_INTERVAL = FRAME_INTERVAL
const WHALE_LIGHT = { x: 4.5, y: 5.5, z: 3, range: 14, shadeMin: 0.28, shadeMax: 2.79 }
const WHALE_MOUSE = { radius: 4.9, strength: 0.8, decay: 0.2, distort: 5 }

/**
 * Rasterize the inline hero-whale SVG and reduce it to the same point-cloud
 * representation the official HeroDigitileR3F builds: every non-isolated
 * bright pixel becomes a particle with a target position, an opacity, an
 * edge factor, and a random scatter origin.
 */
function sampleWhalePoints(svg, size) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const raster = document.createElement('canvas')
        raster.width = size
        raster.height = size
        const context = raster.getContext('2d')
        if (!context) {
          resolve(undefined)
          return
        }
        context.fillStyle = '#000'
        context.fillRect(0, 0, size, size)
        const ratio = Math.min(size / image.width, size / image.height)
        const drawWidth = image.width * ratio
        const drawHeight = image.height * ratio
        context.drawImage(image, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight)
        const pixels = context.getImageData(0, 0, size, size).data
        const luminance = new Float32Array(size * size)
        for (let i = 0; i < size * size; i += 1) {
          const offset = i * 4
          luminance[i] = (0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]) / 255
        }

        const positions = []
        const scattered = []
        const opacities = []
        const edges = []
        const phases = []
        const half = size / 2
        for (let row = 0; row < size; row += 1) {
          for (let col = 0; col < size; col += 1) {
            const index = row * size + col
            const alpha = luminance[index]
            if (alpha <= 0.2) continue

            // Match the official sampler: single isolated specks are noise
            // and are dropped, not turned into logo particles.
            let brightNeighbor = 0
            for (let dy = -2; dy <= 2; dy += 1) {
              for (let dx = -2; dx <= 2; dx += 1) {
                if (dx === 0 && dy === 0) continue
                const ny = row + dy
                const nx = col + dx
                if (nx >= 0 && ny >= 0 && nx < size && ny < size && luminance[ny * size + nx] > 0.2) {
                  brightNeighbor += 1
                }
              }
            }
            if (brightNeighbor === 0) continue

            positions.push((col - half) * 0.18, (half - row) * 0.18, 0)
            opacities.push(alpha)

            let edge = 0
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                if (dx === 0 && dy === 0) continue
                const ny = row + dy
                const nx = col + dx
                if (nx < 0 || ny < 0 || nx >= size || ny >= size || luminance[ny * size + nx] <= 0.2) {
                  edge += 1
                }
              }
            }
            edges.push(edge / 8)

            const azimuth = Math.random() * Math.PI * 2
            const polar = Math.acos(2 * Math.random() - 1)
            const radius = 3 * (0.4 + 0.6 * Math.random())
            scattered.push(
              Math.sin(polar) * Math.cos(azimuth) * radius,
              Math.sin(polar) * Math.sin(azimuth) * radius,
              Math.cos(polar) * radius * 0.5,
            )
            phases.push(Math.random() * Math.PI * 2)
          }
        }

        resolve({
          count: positions.length / 3,
          positions: new Float32Array(positions),
          scatteredPositions: new Float32Array(scattered),
          opacities: new Float32Array(opacities),
          edges: new Float32Array(edges),
          phases: new Float32Array(phases),
        })
      } catch (error) {
        console.warn('dsh-ambient-theme: whale SVG sampling failed.', error)
        resolve(undefined)
      }
    }
    image.onerror = () => {
      console.warn('dsh-ambient-theme: whale SVG failed to load.')
      resolve(undefined)
    }
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/**
 * Clipped whale point-cloud backdrop behind the composer card. The card's
 * opaque fill is made transparent by CSS; this fixed clip host sits behind
 * #root (z-index 0 vs the shell's z-index 1), so the whale is a true
 * background: text, chips and toolbar paint above it.
 */
function createWhaleLogoLayer() {
  const host = document.createElement('div')
  host.dataset.ambientThemeWhaleBackground = PLUGIN_ID
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: '100%',
    height: '100%',
    zIndex: '-1',
    pointerEvents: 'none',
    overflow: 'hidden',
    borderRadius: '22px',
    opacity: '0',
    transition: 'opacity 180ms linear',
  })

  const canvas = document.createElement('canvas')
  canvas.dataset.ambientThemeWhaleLogo = PLUGIN_ID
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: '100%',
    height: '100%',
    display: 'block',
  })
  host.appendChild(canvas)

  const context = canvas.getContext('2d')
  if (!context) {
    host.remove()
    return undefined
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startedAt = performance.now()
  let alive = true
  let points
  let ready = false
  let running = false
  let raf = 0
  let last = 0
  let frameIndex = 0
  let dpr = 1
  let layoutQueued = false
  let currentTarget
  let interactionElement
  let interactionTarget = 0
  let interactionStrength = 0
  let interactionTimer = 0
  const mouse = { x: 0, y: 0, smoothX: 0, smoothY: 0, active: false, strength: 0 }

  function locate() {
    const card = document.querySelector('#root [data-composer-card]')
    if (!card) return undefined
    const rect = card.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 24) return undefined
    return {
      element: card,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  function updateMouse(event) {
    const rect = host.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height * 2 - 1)
  }

  function bindInteraction(card) {
    if (interactionElement === card) return
    if (interactionElement) {
      interactionElement.removeEventListener('pointerenter', onPointerEnter)
      interactionElement.removeEventListener('pointerleave', onPointerLeave)
      interactionElement.removeEventListener('touchstart', onTouchStart)
      interactionElement.removeEventListener('touchend', onTouchEnd)
    }
    interactionElement = card
    if (interactionElement) {
      interactionElement.addEventListener('pointerenter', onPointerEnter)
      interactionElement.addEventListener('pointerleave', onPointerLeave)
      interactionElement.addEventListener('touchstart', onTouchStart, { passive: true })
      interactionElement.addEventListener('touchend', onTouchEnd, { passive: true })
    }
  }

  function onPointerEnter(event) {
    updateMouse(event)
    mouse.active = true
    interactionTarget = 1
    if (interactionTimer) window.clearTimeout(interactionTimer)
  }

  function onPointerLeave() {
    mouse.active = false
    interactionTarget = 0
    if (interactionTimer) window.clearTimeout(interactionTimer)
  }

  function onTouchStart(event) {
    const touch = event.touches?.[0]
    if (touch) updateMouse(touch)
    mouse.active = true
    interactionTarget = 1
    if (interactionTimer) window.clearTimeout(interactionTimer)
    interactionTimer = window.setTimeout(() => {
      interactionTarget = 0
      interactionTimer = 0
    }, 1200)
  }

  function onTouchEnd() {
    mouse.active = false
    if (interactionTimer) window.clearTimeout(interactionTimer)
    interactionTimer = window.setTimeout(() => {
      interactionTarget = 0
      interactionTimer = 0
    }, 350)
  }

  function scheduleLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      applyLayout()
    })
  }

  function applyLayout() {
    const target = locate()
    currentTarget = target
    bindInteraction(target?.element)
    if (!target) {
      host.style.opacity = '0'
      return
    }

    // The whale is a negative-z child of the composer card itself. It paints
    // above the card background but below the textarea/toolbar, so it can
    // never be hidden by root stacking or overlay the quick-scroll controls.
    if (host.parentElement !== target.element) target.element.appendChild(host)
    host.style.opacity = isDarkTheme() ? '1' : '0.6'

    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const nextWidth = Math.max(1, Math.round(target.width * dpr))
    const nextHeight = Math.max(1, Math.round(target.height * dpr))
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth
      canvas.height = nextHeight
    }
  }

  function onPointerMove(event) {
    if (!currentTarget || !currentTarget.element.contains(event.target)) return
    updateMouse(event)
    mouse.active = true
    interactionTarget = Math.max(interactionTarget, 0.6)
  }

  function onPointerGone() {
    mouse.active = false
    interactionTarget = 0
  }

  function onVisibility() {
    if (document.hidden) {
      mouse.active = false
      interactionTarget = 0
    }
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3)
  }

  function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }

  function draw(now) {
    last = now
    if (!ready || points === undefined) return

    frameIndex += 1
    if (frameIndex % 6 === 0) applyLayout()
    if (!currentTarget) return

    const target = currentTarget
    const width = target.width
    const height = target.height
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    const dark = isDarkTheme()
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over'

    const elapsed = (now - startedAt) / 1000
    const assembly = reducedMotion
      ? 1
      : easeOutCubic(Math.max(0, Math.min(1, (elapsed - WHALE_ASSEMBLY_DELAY) / WHALE_ASSEMBLY_DURATION)))

    interactionStrength += (interactionTarget - interactionStrength)
      * (interactionTarget > interactionStrength ? 0.14 : 0.055)
    const pulse = reducedMotion ? 0 : Math.max(0, Math.min(1, interactionStrength))

    mouse.smoothX += (mouse.x - mouse.smoothX) * WHALE_MOUSE.decay
    mouse.smoothY += (mouse.y - mouse.smoothY) * WHALE_MOUSE.decay
    mouse.strength += ((mouse.active ? WHALE_MOUSE.strength : 0) - mouse.strength) * 0.12

    const rotation = reducedMotion
      ? 0
      : elapsed * (1 - assembly) * 0.3
        + 0.04 * Math.sin(0.25 * elapsed)
        + pulse * 0.07 * Math.sin(elapsed * 2.6)
    const cosRotation = Math.cos(rotation)
    const sinRotation = Math.sin(rotation)
    // Large enough to read as a background and deliberately clipped by the
    // card: the whale spans most of the card width and bleeds past both the
    // top and bottom edges.
    const worldScale = Math.max(width * 0.02, height * 0.15) * (1 + pulse * 0.07)
    const centerX = width / 2
    const centerY = height * 0.52
    const mouseX = mouse.smoothX
    const mouseY = mouse.smoothY
    const mouseStrength = mouse.strength
    const mouseRadius = WHALE_MOUSE.radius
    const mouseDistort = WHALE_MOUSE.distort

    const positions = points.positions
    const scattered = points.scatteredPositions
    const opacities = points.opacities
    const edges = points.edges
    const phases = points.phases
    const count = points.count

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3
      const targetX = positions[offset]
      const targetY = positions[offset + 1]
      const edge = edges[index]

      let x = scattered[offset] + (targetX - scattered[offset]) * assembly
      let y = scattered[offset + 1] + (targetY - scattered[offset + 1]) * assembly
      let z = scattered[offset + 2] * (1 - assembly)

      const loose = 0.8 * (1 + pulse * 0.9) * (0.25 + 0.75 * edge) * assembly
      if (loose > 0.001) {
        x += Math.sin(index * 12.9898) * 0.025 * loose
        y += Math.sin(index * 78.233) * 0.025 * loose
        z += Math.sin(index * 39.425) * 0.04 * loose
        x += Math.sin(elapsed * 0.5 + index * 0.53) * 0.06 * loose
        y += Math.cos(elapsed * 0.42 + index * 0.71) * 0.06 * loose
        z += Math.sin(elapsed * 0.36 + index * 0.91) * 0.08 * loose
        const tail = smoothstep(0.5, 4.5, targetX) * loose
        y += Math.sin(elapsed * 1.1 - targetX * 0.7) * 0.1 * tail
        z += Math.cos(elapsed * 0.9 - targetX * 0.55) * 0.06 * tail
      }

      let rotatedX = x * cosRotation - y * sinRotation
      let rotatedY = x * sinRotation + y * cosRotation

      if (assembly > 0.8 && mouseStrength > 0.01) {
        const dx = rotatedX - mouseX
        const dy = rotatedY - mouseY
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < mouseRadius && distance > 0.001) {
          const falloff = 1 - distance / mouseRadius
          const force = falloff * falloff * falloff * (assembly - 0.8) * 5 * mouseStrength
          const radialX = dx / distance
          const radialY = dy / distance
          const angle = Math.sin(index * 0.37 + elapsed * 0.5) * mouseDistort
          const cosAngle = Math.cos(angle)
          const sinAngle = Math.sin(angle)
          rotatedX += (radialX * cosAngle - radialY * sinAngle) * force * 2
          rotatedY += (radialX * sinAngle + radialY * cosAngle) * force * 2
          z += Math.sin(index * 1.7 + elapsed) * force * 0.8
        }
      }

      const perspective = 1 / (1 + z * 0.055)
      const screenX = centerX + rotatedX * worldScale * perspective
      const screenY = centerY - rotatedY * worldScale * perspective

      const lightDistance = Math.sqrt(
        (rotatedX - WHALE_LIGHT.x) ** 2
        + (rotatedY - WHALE_LIGHT.y) ** 2
        + (z - WHALE_LIGHT.z) ** 2,
      )
      const lit = Math.max(0, Math.min(1, 1 - lightDistance / WHALE_LIGHT.range))
      const shade = WHALE_LIGHT.shadeMin + (WHALE_LIGHT.shadeMax - WHALE_LIGHT.shadeMin) * lit * lit

      const centerDistance = Math.sqrt(rotatedX * rotatedX + rotatedY * rotatedY)
      const glow = smoothstep(8, 0, centerDistance) * 0.3 * assembly
      const baseAlpha = 0.55 + 0.35 * assembly
      const shimmer = Math.sin(elapsed * 1.5 + rotatedX * 5 + rotatedY * 3 + phases[index]) * 0.1 + 0.9
      let alpha = opacities[index] * (baseAlpha + glow) * shimmer * Math.min(lit, 1) * shade
      alpha = Math.max(0, Math.min(1, alpha * (dark ? 1.25 : 0.55) * (1 + pulse * 0.16)))

      const size = Math.max(0.9, (0.55 + 0.55 * edge + 0.22 * lit) * (0.55 + 0.45 * assembly) * (1 + pulse * 0.18) * 3.1)

      const baseR = dark ? 0.75 : 0.18
      const baseG = dark ? 0.8 : 0.23
      const baseB = dark ? 0.9 : 0.38
      context.fillStyle = `rgba(${Math.round((baseR + glow * 0.2) * 255)}, ${Math.round((baseG + glow * 0.3) * 255)}, ${Math.round((baseB + glow * 0.5) * 255)}, ${alpha.toFixed(3)})`
      context.fillRect(screenX - size / 2, screenY - size / 2, size, size)
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame)
    if (now - last < WHALE_FRAME_INTERVAL) return
    draw(now)
  }

  function start() {
    if (running) return
    running = true
    draw(performance.now())
    if (!reducedMotion) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
    raf = 0
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('mouseleave', onPointerGone)
  document.addEventListener('visibilitychange', onVisibility)

  const mutationObserver = new MutationObserver(() => { scheduleLayout() })
  if (root) mutationObserver.observe(root, { childList: true, subtree: true })
  window.addEventListener('resize', scheduleLayout)

  const intersectionObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) start()
    else stop()
  }, { threshold: 0 })
  intersectionObserver.observe(host)

  void sampleWhalePoints(HERO_WHALE_SVG, WHALE_SAMPLE_SIZE).then((sampled) => {
    if (!alive) return
    points = sampled
    if (points === undefined || points.count === 0) return
    ready = true
    applyLayout()
    start()
  })

  applyLayout()

  return {
    refreshTheme() {
      applyLayout()
      if (ready && running) draw(performance.now())
    },
    dispose() {
      alive = false
      stop()
      bindInteraction(undefined)
      if (interactionTimer) window.clearTimeout(interactionTimer)
      mutationObserver.disconnect()
      intersectionObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('mouseleave', onPointerGone)
      document.removeEventListener('visibilitychange', onVisibility)
      host.remove()
    },
  }
}


function installThemeStyle() {
  const id = 'dsh-ambient-theme-style'
  const existing = document.getElementById(id)
  if (existing) return existing
  const style = document.createElement('style')
  style.id = id
  style.dataset.plugin = PLUGIN_ID
  style.textContent = `
#root {
  position: relative;
  z-index: 1;
  --dsw-alias-bg-base: color-mix(in srgb, var(--dsw-static-neutral-bluish-00, #ffffff) 88%, transparent);
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--dsw-static-neutral-bluish-50, #f9fafb) 80%, transparent);
}
body[data-ds-dark-theme] #root {
  --dsw-alias-bg-base: color-mix(in srgb, var(--dsw-static-neutral-bluish-950, #151517) 78%, transparent);
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--dsw-static-neutral-bluish-900, #1b1b1c) 70%, transparent);
}
#root > div > div[class*='frame'] { background: transparent; }
#root [data-composer-card] {
  background: color-mix(in srgb, var(--dsw-specific-input-major) 35%, transparent) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
}
#root [class*='composerSeat'] { background: transparent !important; }
`
  document.head.appendChild(style)
  return style
}

function installTheme() {
  const style = installThemeStyle()
  const host = document.createElement('div')
  host.dataset.ambientTheme = PLUGIN_ID
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed', inset: '0', zIndex: '0', pointerEvents: 'none',
    overflow: 'hidden', background: isDarkTheme() ? DARK.hostBackground : LIGHT.hostBackground,
    transition: 'background 0.35s linear',
  })
  document.body.prepend(host)
  const fluid = createFluidLayer(host)
  const grid = createGridLayer(host)
  const whale = createWhaleLogoLayer()
  const refreshTheme = () => {
    host.style.background = isDarkTheme() ? DARK.hostBackground : LIGHT.hostBackground
    fluid?.refreshTheme()
    grid?.refreshTheme()
    whale?.refreshTheme()
  }
  const observer = new MutationObserver(refreshTheme)
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => {
    observer.disconnect()
    fluid?.dispose()
    grid?.dispose()
    whale?.dispose()
    host.remove()
    style.remove()
  }
}

function apply(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(installTheme, 'ambient-theme: mount fluid, grid, and whale layers')
}

exports.name = name
exports.inject = inject
exports.apply = apply

  return module.exports;
} });
