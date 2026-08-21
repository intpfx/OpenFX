import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  constrainFloatingDockPosition,
  type FloatingDockPoint,
  moveFloatingDockFromPointer,
} from "./floating-visual-dock.ts";
import type {
  FloatingVisualPluginDefinition,
  VisualPluginStatus,
} from "./visual-plugin.ts";
import "./floating-visuals.css";

const POSITION_STORAGE_KEY = "openfx:floating-visual-dock-position:v1";

type ActiveDrag = Readonly<{
  pointerId: number;
  originPointer: FloatingDockPoint;
  originPosition: FloatingDockPoint;
}>;

function viewportSize() {
  const viewport = globalThis.visualViewport;
  return {
    width: viewport?.width ?? document.documentElement.clientWidth,
    height: viewport?.height ?? document.documentElement.clientHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
  };
}

function readStoredPosition(): FloatingDockPoint | null {
  try {
    const value = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) ?? "null");
    if (
      value && typeof value.x === "number" && Number.isFinite(value.x) &&
      typeof value.y === "number" && Number.isFinite(value.y)
    ) {
      return { x: value.x, y: value.y };
    }
  } catch {
    // A malformed presentation preference must never block the Web file library.
  }
  return null;
}

function storePosition(position: FloatingDockPoint) {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // The dock remains draggable when localStorage is disabled or full.
  }
}

function FloatingVisualPluginPanel(
  { plugin }: Readonly<{ plugin: FloatingVisualPluginDefinition }>,
) {
  const [status, setStatus] = useState<VisualPluginStatus>({
    id: "loading",
    label: "准备中",
    index: 0,
    total: 0,
  });
  const onStatusChange = useCallback((next: VisualPluginStatus) => {
    setStatus((current) =>
      current.id === next.id && current.index === next.index &&
        current.total === next.total
        ? current
        : next
    );
  }, []);
  const Renderer = plugin.Renderer;

  return (
    <article
      className="floating-visual-plugin"
      data-plugin-id={plugin.id}
    >
      <Renderer onStatusChange={onStatusChange} />
      <footer className="floating-visual-plugin__meta">
        <div className="floating-visual-plugin__identity">
          <span className="floating-visual-plugin__name">{plugin.name}</span>
          <span data-visual-state={status.id}>
            {status.label}
          </span>
        </div>
        <div className="floating-visual-plugin__source">
          <span className="floating-visual-plugin__count">
            {String(status.index + 1).padStart(2, "0")} /{" "}
            {String(status.total).padStart(2, "0")}
          </span>
          <a
            aria-label={`查看 ${plugin.sourceLabel} 源项目`}
            href={plugin.sourceHref}
            rel="noreferrer"
            target="_blank"
          >
            <span className="floating-visual-plugin__source-label">
              {plugin.sourceLabel}
            </span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </footer>
    </article>
  );
}

export function FloatingVisualDock(
  { plugins }: Readonly<{ plugins: readonly FloatingVisualPluginDefinition[] }>,
) {
  const dockRef = useRef<HTMLElement>(null);
  const positionRef = useRef<FloatingDockPoint | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const [position, setPosition] = useState<FloatingDockPoint | null>(null);
  const [dragging, setDragging] = useState(false);

  const updatePosition = useCallback((next: FloatingDockPoint) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const constrainCurrentPosition = useCallback(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const bounds = dock.getBoundingClientRect();
    const viewport = viewportSize();
    const current = positionRef.current ?? readStoredPosition() ?? {
      x: viewport.offsetLeft + viewport.width - bounds.width - 20,
      y: viewport.offsetTop + viewport.height - bounds.height - 20,
    };
    updatePosition(
      constrainFloatingDockPosition(current, bounds, viewport),
    );
  }, [updatePosition]);

  useEffect(() => {
    constrainCurrentPosition();
    const dock = dockRef.current;
    const resizeObserver = dock && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(constrainCurrentPosition)
      : null;
    if (dock) resizeObserver?.observe(dock);
    globalThis.addEventListener("resize", constrainCurrentPosition);
    globalThis.visualViewport?.addEventListener("resize", constrainCurrentPosition);
    globalThis.visualViewport?.addEventListener("scroll", constrainCurrentPosition);

    return () => {
      resizeObserver?.disconnect();
      globalThis.removeEventListener("resize", constrainCurrentPosition);
      globalThis.visualViewport?.removeEventListener(
        "resize",
        constrainCurrentPosition,
      );
      globalThis.visualViewport?.removeEventListener(
        "scroll",
        constrainCurrentPosition,
      );
    };
  }, [constrainCurrentPosition]);

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const dock = dockRef.current;
    if (!dock) return;
    const bounds = dock.getBoundingClientRect();
    const current = positionRef.current ?? { x: bounds.left, y: bounds.top };
    dragRef.current = {
      pointerId: event.pointerId,
      originPointer: { x: event.clientX, y: event.clientY },
      originPosition: current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const continueDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const dock = dockRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !dock) return;
    updatePosition(
      moveFloatingDockFromPointer(
        drag.originPosition,
        drag.originPointer,
        { x: event.clientX, y: event.clientY },
        dock.getBoundingClientRect(),
        viewportSize(),
      ),
    );
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    if (positionRef.current) storePosition(positionRef.current);
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    const dock = dockRef.current;
    if (!direction || !dock) return;
    event.preventDefault();
    const step = event.shiftKey ? 24 : 8;
    const current = positionRef.current ?? {
      x: dock.getBoundingClientRect().left,
      y: dock.getBoundingClientRect().top,
    };
    const next = constrainFloatingDockPosition(
      {
        x: current.x + direction[0] * step,
        y: current.y + direction[1] * step,
      },
      dock.getBoundingClientRect(),
      viewportSize(),
    );
    updatePosition(next);
    storePosition(next);
  };

  return (
    <aside
      aria-label="OpenFX 浮动视觉插件台"
      className="floating-visual-dock"
      data-dragging={dragging ? "true" : "false"}
      ref={dockRef}
      style={position
        ? { left: position.x, top: position.y }
        : { bottom: 20, right: 20 }}
    >
      <div
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        aria-label="拖动视觉插件台；方向键也可移动"
        aria-roledescription="可拖动悬浮台"
        className="floating-visual-dock__handle"
        onKeyDown={moveWithKeyboard}
        onLostPointerCapture={finishDrag}
        onPointerCancel={finishDrag}
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={finishDrag}
        role="group"
        tabIndex={0}
      >
        <span className="floating-visual-dock__eyebrow">VISUAL PLUG-INS</span>
        <span className="floating-visual-dock__hint">拖动悬浮台</span>
        <span aria-hidden="true" className="floating-visual-dock__grip">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="floating-visual-dock__plugins">
        {plugins.map((plugin) => (
          <FloatingVisualPluginPanel key={plugin.id} plugin={plugin} />
        ))}
      </div>
    </aside>
  );
}
