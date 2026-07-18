type WebGLContextProbe = {
  getExtension?: (name: string) => { loseContext?: () => void } | null;
};

export type CoreCanvas = HTMLCanvasElement;

export type CoreRenderTarget = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  render: (timestamp: number) => void;
  dispose: () => void;
};

export type CoreRendererScheduler = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  observeResize: (target: Element, callback: () => void) => () => void;
  pixelRatio: () => number;
};

export type StartCoreRendererOptions = {
  pulseSeconds: number;
  onFailure: () => void;
  createRenderer?: (
    canvas: CoreCanvas,
    pulseSeconds: number,
  ) => CoreRenderTarget | null;
  scheduler?: CoreRendererScheduler;
};

const PARTICLE_COUNT = 420;
const RING_COUNT = 4;
const RING_SEGMENTS = 128;

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute float aAlpha;
attribute float aSize;

uniform float uAspect;
uniform float uPulse;
uniform float uTime;

varying float vAlpha;

void main() {
  float yAngle = uTime * 0.075;
  float xAngle = -0.28 + sin(uTime * 0.063) * 0.08;
  float cy = cos(yAngle);
  float sy = sin(yAngle);
  float cx = cos(xAngle);
  float sx = sin(xAngle);

  vec3 point = aPosition * uPulse;
  point = vec3(
    point.x * cy + point.z * sy,
    point.y,
    -point.x * sy + point.z * cy
  );
  point = vec3(
    point.x,
    point.y * cx - point.z * sx,
    point.y * sx + point.z * cx
  );

  float cameraDepth = 3.15 - point.z;
  float perspective = 1.92 / cameraDepth;
  gl_Position = vec4(
    point.x * perspective / max(uAspect, 0.01),
    point.y * perspective,
    point.z * 0.08,
    1.0
  );
  gl_PointSize = max(1.0, aSize * perspective * 2.6);
  vAlpha = aAlpha * (0.58 + point.z * 0.22);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform float uPointPass;
varying float vAlpha;

void main() {
  float alpha = vAlpha;
  if (uPointPass > 0.5) {
    float radius = distance(gl_PointCoord, vec2(0.5));
    alpha *= 1.0 - smoothstep(0.16, 0.5, radius);
  }
  gl_FragColor = vec4(0.29, 0.89, 0.94, alpha);
}
`;

const createParticleData = (): Float32Array => {
  let seed = 0x4f504658;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const data = new Float32Array(PARTICLE_COUNT * 5);
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const longitude = random() * Math.PI * 2;
    const latitude = Math.acos(2 * random() - 1) - Math.PI / 2;
    const radius = 0.22 + random() * 0.76;
    const layer = index % 5;
    const offset = index * 5;
    data[offset] = Math.cos(latitude) * Math.cos(longitude) * radius;
    data[offset + 1] = Math.sin(latitude) * radius * 0.82;
    data[offset + 2] = Math.cos(latitude) * Math.sin(longitude) * radius;
    data[offset + 3] = 0.18 + random() * 0.72;
    data[offset + 4] = layer === 0 ? 2.7 : 1.2 + random() * 1.4;
  }
  return data;
};

const createRingData = (): Float32Array => {
  const data = new Float32Array(RING_COUNT * RING_SEGMENTS * 5);
  for (let ring = 0; ring < RING_COUNT; ring += 1) {
    const radius = 0.48 + ring * 0.16;
    const tilt = -0.82 + ring * 0.47;
    const rotation = ring * 0.71;
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    const cosRotation = Math.cos(rotation);
    const sinRotation = Math.sin(rotation);
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const angle = segment / RING_SEGMENTS * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.62;
      const tiltedY = y * cosTilt;
      const tiltedZ = y * sinTilt;
      const offset = (ring * RING_SEGMENTS + segment) * 5;
      data[offset] = x * cosRotation + tiltedZ * sinRotation;
      data[offset + 1] = tiltedY;
      data[offset + 2] = -x * sinRotation + tiltedZ * cosRotation;
      data[offset + 3] = 0.14;
      data[offset + 4] = 1;
    }
  }
  return data;
};

export function detectWebGLSupport(
  createCanvas: () => { getContext: (name: string, attributes?: unknown) => unknown } =
    () => document.createElement("canvas"),
): boolean {
  try {
    const context = createCanvas().getContext("webgl", {
      alpha: true,
      failIfMajorPerformanceCaveat: true,
    }) as WebGLContextProbe | null;
    if (!context) return false;
    context.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}

const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl: WebGLRenderingContext): WebGLProgram | null => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

export function createWebGLCoreRenderer(
  canvas: CoreCanvas,
  pulseSeconds: number,
): CoreRenderTarget | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: "high-performance",
    premultipliedAlpha: true,
  });
  if (!gl) return null;

  const program = createProgram(gl);
  const particleBuffer = gl.createBuffer();
  const ringBuffer = gl.createBuffer();
  if (!program || !particleBuffer || !ringBuffer) {
    if (program) gl.deleteProgram(program);
    if (particleBuffer) gl.deleteBuffer(particleBuffer);
    if (ringBuffer) gl.deleteBuffer(ringBuffer);
    return null;
  }

  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const alphaLocation = gl.getAttribLocation(program, "aAlpha");
  const sizeLocation = gl.getAttribLocation(program, "aSize");
  const aspectLocation = gl.getUniformLocation(program, "uAspect");
  const pointPassLocation = gl.getUniformLocation(program, "uPointPass");
  const pulseLocation = gl.getUniformLocation(program, "uPulse");
  const timeLocation = gl.getUniformLocation(program, "uTime");
  if (
    positionLocation < 0 || alphaLocation < 0 || sizeLocation < 0 ||
    !aspectLocation || !pointPassLocation || !pulseLocation || !timeLocation
  ) {
    gl.deleteBuffer(particleBuffer);
    gl.deleteBuffer(ringBuffer);
    gl.deleteProgram(program);
    return null;
  }

  const particleData = createParticleData();
  const ringData = createRingData();
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ringData, gl.STATIC_DRAW);
  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  let width = 1;
  let height = 1;
  let disposed = false;
  const bindAttributes = (buffer: WebGLBuffer) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.enableVertexAttribArray(alphaLocation);
    gl.enableVertexAttribArray(sizeLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, 20, 12);
    gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 20, 16);
  };

  return {
    resize(cssWidth, cssHeight, pixelRatio) {
      if (disposed) return;
      width = Math.max(1, Math.floor(cssWidth * pixelRatio));
      height = Math.max(1, Math.floor(cssHeight * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    render(timestamp) {
      if (disposed || gl.isContextLost()) return;
      const time = timestamp / 1000;
      const pulse = 1 + Math.sin(time * Math.PI * 2 / pulseSeconds) * 0.025;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(aspectLocation, width / height);
      gl.uniform1f(pulseLocation, pulse);
      gl.uniform1f(timeLocation, time);

      bindAttributes(particleBuffer);
      gl.uniform1f(pointPassLocation, 1);
      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

      bindAttributes(ringBuffer);
      gl.uniform1f(pointPassLocation, 0);
      for (let ring = 0; ring < RING_COUNT; ring += 1) {
        gl.drawArrays(gl.LINE_LOOP, ring * RING_SEGMENTS, RING_SEGMENTS);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteBuffer(particleBuffer);
      gl.deleteBuffer(ringBuffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

const browserScheduler: CoreRendererScheduler = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  observeResize: (target, callback) => {
    const observer = new ResizeObserver(callback);
    observer.observe(target);
    return () => observer.disconnect();
  },
  pixelRatio: () => Math.min(devicePixelRatio, 1.5),
};

export function startCoreRenderer(
  canvas: CoreCanvas,
  options: StartCoreRendererOptions,
): () => void {
  const createRenderer = options.createRenderer ?? createWebGLCoreRenderer;
  const scheduler = options.scheduler ?? browserScheduler;
  let renderer: CoreRenderTarget | null;
  try {
    renderer = createRenderer(canvas, options.pulseSeconds);
  } catch {
    options.onFailure();
    return () => {};
  }
  if (!renderer) {
    options.onFailure();
    return () => {};
  }

  let disposed = false;
  let frame = 0;
  let stopObserving = () => {};
  const resize = () => {
    if (disposed || !renderer) return;
    const bounds = canvas.getBoundingClientRect();
    renderer.resize(bounds.width, bounds.height, scheduler.pixelRatio());
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scheduler.cancelFrame(frame);
    stopObserving();
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    renderer?.dispose();
    renderer = null;
  };
  const fail = () => {
    dispose();
    options.onFailure();
  };
  const draw: FrameRequestCallback = (timestamp) => {
    if (disposed || !renderer) return;
    try {
      renderer.render(timestamp);
      frame = scheduler.requestFrame(draw);
    } catch {
      fail();
    }
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    fail();
  };

  try {
    canvas.addEventListener("webglcontextlost", handleContextLost);
    stopObserving = scheduler.observeResize(canvas, resize);
    resize();
    frame = scheduler.requestFrame(draw);
  } catch {
    fail();
  }
  return dispose;
}
