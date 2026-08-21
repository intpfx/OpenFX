import { useEffect, useId, useRef, useState } from "react";

import type { VisualPluginRendererProps } from "../visual-plugin.ts";
import { resolveTimedVisualState } from "../floating-visual-dock.ts";
import { BLOUB_VISUAL_STATES } from "../visual-plugin-catalog.ts";
import { NOTIF_BLUE } from "./vendor/decor.ts";
import { BotEngine, type BotFrame } from "./vendor/engine.ts";
import { DEMI_VIEWBOX, RAYON } from "./vendor/repere.ts";
import { mixHex } from "./vendor/skins.ts";

const BLOUB_PAPER = "#f9f9f9";
const BLOUB_INK = "#0a0a0c";

function bloubEyeKey(index: number) {
  return index === 0 ? "inner-eye" : "outer-eye";
}

function BloubDot({ dot }: Readonly<{ dot: BotFrame["dots"][number] }>) {
  const fill = dot.color ??
    (dot.depth === undefined ? BLOUB_INK : mixHex(BLOUB_PAPER, BLOUB_INK, dot.depth));

  if (dot.d) {
    return (
      <path
        d={dot.d}
        fill={fill}
        opacity={dot.opacity}
        transform={`translate(${dot.x} ${dot.y}) rotate(${
          dot.rot ?? 0
        }) scale(${RAYON})`}
      />
    );
  }

  return (
    <circle
      cx={dot.x}
      cy={dot.y}
      fill={fill}
      opacity={dot.opacity}
      r={dot.r}
    />
  );
}

function BloubSvgFrame({ frame }: Readonly<{ frame: BotFrame }>) {
  const uid = useId().replaceAll(":", "");
  const maskId = `openfx-bloub-mask-${uid}`;

  return (
    <svg
      aria-label="Bloub 动态形态"
      className="floating-visual-plugin__bloub-svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${
        DEMI_VIEWBOX * 2
      }`}
    >
      <defs>
        <mask
          height={DEMI_VIEWBOX * 2}
          id={maskId}
          maskUnits="userSpaceOnUse"
          width={DEMI_VIEWBOX * 2}
          x={-DEMI_VIEWBOX}
          y={-DEMI_VIEWBOX}
        >
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, index) => (
            <path
              d={eye.d}
              fill="#000"
              key={bloubEyeKey(index)}
              opacity={eye.alpha}
              transform={eye.matrix}
            />
          ))}
          {frame.notch
            ? (
              <circle
                cx={frame.notch.x}
                cy={frame.notch.y}
                fill="#000"
                r={frame.notch.r}
              />
            )
            : null}
        </mask>

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

      {frame.dotsBehind
        ? (
          <g>
            {frame.dots.map((dot, index) => (
              <BloubDot dot={dot} key={`behind-${index}`} />
            ))}
          </g>
        )
        : null}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={BLOUB_PAPER} />
        <g mask={`url(#${maskId})`}>
          <rect
            fill={BLOUB_INK}
            height={DEMI_VIEWBOX * 2}
            width={DEMI_VIEWBOX * 2}
            x={-DEMI_VIEWBOX}
            y={-DEMI_VIEWBOX}
          />
        </g>
      </g>

      {!frame.dotsBehind
        ? (
          <g>
            {frame.dots.map((dot, index) => (
              <BloubDot dot={dot} key={`front-${index}`} />
            ))}
          </g>
        )
        : null}

      {frame.notif
        ? (
          <circle
            cx={frame.notif.x}
            cy={frame.notif.y}
            fill={NOTIF_BLUE}
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

export function BloubVisualPlugin(
  { onStatusChange }: VisualPluginRendererProps,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BotEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new BotEngine(RAYON, "idle");
  const [frame, setFrame] = useState<BotFrame>(() => engineRef.current!.sample(0));

  useEffect(() => {
    const root = rootRef.current;
    const engine = engineRef.current;
    if (!root || !engine) return;
    const bot = engine;

    const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    let elementVisible = true;
    let pageVisible = document.visibilityState !== "hidden";
    let elapsedMs = 0;
    let lastFrameMs = 0;
    let currentIndex = 0;
    let frameRequest = 0;

    const reportState = (index: number) => {
      const state = BLOUB_VISUAL_STATES[index];
      onStatusChange({
        id: state.id,
        label: state.label,
        index,
        total: BLOUB_VISUAL_STATES.length,
      });
    };

    const drawStatic = () => {
      elapsedMs = 0;
      currentIndex = 0;
      bot.reset("idle", 0);
      setFrame(bot.sample(1));
      reportState(0);
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

      const state = resolveTimedVisualState(BLOUB_VISUAL_STATES, elapsedMs);
      const clock = elapsedMs / 1_000;
      if (state.index !== currentIndex) {
        bot.setState(state.id, clock);
        currentIndex = state.index;
        reportState(currentIndex);
      }
      setFrame(bot.sample(clock));
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
      if (reducedMotion.matches) drawStatic();
      else requestNextFrame();
    };

    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
        elementVisible = entry?.isIntersecting ?? false;
        if (!elementVisible) stop();
        else requestNextFrame();
      });

    bot.reset("idle", 0);
    setFrame(bot.sample(0));
    reportState(0);
    intersectionObserver?.observe(root);
    document.addEventListener("visibilitychange", updatePageVisibility);
    reducedMotion.addEventListener("change", updateMotion);
    if (reducedMotion.matches) drawStatic();
    else requestNextFrame();

    return () => {
      stop();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", updatePageVisibility);
      reducedMotion.removeEventListener("change", updateMotion);
    };
  }, [onStatusChange]);

  return (
    <div
      className="floating-visual-plugin__stage floating-visual-plugin__stage--bloub"
      data-visual-plugin="bloub"
      ref={rootRef}
    >
      <BloubSvgFrame frame={frame} />
    </div>
  );
}
