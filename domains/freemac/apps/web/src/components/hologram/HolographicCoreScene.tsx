import { useEffect, useRef, useState } from "react";
import { Clock, Color, FogExp2, Group, PerspectiveCamera, Points, Scene } from "three";
import { WebGPURenderer, PostProcessing } from "three/webgpu";
import {
  pass,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  Fn,
  screenUV,
  sin,
  dot,
  fract,
  length,
  smoothstep,
  convertToTexture,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { damp } from "maath/easing";
import type { CoreVisualProfile } from "../../hooks/useFreemacState";
import { createJarvisCoreGeometry, createParticleNodeMaterial } from "./JarvisParticleCore";

export interface RendererInfo {
  activeRenderer: "webgpu" | "webgl" | "static";
  preferredBackend: "webgpu" | "webgl";
  webgpuAvailable: boolean;
}

export type CoreLayerId =
  | "core-pulse"
  | "stability-lattice"
  | "memory-band"
  | "network-band"
  | "telemetry-field";

interface Props {
  hoveredLayerId: CoreLayerId | null;
  onHoverChange: (id: CoreLayerId | null) => void;
  profile: CoreVisualProfile;
  onRendererInfoChange: (info: RendererInfo) => void;
  onRuntimeError: (message: string | null) => void;
  onSelectionChange: (id: CoreLayerId) => void;
  selectedLayerId: CoreLayerId;
}

export function HolographicCoreScene({
  hoveredLayerId,
  onHoverChange,
  profile,
  onRendererInfoChange,
  onRuntimeError,
  onSelectionChange,
  selectedLayerId,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef(profile);
  const hoveredLayerRef = useRef<CoreLayerId | null>(hoveredLayerId);
  const selectedLayerRef = useRef<CoreLayerId>(selectedLayerId);
  const onHoverChangeRef = useRef(onHoverChange);
  const onRendererInfoChangeRef = useRef(onRendererInfoChange);
  const onRuntimeErrorRef = useRef(onRuntimeError);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const [fallbackMode, setFallbackMode] = useState(false);

  profileRef.current = profile;
  hoveredLayerRef.current = hoveredLayerId;
  selectedLayerRef.current = selectedLayerId;
  onHoverChangeRef.current = onHoverChange;
  onRendererInfoChangeRef.current = onRendererInfoChange;
  onRuntimeErrorRef.current = onRuntimeError;
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const browserNavigator = navigator as Navigator & { gpu?: unknown };
    let animationFrameId = 0;
    let renderer: WebGPURenderer | null = null;
    let postProc: PostProcessing | null = null;
    let resizeHandler: (() => void) | null = null;
    let disposed = false;

    const scene = new Scene();
    scene.background = new Color("#020409");
    scene.fog = new FogExp2("#020409", 0.085);

    const camera = new PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 11.5);

    const clock = new Clock();
    let totalElapsed = 0;
    const coreRoot = new Group();
    const { material: particleMaterial, uniforms: pu } = createParticleNodeMaterial();
    const particleCore = new Points(createJarvisCoreGeometry(), particleMaterial);
    particleCore.scale.setScalar(1.28);

    coreRoot.add(particleCore);
    scene.add(coreRoot);

    // Post-processing uniforms
    const bloomStrengthU = uniform(0.8);
    const uDistortion = uniform(0.04);
    const uVignetteStrength = uniform(1.2);
    const uPostTime = uniform(0);

    async function init() {
      renderer = new WebGPURenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        forceWebGL: true,
      });
      await renderer.init();
      if (disposed) {
        renderer.dispose();
        renderer = null;
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      container!.appendChild(renderer.domElement);

      // Node-based post-processing pipeline
      const scenePass = pass(scene, camera);
      const beauty = scenePass.getTextureNode();
      const bloomGlow = bloom(beauty, bloomStrengthU as any, 0.62, 0.12);
      const withBloom = convertToTexture(beauty.add(bloomGlow));

      const cinematicOutput = Fn(() => {
        const p = screenUV;
        const r = p.sub(0.5);
        const cr = length(r);

        // Chromatic aberration
        const amount = uDistortion.mul(0.04).mul(cr);
        const uvR = p.add(r.mul(amount));
        const uvB = p.sub(r.mul(amount));

        const colorR = withBloom.sample(uvR).r;
        const colorG = withBloom.sample(p).g;
        const colorB = withBloom.sample(uvB).b;
        const col = vec3(colorR, colorG, colorB);

        // Subtle film grain
        const grain = fract(
          sin(dot(p.mul(uPostTime), vec2(12.9898, 78.233))).mul(43758.5453),
        ).mul(float(0.008).add(uDistortion.mul(0.02)));

        // Vignette — gentle falloff preserving center brightness
        const vig = smoothstep(float(2.0), float(0.15), cr.mul(uVignetteStrength));

        return vec4(col.add(grain).mul(vig), 1);
      })();

      postProc = new PostProcessing(renderer);
      postProc.outputNode = cinematicOutput;

      resizeHandler = () => {
        if (!renderer || !container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resizeHandler();
      window.addEventListener("resize", resizeHandler);
      onRuntimeErrorRef.current(null);
      onRendererInfoChangeRef.current({
        activeRenderer: "webgpu",
        preferredBackend: "webgpu",
        webgpuAvailable: true,
      });

      const animate = () => {
        if (disposed || !postProc) {
          return;
        }

        animationFrameId = window.requestAnimationFrame(animate);

        const delta = clock.getDelta();
        totalElapsed += delta;
        const elapsed = totalElapsed;
        const nextProfile = profileRef.current;
        const pulse = nextProfile.pulse;
        const lockDimming = nextProfile.locked ? 0.86 : 1;
        const cpuRatio = Math.min(1.2, nextProfile.cpuPercent / 100);
        const memoryRatio = Math.min(1.2, nextProfile.memoryRatio / 100);
        const depthFactor = Math.min(1, nextProfile.conversationDepth / 20);
        const batteryBrightness = nextProfile.batteryPercent / 100;

        coreRoot.rotation.y = elapsed * (0.015 + pulse * 0.008);
        coreRoot.rotation.x = Math.sin(elapsed * 0.06) * 0.012;
        particleCore.rotation.z = elapsed * (0.02 + memoryRatio * 0.01);

        // Particle uniforms
        pu.uTime.value = elapsed;
        pu.uPulse.value = 0.3 + pulse * 0.3 + cpuRatio * 0.05;
        pu.uErrorState.value = nextProfile.errorActive ? 0.24 : 0;
        const batteryDim = 0.6 + batteryBrightness * 0.4;
        const criticalFlicker =
          nextProfile.batteryPercent < 10
            ? 1 - Math.random() * 0.15 * (1 - nextProfile.batteryPercent / 10)
            : 1;
        pu.uBrightness.value =
          (0.92 + cpuRatio * 0.1 + memoryRatio * 0.06) *
          lockDimming *
          batteryDim *
          criticalFlicker;

        const agentStateMap = { idle: 0, listening: 1, thinking: 2, responding: 3 } as const;
        pu.uAgentState.value = agentStateMap[nextProfile.agentState] ?? 0;

        const toneColor =
          nextProfile.tone === "error"
            ? new Color("#ff6b4a")
            : nextProfile.tone === "success"
              ? new Color("#ffd37a")
              : nextProfile.tone === "running"
                ? new Color("#ffc05c")
                : new Color("#ffb347");

        if (depthFactor > 0) {
          toneColor.lerp(new Color("#ffcc66"), depthFactor * 0.3);
        }

        pu.uColorJarvis.value.copy(toneColor);
        pu.uColorUltron.value.copy(
          nextProfile.errorActive ? new Color("#c8f3ff") : new Color("#ffe7b0"),
        );

        // Camera sway
        const desiredCameraX = Math.sin(elapsed * 0.07) * 0.06;
        const desiredCameraY = Math.sin(elapsed * 0.09 + 0.7) * 0.04;
        const desiredCameraZ = 10.9 - pulse * 0.06 - depthFactor * 0.4;
        damp(camera.position, "x", desiredCameraX, 0.25, delta);
        damp(camera.position, "y", desiredCameraY, 0.25, delta);
        damp(camera.position, "z", desiredCameraZ, 0.2, delta);
        camera.lookAt(0, Math.sin(elapsed * 0.1) * 0.04, 0);

        // Bloom damping
        const targetBloomStrength = nextProfile.errorActive
          ? 0.6 + Math.sin(elapsed * 10) * 0.08
          : 0.35 +
            pulse * 0.08 +
            cpuRatio * 0.06 +
            (nextProfile.agentState === "thinking" || nextProfile.agentState === "responding"
              ? 0.12
              : 0) +
            depthFactor * 0.08;
        damp(bloomStrengthU, "value", targetBloomStrength, 0.15, delta);

        // Cinematic uniforms
        uPostTime.value = elapsed;
        uDistortion.value =
          (nextProfile.errorActive ? 0.35 : 0.04) +
          pulse * 0.06 +
          (cpuRatio > 0.8 ? 0.08 : 0);
        uVignetteStrength.value = nextProfile.locked ? 1.8 : 1.2;

        postProc.renderAsync();
      };

      animate();
    }

    init().catch((err) => {
      if (disposed) return;
      setFallbackMode(true);
      onRuntimeErrorRef.current(
        err instanceof Error ? err.message : "WebGPU renderer initialization failed.",
      );
      onRendererInfoChangeRef.current({
        activeRenderer: "static",
        preferredBackend: browserNavigator.gpu ? "webgpu" : "webgl",
        webgpuAvailable: Boolean(browserNavigator.gpu),
      });
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      postProc?.dispose();
      renderer?.dispose();
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="core-scene-wrap">
      <div className="core-scene" ref={containerRef} />
      <div className="core-scene__veil" />
      <div className="core-scene__scanlines" />
      <div className="core-scene__vignette" />
      {fallbackMode && (
        <div className="core-scene__fallback">
          <div className="core-scene__fallback-orb" />
          <p>3D renderer unavailable. Showing static core shell.</p>
        </div>
      )}
    </div>
  );
}
