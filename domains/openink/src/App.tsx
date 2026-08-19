import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CursorClick,
  DownloadSimple,
  Eraser,
  FilePlus,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  commitHistory,
  commitStroke,
  createDrawingDocument,
  createHistory,
  type DocumentHistory,
  findStrokeAtPoint,
  type NativeStroke,
  parseDrawingDocument,
  redoHistory,
  removeStrokes,
  serializeDrawingDocument,
  type StrokePoint,
  type StrokeTransform,
  undoHistory,
  updateStrokeTransform,
} from "./drawing-document.ts";
import { downloadPng, downloadSvg } from "./export-document.ts";
import { getStrokeBounds, strokeToSvgPath } from "./stroke-renderer.ts";

const STORAGE_KEY = "openink.document.v1";
const DEFAULT_INK = "#18201c";

type Tool = "pen" | "select" | "eraser";

type DrawGesture = Readonly<{
  kind: "draw";
  pointerId: number;
  stroke: NativeStroke;
}>;

type EraseGesture = Readonly<{
  kind: "erase";
  pointerId: number;
  strokeIds: ReadonlySet<string>;
}>;

type TransformGesture = Readonly<{
  kind: "move" | "scale";
  pointerId: number;
  strokeId: string;
  startPoint: Readonly<{ x: number; y: number }>;
  startTransform: StrokeTransform;
  previewTransform: StrokeTransform;
  startDistance?: number;
}>;

type Gesture = DrawGesture | EraseGesture | TransformGesture;

function now(): string {
  return new Date().toISOString();
}

function createEmptyDocument() {
  const width = Math.max(360, Math.round(globalThis.innerWidth || 1200));
  const height = Math.max(520, Math.round((globalThis.innerHeight || 840) - 68));
  return createDrawingDocument({
    id: crypto.randomUUID(),
    now: now(),
    width,
    height,
  });
}

function loadInitialHistory(): DocumentHistory {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) return createHistory(parseDrawingDocument(stored));
  } catch {
    // A damaged or blocked local store must not prevent opening a fresh canvas.
  }
  return createHistory(createEmptyDocument());
}

function pressureForEvent(event: ReactPointerEvent<SVGSVGElement>): number {
  return event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5;
}

function pointForEvent(
  svg: SVGSVGElement,
  event: Readonly<{ clientX: number; clientY: number }>,
) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: event.clientX, y: event.clientY };
  const transformed = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    matrix.inverse(),
  );
  return { x: transformed.x, y: transformed.y };
}

function ToolButton(
  props: Readonly<{
    active?: boolean;
    disabled?: boolean;
    label: string;
    onClick: () => void;
    children: ReactNode;
  }>,
) {
  return (
    <button
      type="button"
      className="tool-button"
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
      <span>{props.label}</span>
    </button>
  );
}

export function App() {
  const [history, setHistory] = useState(loadInitialHistory);
  const [tool, setTool] = useState<Tool>("pen");
  const [brushSize, setBrushSize] = useState(14);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [gestureState, setGestureState] = useState<Gesture | null>(null);
  const [revision, setRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState(() =>
    history.present.strokes.length > 0 ? "已从此浏览器恢复" : "尚未落笔"
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const canvasRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const document = history.present;

  function setGesture(gesture: Gesture | null) {
    gestureRef.current = gesture;
    setGestureState(gesture);
  }

  function markChanged() {
    setRevision((current) => current + 1);
    setSaveStatus("正在保存");
  }

  function commitDocument(nextDocument: typeof document) {
    if (nextDocument === document) return;
    setHistory((current) => commitHistory(current, nextDocument));
    markChanged();
  }

  function undo() {
    if (history.past.length === 0) return;
    setHistory((current) => undoHistory(current));
    setSelectedStrokeId(null);
    markChanged();
  }

  function redo() {
    if (history.future.length === 0) return;
    setHistory((current) => redoHistory(current));
    setSelectedStrokeId(null);
    markChanged();
  }

  useEffect(() => {
    if (revision === 0) return;
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        serializeDrawingDocument(history.present),
      );
      setSaveStatus("已保存在此浏览器");
    } catch {
      setSaveStatus("本机保存失败");
    }
  }, [history.present, revision]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedStrokeId) return;
        event.preventDefault();
        commitDocument(removeStrokes(document, new Set([selectedStrokeId]), now()));
        setSelectedStrokeId(null);
        return;
      }
      if (event.key.toLowerCase() === "p") setTool("pen");
      if (event.key.toLowerCase() === "v") setTool("select");
      if (event.key.toLowerCase() === "e") setTool("eraser");
    }
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  });

  function beginGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const svg = canvasRef.current;
    if (!svg) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    const point = pointForEvent(svg, event);

    if (tool === "pen") {
      const sample: StrokePoint = {
        ...point,
        pressure: pressureForEvent(event),
        time: performance.now(),
      };
      setSelectedStrokeId(null);
      setGesture({
        kind: "draw",
        pointerId: event.pointerId,
        stroke: {
          id: crypto.randomUUID(),
          points: [sample],
          brush: {
            color: DEFAULT_INK,
            size: brushSize,
            thinning: 0.58,
            smoothing: 0.72,
            streamline: 0.62,
            simulatePressure: event.pointerType !== "pen",
          },
          transform: { x: 0, y: 0, scale: 1 },
        },
      });
      return;
    }

    if (tool === "eraser") {
      const hit = findStrokeAtPoint(document, point);
      const strokeIds = new Set(hit ? [hit.id] : []);
      setSelectedStrokeId(null);
      setGesture({ kind: "erase", pointerId: event.pointerId, strokeIds });
      return;
    }

    const hit = findStrokeAtPoint(document, point);
    setSelectedStrokeId(hit?.id ?? null);
    if (hit) {
      setGesture({
        kind: "move",
        pointerId: event.pointerId,
        strokeId: hit.id,
        startPoint: point,
        startTransform: hit.transform,
        previewTransform: hit.transform,
      });
    }
  }

  function continueGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = canvasRef.current;
    const gesture = gestureRef.current;
    if (!svg || !gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointForEvent(svg, event);

    if (gesture.kind === "draw") {
      const previous = gesture.stroke.points.at(-1);
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.35) {
        return;
      }
      setGesture({
        ...gesture,
        stroke: {
          ...gesture.stroke,
          points: [...gesture.stroke.points, {
            ...point,
            pressure: pressureForEvent(event),
            time: performance.now(),
          }],
        },
      });
      return;
    }

    if (gesture.kind === "erase") {
      const hit = findStrokeAtPoint(document, point);
      if (!hit || gesture.strokeIds.has(hit.id)) return;
      setGesture({ ...gesture, strokeIds: new Set([...gesture.strokeIds, hit.id]) });
      return;
    }

    if (gesture.kind === "move") {
      setGesture({
        ...gesture,
        previewTransform: {
          ...gesture.startTransform,
          x: gesture.startTransform.x + point.x - gesture.startPoint.x,
          y: gesture.startTransform.y + point.y - gesture.startPoint.y,
        },
      });
      return;
    }

    const distance = Math.max(
      1,
      Math.hypot(
        point.x - gesture.startTransform.x,
        point.y - gesture.startTransform.y,
      ),
    );
    const startDistance = Math.max(1, gesture.startDistance ?? distance);
    setGesture({
      ...gesture,
      previewTransform: {
        ...gesture.startTransform,
        scale: gesture.startTransform.scale * distance / startDistance,
      },
    });
  }

  function finishGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const svg = canvasRef.current;
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    setGesture(null);
    if (gesture.kind === "draw") {
      commitDocument(commitStroke(document, gesture.stroke, now()));
    } else if (gesture.kind === "erase") {
      commitDocument(removeStrokes(document, gesture.strokeIds, now()));
    } else {
      commitDocument(
        updateStrokeTransform(
          document,
          gesture.strokeId,
          gesture.previewTransform,
          now(),
        ),
      );
    }
  }

  function cancelGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    setGesture(null);
  }

  const selectedStroke = document.strokes.find((stroke) =>
    stroke.id === selectedStrokeId
  );
  const selectedTransform = gestureState &&
      (gestureState.kind === "move" || gestureState.kind === "scale") &&
      gestureState.strokeId === selectedStrokeId
    ? gestureState.previewTransform
    : selectedStroke?.transform;
  const displayStrokes: NativeStroke[] = [];
  for (const stroke of document.strokes) {
    if (gestureState?.kind === "erase" && gestureState.strokeIds.has(stroke.id)) {
      continue;
    }
    displayStrokes.push(
      stroke.id === selectedStrokeId && selectedTransform
        ? { ...stroke, transform: selectedTransform }
        : stroke,
    );
  }
  const selectedDisplayStroke = displayStrokes.find((stroke) =>
    stroke.id === selectedStrokeId
  );
  const selectedBounds = selectedDisplayStroke
    ? getStrokeBounds(selectedDisplayStroke)
    : null;

  function beginScale(event: ReactPointerEvent<SVGCircleElement>) {
    const svg = canvasRef.current;
    if (!svg || !selectedDisplayStroke || !selectedBounds) return;
    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture(event.pointerId);
    const point = pointForEvent(svg, event);
    const startTransform = selectedDisplayStroke.transform;
    setGesture({
      kind: "scale",
      pointerId: event.pointerId,
      strokeId: selectedDisplayStroke.id,
      startPoint: point,
      startTransform,
      previewTransform: startTransform,
      startDistance: Math.max(
        1,
        Math.hypot(
          point.x - startTransform.x,
          point.y - startTransform.y,
        ),
      ),
    });
  }

  function createNewDocument() {
    if (
      document.strokes.length > 0 &&
      !globalThis.confirm("新建画稿会替换当前本机画稿，仍要继续吗？")
    ) return;
    setHistory(createHistory(createEmptyDocument()));
    setSelectedStrokeId(null);
    setExportOpen(false);
    markChanged();
  }

  function removeSelectedStroke() {
    if (!selectedStrokeId) return;
    commitDocument(removeStrokes(document, new Set([selectedStrokeId]), now()));
    setSelectedStrokeId(null);
  }

  async function exportPng() {
    setExportStatus("正在生成 PNG");
    try {
      await downloadPng(document);
      setExportStatus("PNG 已下载");
      setExportOpen(false);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "PNG 导出失败");
    }
  }

  return (
    <main className="openink-app">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">OI</span>
          <div>
            <strong>OpenInk</strong>
            <span>本地画稿 · {document.strokes.length} 笔</span>
          </div>
        </div>
        <div className="document-status" aria-live="polite">
          <span className="save-dot" aria-hidden="true" />
          {saveStatus}
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-button"
            aria-label="新建画稿"
            onClick={createNewDocument}
          >
            <FilePlus aria-hidden="true" size={19} />
            <span>新建</span>
          </button>
          <div className="export-control">
            <button
              type="button"
              className="topbar-button is-primary"
              aria-label="导出画稿"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((current) => !current)}
            >
              <DownloadSimple aria-hidden="true" size={19} />
              <span>导出</span>
            </button>
            {exportOpen
              ? (
                <div className="export-menu">
                  <button type="button" onClick={() => downloadSvg(document)}>
                    <strong>SVG</strong>
                    <span>保留可缩放轮廓</span>
                  </button>
                  <button type="button" onClick={exportPng}>
                    <strong>PNG</strong>
                    <span>最高 2× 清晰度</span>
                  </button>
                </div>
              )
              : null}
          </div>
        </div>
      </header>

      <section className="studio">
        <nav className="tool-rail" aria-label="绘图工具">
          <ToolButton
            active={tool === "pen"}
            label="画笔 P"
            onClick={() => setTool("pen")}
          >
            <PencilSimple aria-hidden="true" size={23} weight="regular" />
          </ToolButton>
          <ToolButton
            active={tool === "select"}
            label="选择 V"
            onClick={() => setTool("select")}
          >
            <CursorClick aria-hidden="true" size={23} weight="regular" />
          </ToolButton>
          <ToolButton
            active={tool === "eraser"}
            label="橡皮 E"
            onClick={() => setTool("eraser")}
          >
            <Eraser aria-hidden="true" size={23} weight="regular" />
          </ToolButton>
          <span className="tool-divider" aria-hidden="true" />
          <ToolButton label="撤销" disabled={history.past.length === 0} onClick={undo}>
            <ArrowCounterClockwise aria-hidden="true" size={23} />
          </ToolButton>
          <ToolButton
            label="重做"
            disabled={history.future.length === 0}
            onClick={redo}
          >
            <ArrowClockwise aria-hidden="true" size={23} />
          </ToolButton>
          <ToolButton
            label="删除所选"
            disabled={!selectedStrokeId}
            onClick={removeSelectedStroke}
          >
            <Trash aria-hidden="true" size={22} />
          </ToolButton>
        </nav>

        <div className="canvas-stage">
          <div
            className="canvas-frame"
            style={{ aspectRatio: `${document.width} / ${document.height}` }}
          >
            <svg
              ref={canvasRef}
              className={`ink-canvas tool-${tool}`}
              viewBox={`0 0 ${document.width} ${document.height}`}
              role="application"
              aria-label="OpenInk 绘图画布"
              onPointerDown={beginGesture}
              onPointerMove={continueGesture}
              onPointerUp={finishGesture}
              onPointerCancel={cancelGesture}
            >
              <rect className="paper-background" width="100%" height="100%" />
              {displayStrokes.map((stroke) => (
                <path
                  key={stroke.id}
                  className={stroke.id === selectedStrokeId ? "is-selected" : undefined}
                  d={strokeToSvgPath(stroke, true)}
                  fill={stroke.brush.color}
                  transform={`translate(${stroke.transform.x} ${stroke.transform.y}) scale(${stroke.transform.scale})`}
                />
              ))}
              {gestureState?.kind === "draw"
                ? (
                  <path
                    d={strokeToSvgPath(gestureState.stroke, false)}
                    fill={gestureState.stroke.brush.color}
                  />
                )
                : null}
              {selectedBounds
                ? (
                  <g className="selection-outline">
                    <rect
                      x={selectedBounds.x}
                      y={selectedBounds.y}
                      width={selectedBounds.width}
                      height={selectedBounds.height}
                    />
                    <circle
                      cx={selectedBounds.x + selectedBounds.width}
                      cy={selectedBounds.y + selectedBounds.height}
                      r={11}
                      onPointerDown={beginScale}
                    />
                  </g>
                )
                : null}
            </svg>
            {document.strokes.length === 0 && gestureState?.kind !== "draw"
              ? (
                <div className="empty-hint" aria-hidden="true">
                  <span>落笔即保存</span>
                  <strong>用鼠标、触控或 Apple Pencil 开始</strong>
                </div>
              )
              : null}
          </div>
          <div className="canvas-caption" aria-live="polite">
            <span>{tool === "pen" ? "画笔" : tool === "select" ? "选择" : "橡皮"}</span>
            <span>{exportStatus}</span>
          </div>
        </div>

        <aside className="inspector" aria-label="画笔设置">
          <div className="inspector-heading">
            <span>画笔</span>
            <strong>{brushSize}px</strong>
          </div>
          <label className="size-control">
            <span>粗细</span>
            <input
              type="range"
              aria-label="画笔粗细"
              min="4"
              max="36"
              step="1"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.currentTarget.value))}
            />
          </label>
          <div className="ink-sample" aria-hidden="true">
            <span style={{ height: Math.max(4, brushSize * 0.72) }} />
          </div>
          <div className="inspector-copy">
            <span>原始笔迹</span>
            <p>每个压力点都会保留。移动或缩放只改变变换，不会破坏原始轨迹。</p>
          </div>
          <dl className="shortcut-list">
            <div>
              <dt>P / V / E</dt>
              <dd>切换工具</dd>
            </div>
            <div>
              <dt>⌘ Z</dt>
              <dd>撤销</dd>
            </div>
            <div>
              <dt>⇧ ⌘ Z</dt>
              <dd>重做</dd>
            </div>
            <div>
              <dt>Delete</dt>
              <dd>删除所选</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
