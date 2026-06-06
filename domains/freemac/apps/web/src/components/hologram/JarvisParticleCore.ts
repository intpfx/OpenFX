import { BufferGeometry, Float32BufferAttribute, AdditiveBlending, Color } from "three";
import { PointsNodeMaterial } from "three/webgpu";
import {
  uniform,
  float,
  vec3,
  color,
  int,
  attribute,
  select,
  and,
  mix,
  smoothstep,
  sin,
  cos,
  pow,
  fract,
  length,
  normalize,
  abs,
  clamp,
  step,
  positionLocal,
  pointUV,
  varying,
  Fn,
  mx_fractal_noise_vec3,
} from "three/tsl";

const shellSectors = [
  { phiMin: 0.3, phiMax: 1.3, thetaMin: -0.6, thetaMax: 1.4 },
  { phiMin: 1.6, phiMax: 2.7, thetaMin: 1.6, thetaMax: 3.14 },
  { phiMin: 0.5, phiMax: 1.9, thetaMin: -2.6, thetaMax: -1.4 },
];

function isInShellSector(phi: number, theta: number): boolean {
  for (const s of shellSectors) {
    if (phi >= s.phiMin && phi <= s.phiMax && theta >= s.thetaMin && theta <= s.thetaMax)
      return true;
  }
  return false;
}

export function createJarvisCoreGeometry() {
  const pCount = 100000;
  const positions = new Float32Array(pCount * 3);
  const types = new Float32Array(pCount);
  const seeds = new Float32Array(pCount);

  let p = 0;
  const pi2 = Math.PI * 2;

  // 0. Front-facing spiral core (20,000)
  for (let i = 0; i < 20000; i++) {
    const arm = Math.floor(Math.random() * 5);
    const armOffset = (arm / 5) * pi2;
    const spiralTurns = 7.5;
    const theta = Math.random() * pi2 * spiralTurns + armOffset;
    const radius = 0.12 + (theta / (pi2 * spiralTurns)) * 0.34 + Math.random() * 0.05;
    const swirlNoise = (Math.random() - 0.5) * 0.04;
    positions[p * 3] = Math.cos(theta) * (radius + swirlNoise);
    positions[p * 3 + 1] = Math.sin(theta) * (radius + swirlNoise);
    positions[p * 3 + 2] = (Math.random() - 0.5) * 0.04;
    types[p] = 0.0;
    seeds[p] = Math.random();
    p++;
  }

  // 1. Fragmented meridians (20,000 — shell sectors only)
  for (let i = 0; i < 20000; i++) {
    const meridian = Math.floor(Math.random() * 18);
    const theta = (meridian / 18) * pi2 + (Math.random() - 0.5) * 0.12;
    const phi = Math.random() * Math.PI;
    const r = 1.25 + (Math.random() - 0.5) * 0.1;
    const x = r * Math.sin(phi) * Math.cos(theta) + (Math.random() - 0.5) * 0.04;
    const y = r * Math.cos(phi) + (Math.random() - 0.5) * 0.04;
    const z = r * Math.sin(phi) * Math.sin(theta) + (Math.random() - 0.5) * 0.04;
    const rr = Math.sqrt(x * x + y * y + z * z);
    const sPhi = Math.acos(Math.max(-1, Math.min(1, y / rr)));
    const sTheta = Math.atan2(z, x);
    if (isInShellSector(sPhi, sTheta)) {
      positions[p * 3] = x;
      positions[p * 3 + 1] = y;
      positions[p * 3 + 2] = z;
      types[p] = 1.0;
    } else {
      const cr = 1.6 + Math.random() * 0.5;
      positions[p * 3] = (x / rr) * cr;
      positions[p * 3 + 1] = (y / rr) * cr;
      positions[p * 3 + 2] = (z / rr) * cr;
      types[p] = 4.0;
    }
    seeds[p] = Math.random();
    p++;
  }

  // 2. Fragmented parallels (25,000 — shell sectors only)
  for (let i = 0; i < 25000; i++) {
    const parallel = Math.floor(Math.random() * 12);
    const phi = ((parallel + 1) / 14) * Math.PI + (Math.random() - 0.5) * 0.08;
    const radiusAtPhi = Math.sin(phi) * 1.3;
    const y = Math.cos(phi) * 1.3 + (Math.random() - 0.5) * 0.05;
    const theta = Math.random() * pi2;
    const x = radiusAtPhi * Math.cos(theta) + (Math.random() - 0.5) * 0.04;
    const z = radiusAtPhi * Math.sin(theta) + (Math.random() - 0.5) * 0.04;
    const rr = Math.sqrt(x * x + y * y + z * z);
    const sPhi = Math.acos(Math.max(-1, Math.min(1, y / rr)));
    const sTheta = Math.atan2(z, x);
    if (isInShellSector(sPhi, sTheta)) {
      positions[p * 3] = x;
      positions[p * 3 + 1] = y;
      positions[p * 3 + 2] = z;
      types[p] = 2.0;
    } else {
      const cr = 1.5 + Math.random() * 0.6;
      positions[p * 3] = (x / rr) * cr;
      positions[p * 3 + 1] = (y / rr) * cr;
      positions[p * 3 + 2] = (z / rr) * cr;
      types[p] = 4.0;
    }
    seeds[p] = Math.random();
    p++;
  }

  // 3. Radial connectors in XZ plane (15,000)
  for (let i = 0; i < 15000; i++) {
    const spoke = Math.floor(Math.random() * 48);
    const theta = (spoke / 48) * pi2;
    const radial = 0.5 + Math.random() * 0.78;
    const lift = (Math.random() - 0.5) * 0.06;
    positions[p * 3] = Math.cos(theta) * radial;
    positions[p * 3 + 1] = lift;
    positions[p * 3 + 2] = Math.sin(theta) * radial;
    types[p] = 3.0;
    seeds[p] = Math.random();
    p++;
  }

  // 4. Ambient Data Cloud (20,000 points)
  for (let i = 0; i < 20000; i++) {
    const r = 0.6 + Math.random() * 1.3;
    const theta = Math.random() * pi2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[p * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[p * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[p * 3 + 2] = r * Math.cos(phi);
    types[p] = 4.0;
    seeds[p] = Math.random();
    p++;
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setAttribute("aType", new Float32BufferAttribute(types, 1));
  geom.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  return geom;
}

export function createParticleNodeMaterial() {
  /* ── Uniforms ── */
  const uTime = uniform(0);
  const uPulse = uniform(0);
  const uErrorState = uniform(0);
  const uColorJarvis = uniform(color("#ffb347"));
  const uColorUltron = uniform(color("#1685ff"));
  const uBrightness = uniform(1.0);
  const uAgentState = uniform(0.0);

  /* ── Attributes ── */
  const aType = attribute("aType", "float");
  const aSeed = attribute("aSeed", "float");

  /* ── Vertex: position ── */
  const positionFn = Fn(() => {
    const t = uTime.mul(0.15);
    const pos = positionLocal.toVar();
    const r = length(pos);

    // Per-type Y rotation
    const ay = select(
      aType.equal(1),
      t.mul(0.04),
      select(
        aType.equal(2),
        t.mul(-0.06),
        select(aType.equal(3), t.mul(0.03), select(aType.equal(4), t.mul(0.05), float(0))),
      ),
    );
    const az = select(aType.equal(4), t.mul(0.03), float(0));

    // Rotate around Y (xz plane)
    const cy = cos(ay);
    const sy = sin(ay);
    const rx = pos.x.mul(cy).sub(pos.z.mul(sy));
    const rz = pos.x.mul(sy).add(pos.z.mul(cy));

    // Rotate around Z (xy plane)
    const cz = cos(az);
    const sz = sin(az);
    const rxx = rx.mul(cz).sub(pos.y.mul(sz));
    const ry = rx.mul(sz).add(pos.y.mul(cz));
    pos.assign(vec3(rxx, ry, rz));

    // Core twist (type 0 only)
    const twist = t.mul(0.18).add(r.mul(3));
    const agentTwistBoost = select(uAgentState.equal(2), float(2), float(1));
    const twistAngle = twist.mul(0.06).mul(agentTwistBoost);
    const ct = cos(twistAngle);
    const st = sin(twistAngle);
    const twistedX = pos.x.mul(ct).sub(pos.y.mul(st));
    const twistedY = pos.x.mul(st).add(pos.y.mul(ct));
    const pulseFactor = sin(twist.mul(agentTwistBoost)).mul(0.015).mul(uPulse).add(1);
    const coreTwisted = vec3(twistedX, twistedY, pos.z).mul(pulseFactor);
    const isCore = step(float(0.5), float(1).sub(abs(aType)));
    pos.assign(mix(pos, coreTwisted, isCore));

    // Listening drift
    const listenDrift = smoothstep(float(0.5), float(1.5), uAgentState).mul(
      float(1).sub(smoothstep(float(1.5), float(2.5), uAgentState)),
    );
    pos.assign(mix(pos, pos.mul(0.92), listenDrift.mul(0.15)));

    // FBM noise displacement
    const noiseFreqMult = select(uAgentState.equal(2), float(1.8), float(1));
    const noisePos = pos.mul(1.2).add(vec3(t.mul(0.15))).mul(noiseFreqMult);
    const displacement = mx_fractal_noise_vec3(noisePos, int(4), float(2), float(0.5));

    // Ultron / error position
    const ultronPos = pos
      .mul(float(0.4).add(aSeed.mul(0.6)))
      .add(displacement.mul(float(1).add(r.mul(1.2))));

    // Respond pulse
    const respondPulse = select(
      uAgentState.equal(3),
      sin(r.mul(8).sub(uTime.mul(3))).mul(0.04),
      float(0),
    );
    const radialDir = select(r.greaterThan(0.001), normalize(pos), vec3(0, 1, 0));

    const finalPos = mix(
      pos.add(radialDir.mul(respondPulse)),
      ultronPos,
      smoothstep(float(0), float(1), uErrorState),
    );

    return finalPos;
  });

  const finalPosition = positionFn();

  /* ── Vertex: size ── */
  const sizeFn = Fn(() => {
    const t = uTime.mul(0.15);
    const baseSize = select(
      aType.equal(0),
      float(1).add(aSeed.mul(0.7)),
      select(aType.equal(2), float(1.35), select(aType.equal(3), float(1.15), float(0.85))),
    );
    const errorFlash = step(float(0.96), fract(aSeed.mul(123.4).add(t)))
      .mul(uErrorState)
      .mul(0.4);
    return baseSize.mul(float(1).add(errorFlash)).mul(uBrightness).mul(40);
  });

  /* ── Fragment: color ── */
  const vType = varying(aType, "v_type");
  const vSeed = varying(aSeed, "v_seed");
  const noiseForVarying = mx_fractal_noise_vec3(
    positionLocal.mul(1.2).add(vec3(uTime.mul(0.15).mul(0.15))),
    int(4),
    float(2),
    float(0.5),
  );
  const vDisplacement = varying(noiseForVarying, "v_disp");

  const colorFn = Fn(() => {
    // Gold variant for core + high seed
    const goldMixed = mix(
      vec3(uColorJarvis),
      vec3(1, 0.92, 0.68),
      smoothstep(float(0.72), float(1), vSeed),
    );
    const gold = select(and(vType.equal(0), vSeed.greaterThan(0.72)), goldMixed, vec3(uColorJarvis));

    // Blue variant for high seed
    const blueMixed = mix(
      vec3(uColorUltron),
      vec3(0.5, 1, 1),
      smoothstep(float(0.7), float(1), vSeed),
    );
    const blue = select(vSeed.greaterThan(0.7), blueMixed, vec3(uColorUltron));

    const col = mix(gold, blue, uErrorState);

    const intensity = select(
      vType.equal(0),
      float(1),
      select(
        vType.equal(1),
        float(0.72),
        select(vType.equal(2), float(0.82), select(vType.equal(4), float(0.38), float(0.9))),
      ),
    );
    const agentGlow = select(uAgentState.greaterThan(0.5), float(0.12), float(0));
    return col.mul(intensity.add(agentGlow));
  });

  /* ── Fragment: opacity ── */
  const opacityFn = Fn(() => {
    const pt = pointUV.sub(0.5);
    const dist = length(pt);
    const circleMask = step(dist, float(0.5));
    const alpha = pow(float(0.5).sub(dist).max(0).mul(2), float(1.5));
    const chaosFade = mix(
      float(1),
      clamp(float(1).sub(length(vDisplacement).mul(0.4)), float(0.2), float(1)),
      uErrorState,
    );
    return alpha.mul(circleMask).mul(chaosFade).mul(float(0.85).add(uErrorState.mul(0.15)));
  });

  /* ── Material ── */
  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });
  material.positionNode = finalPosition;
  material.sizeNode = sizeFn();
  material.colorNode = colorFn();
  material.opacityNode = opacityFn();

  return {
    material,
    uniforms: { uTime, uPulse, uErrorState, uColorJarvis, uColorUltron, uBrightness, uAgentState },
  };
}
