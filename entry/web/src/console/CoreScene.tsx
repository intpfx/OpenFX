import { useEffect, useRef, useState } from "react";

import {
  corePresentation,
  type NodeAvailability,
  selectCoreRenderer,
} from "./model.ts";

type CoreSceneProps = {
  availability: NodeAvailability;
  dimmed: boolean;
  lowPower: boolean;
};

type Particle = {
  angle: number;
  radius: number;
  speed: number;
  layer: number;
  alpha: number;
};

const createParticles = (): Particle[] => {
  let seed = 0x4f504658;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  return Array.from({ length: 420 }, (_, index) => ({
    angle: random() * Math.PI * 2,
    radius: 0.09 + random() * 0.88,
    speed: (index % 3 === 0 ? -1 : 1) * (0.018 + random() * 0.038),
    layer: index % 5,
    alpha: 0.18 + random() * 0.72,
  }));
};

export function CoreScene({ availability, dimmed, lowPower }: CoreSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(false);
  const presentation = corePresentation(availability);
  const mode = selectCoreRenderer({
    reducedMotion,
    lowPower,
    narrowViewport,
    canvasAvailable: typeof document !== "undefined" &&
      Boolean(document.createElement("canvas").getContext),
    rendererFailed,
  });

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = matchMedia("(max-width: 760px)");
    const update = () => {
      setReducedMotion(motion.matches);
      setNarrowViewport(narrow.matches);
    };
    update();
    motion.addEventListener("change", update);
    narrow.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      narrow.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (mode !== "canvas") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      setRendererFailed(true);
      return;
    }

    const particles = createParticles();
    let frame = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio, 1.5);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (timestamp: number) => {
      if (disposed) return;
      try {
        context.clearRect(0, 0, width, height);
        const size = Math.min(width, height) * 0.31;
        const centerX = width / 2;
        const centerY = height / 2;
        const time = timestamp / 1000;
        const breath = 1 +
          Math.sin(time * (Math.PI * 2 / presentation.pulseSeconds)) * 0.022;

        const glow = context.createRadialGradient(
          centerX,
          centerY,
          size * 0.05,
          centerX,
          centerY,
          size * 1.35,
        );
        glow.addColorStop(0, "rgba(112, 247, 255, .23)");
        glow.addColorStop(0.36, "rgba(42, 204, 219, .08)");
        glow.addColorStop(1, "rgba(0, 22, 30, 0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);

        context.save();
        context.translate(centerX, centerY);
        context.scale(breath, breath * 0.82);
        context.globalCompositeOperation = "lighter";
        for (const particle of particles) {
          const phase = particle.angle + time * particle.speed;
          const layerRadius = size * particle.radius;
          const wobble = Math.sin(time * 0.22 + particle.angle * 3) * size * 0.025;
          const x = Math.cos(phase) * (layerRadius + wobble);
          const y = Math.sin(phase) * layerRadius;
          const depth = 0.5 + Math.cos(phase) * 0.5;
          const pointSize = particle.layer === 0 ? 1.7 : 0.55 + depth * 0.85;
          context.fillStyle = `rgba(73, 226, 239, ${
            particle.alpha * (0.28 + depth * 0.72)
          })`;
          context.fillRect(x, y, pointSize, pointSize);
        }

        context.strokeStyle = "rgba(99, 236, 245, .17)";
        context.lineWidth = 0.7;
        for (let ring = 0; ring < 4; ring += 1) {
          context.beginPath();
          context.ellipse(
            0,
            0,
            size * (0.52 + ring * 0.17),
            size * (0.2 + ring * 0.13),
            time * 0.012 * (ring % 2 ? -1 : 1),
            0,
            Math.PI * 2,
          );
          context.stroke();
        }
        context.restore();
        frame = requestAnimationFrame(draw);
      } catch {
        setRendererFailed(true);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mode, presentation.pulseSeconds]);

  return (
    <div
      className={`console-core-scene tone-${presentation.tone}${
        dimmed ? " is-dimmed" : ""
      }`}
      data-renderer={mode}
    >
      <div className="console-core-grid" />
      {mode === "canvas"
        ? <canvas aria-hidden="true" ref={canvasRef} />
        : (
          <div className="console-static-core" aria-hidden="true">
            <i />
            <i />
            <i />
            <b />
          </div>
        )}
      <div className="console-core-caption" aria-live="polite">
        <span className="console-core-rule" />
        <strong>OPENFX CORE</strong>
        <span>{presentation.label}</span>
      </div>
    </div>
  );
}
