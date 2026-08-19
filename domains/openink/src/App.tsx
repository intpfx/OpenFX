import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  CaretUp,
  Check,
  Copy,
  CursorClick,
  DownloadSimple,
  Eraser,
  Eye,
  EyeSlash,
  FilePlus,
  ImageSquare,
  Lock,
  LockOpen,
  PencilSimple,
  Plus,
  Selection,
  Stack,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  addDrawingLayer,
  applyMaterialPreset,
  commitHistory,
  commitImportedInkLayer,
  commitStroke,
  type ContentSelection,
  createDrawingDocument,
  createHistory,
  type DocumentHistory,
  type DocumentMaterial,
  type DrawingDocument,
  duplicateDrawingDocument,
  findContentAtPoint,
  findStrokeAtPoint,
  MATERIAL_PRESET_LABELS,
  MATERIAL_PRESET_ORDER,
  moveDrawingLayer,
  type NativeStroke,
  parseDrawingDocument,
  redoHistory,
  removeContentSelection,
  removeDrawingLayer,
  removeStrokes,
  renameDrawingDocument,
  renameDrawingLayer,
  serializeDrawingDocument,
  setActiveDrawingLayer,
  setDrawingLayerLocked,
  setDrawingLayerVisibility,
  type StrokePoint,
  transformContentSelection,
  undoHistory,
  updateDocumentMaterial,
} from "./drawing-document.ts";
import {
  loadInkSdfAsset,
  storeInkDerivatives,
  storePhotoSource,
} from "./drawing-assets.ts";
import {
  activateDrawingDocument,
  bootstrapDrawingLibrary,
  type DrawingLibrarySnapshot,
  persistDrawingDocument,
} from "./drawing-library.ts";
import { downloadPng, downloadSvg } from "./export-document.ts";
import { createInkMaskDataUrl, createInkMaskUrl } from "./ink-mask-image.ts";
import { renderInkSdf } from "./ink-sdf.ts";
import { applyLassoSelection } from "./lasso-operation.ts";
import { getContentSelectionBounds } from "./lasso-selection.ts";
import { createOpfsTextStore } from "./opfs-text-store.ts";
import {
  createPhotoCleanupProcessor,
  type PhotoCleanupProcessor,
} from "./photo-cleanup-client.ts";
import {
  PhotoCleanupWorkspace,
  type PhotoImportCommit,
} from "./PhotoCleanupWorkspace.tsx";
import { type DecodedPhoto, decodePhotoFile } from "./photo-import.ts";
import { type RenderedInkLayer, strokeToSvgPath } from "./stroke-renderer.ts";

const STORAGE_KEY = "openink.document.v1";
const DEFAULT_INK = "#18201c";
const DRAWING_STORE = createOpfsTextStore();
const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Tool = "pen" | "select" | "lasso" | "eraser";

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
  selection: ContentSelection;
  startPoint: Readonly<{ x: number; y: number }>;
  origin: Readonly<{ x: number; y: number }>;
  startDocument: DrawingDocument;
  previewDocument: DrawingDocument;
  startDistance?: number;
}>;

type LassoGesture = Readonly<{
  kind: "lasso";
  pointerId: number;
  points: readonly Readonly<{ x: number; y: number }>[];
}>;

type Gesture = DrawGesture | EraseGesture | TransformGesture | LassoGesture;

type PhotoImportSession = Readonly<{
  photo: DecodedPhoto;
  processor: PhotoCleanupProcessor;
}>;

type InkLayerVisual = Readonly<{
  url: string;
  width: number;
  height: number;
}>;

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

function loadLegacyDocument() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) return parseDrawingDocument(stored);
  } catch {
    // A damaged or blocked legacy store must not prevent opening OpenInk.
  }
  return null;
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

function selectionHasContent(selection: ContentSelection): boolean {
  return selection.strokeIds.length > 0 || selection.layerIds.length > 0;
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

const MATERIAL_PATTERN_IDS: Readonly<
  Partial<Record<DocumentMaterial["preset"], string>>
> = {
  blackboard: "openink-blackboard-dust",
  blueprint: "openink-blueprint-grid",
  letterpress: "openink-letterpress-fibers",
  paper: "openink-paper-rule",
  pixels: "openink-pixels-grid",
  sketch: "openink-sketch-hatch",
  warhol: "openink-warhol-dots",
};

function MaterialPatternDefinitions(
  props: Readonly<{ material: DocumentMaterial }>,
) {
  const material = props.material;
  switch (material.preset) {
    case "blackboard":
      return (
        <pattern
          id="openink-blackboard-dust"
          width="42"
          height="42"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="8" cy="11" r="1.2" fill={material.foreground} opacity="0.07" />
          <circle cx="31" cy="28" r="0.8" fill={material.foreground} opacity="0.05" />
        </pattern>
      );
    case "blueprint":
      return (
        <pattern
          id="openink-blueprint-grid"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M32 0H0V32"
            fill="none"
            stroke={material.foreground}
            strokeOpacity="0.09"
            strokeWidth="1"
          />
        </pattern>
      );
    case "letterpress":
      return (
        <pattern
          id="openink-letterpress-fibers"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M-4 7L9 -2M3 26L26 3M18 29L29 18"
            stroke={material.foreground}
            strokeOpacity="0.035"
            strokeWidth="1"
          />
        </pattern>
      );
    case "paper":
      return (
        <pattern
          id="openink-paper-rule"
          width="100"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 35.5H100"
            stroke="#6c9aab"
            strokeOpacity="0.18"
            strokeWidth="1"
          />
        </pattern>
      );
    case "pixels":
      return (
        <pattern
          id="openink-pixels-grid"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M16 0H0V16"
            fill="none"
            stroke="#202524"
            strokeOpacity="0.08"
            strokeWidth="1"
            shapeRendering="crispEdges"
          />
        </pattern>
      );
    case "sketch":
      return (
        <pattern
          id="openink-sketch-hatch"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(18)"
        >
          <path
            d="M0 0V18M9 0V18"
            stroke="#3b3b38"
            strokeOpacity="0.035"
            strokeWidth="1"
          />
        </pattern>
      );
    case "warhol":
      return (
        <pattern
          id="openink-warhol-dots"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="7" cy="7" r="4.5" fill="#ffe447" opacity="0.78" />
          <circle cx="21" cy="21" r="4.5" fill="#52e5ca" opacity="0.58" />
        </pattern>
      );
    default:
      return null;
  }
}

function MaterialBackdrop(props: Readonly<{ material: DocumentMaterial }>) {
  const id = MATERIAL_PATTERN_IDS[props.material.preset];
  return id ? <rect width="100%" height="100%" fill={`url(#${id})`} /> : null;
}

function MaterialSlider(
  props: Readonly<{
    label: string;
    value: number;
    onPreview: (value: number) => void;
    onCommit: (value: number) => void;
  }>,
) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <label className="material-slider">
      <span>{props.label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={draft}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          setDraft(value);
          props.onPreview(value);
        }}
        onPointerUp={() => props.onCommit(draft)}
        onKeyUp={() => props.onCommit(draft)}
        onBlur={() => props.onCommit(draft)}
      />
      <strong>{Math.round(draft * 100)}</strong>
    </label>
  );
}

function DrawingThumbnail(
  props: Readonly<{ document: DocumentHistory["present"] }>,
) {
  const [visuals, setVisuals] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void Promise.all(props.document.importedInkLayers.map(async (layer) => {
      const sdf = await loadInkSdfAsset(DRAWING_STORE, layer.sdfAssetId);
      const mask = renderInkSdf(sdf, {
        thickness: layer.cleanup.thickness,
        softness: 0.35,
      });
      const url = await createInkMaskUrl(mask, props.document.material.foreground);
      urls.push(url);
      return [layer.id, url] as const;
    })).then((entries) => {
      if (active) setVisuals(Object.fromEntries(entries));
    }, () => {
      if (active) setVisuals({});
    });
    return () => {
      active = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [props.document]);
  const strokesById = new Map(
    props.document.strokes.map((stroke) => [stroke.id, stroke]),
  );
  const importedById = new Map(
    props.document.importedInkLayers.map((layer) => [layer.id, layer]),
  );
  return (
    <svg
      viewBox={`0 0 ${props.document.width} ${props.document.height}`}
      role="img"
      aria-label={`${props.document.title} 缩略图`}
    >
      <defs>
        <MaterialPatternDefinitions material={props.document.material} />
      </defs>
      <rect width="100%" height="100%" fill={props.document.material.background} />
      <MaterialBackdrop material={props.document.material} />
      {props.document.drawingLayers.map((layer) =>
        layer.visible
          ? (
            <g key={layer.id} data-openink-layer={layer.id}>
              {layer.content.map((reference) => {
                if (reference.kind === "stroke") {
                  const stroke = strokesById.get(reference.id);
                  return stroke
                    ? (
                      <path
                        key={reference.id}
                        d={strokeToSvgPath(stroke, true)}
                        fill={props.document.material.foreground}
                        transform={`translate(${stroke.transform.x} ${stroke.transform.y}) scale(${stroke.transform.scale})`}
                      />
                    )
                    : null;
                }
                const imported = importedById.get(reference.id);
                return imported && visuals[reference.id]
                  ? (
                    <image
                      key={reference.id}
                      href={visuals[reference.id]}
                      width={imported.width}
                      height={imported.height}
                      transform={`translate(${imported.transform.x} ${imported.transform.y}) scale(${imported.transform.scale})`}
                    />
                  )
                  : null;
              })}
            </g>
          )
          : null
      )}
    </svg>
  );
}

function formatUpdatedAt(value: string): string {
  return UPDATED_AT_FORMATTER.format(new Date(value));
}

export function App() {
  const [initial] = useState(() => {
    const legacyDocument = loadLegacyDocument();
    return {
      legacyDocument,
      history: createHistory(legacyDocument ?? createEmptyDocument()),
    };
  });
  const [history, setHistory] = useState(initial.history);
  const [library, setLibrary] = useState<DrawingLibrarySnapshot | null>(null);
  const [storageMode, setStorageMode] = useState<"loading" | "opfs" | "legacy">(
    "loading",
  );
  const [tool, setTool] = useState<Tool>("pen");
  const [brushSize, setBrushSize] = useState(14);
  const [selection, setSelection] = useState<ContentSelection>({
    strokeIds: [],
    layerIds: [],
  });
  const [gestureState, setGestureState] = useState<Gesture | null>(null);
  const [saveStatus, setSaveStatus] = useState("正在打开本机画稿库");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [layerRenameValue, setLayerRenameValue] = useState("");
  const [photoSession, setPhotoSession] = useState<PhotoImportSession | null>(null);
  const [inkLayerVisuals, setInkLayerVisuals] = useState<
    Readonly<Record<string, InkLayerVisual>>
  >({});
  const [materialPreview, setMaterialPreview] = useState<DocumentMaterial | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const libraryRef = useRef<DrawingLibrarySnapshot | null>(null);
  const bootPromiseRef = useRef<ReturnType<typeof bootstrapDrawingLibrary> | null>(
    null,
  );
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRequestRef = useRef(0);
  const document = history.present;
  const displayMaterial = materialPreview ?? document.material;
  const activeDrawingLayer =
    document.drawingLayers.find((layer) => layer.id === document.activeLayerId) ??
      document.drawingLayers[0];
  const selectedStrokeIds = new Set(selection.strokeIds);
  const selectedLayerIds = new Set(selection.layerIds);

  function setGesture(gesture: Gesture | null) {
    gestureRef.current = gesture;
    setGestureState(gesture);
  }

  function queueLibraryMutation(
    operation: (
      snapshot: DrawingLibrarySnapshot,
    ) => Promise<DrawingLibrarySnapshot>,
    successMessage: string,
  ): Promise<DrawingLibrarySnapshot> {
    const request = ++saveRequestRef.current;
    setSaveStatus("正在保存到本机");
    const result = saveQueueRef.current.then(async () => {
      const current = libraryRef.current;
      if (!current) throw new Error("OpenInk 本机画稿库尚未就绪");
      const next = await operation(current);
      libraryRef.current = next;
      setLibrary(next);
      return next;
    });
    saveQueueRef.current = result.then(() => undefined, () => undefined);
    void result.then(
      () => {
        if (saveRequestRef.current === request) setSaveStatus(successMessage);
      },
      (error) => {
        if (saveRequestRef.current === request) {
          setSaveStatus(error instanceof Error ? error.message : "本机保存失败");
        }
      },
    );
    return result;
  }

  function saveDocument(nextDocument: typeof document) {
    if (storageMode === "legacy") {
      try {
        globalThis.localStorage?.setItem(
          STORAGE_KEY,
          serializeDrawingDocument(nextDocument),
        );
        setSaveStatus("已使用兼容存储保存");
      } catch {
        setSaveStatus("本机保存失败");
      }
      return;
    }
    if (!libraryRef.current) return;
    void queueLibraryMutation(
      (snapshot) => persistDrawingDocument(DRAWING_STORE, snapshot, nextDocument),
      "已保存在本机画稿库",
    );
  }

  function commitDocument(nextDocument: typeof document) {
    if (nextDocument === document) return;
    setHistory((current) => commitHistory(current, nextDocument));
    saveDocument(nextDocument);
  }

  function persistDocumentViewState(nextDocument: typeof document) {
    if (nextDocument === document) return;
    setHistory((current) => ({ ...current, present: nextDocument }));
    saveDocument(nextDocument);
  }

  function undo() {
    if (history.past.length === 0) return;
    const next = undoHistory(history);
    setHistory(next);
    setSelection({ strokeIds: [], layerIds: [] });
    setMaterialPreview(null);
    saveDocument(next.present);
  }

  function redo() {
    if (history.future.length === 0) return;
    const next = redoHistory(history);
    setHistory(next);
    setSelection({ strokeIds: [], layerIds: [] });
    setMaterialPreview(null);
    saveDocument(next.present);
  }

  useEffect(() => {
    let active = true;
    bootPromiseRef.current ??= bootstrapDrawingLibrary(DRAWING_STORE, {
      legacyDocument: initial.legacyDocument,
      createFresh: () => initial.history.present,
    });
    void bootPromiseRef.current.then(
      ({ snapshot, migratedLegacy }) => {
        if (!active) return;
        const activeItem = snapshot.items.find((item) =>
          item.document.id === snapshot.activeDocumentId
        );
        if (!activeItem) throw new Error("OpenInk 活动画稿缺失");
        libraryRef.current = snapshot;
        setLibrary(snapshot);
        setHistory(createHistory(activeItem.document));
        setStorageMode("opfs");
        if (migratedLegacy) {
          try {
            globalThis.localStorage?.removeItem(STORAGE_KEY);
          } catch {
            // The durable OPFS copy already exists; a stale legacy copy is harmless.
          }
        }
        setSaveStatus(
          migratedLegacy ? "旧画稿已迁移到本机画稿库" : "本机画稿库已就绪",
        );
      },
      (error) => {
        if (!active) return;
        setStorageMode("legacy");
        setSaveStatus(
          error instanceof Error
            ? `${error.message} · 使用兼容存储`
            : "OPFS 不可用 · 使用兼容存储",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [initial]);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void Promise.all(
      document.importedInkLayers.map(async (layer) => {
        const sdf = await loadInkSdfAsset(DRAWING_STORE, layer.sdfAssetId);
        const mask = renderInkSdf(sdf, {
          thickness: layer.cleanup.thickness,
          softness: 0.35,
        });
        const url = await createInkMaskUrl(mask, displayMaterial.foreground);
        urls.push(url);
        return [layer.id, { url, width: mask.width, height: mask.height }] as const;
      }),
    ).then(
      (entries) => {
        if (!active) return;
        setInkLayerVisuals(Object.fromEntries(entries));
      },
      (error) => {
        if (!active) return;
        setExportStatus(
          error instanceof Error
            ? `${error.message} · 照片墨迹稍后重试`
            : "照片墨迹加载失败",
        );
        setInkLayerVisuals({});
      },
    );
    return () => {
      active = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [
    document.importedInkLayers,
    displayMaterial.foreground,
  ]);

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
        if (!selectionHasContent(selection)) return;
        event.preventDefault();
        commitDocument(removeContentSelection(document, selection, now()));
        setSelection({ strokeIds: [], layerIds: [] });
        return;
      }
      if (event.key === "Escape") {
        setSelection({ strokeIds: [], layerIds: [] });
        return;
      }
      if (event.key.toLowerCase() === "p") setTool("pen");
      if (event.key.toLowerCase() === "v") setTool("select");
      if (event.key.toLowerCase() === "l") setTool("lasso");
      if (event.key.toLowerCase() === "e") setTool("eraser");
    }
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  });

  function beginGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (storageMode === "loading") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const svg = canvasRef.current;
    if (!svg) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    const point = pointForEvent(svg, event);

    if (tool === "pen") {
      if (!activeDrawingLayer?.visible || activeDrawingLayer.locked) {
        setSaveStatus(
          activeDrawingLayer?.locked ? "当前图层已锁定" : "当前图层已隐藏",
        );
        return;
      }
      const sample: StrokePoint = {
        ...point,
        pressure: pressureForEvent(event),
        time: performance.now(),
      };
      setSelection({ strokeIds: [], layerIds: [] });
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
      setSelection({ strokeIds: [], layerIds: [] });
      setGesture({ kind: "erase", pointerId: event.pointerId, strokeIds });
      return;
    }

    if (tool === "lasso") {
      setSelection({ strokeIds: [], layerIds: [] });
      setGesture({ kind: "lasso", pointerId: event.pointerId, points: [point] });
      return;
    }

    const hit = findContentAtPoint(document, point);
    const nextSelection: ContentSelection = {
      strokeIds: hit?.kind === "stroke" ? [hit.id] : [],
      layerIds: hit?.kind === "importedInk" ? [hit.id] : [],
    };
    setSelection(nextSelection);
    if (selectionHasContent(nextSelection)) {
      setGesture({
        kind: "move",
        pointerId: event.pointerId,
        selection: nextSelection,
        startPoint: point,
        origin: point,
        startDocument: document,
        previewDocument: document,
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

    if (gesture.kind === "lasso") {
      const previous = gesture.points.at(-1);
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1) {
        return;
      }
      setGesture({ ...gesture, points: [...gesture.points, point] });
      return;
    }

    if (gesture.kind === "move") {
      setGesture({
        ...gesture,
        previewDocument: transformContentSelection(
          gesture.startDocument,
          gesture.selection,
          {
            origin: gesture.origin,
            translate: {
              x: point.x - gesture.startPoint.x,
              y: point.y - gesture.startPoint.y,
            },
            scale: 1,
          },
          gesture.startDocument.updatedAt,
        ),
      });
      return;
    }

    const distance = Math.max(
      1,
      Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y),
    );
    const startDistance = Math.max(1, gesture.startDistance ?? distance);
    setGesture({
      ...gesture,
      previewDocument: transformContentSelection(
        gesture.startDocument,
        gesture.selection,
        {
          origin: gesture.origin,
          translate: { x: 0, y: 0 },
          scale: distance / startDistance,
        },
        gesture.startDocument.updatedAt,
      ),
    });
  }

  async function finishLasso(gesture: LassoGesture) {
    if (gesture.points.length < 3) {
      setSelection({ strokeIds: [], layerIds: [] });
      return;
    }
    setSaveStatus("正在切分套索中的照片墨迹");
    try {
      const result = await applyLassoSelection(
        DRAWING_STORE,
        document,
        gesture.points,
        {
          createLayerId: () => crypto.randomUUID(),
          now: now(),
        },
      );
      if (result.document !== document) commitDocument(result.document);
      setSelection(result.selection);
      setSaveStatus(
        selectionHasContent(result.selection) ? "套索内容已选中" : "套索内没有可选墨迹",
      );
    } catch (error) {
      setSelection({ strokeIds: [], layerIds: [] });
      setSaveStatus(error instanceof Error ? error.message : "套索切分失败");
    }
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
    } else if (gesture.kind === "lasso") {
      void finishLasso(gesture);
    } else {
      commitDocument({ ...gesture.previewDocument, updatedAt: now() });
    }
  }

  function cancelGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    setGesture(null);
  }

  const displayDocument = gestureState &&
      (gestureState.kind === "move" || gestureState.kind === "scale")
    ? gestureState.previewDocument
    : document;
  const displayStrokes: NativeStroke[] = [];
  for (const stroke of displayDocument.strokes) {
    if (gestureState?.kind === "erase" && gestureState.strokeIds.has(stroke.id)) {
      continue;
    }
    displayStrokes.push(stroke);
  }
  const displayStrokesById = new Map(
    displayStrokes.map((stroke) => [stroke.id, stroke]),
  );
  const displayImportedById = new Map(
    displayDocument.importedInkLayers.map((layer) => [layer.id, layer]),
  );
  const visibleContentCount = displayDocument.drawingLayers
    .filter((layer) => layer.visible)
    .reduce((total, layer) => total + layer.content.length, 0);
  const selectedBounds = getContentSelectionBounds(displayDocument, selection);

  function beginScale(event: ReactPointerEvent<SVGCircleElement>) {
    const svg = canvasRef.current;
    if (!svg || !selectedBounds || !selectionHasContent(selection)) return;
    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture(event.pointerId);
    const point = pointForEvent(svg, event);
    const origin = { x: selectedBounds.x, y: selectedBounds.y };
    setGesture({
      kind: "scale",
      pointerId: event.pointerId,
      selection,
      startPoint: point,
      origin,
      startDocument: document,
      previewDocument: document,
      startDistance: Math.max(
        1,
        Math.hypot(point.x - origin.x, point.y - origin.y),
      ),
    });
  }

  function openDrawing(documentId: string) {
    if (!libraryRef.current || documentId === libraryRef.current.activeDocumentId) {
      setLibraryOpen(false);
      return;
    }
    setGesture(null);
    setSelection({ strokeIds: [], layerIds: [] });
    setMaterialPreview(null);
    void queueLibraryMutation(
      (snapshot) => activateDrawingDocument(DRAWING_STORE, snapshot, documentId),
      "画稿已打开",
    ).then(
      (snapshot) => {
        const active = snapshot.items.find((item) =>
          item.document.id === snapshot.activeDocumentId
        );
        if (active) setHistory(createHistory(active.document));
        setLibraryOpen(false);
      },
      () => undefined,
    );
  }

  function createNewDocument() {
    if (!libraryRef.current) return;
    const fresh = createEmptyDocument();
    setGesture(null);
    setSelection({ strokeIds: [], layerIds: [] });
    setMaterialPreview(null);
    setExportOpen(false);
    void queueLibraryMutation(
      (snapshot) => persistDrawingDocument(DRAWING_STORE, snapshot, fresh),
      "新画稿已保存在本机",
    ).then(
      () => {
        setHistory(createHistory(fresh));
        setLibraryOpen(false);
      },
      () => undefined,
    );
  }

  function duplicateDocument(documentId: string) {
    let duplicatedId = "";
    void queueLibraryMutation(
      (snapshot) => {
        const source = snapshot.items.find((item) => item.document.id === documentId);
        if (!source) return Promise.reject(new Error("OpenInk 画稿不存在"));
        const duplicated = duplicateDrawingDocument(source.document, {
          id: crypto.randomUUID(),
          now: now(),
        });
        duplicatedId = duplicated.id;
        return persistDrawingDocument(DRAWING_STORE, snapshot, duplicated);
      },
      "画稿副本已创建",
    ).then(
      (snapshot) => {
        const duplicated = snapshot.items.find((item) =>
          item.document.id === duplicatedId
        );
        if (duplicated) setHistory(createHistory(duplicated.document));
        setLibraryOpen(false);
      },
      () => undefined,
    );
  }

  function startRename(documentId: string, title: string) {
    setRenamingId(documentId);
    setRenameValue(title);
  }

  function commitRename(documentId: string) {
    void queueLibraryMutation(
      (snapshot) => {
        const source = snapshot.items.find((item) => item.document.id === documentId);
        if (!source) return Promise.reject(new Error("OpenInk 画稿不存在"));
        let renamed;
        try {
          renamed = renameDrawingDocument(source.document, renameValue, now());
        } catch (error) {
          return Promise.reject(error);
        }
        return persistDrawingDocument(DRAWING_STORE, snapshot, renamed, {
          activate: false,
        });
      },
      "画稿已重命名",
    ).then(
      (snapshot) => {
        setRenamingId(null);
        if (snapshot.activeDocumentId === documentId) {
          const active = snapshot.items.find((item) => item.document.id === documentId);
          if (active) setHistory(createHistory(active.document));
        }
      },
      () => undefined,
    );
  }

  function createLayer() {
    commitDocument(
      addDrawingLayer(
        document,
        {
          id: crypto.randomUUID(),
          name: `图层 ${document.drawingLayers.length + 1}`,
        },
        now(),
      ),
    );
    setSelection({ strokeIds: [], layerIds: [] });
  }

  function activateLayer(layerId: string) {
    const next = setActiveDrawingLayer(document, layerId);
    persistDocumentViewState(next);
    setSelection({ strokeIds: [], layerIds: [] });
  }

  function startLayerRename(layerId: string, name: string) {
    setRenamingLayerId(layerId);
    setLayerRenameValue(name);
  }

  function commitLayerRename(layerId: string) {
    try {
      commitDocument(renameDrawingLayer(document, layerId, layerRenameValue, now()));
      setRenamingLayerId(null);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "图层重命名失败");
    }
  }

  function reorderLayer(layerId: string, targetIndex: number) {
    commitDocument(moveDrawingLayer(document, layerId, targetIndex, now()));
  }

  function toggleLayerVisibility(layerId: string, visible: boolean) {
    commitDocument(setDrawingLayerVisibility(document, layerId, visible, now()));
    setSelection({ strokeIds: [], layerIds: [] });
  }

  function toggleLayerLock(layerId: string, locked: boolean) {
    commitDocument(setDrawingLayerLocked(document, layerId, locked, now()));
    setSelection({ strokeIds: [], layerIds: [] });
  }

  function deleteLayer(layerId: string) {
    const layer = document.drawingLayers.find((candidate) => candidate.id === layerId);
    if (!layer || document.drawingLayers.length === 1) return;
    if (
      layer.content.length > 0 &&
      !globalThis.confirm(`删除“${layer.name}”及其中 ${layer.content.length} 项内容？`)
    ) {
      return;
    }
    try {
      commitDocument(removeDrawingLayer(document, layerId, now()));
      setSelection({ strokeIds: [], layerIds: [] });
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "图层删除失败");
    }
  }

  async function beginPhotoImport(file: File) {
    if (storageMode !== "opfs") {
      setSaveStatus("照片原图需要 OPFS，本机画稿库尚不可用");
      return;
    }
    if (!activeDrawingLayer?.visible || activeDrawingLayer.locked) {
      setSaveStatus(
        activeDrawingLayer?.locked ? "当前图层已锁定" : "当前图层已隐藏",
      );
      return;
    }
    setSaveStatus("正在读取照片，仅在本机处理");
    let decoded: DecodedPhoto | null = null;
    try {
      decoded = await decodePhotoFile(file);
      const processor = await createPhotoCleanupProcessor(decoded.processingImage);
      setPhotoSession({ photo: decoded, processor });
      setSaveStatus("照片已进入本机清理工作区");
    } catch (error) {
      if (decoded) URL.revokeObjectURL(decoded.previewUrl);
      setSaveStatus(error instanceof Error ? error.message : "照片读取失败");
    }
  }

  function closePhotoImport() {
    if (!photoSession) return;
    photoSession.processor.dispose();
    URL.revokeObjectURL(photoSession.photo.previewUrl);
    setPhotoSession(null);
  }

  async function commitPhotoImport(commit: PhotoImportCommit) {
    if (!photoSession) return;
    setSaveStatus("正在保存原图、蒙版与 SDF");
    try {
      const [source, derivatives] = await Promise.all([
        storePhotoSource(DRAWING_STORE, {
          bytes: photoSession.photo.bytes,
          mimeType: photoSession.photo.mimeType,
          width: photoSession.photo.sourceWidth,
          height: photoSession.photo.sourceHeight,
        }),
        storeInkDerivatives(DRAWING_STORE, commit.result),
      ]);
      const scale = Math.min(
        1,
        document.width * 0.82 / commit.result.mask.width,
        document.height * 0.82 / commit.result.mask.height,
      );
      const layer = {
        id: crypto.randomUUID(),
        source,
        ...derivatives,
        width: commit.result.mask.width,
        height: commit.result.mask.height,
        crop: commit.crop,
        cleanup: commit.settings,
        transform: {
          x: (document.width - commit.result.mask.width * scale) / 2,
          y: (document.height - commit.result.mask.height * scale) / 2,
          scale,
        },
      };
      commitDocument(commitImportedInkLayer(document, layer, now()));
      closePhotoImport();
      setSaveStatus("照片墨迹已加入画稿，原图保留在本机");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "照片墨迹保存失败");
    }
  }

  function selectMaterialPreset(preset: DocumentMaterial["preset"]) {
    setMaterialPreview(null);
    if (document.material.preset === preset) return;
    commitDocument(applyMaterialPreset(document, preset, now()));
  }

  function previewMaterial(
    key: "textureStrength" | "edgeSoftness" | "bleed",
    value: number,
  ) {
    setMaterialPreview({ ...document.material, [key]: value });
  }

  function commitMaterial(
    key: "textureStrength" | "edgeSoftness" | "bleed",
    value: number,
  ) {
    setMaterialPreview(null);
    if (document.material[key] === value) return;
    commitDocument(updateDocumentMaterial(document, { [key]: value }, now()));
  }

  function removeSelectedContent() {
    if (!selectionHasContent(selection)) return;
    commitDocument(removeContentSelection(document, selection, now()));
    setSelection({ strokeIds: [], layerIds: [] });
  }

  async function renderInkLayersForExport(): Promise<readonly RenderedInkLayer[]> {
    const visibleIds = new Set<string>();
    for (const layer of document.drawingLayers) {
      if (!layer.visible) continue;
      for (const reference of layer.content) {
        if (reference.kind === "importedInk") visibleIds.add(reference.id);
      }
    }
    const renderTasks: Promise<RenderedInkLayer>[] = [];
    for (const layer of document.importedInkLayers) {
      if (!visibleIds.has(layer.id)) continue;
      renderTasks.push((async () => {
        const sdf = await loadInkSdfAsset(DRAWING_STORE, layer.sdfAssetId);
        const mask = renderInkSdf(sdf, {
          thickness: layer.cleanup.thickness,
          softness: 0.35,
        });
        return {
          id: layer.id,
          dataUrl: createInkMaskDataUrl(mask, document.material.foreground),
        };
      })());
    }
    return await Promise.all(renderTasks);
  }

  async function exportSvg() {
    setExportStatus("正在生成 SVG");
    try {
      downloadSvg(document, await renderInkLayersForExport());
      setExportStatus("SVG 已下载");
      setExportOpen(false);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "SVG 导出失败");
    }
  }

  async function exportPng() {
    setExportStatus("正在生成 PNG");
    try {
      await downloadPng(document, await renderInkLayersForExport());
      setExportStatus("PNG 已下载");
      setExportOpen(false);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "PNG 导出失败");
    }
  }

  const libraryItems = library
    ? library.items.toSorted((left, right) =>
      right.document.updatedAt.localeCompare(left.document.updatedAt)
    )
    : [];

  return (
    <main className="openink-app">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">OI</span>
          <div>
            <strong>OpenInk</strong>
            <span>
              {document.title} · {document.strokes.length} 笔 ·{" "}
              {document.importedInkLayers.length}
              张照片墨迹 · {document.drawingLayers.length} 层
            </span>
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
            aria-label="导入纸张照片"
            disabled={storageMode !== "opfs" || !activeDrawingLayer?.visible ||
              activeDrawingLayer.locked}
            onClick={() => photoInputRef.current?.click()}
          >
            <ImageSquare aria-hidden="true" size={19} />
            <span>照片</span>
          </button>
          <input
            ref={photoInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void beginPhotoImport(file);
            }}
          />
          <button
            type="button"
            className="topbar-button"
            aria-label="打开图层面板"
            aria-expanded={layersOpen}
            onClick={() => {
              setLibraryOpen(false);
              setLayersOpen(true);
            }}
          >
            <Stack aria-hidden="true" size={19} />
            <span>图层</span>
          </button>
          <button
            type="button"
            className="topbar-button"
            aria-label="打开画稿库"
            aria-expanded={libraryOpen}
            disabled={!library}
            onClick={() => {
              setLayersOpen(false);
              setLibraryOpen(true);
            }}
          >
            <Stack aria-hidden="true" size={19} />
            <span>画稿</span>
          </button>
          <button
            type="button"
            className="topbar-button"
            aria-label="新建画稿"
            disabled={!library}
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
                  <button type="button" onClick={() => void exportSvg()}>
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

      {photoSession
        ? (
          <PhotoCleanupWorkspace
            photo={photoSession.photo}
            processor={photoSession.processor}
            material={displayMaterial}
            onCancel={closePhotoImport}
            onConfirm={(commit) => void commitPhotoImport(commit)}
          />
        )
        : null}

      {libraryOpen && library
        ? (
          <>
            <button
              type="button"
              className="library-scrim"
              aria-label="关闭画稿库"
              onClick={() => setLibraryOpen(false)}
            />
            <aside className="library-panel" aria-label="本机画稿库">
              <div className="library-heading">
                <div>
                  <span>本机画稿库</span>
                  <strong>{library.items.length} 张画稿</strong>
                </div>
                <button
                  type="button"
                  aria-label="关闭画稿库"
                  onClick={() => setLibraryOpen(false)}
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </div>
              <div className="drawing-list">
                {libraryItems.map((item) => {
                  const isActive = item.document.id === library.activeDocumentId;
                  const isRenaming = item.document.id === renamingId;
                  return (
                    <article
                      key={item.document.id}
                      className={`drawing-card${isActive ? " is-active" : ""}`}
                    >
                      <button
                        type="button"
                        className="drawing-preview"
                        aria-label={`打开${item.document.title}`}
                        onClick={() => openDrawing(item.document.id)}
                      >
                        <DrawingThumbnail document={item.document} />
                      </button>
                      {isRenaming
                        ? (
                          <form
                            className="rename-row"
                            onSubmit={(event) => {
                              event.preventDefault();
                              commitRename(item.document.id);
                            }}
                          >
                            <input
                              autoFocus
                              aria-label="画稿名称"
                              maxLength={80}
                              value={renameValue}
                              onChange={(event) =>
                                setRenameValue(event.currentTarget.value)}
                            />
                            <button type="submit" aria-label="确认重命名">
                              <Check aria-hidden="true" size={17} />
                            </button>
                            <button
                              type="button"
                              aria-label="取消重命名"
                              onClick={() => setRenamingId(null)}
                            >
                              <X aria-hidden="true" size={17} />
                            </button>
                          </form>
                        )
                        : (
                          <div className="drawing-meta">
                            <button
                              type="button"
                              className="drawing-name"
                              onClick={() => openDrawing(item.document.id)}
                            >
                              <strong>{item.document.title}</strong>
                              <span>{formatUpdatedAt(item.document.updatedAt)}</span>
                            </button>
                            <div className="drawing-actions">
                              <button
                                type="button"
                                aria-label={`重命名${item.document.title}`}
                                title="重命名"
                                onClick={() =>
                                  startRename(item.document.id, item.document.title)}
                              >
                                <PencilSimple aria-hidden="true" size={16} />
                              </button>
                              <button
                                type="button"
                                aria-label={`复制${item.document.title}`}
                                title="复制"
                                onClick={() => duplicateDocument(item.document.id)}
                              >
                                <Copy aria-hidden="true" size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                className="library-new"
                onClick={createNewDocument}
              >
                <FilePlus aria-hidden="true" size={18} />
                新建空白画稿
              </button>
              <p className="library-note">原稿与修订只保存在此浏览器的 OPFS 中。</p>
            </aside>
          </>
        )
        : null}

      {layersOpen
        ? (
          <>
            <button
              type="button"
              className="layer-scrim"
              aria-label="关闭图层面板"
              onClick={() => setLayersOpen(false)}
            />
            <aside className="layer-panel" aria-label="画稿图层">
              <div className="layer-panel-heading">
                <div>
                  <span>画稿图层</span>
                  <strong>{activeDrawingLayer?.name ?? "墨迹"}</strong>
                </div>
                <button
                  type="button"
                  aria-label="关闭图层面板"
                  onClick={() => setLayersOpen(false)}
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </div>
              <div className="layer-list">
                {[...document.drawingLayers].reverse().map((layer) => {
                  const index = document.drawingLayers.findIndex((candidate) =>
                    candidate.id === layer.id
                  );
                  const active = layer.id === document.activeLayerId;
                  if (renamingLayerId === layer.id) {
                    return (
                      <form
                        key={layer.id}
                        className="layer-rename-row"
                        onSubmit={(event) => {
                          event.preventDefault();
                          commitLayerRename(layer.id);
                        }}
                      >
                        <input
                          autoFocus
                          aria-label="图层名称"
                          maxLength={40}
                          value={layerRenameValue}
                          onChange={(event) =>
                            setLayerRenameValue(event.currentTarget.value)}
                        />
                        <button type="submit" aria-label="确认图层名称">
                          <Check aria-hidden="true" size={17} />
                        </button>
                        <button
                          type="button"
                          aria-label="取消图层重命名"
                          onClick={() => setRenamingLayerId(null)}
                        >
                          <X aria-hidden="true" size={17} />
                        </button>
                      </form>
                    );
                  }
                  return (
                    <article
                      key={layer.id}
                      className={`layer-row${active ? " is-active" : ""}${
                        !layer.visible ? " is-hidden" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="layer-activate"
                        aria-pressed={active}
                        onClick={() => activateLayer(layer.id)}
                      >
                        <span className="layer-swatch" aria-hidden="true" />
                        <span>
                          <strong>{layer.name}</strong>
                          <small>{layer.content.length} 项内容</small>
                        </span>
                      </button>
                      <div className="layer-actions">
                        <button
                          type="button"
                          aria-label={layer.visible
                            ? `隐藏${layer.name}`
                            : `显示${layer.name}`}
                          title={layer.visible ? "隐藏" : "显示"}
                          onClick={() =>
                            toggleLayerVisibility(layer.id, !layer.visible)}
                        >
                          {layer.visible
                            ? <Eye aria-hidden="true" size={16} />
                            : <EyeSlash aria-hidden="true" size={16} />}
                        </button>
                        <button
                          type="button"
                          aria-label={layer.locked
                            ? `解锁${layer.name}`
                            : `锁定${layer.name}`}
                          title={layer.locked ? "解锁" : "锁定"}
                          onClick={() => toggleLayerLock(layer.id, !layer.locked)}
                        >
                          {layer.locked
                            ? <Lock aria-hidden="true" size={16} />
                            : <LockOpen aria-hidden="true" size={16} />}
                        </button>
                        <button
                          type="button"
                          aria-label={`上移${layer.name}`}
                          title="上移"
                          disabled={index === document.drawingLayers.length - 1}
                          onClick={() => reorderLayer(layer.id, index + 1)}
                        >
                          <CaretUp aria-hidden="true" size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`下移${layer.name}`}
                          title="下移"
                          disabled={index === 0}
                          onClick={() => reorderLayer(layer.id, index - 1)}
                        >
                          <CaretDown aria-hidden="true" size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`重命名${layer.name}`}
                          title="重命名"
                          onClick={() => startLayerRename(layer.id, layer.name)}
                        >
                          <PencilSimple aria-hidden="true" size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`删除${layer.name}`}
                          title="删除"
                          disabled={document.drawingLayers.length === 1}
                          onClick={() => deleteLayer(layer.id)}
                        >
                          <Trash aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button type="button" className="layer-new" onClick={createLayer}>
                <Plus aria-hidden="true" size={18} />
                新建图层
              </button>
              <p className="layer-note">
                隐藏层不会显示或导出；锁定层不可选择、套索或擦除。
              </p>
            </aside>
          </>
        )
        : null}

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
            active={tool === "lasso"}
            label="套索 L"
            onClick={() => setTool("lasso")}
          >
            <Selection aria-hidden="true" size={23} weight="regular" />
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
            disabled={!selectionHasContent(selection)}
            onClick={removeSelectedContent}
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
              <defs>
                <filter
                  id="openink-live-material"
                  x="-8%"
                  y="-8%"
                  width="116%"
                  height="116%"
                >
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.72"
                    numOctaves={2}
                    seed={23}
                    result="openink-live-noise"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="openink-live-noise"
                    scale={displayMaterial.bleed * 8}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="openink-live-displaced"
                  />
                  <feGaussianBlur
                    in="openink-live-displaced"
                    stdDeviation={displayMaterial.edgeSoftness * 1.25}
                    result="openink-live-softened"
                  />
                  <feComposite
                    in="openink-live-noise"
                    in2="openink-live-softened"
                    operator="in"
                    result="openink-live-grain"
                  />
                  <feComponentTransfer
                    in="openink-live-grain"
                    result="openink-live-grain-strength"
                  >
                    <feFuncA
                      type="linear"
                      slope={displayMaterial.textureStrength}
                    />
                  </feComponentTransfer>
                  <feBlend
                    in="openink-live-softened"
                    in2="openink-live-grain-strength"
                    mode="multiply"
                  />
                </filter>
                <MaterialPatternDefinitions material={displayMaterial} />
              </defs>
              <rect
                className="paper-background"
                width="100%"
                height="100%"
                fill={displayMaterial.background}
              />
              <MaterialBackdrop material={displayMaterial} />
              <g
                className="ink-content"
                shapeRendering={displayMaterial.preset === "pixels"
                  ? "crispEdges"
                  : undefined}
                filter={displayMaterial.textureStrength > 0 ||
                    displayMaterial.edgeSoftness > 0 || displayMaterial.bleed > 0
                  ? "url(#openink-live-material)"
                  : undefined}
              >
                {displayDocument.drawingLayers.map((layer) =>
                  layer.visible
                    ? (
                      <g key={layer.id} data-openink-layer={layer.id}>
                        {layer.content.map((reference) => {
                          if (reference.kind === "stroke") {
                            const stroke = displayStrokesById.get(reference.id);
                            return stroke
                              ? (
                                <path
                                  key={reference.id}
                                  className={selectedStrokeIds.has(reference.id)
                                    ? "is-selected"
                                    : undefined}
                                  d={strokeToSvgPath(stroke, true)}
                                  fill={displayMaterial.foreground}
                                  transform={`translate(${stroke.transform.x} ${stroke.transform.y}) scale(${stroke.transform.scale})`}
                                />
                              )
                              : null;
                          }
                          const imported = displayImportedById.get(reference.id);
                          const visual = inkLayerVisuals[reference.id];
                          return imported && visual
                            ? (
                              <image
                                key={reference.id}
                                className={selectedLayerIds.has(reference.id)
                                  ? "is-selected"
                                  : undefined}
                                href={visual.url}
                                width={imported.width}
                                height={imported.height}
                                transform={`translate(${imported.transform.x} ${imported.transform.y}) scale(${imported.transform.scale})`}
                              />
                            )
                            : null;
                        })}
                        {layer.id === displayDocument.activeLayerId &&
                            gestureState?.kind === "draw"
                          ? (
                            <path
                              d={strokeToSvgPath(gestureState.stroke, false)}
                              fill={displayMaterial.foreground}
                            />
                          )
                          : null}
                      </g>
                    )
                    : null
                )}
              </g>
              {gestureState?.kind === "lasso" && gestureState.points.length > 1
                ? (
                  <polyline
                    className="lasso-outline"
                    points={gestureState.points.map((point) => `${point.x},${point.y}`)
                      .join(" ")}
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
            {visibleContentCount === 0 && gestureState?.kind !== "draw"
              ? (
                <div className="empty-hint" aria-hidden="true">
                  <span>落笔即保存</span>
                  <strong>用鼠标、触控或 Apple Pencil 开始</strong>
                </div>
              )
              : null}
          </div>
          <div className="canvas-caption" aria-live="polite">
            <span>
              {tool === "pen"
                ? "画笔"
                : tool === "select"
                ? "选择"
                : tool === "lasso"
                ? "套索"
                : "橡皮"} · {activeDrawingLayer?.name ?? "墨迹"}
            </span>
            <span>{exportStatus}</span>
          </div>
        </div>

        <aside className="inspector" aria-label="画笔与材质设置">
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
            <span
              style={{
                height: Math.max(4, brushSize * 0.72),
                background: displayMaterial.foreground,
              }}
            />
          </div>
          <section className="material-controls" aria-label="画稿材质">
            <div className="material-heading">
              <span>统一材质</span>
              <strong>{MATERIAL_PRESET_LABELS[displayMaterial.preset]}</strong>
            </div>
            <div className="material-presets">
              {MATERIAL_PRESET_ORDER.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={displayMaterial.preset === preset}
                  onClick={() => selectMaterialPreset(preset)}
                >
                  {MATERIAL_PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
            <MaterialSlider
              label="纹理"
              value={displayMaterial.textureStrength}
              onPreview={(value) => previewMaterial("textureStrength", value)}
              onCommit={(value) => commitMaterial("textureStrength", value)}
            />
            <MaterialSlider
              label="软化"
              value={displayMaterial.edgeSoftness}
              onPreview={(value) => previewMaterial("edgeSoftness", value)}
              onCommit={(value) => commitMaterial("edgeSoftness", value)}
            />
            <MaterialSlider
              label="渗透"
              value={displayMaterial.bleed}
              onPreview={(value) => previewMaterial("bleed", value)}
              onCommit={(value) => commitMaterial("bleed", value)}
            />
          </section>
          <div className="inspector-copy">
            <span>原始笔迹</span>
            <p>每个压力点都会保留。移动或缩放只改变变换，不会破坏原始轨迹。</p>
          </div>
          <dl className="shortcut-list">
            <div>
              <dt>P / V / L / E</dt>
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
