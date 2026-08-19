import { Check, X } from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { DocumentMaterial } from "./drawing-document.ts";
import { createInkMaskUrl } from "./ink-mask-image.ts";
import { renderInkSdf } from "./ink-sdf.ts";
import type {
  PhotoCleanupProcessor,
  PhotoCleanupResult,
} from "./photo-cleanup-client.ts";
import type { PhotoCleanupSettings, PhotoQuad, Point } from "./photo-cleanup.ts";
import {
  createDefaultPhotoQuad,
  type DecodedPhoto,
  photoCleanupOutputSize,
  scalePhotoQuad,
} from "./photo-import.ts";

export type PhotoImportCommit = Readonly<{
  crop: PhotoQuad;
  settings: PhotoCleanupSettings;
  result: PhotoCleanupResult;
}>;

type Corner = keyof PhotoQuad;

const DEFAULT_SETTINGS: PhotoCleanupSettings = {
  threshold: 0.34,
  denoise: 0.35,
  backgroundRemoval: 0.88,
  thickness: 0,
};

function pointForEvent(
  svg: SVGSVGElement,
  event: Readonly<{ clientX: number; clientY: number }>,
): Point {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: event.clientX, y: event.clientY };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    matrix.inverse(),
  );
  return { x: point.x, y: point.y };
}

function Slider(
  props: Readonly<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
    onChange: (value: number) => void;
  }>,
) {
  return (
    <label className="cleanup-slider">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
      <strong>{props.format(props.value)}</strong>
    </label>
  );
}

export function PhotoCleanupWorkspace(
  props: Readonly<{
    photo: DecodedPhoto;
    processor: PhotoCleanupProcessor;
    material: DocumentMaterial;
    onCancel: () => void;
    onConfirm: (commit: PhotoImportCommit) => void;
  }>,
) {
  const [quad, setQuad] = useState(() =>
    createDefaultPhotoQuad(props.photo.sourceWidth, props.photo.sourceHeight)
  );
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState<PhotoCleanupResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("正在准备本机清理");
  const [processing, setProcessing] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Readonly<{ corner: Corner; pointerId: number }> | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const request = ++requestRef.current;
    const timeout = globalThis.setTimeout(() => {
      setProcessing(true);
      setStatus("正在本机生成墨迹与 SDF");
      const output = photoCleanupOutputSize(quad);
      const processingQuad = scalePhotoQuad(
        quad,
        props.photo.processingImage.width / props.photo.sourceWidth,
        props.photo.processingImage.height / props.photo.sourceHeight,
      );
      void props.processor.process(processingQuad, output, settings).then(
        (next) => {
          if (requestRef.current !== request) return;
          setResult(next);
          setProcessing(false);
          setStatus(`${output.width} × ${output.height} · 原图保留`);
        },
        (error) => {
          if (requestRef.current !== request) return;
          setProcessing(false);
          setStatus(error instanceof Error ? error.message : "照片清理失败");
        },
      );
    }, 120);
    return () => globalThis.clearTimeout(timeout);
  }, [props.photo, props.processor, quad, settings]);

  useEffect(() => {
    if (!result) return;
    let active = true;
    const display = renderInkSdf(result.sdf, {
      thickness: settings.thickness,
      softness: Math.max(0.35, props.material.edgeSoftness * 3),
    });
    void createInkMaskUrl(display, props.material.foreground).then((url) => {
      if (!active) {
        URL.revokeObjectURL(url);
        return;
      }
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    });
    return () => {
      active = false;
    };
  }, [
    props.material.edgeSoftness,
    props.material.foreground,
    result,
    settings.thickness,
  ]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function beginCorner(corner: Corner, event: ReactPointerEvent<SVGCircleElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture(event.pointerId);
    dragRef.current = { corner, pointerId: event.pointerId };
  }

  function moveCorner(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointForEvent(svg, event);
    setQuad((current) => ({
      ...current,
      [drag.corner]: {
        x: Math.max(0, Math.min(props.photo.sourceWidth, point.x)),
        y: Math.max(0, Math.min(props.photo.sourceHeight, point.y)),
      },
    }));
  }

  function endCorner(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  const corners = Object.entries(quad) as [Corner, Point][];
  const polygon = corners.map(([, point]) => `${point.x},${point.y}`).join(" ");

  return (
    <section className="cleanup-workspace" aria-label="照片清理工作区">
      <header className="cleanup-header">
        <div>
          <span>照片清理</span>
          <strong>{props.photo.name}</strong>
        </div>
        <p>{status}</p>
        <div className="cleanup-header-actions">
          <button type="button" className="cleanup-cancel" onClick={props.onCancel}>
            <X aria-hidden="true" size={18} />
            取消
          </button>
          <button
            type="button"
            className="cleanup-confirm"
            disabled={!result || processing}
            onClick={() => result && props.onConfirm({ crop: quad, settings, result })}
          >
            <Check aria-hidden="true" size={18} />
            加入画稿
          </button>
        </div>
      </header>

      <div className="cleanup-body">
        <div className="cleanup-source">
          <div className="cleanup-pane-label">
            <span>01</span>
            <strong>拖动四角校正纸张</strong>
          </div>
          <svg
            ref={svgRef}
            className="cleanup-source-svg"
            viewBox={`0 0 ${props.photo.sourceWidth} ${props.photo.sourceHeight}`}
            aria-label="照片透视校正"
            onPointerMove={moveCorner}
            onPointerUp={endCorner}
            onPointerCancel={endCorner}
          >
            <image
              href={props.photo.previewUrl}
              width={props.photo.sourceWidth}
              height={props.photo.sourceHeight}
              preserveAspectRatio="none"
            />
            <path
              className="cleanup-dim"
              d={`M0 0H${props.photo.sourceWidth}V${props.photo.sourceHeight}H0Z M${polygon}Z`}
              fillRule="evenodd"
            />
            <polygon className="cleanup-crop-outline" points={polygon} />
            {corners.map(([corner, point]) => (
              <circle
                key={corner}
                className="cleanup-corner"
                cx={point.x}
                cy={point.y}
                r={Math.max(props.photo.sourceWidth, props.photo.sourceHeight) * 0.014}
                onPointerDown={(event) => beginCorner(corner, event)}
              />
            ))}
          </svg>
        </div>

        <div
          className="cleanup-result"
          style={{ background: props.material.background }}
        >
          <div className="cleanup-pane-label is-light">
            <span>02</span>
            <strong>确认墨迹结果</strong>
          </div>
          {previewUrl
            ? <img src={previewUrl} alt="清理后的墨迹预览" />
            : <div className="cleanup-processing">正在生成本机预览</div>}
          {processing
            ? <span className="cleanup-busy" aria-label="正在重新计算" />
            : null}
        </div>

        <aside className="cleanup-controls" aria-label="照片清理参数">
          <div className="cleanup-control-heading">
            <span>清理参数</span>
            <strong>非破坏</strong>
          </div>
          <Slider
            label="阈值"
            min={0.12}
            max={0.72}
            step={0.01}
            value={settings.threshold}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(threshold) =>
              setSettings((current) => ({ ...current, threshold }))}
          />
          <Slider
            label="背景清除"
            min={0}
            max={1}
            step={0.01}
            value={settings.backgroundRemoval}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(backgroundRemoval) =>
              setSettings((current) => ({ ...current, backgroundRemoval }))}
          />
          <Slider
            label="降噪"
            min={0}
            max={1}
            step={0.01}
            value={settings.denoise}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(denoise) => setSettings((current) => ({ ...current, denoise }))}
          />
          <Slider
            label="线条粗细"
            min={-4}
            max={8}
            step={0.2}
            value={settings.thickness}
            format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
            onChange={(thickness) =>
              setSettings((current) => ({ ...current, thickness }))}
          />
          <p>原始照片会保留在此浏览器的 OPFS 中，当前蒙版与 SDF 可随时重建。</p>
        </aside>
      </div>
    </section>
  );
}
