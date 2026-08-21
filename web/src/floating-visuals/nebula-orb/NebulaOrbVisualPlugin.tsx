import { useEffect, useRef } from "react";

import { resolveTimedVisualState } from "../floating-visual-dock.ts";
import { NEBULA_ORB_VISUAL_STATES } from "../visual-plugin-catalog.ts";
import type { VisualPluginRendererProps } from "../visual-plugin.ts";
import { renderOrb } from "./vendor/orb-engine.ts";

const NEBULA_INK = "245,245,247";

export function NebulaOrbVisualPlugin(
  { onStatusChange }: VisualPluginRendererProps,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!root || !canvas || !context) return;

    const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    let elementVisible = true;
    let pageVisible = document.visibilityState !== "hidden";
    let elapsedMs = 0;
    let lastFrameMs = 0;
    let currentIndex = 0;
    let frameRequest = 0;
    let canvasSize = 0;

    const reportState = (index: number) => {
      const state = NEBULA_ORB_VISUAL_STATES[index];
      onStatusChange({
        id: state.id,
        label: state.label,
        index,
        total: NEBULA_ORB_VISUAL_STATES.length,
      });
    };

    const resizeCanvas = () => {
      const bounds = root.getBoundingClientRect();
      const size = Math.max(1, Math.floor(Math.min(bounds.width, bounds.height)));
      const pixelRatio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
      const backingSize = Math.round(size * pixelRatio);
      if (canvas.width !== backingSize || canvas.height !== backingSize) {
        canvas.width = backingSize;
        canvas.height = backingSize;
      }
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      canvasSize = size;
    };

    const renderCurrent = () => {
      if (canvasSize <= 0) resizeCanvas();
      const state = reducedMotion.matches
        ? NEBULA_ORB_VISUAL_STATES[0]
        : resolveTimedVisualState(NEBULA_ORB_VISUAL_STATES, elapsedMs);
      canvas.dataset.state = state.id;
      renderOrb(
        context,
        canvasSize,
        reducedMotion.matches ? 0 : elapsedMs / 1_000,
        state.id,
        3,
        NEBULA_INK,
        0.6,
        "sphere",
        "AI",
        1,
        5,
        1,
        -0.45,
        0,
        0.34,
      );
    };

    const shouldAnimate = () => elementVisible && pageVisible && !reducedMotion.matches;

    const requestNextFrame = () => {
      if (frameRequest !== 0 || !shouldAnimate()) return;
      frameRequest = requestAnimationFrame(tick);
    };

    function tick(nowMs: number) {
      frameRequest = 0;
      if (!shouldAnimate()) return;
      if (lastFrameMs !== 0) {
        elapsedMs += Math.min(64, Math.max(0, nowMs - lastFrameMs));
      }
      lastFrameMs = nowMs;

      const state = resolveTimedVisualState(NEBULA_ORB_VISUAL_STATES, elapsedMs);
      if (state.index !== currentIndex) {
        currentIndex = state.index;
        reportState(currentIndex);
      }
      renderCurrent();
      requestNextFrame();
    }

    const stop = () => {
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      lastFrameMs = 0;
    };

    const updatePageVisibility = () => {
      pageVisible = document.visibilityState !== "hidden";
      if (!pageVisible) stop();
      else requestNextFrame();
    };

    const updateMotion = () => {
      stop();
      if (reducedMotion.matches) {
        elapsedMs = 0;
        currentIndex = 0;
        reportState(0);
        renderCurrent();
      } else {
        requestNextFrame();
      }
    };

    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
        elementVisible = entry?.isIntersecting ?? false;
        if (!elementVisible) stop();
        else requestNextFrame();
      });
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
        resizeCanvas();
        renderCurrent();
      });

    resizeCanvas();
    reportState(0);
    renderCurrent();
    intersectionObserver?.observe(root);
    resizeObserver?.observe(root);
    document.addEventListener("visibilitychange", updatePageVisibility);
    reducedMotion.addEventListener("change", updateMotion);
    requestNextFrame();

    return () => {
      stop();
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", updatePageVisibility);
      reducedMotion.removeEventListener("change", updateMotion);
    };
  }, [onStatusChange]);

  return (
    <div
      className="floating-visual-plugin__stage floating-visual-plugin__stage--nebula"
      data-visual-plugin="nebula-orb"
      ref={rootRef}
    >
      <canvas aria-label="Nebula-Orb 动态形态" ref={canvasRef} role="img" />
    </div>
  );
}
