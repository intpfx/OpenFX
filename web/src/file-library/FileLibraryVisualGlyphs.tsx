import { type RefObject, useEffect, useId, useRef, useState } from "react";

import { BotEngine, type BotFrame } from "./visuals/bloub/engine.ts";
import { DEMI_VIEWBOX, RAYON } from "./visuals/bloub/repere.ts";
import type { StateId as BloubGlyphState } from "./visuals/bloub/states.ts";
import { renderOrb } from "./visuals/nebula-orb/orb-engine.ts";

export type { BloubGlyphState };

export type NebulaGlyphState =
  | "working"
  | "sweep"
  | "shake"
  | "listening"
  | "network"
  | "spin"
  | "breathing"
  | "twinkle"
  | "pulse"
  | "tide"
  | "aurora"
  | "spiral";

function useVisibleAnimation(
  rootRef: RefObject<HTMLElement | null>,
  draw: (elapsedSeconds: number, reducedMotion: boolean) => void,
  dependencies: readonly unknown[],
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motionPreference = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = motionPreference?.matches ?? false;
    let elementVisible = true;
    let pageVisible = document.visibilityState !== "hidden";
    let frameRequest = 0;
    let startedAt = performance.now();
    let lastDrawnAt = Number.NEGATIVE_INFINITY;

    const shouldAnimate = () => elementVisible && pageVisible && !reducedMotion;
    const stop = () => {
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    };
    const requestFrame = () => {
      if (frameRequest !== 0 || !shouldAnimate()) return;
      frameRequest = requestAnimationFrame(tick);
    };
    function tick(now: number) {
      frameRequest = 0;
      if (!shouldAnimate()) return;
      if (now - lastDrawnAt >= 1_000 / 30) {
        draw((now - startedAt) / 1_000, false);
        lastDrawnAt = now;
      }
      requestFrame();
    }
    const syncPageVisibility = () => {
      pageVisible = document.visibilityState !== "hidden";
      if (pageVisible) requestFrame();
      else stop();
    };
    const syncMotion = () => {
      reducedMotion = motionPreference?.matches ?? false;
      stop();
      startedAt = performance.now();
      draw(0, reducedMotion);
      requestFrame();
    };
    const intersection = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
        elementVisible = entry?.isIntersecting ?? false;
        if (elementVisible) requestFrame();
        else stop();
      });

    intersection?.observe(root);
    document.addEventListener("visibilitychange", syncPageVisibility);
    motionPreference?.addEventListener("change", syncMotion);
    draw(0, reducedMotion);
    requestFrame();
    return () => {
      stop();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", syncPageVisibility);
      motionPreference?.removeEventListener("change", syncMotion);
    };
    // draw is intentionally refreshed only with the caller's semantic dependencies.
    // deno-lint-ignore react-hooks/exhaustive-deps
  }, dependencies);
}

function BloubFrame({ frame }: Readonly<{ frame: BotFrame }>) {
  const uid = useId().replaceAll(":", "");
  return (
    <svg
      aria-hidden="true"
      className="file-library-bloub-glyph-svg"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${
        DEMI_VIEWBOX * 2
      }`}
    >
      <defs>
        {frame.arcs.map((arc) => (
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}-${arc.id}`}
            key={arc.id}
            x1={arc.grad.x1}
            x2={arc.grad.x2}
            y1={arc.grad.y1}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((color, index) => (
              <stop
                key={`${color}-${index}`}
                offset={index / Math.max(1, arc.grad.stops.length - 1)}
                stopColor={color}
              />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            d={arc.back}
            key={`back-${arc.id}`}
            opacity={arc.opacity}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
          />
        ))}
      </g>
      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill="currentColor" />
        {frame.eyes.map((eye, index) => (
          <path
            className="file-library-bloub-glyph-eye"
            d={eye.d}
            key={index === 0 ? "inner-eye" : "outer-eye"}
            opacity={eye.alpha}
            transform={eye.matrix}
          />
        ))}
      </g>
      <g fill="currentColor">
        {frame.dots.map((dot, index) =>
          dot.d
            ? (
              <path
                d={dot.d}
                key={index}
                opacity={dot.opacity}
                transform={`translate(${dot.x} ${dot.y}) rotate(${
                  dot.rot ?? 0
                }) scale(${RAYON})`}
              />
            )
            : (
              <circle
                cx={dot.x}
                cy={dot.y}
                key={index}
                opacity={dot.opacity}
                r={dot.r}
              />
            )
        )}
      </g>
      {frame.notif
        ? (
          <circle
            className="file-library-bloub-glyph-notification"
            cx={frame.notif.x}
            cy={frame.notif.y}
            r={frame.notif.r}
          />
        )
        : null}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            d={arc.front}
            key={`front-${arc.id}`}
            opacity={arc.opacity}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
          />
        ))}
      </g>
    </svg>
  );
}

export function BloubGlyph(props: {
  state: BloubGlyphState;
  label: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef(new BotEngine(RAYON, props.state));
  const stateRef = useRef(props.state);
  const [frame, setFrame] = useState(() => engineRef.current.sample(0));

  useVisibleAnimation(
    rootRef,
    (elapsed, reducedMotion) => {
      const engine = engineRef.current;
      if (stateRef.current !== props.state) {
        if (reducedMotion) engine.reset(props.state, elapsed);
        else engine.setState(props.state, elapsed);
        stateRef.current = props.state;
      }
      setFrame(engine.sample(elapsed));
    },
    [props.state],
  );

  return (
    <span
      aria-label={props.label}
      className={`file-library-bloub-glyph is-${props.state}`}
      data-state={props.state}
      ref={rootRef}
      role="img"
    >
      <BloubFrame frame={frame} />
    </span>
  );
}

export function NebulaOrbGlyph(props: {
  state: NebulaGlyphState;
  label: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useVisibleAnimation(
    rootRef,
    (elapsed, reducedMotion) => {
      const root = rootRef.current;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!root || !canvas || !context) return;
      const size = Math.max(
        1,
        Math.floor(Math.min(root.clientWidth, root.clientHeight)),
      );
      const ratio = Math.min(2, Math.max(1, devicePixelRatio || 1));
      const backingSize = Math.round(size * ratio);
      if (canvas.width !== backingSize || canvas.height !== backingSize) {
        canvas.width = backingSize;
        canvas.height = backingSize;
      }
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const ink = getComputedStyle(root).color.match(/[\d.]+/g)?.slice(0, 3)
        .map((channel) => String(Math.round(Number(channel))))
        .join(",") ?? "16,24,32";
      renderOrb(
        context,
        size,
        reducedMotion ? 0 : elapsed,
        props.state,
        1.35,
        ink,
        0.7,
        "sphere",
        "AI",
        1,
        5,
        1.15,
        -0.45,
        0,
        0.34,
      );
    },
    [props.state],
  );

  return (
    <span
      aria-label={props.label}
      className={`file-library-nebula-glyph is-${props.state}`}
      data-state={props.state}
      ref={rootRef}
      role="img"
    >
      <canvas aria-hidden="true" ref={canvasRef} />
    </span>
  );
}
