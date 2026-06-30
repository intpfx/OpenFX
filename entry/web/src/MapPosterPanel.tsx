import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { THEMES as MAP_POSTER_THEMES } from "@domains/map-poster/src/themes.ts";

type PosterFormat = "png" | "svg";

type MapPosterForm = {
  displayCity: string;
  displayCountry: string;
  theme: string;
  distanceMeters: string;
  format: PosterFormat;
  size: string;
};

type MapCoord = {
  lat: number;
  lon: number;
};

type MapViewportSize = {
  width: number;
  height: number;
};

type MapTile = {
  key: string;
  src: string;
  left: number;
  top: number;
};

type PointerDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  centerAtStart: MapCoord;
  moved: boolean;
};

type MapPosterRenderResult = {
  ok: true;
  svg: string;
  filename: string;
  width: number;
  height: number;
  theme: string;
  city: string;
  country: string;
  center: MapCoord;
  stats: {
    roads: number;
    water: number;
    parks: number;
    distanceMeters: number;
  };
};

type MapPosterRenderError = {
  ok: false;
  error: string;
  hint?: string;
};

type MapPosterRenderResponse = MapPosterRenderResult | MapPosterRenderError;

type RenderState =
  | { status: "idle"; message: string; result?: MapPosterRenderResult }
  | { status: "loading"; message: string; result?: MapPosterRenderResult }
  | { status: "ready"; message: string; result: MapPosterRenderResult }
  | { status: "error"; message: string; result?: MapPosterRenderResult };

const SIZE_PRESETS = [
  { id: "portrait", label: "竖版 12:16", width: 1200, height: 1600 },
  { id: "square", label: "方版 1:1", width: 1600, height: 1600 },
  { id: "wide", label: "横版 3:2", width: 1800, height: 1200 },
  { id: "print", label: "印刷 300DPI", width: 3600, height: 4800 },
] as const;

const DISTANCE_OPTIONS = [
  { value: "4000", label: "4 km" },
  { value: "6000", label: "6 km" },
  { value: "8000", label: "8 km" },
  { value: "12000", label: "12 km" },
] as const;

const THEME_LABELS: Record<string, string> = {
  autumn: "秋日铜橙",
  blueprint: "蓝图线稿",
  contrast_zones: "黑白分区",
  copper_patina: "铜绿氧化",
  emerald: "翡翠绿洲",
  forest: "森林雾绿",
  gradient_roads: "黑白层级",
  japanese_ink: "日式墨线",
  midnight_blue: "午夜金蓝",
  monochrome_blue: "单色蓝图",
  neon_cyberpunk: "霓虹赛博",
  noir: "黑白暗房",
  ocean: "海岸冷蓝",
  pastel_dream: "柔彩梦境",
  sunset: "日落暖调",
  terracotta: "赤陶暖调",
  warm_beige: "暖米极简",
};

const ERROR_MESSAGES: Record<string, string> = {
  geocoding_unavailable: "定位服务暂时不可用",
  invalid_city: "请输入标题",
  invalid_country: "请输入副标题",
  invalid_display_name: "标题文字过长",
  invalid_distance: "地图范围超出可用区间",
  invalid_height: "高度超出可用区间",
  invalid_json: "请求内容无法解析",
  invalid_latitude: "纬度超出可用区间",
  invalid_longitude: "经度超出可用区间",
  invalid_theme: "主题不可用",
  invalid_width: "宽度超出可用区间",
  map_render_failed: "地图生成失败",
  place_not_found: "没有找到这个地点",
};

const DEFAULT_PREVIEW_SRC = "/map-poster/tokyo-japanese-ink.webp";
const DEFAULT_MAP_CENTER: MapCoord = { lat: 35.6768601, lon: 139.7638947 };
const DEFAULT_MAP_ZOOM = 12;
const MIN_MAP_ZOOM = 3;
const MAX_MAP_ZOOM = 16;
const TILE_SIZE = 256;
const MAX_MERCATOR_LAT = 85.05112878;
const KEYBOARD_PAN_PIXELS = 96;

function getThemeLabel(name: string) {
  return THEME_LABELS[name] ?? name.replaceAll("_", " ");
}

function getErrorMessage(response: MapPosterRenderError) {
  return response.hint ?? ERROR_MESSAGES[response.error] ?? "生成失败";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function mapPixelSize(zoom: number) {
  return TILE_SIZE * 2 ** zoom;
}

function lonToWorldX(lon: number, zoom: number) {
  return ((normalizeLongitude(lon) + 180) / 360) * mapPixelSize(zoom);
}

function latToWorldY(lat: number, zoom: number) {
  const clampedLat = clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
  const radians = clampedLat * Math.PI / 180;
  return (
    (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
  ) * mapPixelSize(zoom);
}

function worldXToLon(x: number, zoom: number) {
  return x / mapPixelSize(zoom) * 360 - 180;
}

function worldYToLat(y: number, zoom: number) {
  const n = Math.PI - 2 * Math.PI * y / mapPixelSize(zoom);
  return 180 / Math.PI * Math.atan(Math.sinh(n));
}

function wrapWorldX(x: number, zoom: number) {
  const size = mapPixelSize(zoom);
  return ((x % size) + size) % size;
}

function worldToCoord(x: number, y: number, zoom: number): MapCoord {
  const size = mapPixelSize(zoom);
  const safeY = clamp(y, 0, size);
  return {
    lat: clamp(worldYToLat(safeY, zoom), -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT),
    lon: normalizeLongitude(worldXToLon(wrapWorldX(x, zoom), zoom)),
  };
}

function moveCenterByPixels(
  center: MapCoord,
  zoom: number,
  deltaX: number,
  deltaY: number,
) {
  return worldToCoord(
    lonToWorldX(center.lon, zoom) + deltaX,
    latToWorldY(center.lat, zoom) + deltaY,
    zoom,
  );
}

function getVisibleMapTiles(
  center: MapCoord,
  zoom: number,
  viewport: MapViewportSize,
) {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const centerX = lonToWorldX(center.lon, zoom);
  const centerY = latToWorldY(center.lat, zoom);
  const minTileX = Math.floor((centerX - width / 2) / TILE_SIZE);
  const maxTileX = Math.floor((centerX + width / 2) / TILE_SIZE);
  const minTileY = Math.floor((centerY - height / 2) / TILE_SIZE);
  const maxTileY = Math.floor((centerY + height / 2) / TILE_SIZE);
  const tilesPerAxis = 2 ** zoom;
  const tiles: MapTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tilesPerAxis) continue;

      const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        left: tileX * TILE_SIZE - centerX + width / 2,
        top: tileY * TILE_SIZE - centerY + height / 2,
      });
    }
  }

  return tiles;
}

function formatCoord(coord: MapCoord) {
  return `${coord.lat.toFixed(5)}, ${coord.lon.toFixed(5)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = src;
  });
}

async function createPngBlob(svg: string, width: number, height: number) {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("canvas_unavailable");
    }

    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("png_export_failed"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MapPosterPanelContent() {
  const [form, setForm] = useState<MapPosterForm>({
    displayCity: "Tokyo",
    displayCountry: "Japan",
    theme: "japanese_ink",
    distanceMeters: "4000",
    format: "png",
    size: "portrait",
  });
  const [mapCenter, setMapCenter] = useState<MapCoord>(DEFAULT_MAP_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [mapSize, setMapSize] = useState<MapViewportSize>({
    width: 640,
    height: 288,
  });
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
    message: `中心 ${formatCoord(DEFAULT_MAP_CENTER)}`,
  });
  const [previewSrc, setPreviewSrc] = useState(DEFAULT_PREVIEW_SRC);
  const [downloadStatus, setDownloadStatus] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<PointerDrag | null>(null);

  const selectedTheme = useMemo(
    () =>
      MAP_POSTER_THEMES.find((theme) => theme.name === form.theme) ??
        MAP_POSTER_THEMES[0],
    [form.theme],
  );
  const selectedSize = useMemo(
    () => SIZE_PRESETS.find((size) => size.id === form.size) ?? SIZE_PRESETS[0],
    [form.size],
  );
  const visibleTiles = useMemo(
    () => getVisibleMapTiles(mapCenter, mapZoom, mapSize),
    [mapCenter, mapSize, mapZoom],
  );
  const isBusy = renderState.status === "loading";

  useEffect(() => {
    const svg = renderState.result?.svg;
    if (!svg) {
      setPreviewSrc(DEFAULT_PREVIEW_SRC);
      return;
    }

    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    setPreviewSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [renderState.result?.svg]);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setMapSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function updateForm<K extends keyof MapPosterForm>(
    key: K,
    value: MapPosterForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function markMapCenterChanged(center: MapCoord) {
    setRenderState((current) => {
      if (current.status === "loading") return current;
      return {
        status: "idle",
        message: `中心 ${formatCoord(center)}`,
        result: current.result,
      };
    });
  }

  function commitMapCenter(center: MapCoord) {
    setMapCenter(center);
    markMapCenterChanged(center);
  }

  function coordFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return moveCenterByPixels(
      mapCenter,
      mapZoom,
      event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2,
    );
  }

  function centerFromDrag(event: PointerEvent<HTMLDivElement>, drag: PointerDrag) {
    return moveCenterByPixels(
      drag.centerAtStart,
      mapZoom,
      -(event.clientX - drag.startX),
      -(event.clientY - drag.startY),
    );
  }

  function handleMapPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerAtStart: mapCenter,
      moved: false,
    };
  }

  function handleMapPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    if (distance <= 3) return;

    drag.moved = true;
    setMapCenter(centerFromDrag(event, drag));
  }

  function handleMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const nextCenter = drag.moved
      ? centerFromDrag(event, drag)
      : coordFromPointer(event);
    dragRef.current = null;
    commitMapCenter(nextCenter);
  }

  function handleMapPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setMapZoom((current) => clamp(current + 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM));
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      setMapZoom((current) => clamp(current - 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM));
      return;
    }

    const keyDeltas: Record<string, [number, number] | undefined> = {
      ArrowDown: [0, KEYBOARD_PAN_PIXELS],
      ArrowLeft: [-KEYBOARD_PAN_PIXELS, 0],
      ArrowRight: [KEYBOARD_PAN_PIXELS, 0],
      ArrowUp: [0, -KEYBOARD_PAN_PIXELS],
    };
    const delta = keyDeltas[event.key];
    if (!delta) return;

    event.preventDefault();
    commitMapCenter(moveCenterByPixels(mapCenter, mapZoom, delta[0], delta[1]));
  }

  function zoomMap(delta: number) {
    setMapZoom((current) => clamp(current + delta, MIN_MAP_ZOOM, MAX_MAP_ZOOM));
  }

  async function generatePoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const posterTitle = form.displayCity.trim() || "Selected Point";
    const posterSubtitle = form.displayCountry.trim() || "OpenStreetMap";
    setDownloadStatus("");
    setRenderState((current) => ({
      status: "loading",
      message: `正在生成 ${posterTitle}`,
      result: current.result,
    }));

    try {
      const response = await fetch("/api/map-poster/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city: posterTitle,
          country: posterSubtitle,
          displayCity: posterTitle,
          displayCountry: posterSubtitle,
          latitude: mapCenter.lat,
          longitude: mapCenter.lon,
          theme: form.theme,
          distanceMeters: Number(form.distanceMeters),
          width: selectedSize.width,
          height: selectedSize.height,
        }),
      });
      const payload = await response.json() as MapPosterRenderResponse;

      if (!response.ok || payload.ok !== true) {
        throw new Error(getErrorMessage(payload as MapPosterRenderError));
      }

      setRenderState({
        status: "ready",
        message: `已生成 ${payload.city}`,
        result: payload,
      });
    } catch (error) {
      setRenderState((current) => ({
        status: "error",
        message: error instanceof Error ? error.message : "生成失败",
        result: current.result,
      }));
    }
  }

  async function downloadPoster() {
    const result = renderState.result;
    if (!result) return;

    setDownloadStatus("正在准备下载");

    try {
      if (form.format === "svg") {
        downloadBlob(
          new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }),
          result.filename,
        );
      } else {
        const pngBlob = await createPngBlob(result.svg, result.width, result.height);
        downloadBlob(pngBlob, result.filename.replace(/\.svg$/, ".png"));
      }
      setDownloadStatus("下载已准备");
    } catch {
      setDownloadStatus("下载失败");
    }
  }

  return (
    <>
      <article className="domain-panel-section map-poster-tool-section">
        <form className="map-poster-form" onSubmit={generatePoster}>
          <div className="map-poster-form-head">
            <div>
              <h2>生成地图海报</h2>
              <span className={`map-poster-state ${renderState.status}`}>
                {renderState.message}
              </span>
            </div>
            <div className="map-poster-action-row">
              <button
                type="submit"
                className="map-poster-primary"
                disabled={isBusy}
              >
                {isBusy ? "生成中" : "生成预览"}
              </button>
              <button
                type="button"
                className="map-poster-secondary"
                disabled={!renderState.result || isBusy}
                onClick={() => void downloadPoster()}
              >
                下载 {form.format.toUpperCase()}
              </button>
            </div>
          </div>

          <section className="map-poster-origin-note" aria-label="来源与差异">
            <h3>来源与 OpenFX 改造</h3>
            <dl>
              <div>
                <dt>来源</dt>
                <dd>
                  <a
                    href="https://github.com/originalankur/maptoposter"
                    rel="noreferrer"
                    target="_blank"
                  >
                    originalankur/maptoposter
                  </a>
                  <span>MIT License</span>
                </dd>
              </div>
              <div>
                <dt>改动</dt>
                <dd>
                  移植为 TypeScript/Deno + Nitro Web 服务，重做 SVG
                  渲染、主题参数和在线预览下载。
                </dd>
              </div>
              <div>
                <dt>区别</dt>
                <dd>
                  原项目偏 Python CLI；OpenFX 版提供地图点选中心、浏览器交互、PNG/SVG
                  下载和 Web 数据裁剪。
                </dd>
              </div>
            </dl>
          </section>

          <section className="map-poster-picker" aria-label="地图取点">
            <div className="map-poster-map-head">
              <div>
                <span>地图取点</span>
                <strong>{formatCoord(mapCenter)}</strong>
              </div>
              <div className="map-poster-map-controls" aria-label="地图缩放">
                <button
                  type="button"
                  aria-label="缩小地图"
                  title="缩小地图"
                  onClick={() => zoomMap(-1)}
                >
                  -
                </button>
                <span>{mapZoom}</span>
                <button
                  type="button"
                  aria-label="放大地图"
                  title="放大地图"
                  onClick={() => zoomMap(1)}
                >
                  +
                </button>
              </div>
            </div>
            <div
              ref={mapRef}
              className="map-poster-picker-map"
              role="application"
              tabIndex={0}
              aria-label="在地图上点击或拖动选择海报中心点"
              onKeyDown={handleMapKeyDown}
              onPointerCancel={handleMapPointerCancel}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={handleMapPointerUp}
            >
              {visibleTiles.map((tile) => (
                <img
                  key={tile.key}
                  className="map-poster-map-tile"
                  src={tile.src}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  style={{ left: tile.left, top: tile.top }}
                />
              ))}
              <span className="map-poster-map-marker" aria-hidden="true" />
              <span className="map-poster-map-attribution">
                © OpenStreetMap
              </span>
            </div>
          </section>

          <div className="map-poster-field-grid">
            <label className="map-poster-field">
              <span>标题</span>
              <input
                value={form.displayCity}
                onChange={(event) => updateForm("displayCity", event.target.value)}
              />
            </label>
            <label className="map-poster-field">
              <span>副标题</span>
              <input
                value={form.displayCountry}
                onChange={(event) => updateForm("displayCountry", event.target.value)}
              />
            </label>
            <label className="map-poster-field map-poster-field-wide">
              <span>主题</span>
              <select
                value={form.theme}
                onChange={(event) => updateForm("theme", event.target.value)}
              >
                {MAP_POSTER_THEMES.map((theme) => (
                  <option key={theme.name} value={theme.name}>
                    {getThemeLabel(theme.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="map-poster-field">
              <span>画幅</span>
              <select
                value={form.size}
                onChange={(event) => updateForm("size", event.target.value)}
              >
                {SIZE_PRESETS.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="map-poster-field">
              <span>范围</span>
              <select
                value={form.distanceMeters}
                onChange={(event) => updateForm("distanceMeters", event.target.value)}
              >
                {DISTANCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="map-poster-field">
              <span>下载格式</span>
              <select
                value={form.format}
                onChange={(event) =>
                  updateForm("format", event.target.value as PosterFormat)}
              >
                <option value="png">PNG</option>
                <option value="svg">SVG</option>
              </select>
            </label>
          </div>

          <div className="map-poster-theme-strip" aria-label="主题颜色">
            {[
              selectedTheme.bg,
              selectedTheme.water,
              selectedTheme.parks,
              selectedTheme.roadPrimary,
              selectedTheme.text,
            ].map((color) => <span key={color} style={{ backgroundColor: color }} />)}
          </div>

          {downloadStatus
            ? (
              <p className="map-poster-download-status" aria-live="polite">
                {downloadStatus}
              </p>
            )
            : null}
        </form>
      </article>

      <article className="domain-panel-section map-poster-live-section">
        <div className="map-poster-preview-head">
          <h2>预览</h2>
          <span>
            {renderState.result
              ? `${renderState.result.width} × ${renderState.result.height}`
              : "1200 × 1600"}
          </span>
        </div>
        <div
          className="map-poster-live-frame"
          data-loading={isBusy ? "true" : "false"}
          aria-busy={isBusy}
        >
          <img
            className="map-poster-live-image"
            src={previewSrc}
            alt="Map poster preview"
          />
          {isBusy ? <span className="map-poster-loading">生成中</span> : null}
        </div>
        <dl className="map-poster-meta-grid">
          <div>
            <dt>主题</dt>
            <dd>{getThemeLabel(form.theme)}</dd>
          </div>
          <div>
            <dt>范围</dt>
            <dd>{Number(form.distanceMeters) / 1000} km</dd>
          </div>
          <div>
            <dt>路网</dt>
            <dd>{renderState.result?.stats.roads ?? "-"}</dd>
          </div>
          <div>
            <dt>中心</dt>
            <dd>
              {formatCoord(renderState.result?.center ?? mapCenter)}
            </dd>
          </div>
        </dl>
      </article>
    </>
  );
}
