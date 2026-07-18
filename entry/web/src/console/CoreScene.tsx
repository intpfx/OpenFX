import { useEffect, useRef, useState } from "react";

import { detectWebGLSupport, startCoreRenderer } from "./core-renderer.ts";
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

export function CoreScene({ availability, dimmed, lowPower }: CoreSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
  const [narrowViewport, setNarrowViewport] = useState(() =>
    globalThis.matchMedia?.("(max-width: 760px)").matches ?? false
  );
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const presentation = corePresentation(availability);
  const mode = selectCoreRenderer({
    reducedMotion,
    lowPower,
    narrowViewport,
    webglAvailable: webglAvailable === true,
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
    if (
      webglAvailable !== null || reducedMotion || lowPower || narrowViewport
    ) return;
    setWebglAvailable(detectWebGLSupport());
  }, [lowPower, narrowViewport, reducedMotion, webglAvailable]);

  useEffect(() => {
    if (mode !== "webgl") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startCoreRenderer(canvas, {
      pulseSeconds: presentation.pulseSeconds,
      onFailure: () => setRendererFailed(true),
    });
  }, [mode, presentation.pulseSeconds]);

  return (
    <div
      className={`console-core-scene tone-${presentation.tone}${
        dimmed ? " is-dimmed" : ""
      }`}
      data-renderer={mode}
    >
      <div className="console-core-grid" />
      {mode === "webgl"
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
