import {
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  CopySimple,
  DownloadSimple,
  FolderOpen,
  Heart,
  Info,
  LinkSimple,
  MagnifyingGlass,
  MapPin,
  NotePencil,
  PlayCircle,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LIBRARY_APP_PANEL_IDS,
  type LibraryAppPanelId,
} from "../../library-app-panels.ts";
import { HomepageThemeControl } from "../homepage/HomepageThemeControl.tsx";
import {
  filterLibraryItems,
  formatLibraryBytes,
  type LibraryItem,
  type LibrarySmartView,
  searchLibraryItems,
  type StoredFileRef,
} from "./model.ts";
import {
  createOpfsFileLibrary,
  type OpfsFileLibrary,
  type StorageEstimate,
} from "./opfs-library.ts";
import { getLibraryAppTileColor } from "./app-tile.ts";
import { summarizeFileLibraryHudProgress } from "./hud-state.ts";
import {
  isMediaPlayerProgressMessage,
  makeMediaPlayerUrl,
} from "./media-player-url.ts";
import {
  consumeSharedImport,
  installFileLaunchConsumer,
  registerOpenFxServiceWorker,
} from "./pwa-import.ts";
import { createVideoThumbnail } from "./video-thumbnail.ts";
import { type DuplicateGroup, findDuplicateGroups } from "./similarity-core.ts";
import "./file-library.css";

const KIND_LABELS: Record<LibraryItem["kind"], string> = {
  app: "App",
  image: "图片",
  "live-photo": "实况图片",
  video: "视频",
  audio: "音频",
  pdf: "PDF",
  text: "文本",
  link: "链接",
  file: "文件",
};

type ComposerKind = "text" | "link";

const SMART_VIEW_LABELS: Record<LibrarySmartView, string> = {
  all: "全部内容",
  recent: "最近播放",
  photos: "全部照片",
  "live-photos": "实况图片",
  favorites: "收藏",
  places: "有位置的照片",
  videos: "全部视频",
  movies: "电影",
  shows: "剧集",
  duplicates: "重复项",
};

const SMART_VIEW_ORDER: readonly LibrarySmartView[] = [
  "all",
  "photos",
  "videos",
  "live-photos",
  "duplicates",
  "recent",
  "favorites",
  "places",
  "movies",
  "shows",
];

const SMART_VIEW_SHORT_LABELS: Record<LibrarySmartView, string> = {
  all: "全部",
  recent: "最近",
  photos: "照片",
  "live-photos": "实况",
  favorites: "收藏",
  places: "位置",
  videos: "视频",
  movies: "电影",
  shows: "剧集",
  duplicates: "重复项",
};

function formatMediaTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatPhotoNumber(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

function useStoredObjectUrl(
  library: OpfsFileLibrary,
  reference: StoredFileRef | undefined,
): { url: string; failed: boolean } {
  const [value, setValue] = useState({ url: "", failed: false });

  useEffect(() => {
    if (!reference) {
      setValue({ url: "", failed: false });
      return;
    }

    let active = true;
    let objectUrl = "";
    library.getStoredFile(reference).then((stored) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(stored);
      setValue({ url: objectUrl, failed: false });
    }).catch(() => {
      if (active) setValue({ url: "", failed: true });
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [library, reference]);

  return value;
}

function LivePhotoView(props: {
  name: string;
  imageUrl: string;
  motionUrl: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const activePointers = useRef(new Set<number>());
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  function clearLongPress() {
    if (longPressTimer.current !== undefined) {
      globalThis.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  }

  function start() {
    const video = videoRef.current;
    if (!video) return;
    clearLongPress();
    video.currentTime = 0;
    video.muted = muted;
    setPlaying(true);
    void video.play().catch(() => setPlaying(false));
    navigator.vibrate?.(35);
  }

  function stop() {
    clearLongPress();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setPlaying(false);
  }

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      clearLongPress();
      video?.pause();
    };
  }, [props.motionUrl]);

  return (
    <div
      className={`file-library-live-view${playing ? " is-playing" : ""}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") start();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") stop();
      }}
      onPointerDown={(event) => {
        activePointers.current.add(event.pointerId);
        if (event.pointerType === "mouse") return;
        if (activePointers.current.size > 1) {
          stop();
          return;
        }
        clearLongPress();
        longPressTimer.current = globalThis.setTimeout(start, 350);
      }}
      onPointerUp={(event) => {
        activePointers.current.delete(event.pointerId);
        if (event.pointerType !== "mouse") stop();
      }}
      onPointerCancel={(event) => {
        activePointers.current.delete(event.pointerId);
        stop();
      }}
    >
      {props.imageUrl ? <img alt={props.name} src={props.imageUrl} /> : null}
      <video
        aria-label={`${props.name} 动态片段`}
        loop
        muted={muted}
        playsInline
        preload="metadata"
        ref={videoRef}
        src={props.motionUrl}
        onEnded={stop}
      />
      <div className="file-library-live-controls">
        <button type="button" onClick={playing ? stop : start}>
          <PlayCircle aria-hidden="true" size={22} weight="fill" />
          {playing ? "停止实况" : "播放实况"}
        </button>
        <button
          aria-label={muted ? "打开实况声音" : "静音实况声音"}
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (videoRef.current) videoRef.current.muted = next;
          }}
        >
          {muted
            ? <SpeakerSlash aria-hidden="true" size={20} />
            : <SpeakerHigh aria-hidden="true" size={20} />}
        </button>
      </div>
    </div>
  );
}

function LibraryCard(props: {
  item: LibraryItem;
  library: OpfsFileLibrary;
  duplicateType?: DuplicateGroup["type"];
  onOpen: (item: LibraryItem) => void;
}) {
  const appPreview = props.item.kind === "app" ? props.item.app?.preview : undefined;
  const showsAppColor = props.item.kind === "app" && !appPreview;
  const visualRef = props.item.preview ?? props.item.source;
  const showsVisual = props.item.kind === "image" ||
    props.item.kind === "live-photo" ||
    (props.item.kind === "video" && Boolean(props.item.preview));
  const { url, failed } = useStoredObjectUrl(
    props.library,
    showsVisual ? visualRef : undefined,
  );
  const [textPreview, setTextPreview] = useState("");

  useEffect(() => {
    if (props.item.kind !== "text") {
      setTextPreview("");
      return;
    }
    let active = true;
    props.library.getStoredFile(props.item.source).then((stored) => stored.text()).then(
      (text) => {
        if (active) setTextPreview(text.replace(/\s+/g, " ").trim().slice(0, 260));
      },
    ).catch(() => {
      if (active) setTextPreview("");
    });
    return () => {
      active = false;
    };
  }, [props.item, props.library]);

  const extension = props.item.source.name.split(".").pop()?.toUpperCase() || "FILE";
  const hostname = props.item.url ? new URL(props.item.url).hostname : "";
  const displayName = props.item.kind === "video"
    ? props.item.media?.title ?? props.item.name
    : props.item.name;
  const progress = props.item.playback?.watchState === "in-progress" &&
      props.item.playback.durationSec > 0
    ? Math.min(
      100,
      props.item.playback.positionSec / props.item.playback.durationSec * 100,
    )
    : 0;

  return (
    <article
      className={`file-library-card is-${props.item.kind}${
        appPreview ? " has-live-app-preview" : ""
      }${showsAppColor ? " has-color-app-preview" : ""}`}
      data-library-item={props.item.id}
    >
      <span
        className="file-library-card-media"
        style={showsAppColor
          ? {
            backgroundColor: getLibraryAppTileColor(
              props.item.app?.id ?? props.item.id,
            ),
          }
          : undefined}
      >
        {appPreview
          ? (
            <iframe
              aria-hidden="true"
              className="file-library-app-live-preview"
              loading="lazy"
              sandbox={appPreview.sandbox}
              src={appPreview.src}
              tabIndex={-1}
              title={appPreview.title}
            />
          )
          : null}
        {showsAppColor
          ? (
            <span className="file-library-app-color-title">
              {props.item.name}
            </span>
          )
          : null}
        {url && (props.item.kind === "image" || props.item.kind === "live-photo" ||
            props.item.kind === "video")
          ? (
            <img
              alt=""
              decoding="async"
              draggable={false}
              loading="lazy"
              src={url}
            />
          )
          : null}
        {props.item.kind === "text"
          ? (
            <span className="file-library-card-text-preview">
              {textPreview || "文本内容"}
            </span>
          )
          : null}
        {props.item.kind === "link"
          ? (
            <span className="file-library-card-link-preview">
              <LinkSimple aria-hidden="true" size={38} weight="regular" />
              <span>{hostname}</span>
            </span>
          )
          : null}
        {(props.item.kind === "audio" || props.item.kind === "pdf" ||
            props.item.kind === "file" ||
            (props.item.kind === "video" && !props.item.preview) ||
            (showsVisual && (!url || failed)))
          ? (
            <span className="file-library-card-file-preview" aria-hidden="true">
              <span>{extension.slice(0, 6)}</span>
            </span>
          )
          : null}
        {props.item.kind === "live-photo"
          ? (
            <span className="file-library-live-badge">
              <PlayCircle aria-hidden="true" size={15} weight="fill" /> LIVE
            </span>
          )
          : null}
        {props.item.favorite
          ? (
            <span className="file-library-favorite-badge" aria-label="已收藏">
              <Heart aria-hidden="true" size={15} weight="fill" />
            </span>
          )
          : null}
        {props.item.processing?.status === "failed"
          ? (
            <span className="file-library-processing-badge" title="照片分析失败">
              !
            </span>
          )
          : null}
        {props.duplicateType
          ? (
            <span className="file-library-duplicate-badge">
              {props.duplicateType === "exact" ? "完全重复" : "相似"}
            </span>
          )
          : null}
      </span>
      {showsAppColor ? null : <span className="file-library-card-shade" />}
      <span className="file-library-card-copy">
        {showsAppColor ? null : <strong>{displayName}</strong>}
        <span>
          {props.item.kind === "app"
            ? KIND_LABELS[props.item.kind]
            : props.item.kind === "video" &&
                props.item.playback?.watchState === "in-progress"
            ? `继续播放 · ${formatMediaTime(props.item.playback.positionSec)}`
            : props.item.kind === "video" && props.item.media?.kind === "show"
            ? `剧集 · S${String(props.item.media.seasonNumber ?? 0).padStart(2, "0")}E${
              String(props.item.media.episodeNumber ?? 0).padStart(2, "0")
            }`
            : `${KIND_LABELS[props.item.kind]} · ${
              formatLibraryBytes(props.item.size)
            }`}
        </span>
      </span>
      {progress > 0
        ? (
          <span className="file-library-card-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        )
        : null}
      <button
        aria-label={`${props.item.name} ${KIND_LABELS[props.item.kind]}`}
        className="file-library-card-open"
        type="button"
        onClick={() => props.onOpen(props.item)}
      />
    </article>
  );
}

function LibraryViewer(props: {
  item: LibraryItem;
  library: OpfsFileLibrary;
  onClose: () => void;
  onDelete: (item: LibraryItem) => Promise<void>;
  onItemsChange: (items: LibraryItem[]) => void;
  renderApp: (appId: LibraryAppPanelId) => ReactNode;
}) {
  const imageRef = props.item.preview ?? props.item.source;
  const image = useStoredObjectUrl(
    props.library,
    props.item.kind === "image" || props.item.kind === "live-photo"
      ? imageRef
      : undefined,
  );
  const media = useStoredObjectUrl(
    props.library,
    props.item.kind === "audio" || props.item.kind === "pdf"
      ? props.item.source
      : undefined,
  );
  const motion = useStoredObjectUrl(
    props.library,
    props.item.kind === "live-photo" ? props.item.motion : undefined,
  );
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [albums, setAlbums] = useState((props.item.albums ?? []).join(", "));

  useEffect(() => {
    setAlbums((props.item.albums ?? []).join(", "));
  }, [props.item.id, props.item.albums]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [props]);

  useEffect(() => {
    if (props.item.kind !== "text") return;
    let active = true;
    props.library.getStoredFile(props.item.source).then((stored) => stored.text()).then(
      (value) => {
        if (active) setText(value);
      },
    ).catch(() => {
      if (active) setText("无法读取文本内容。");
    });
    return () => {
      active = false;
    };
  }, [props.item, props.library]);

  async function download(reference?: StoredFileRef) {
    const stored = !reference && props.item.kind === "live-photo"
      ? await props.library.exportLivePhoto(props.item)
      : await props.library.getStoredFile(reference ?? props.item.source);
    const url = URL.createObjectURL(stored);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = stored.name;
    anchor.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function remove() {
    setDeleting(true);
    try {
      await props.onDelete(props.item);
    } finally {
      setDeleting(false);
    }
  }

  const playerRef = props.item.kind === "video"
    ? props.item.source
    : props.item.kind === "live-photo"
    ? props.item.motion
    : undefined;

  return (
    <section
      aria-label={`${props.item.name} 预览`}
      aria-modal="true"
      className={`file-library-viewer is-${props.item.kind}`}
      role="dialog"
    >
      <div className="file-library-viewer-head file-library-hud">
        <button aria-label="返回文件库" type="button" onClick={props.onClose}>
          <ArrowLeft aria-hidden="true" size={22} />
        </button>
        <span className="file-library-viewer-title">
          <strong>{props.item.name}</strong>
          <small>
            {props.item.kind === "app"
              ? KIND_LABELS[props.item.kind]
              : `${KIND_LABELS[props.item.kind]} · ${
                formatLibraryBytes(props.item.size)
              }`}
          </small>
        </span>
        {props.item.kind === "link" && props.item.url
          ? (
            <a
              aria-label="在新标签打开"
              href={props.item.url}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowSquareOut aria-hidden="true" size={21} />
            </a>
          )
          : null}
        {props.item.kind === "app" ? null : (
          <>
            {props.item.kind === "image" || props.item.kind === "live-photo"
              ? (
                <>
                  <button
                    aria-label={props.item.favorite ? "取消收藏" : "收藏"}
                    type="button"
                    onClick={() => {
                      void props.library.updatePhotoDetails(props.item.id, {
                        favorite: !props.item.favorite,
                      }).then(props.onItemsChange);
                    }}
                  >
                    <Heart
                      aria-hidden="true"
                      size={21}
                      weight={props.item.favorite ? "fill" : "regular"}
                    />
                  </button>
                  <button
                    aria-label="照片信息"
                    aria-pressed={showInfo}
                    type="button"
                    onClick={() => setShowInfo((current) => !current)}
                  >
                    <Info aria-hidden="true" size={21} />
                  </button>
                </>
              )
              : null}
            <button
              aria-label="下载"
              type="button"
              onClick={() => void download()}
            >
              <DownloadSimple aria-hidden="true" size={21} />
            </button>
            <button
              aria-label="删除"
              disabled={deleting}
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash aria-hidden="true" size={20} />
            </button>
          </>
        )}
      </div>

      <div className="file-library-viewer-stage">
        {props.item.kind === "app" && props.item.app
          ? props.renderApp(props.item.app.id as LibraryAppPanelId)
          : null}
        {props.item.kind === "image" && image.url
          ? <img alt={props.item.name} src={image.url} />
          : null}
        {props.item.kind === "video" && playerRef
          ? (
            <iframe
              allow="autoplay; fullscreen"
              src={makeMediaPlayerUrl(playerRef, {
                itemId: props.item.id,
                resumePositionSec: props.item.playback?.watchState === "in-progress"
                  ? props.item.playback.positionSec
                  : 0,
                subtitles: props.item.subtitles,
              })}
              title={`${props.item.name} · OpenFX Media Player`}
            />
          )
          : null}
        {props.item.kind === "live-photo"
          ? (
            image.url && motion.url
              ? (
                <LivePhotoView
                  imageUrl={image.url}
                  motionUrl={motion.url}
                  name={props.item.name}
                />
              )
              : image.url
              ? <img alt={props.item.name} src={image.url} />
              : null
          )
          : null}
        {props.item.kind === "audio" && media.url
          ? <audio controls autoPlay src={media.url} />
          : null}
        {props.item.kind === "pdf" && media.url
          ? (
            <iframe
              className="file-library-document-frame"
              src={media.url}
              title={props.item.name}
            />
          )
          : null}
        {props.item.kind === "text"
          ? <pre className="file-library-text-view">{text}</pre>
          : null}
        {props.item.kind === "link" && props.item.url
          ? (
            <div className="file-library-link-view">
              <iframe src={props.item.url} title={props.item.name} />
              <a href={props.item.url} rel="noreferrer" target="_blank">
                无法嵌入时，在新标签打开
                <ArrowSquareOut aria-hidden="true" size={18} />
              </a>
            </div>
          )
          : null}
        {props.item.kind === "file"
          ? (
            <div className="file-library-download-view">
              <span>
                {props.item.source.name.split(".").pop()?.toUpperCase() || "FILE"}
              </span>
              <h2>此格式暂不支持在线预览</h2>
              <p>文件已经完整保存在浏览器 OPFS 中，可随时下载原件。</p>
              <button type="button" onClick={() => void download()}>
                <DownloadSimple aria-hidden="true" size={20} /> 下载文件
              </button>
            </div>
          )
          : null}
      </div>
      {showInfo && (props.item.kind === "image" || props.item.kind === "live-photo")
        ? (
          <aside className="file-library-photo-info file-library-hud">
            <strong>照片信息</strong>
            <dl>
              {props.item.photo?.capturedAt
                ? (
                  <>
                    <dt>拍摄时间</dt>
                    <dd>{props.item.photo.capturedAt}</dd>
                  </>
                )
                : null}
              {props.item.photo?.width && props.item.photo.height
                ? (
                  <>
                    <dt>尺寸</dt>
                    <dd>{props.item.photo.width} × {props.item.photo.height}</dd>
                  </>
                )
                : null}
              {props.item.photo?.make || props.item.photo?.model
                ? (
                  <>
                    <dt>相机</dt>
                    <dd>
                      {[props.item.photo.make, props.item.photo.model].filter(Boolean)
                        .join(" ")}
                    </dd>
                  </>
                )
                : null}
              {props.item.photo?.lensModel
                ? (
                  <>
                    <dt>镜头</dt>
                    <dd>{props.item.photo.lensModel}</dd>
                  </>
                )
                : null}
              {props.item.photo?.exposureTime || props.item.photo?.fNumber ||
                  props.item.photo?.iso || props.item.photo?.focalLength
                ? (
                  <>
                    <dt>曝光</dt>
                    <dd>
                      {[
                        props.item.photo.exposureTime,
                        props.item.photo.fNumber
                          ? `ƒ/${formatPhotoNumber(props.item.photo.fNumber)}`
                          : undefined,
                        props.item.photo.iso
                          ? `ISO ${props.item.photo.iso}`
                          : undefined,
                        props.item.photo.focalLength
                          ? `${formatPhotoNumber(props.item.photo.focalLength)} mm`
                          : undefined,
                      ].filter(Boolean).join(" · ")}
                    </dd>
                  </>
                )
                : null}
              {props.item.photo?.rating
                ? (
                  <>
                    <dt>原始评分</dt>
                    <dd>{props.item.photo.rating} / 5</dd>
                  </>
                )
                : null}
            </dl>
            {props.item.photo?.latitude !== undefined &&
                props.item.photo.longitude !== undefined
              ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${props.item.photo.latitude}&mlon=${props.item.photo.longitude}#map=14/${props.item.photo.latitude}/${props.item.photo.longitude}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MapPin aria-hidden="true" size={18} />
                  {props.item.photo.latitude.toFixed(5)},{" "}
                  {props.item.photo.longitude.toFixed(5)}
                </a>
              )
              : null}
            <label>
              <span>相册</span>
              <input
                placeholder="以逗号分隔，例如：旅行, 家人"
                value={albums}
                onChange={(event) => setAlbums(event.target.value)}
                onBlur={() => {
                  void props.library.updatePhotoDetails(props.item.id, {
                    albums: albums.split(","),
                  }).then(props.onItemsChange);
                }}
              />
            </label>
            <small>
              {props.item.processing?.status === "completed"
                ? "元数据与动态片段分析完成"
                : props.item.processing?.status === "failed"
                ? props.item.processing.error ?? "照片分析失败"
                : "照片正在后台分析"}
            </small>
            {props.item.processing?.status === "failed"
              ? (
                <button
                  type="button"
                  onClick={() => {
                    void props.library.retryPhotoAnalysis(props.item.id).then(
                      props.onItemsChange,
                    );
                  }}
                >
                  <ArrowClockwise aria-hidden="true" size={18} /> 重新分析
                </button>
              )
              : null}
          </aside>
        )
        : null}
      {confirmDelete && props.item.kind !== "app"
        ? (
          <div
            className="file-library-delete-confirm file-library-hud"
            role="alertdialog"
          >
            <span>
              <strong>删除“{props.item.name}”？</strong>
              <small>只会移除 OpenFX 文件库里的副本。</small>
            </span>
            <button type="button" onClick={() => setConfirmDelete(false)}>取消</button>
            <button disabled={deleting} type="button" onClick={() => void remove()}>
              {deleting ? "正在删除…" : "确认删除"}
            </button>
          </div>
        )
        : null}
    </section>
  );
}

function LibraryComposer(props: {
  kind: ComposerKind;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string, value: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const isLink = props.kind === "link";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    void props.onSubmit(name, value);
  }

  return (
    <div
      className="file-library-composer-backdrop"
      role="presentation"
      onMouseDown={props.onClose}
    >
      <form
        aria-label={isLink ? "保存链接" : "新建文本"}
        className="file-library-composer file-library-hud"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="file-library-composer-head">
          <strong>{isLink ? "保存链接" : "新建文本"}</strong>
          <button aria-label="关闭" type="button" onClick={props.onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <label>
          <span>名称</span>
          <input
            autoFocus
            placeholder={isLink ? "可选，默认使用域名" : "未命名文本"}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>{isLink ? "网址" : "内容"}</span>
          {isLink
            ? (
              <input
                inputMode="url"
                placeholder="https://example.com"
                required
                type="url"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )
            : (
              <textarea
                placeholder="写下内容…"
                required
                rows={8}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
        </label>
        <button
          className="file-library-composer-submit"
          disabled={props.busy}
          type="submit"
        >
          <Plus aria-hidden="true" size={19} />
          {props.busy ? "正在保存…" : "保存到文件库"}
        </button>
      </form>
    </div>
  );
}

export function FileLibraryHomepage(props: {
  renderApp: (appId: LibraryAppPanelId) => ReactNode;
}) {
  const [library] = useState(createOpfsFileLibrary);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [query, setQuery] = useState("");
  const [smartView, setSmartView] = useState<LibrarySmartView>("all");
  const [hudExpanded, setHudExpanded] = useState(false);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("正在打开本地文件库…");
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnailFailures = useRef(new Set<string>());

  function applyItems(next: LibraryItem[]) {
    setItems(next);
    setSelected((current) =>
      current ? next.find((item) => item.id === current.id) ?? null : null
    );
  }

  const visibleItems = useMemo(
    () => filterLibraryItems(searchLibraryItems(items, query), smartView),
    [items, query, smartView],
  );
  const duplicateGroups = useMemo(() => findDuplicateGroups(items), [items]);
  const hudProgress = useMemo(
    () => summarizeFileLibraryHudProgress(items),
    [items],
  );
  const duplicateTypes = useMemo(() => {
    const types = new Map<string, DuplicateGroup["type"]>();
    for (const group of duplicateGroups) {
      for (const id of group.itemIds) {
        if (group.type === "exact" || !types.has(id)) types.set(id, group.type);
      }
    }
    return types;
  }, [duplicateGroups]);

  async function refreshStorage() {
    try {
      setStorage(await library.estimate());
    } catch {
      setStorage(null);
    }
  }

  async function persistStorage() {
    await library.persist();
    await refreshStorage();
  }

  useEffect(() => {
    document.body.classList.add("homepage-body", "file-library-body");
    document.title = "OpenFX 文件库";
    let active = true;
    library.load().then((stored) => {
      if (!active) return;
      setItems(stored);
      const storedFileCount = stored.filter((item) => item.kind !== "app").length;
      setMessage(
        storedFileCount > 0
          ? "导入内容仅保存在当前浏览器"
          : `${LIBRARY_APP_PANEL_IDS.length} 个默认 App 已就绪`,
      );
      void refreshStorage();
    }).catch((error: unknown) => {
      if (active) {
        setMessage(error instanceof Error ? error.message : "无法打开 OPFS 文件库");
      }
    });
    return () => {
      active = false;
      document.body.classList.remove("homepage-body", "file-library-body");
    };
  }, [library]);

  async function importSelected(files: FileList | readonly File[]) {
    const batch = Array.from(files);
    if (batch.length === 0 || busy) return;
    setBusy(true);
    setMessage(`正在导入 ${batch.length} 个文件…`);
    try {
      const next = await library.importFiles(batch);
      setItems(next);
      setMessage(`已导入 ${batch.length} 个文件`);
      await refreshStorage();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文件导入失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  useEffect(() => {
    installFileLaunchConsumer((files) => importSelected(files));
    void registerOpenFxServiceWorker().catch(() => undefined);
    void consumeSharedImport(location.search).then((files) => {
      if (files.length > 0) return importSelected(files);
    }).catch(() => undefined);
  }, [library]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== location.origin || !isMediaPlayerProgressMessage(event.data)
      ) return;
      void library.recordPlayback(event.data.itemId, {
        positionSec: event.data.positionSec,
        durationSec: event.data.durationSec,
        ended: event.data.ended,
      }).then((next) => {
        setItems(next);
      });
    };
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, [library]);

  useEffect(() => {
    const pending = items.filter((item) =>
      item.kind === "video" && !item.preview && !thumbnailFailures.current.has(item.id)
    );
    if (pending.length === 0) return;
    let cancelled = false;

    const run = async () => {
      for (const item of pending) {
        if (cancelled) return;
        try {
          if (document.visibilityState === "hidden") continue;
          const source = await library.getStoredFile(item.source);
          const thumbnail = await createVideoThumbnail(source);
          if (cancelled) return;
          setItems(await library.storeVideoThumbnail(item.id, thumbnail));
        } catch {
          thumbnailFailures.current.add(item.id);
        }
      }
      await refreshStorage();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [items, library]);

  useEffect(() => {
    const pending = items.filter((item) => {
      if (item.kind === "app" || item.fingerprint?.status !== "pending") return false;
      const isPhoto = item.kind === "image" || item.kind === "live-photo";
      return !isPhoto || item.processing?.status === "completed" ||
        item.processing?.status === "failed";
    });
    if (pending.length === 0) return;
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const item of pending) {
        if (cancelled) return;
        const next = await library.processFingerprint(item.id, controller.signal);
        if (cancelled) return;
        applyItems(next);
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [items, library]);

  useEffect(() => {
    const pending = items.filter((item) =>
      (item.kind === "image" || item.kind === "live-photo") &&
      item.processing?.status === "pending"
    );
    if (pending.length === 0) return;
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const item of pending) {
        if (cancelled) return;
        const next = await library.processPhoto(item.id, controller.signal);
        if (cancelled) return;
        applyItems(next);
      }
      await refreshStorage();
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [items, library]);

  async function submitComposer(name: string, value: string) {
    if (!composer || busy) return;
    setBusy(true);
    try {
      const next = composer === "link"
        ? await library.createLink(name, value)
        : await library.createText(name, value);
      setItems(next);
      setMessage(composer === "link" ? "链接已保存" : "文本已保存");
      setComposer(null);
      await refreshStorage();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: LibraryItem) {
    const next = await library.removeItem(item.id);
    setItems(next);
    setSelected(null);
    setMessage("已从文件库删除");
    await refreshStorage();
  }

  async function openDuplicateReview() {
    let next = items;
    for (const item of items) {
      if (item.fingerprint?.status !== "failed") continue;
      next = await library.retryFingerprintAnalysis(item.id);
    }
    if (next !== items) applyItems(next);
    setSmartView("duplicates");
    const matchCount = new Set(duplicateGroups.flatMap((group) => group.itemIds)).size;
    setMessage(
      matchCount > 0
        ? `发现 ${duplicateGroups.length} 组、${matchCount} 个重复或相似文件，请逐项确认`
        : "查重在后台进行；完成后重复项会显示在这里",
    );
  }

  const storageText = storage
    ? `${formatLibraryBytes(storage.usage)} / ${formatLibraryBytes(storage.quota)}`
    : "OPFS 本地存储";

  return (
    <main
      className={`file-library-page${dragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void importSelected(event.dataTransfer.files);
      }}
    >
      {!hudExpanded
        ? (
          <button
            aria-expanded="false"
            aria-label={`展开文件库控制面板，${hudProgress.label} ${hudProgress.processed}/${hudProgress.total}`}
            className="file-library-core"
            style={{
              "--file-library-core-progress": `${hudProgress.ratio * 360}deg`,
            } as CSSProperties}
            type="button"
            onClick={() => setHudExpanded(true)}
          >
            <span aria-hidden="true" className="file-library-core-atmosphere" />
            <span aria-hidden="true" className="file-library-core-orbit" />
            <span className="file-library-core-copy">
              <small>OPENFX LIBRARY</small>
              <strong>{hudProgress.processed} / {hudProgress.total}</strong>
              <span>{hudProgress.label}</span>
              <CaretDown aria-hidden="true" size={12} weight="bold" />
            </span>
          </button>
        )
        : (
          <header className="file-library-head file-library-hud is-expanded">
            <div className="file-library-head-primary">
              <span className="file-library-brand" aria-label="OpenFX">
                Open<span>FX</span>
              </span>
              <span className="file-library-count">{visibleItems.length} 项</span>
              <span className="file-library-head-spacer" />
              <HomepageThemeControl compact />
              <button
                aria-expanded="true"
                aria-label="收起文件库控制面板"
                className="file-library-collapse"
                type="button"
                onClick={() => setHudExpanded(false)}
              >
                <CaretUp aria-hidden="true" size={21} />
              </button>
            </div>

            <label className="file-library-search">
              <MagnifyingGlass aria-hidden="true" size={21} />
              <input
                placeholder="搜索文件"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
              />
            </label>

            <nav aria-label="智能视图" className="file-library-smart-views">
              {SMART_VIEW_ORDER.map((view) => (
                <button
                  aria-label={SMART_VIEW_LABELS[view]}
                  aria-pressed={smartView === view}
                  className={smartView === view ? "is-active" : undefined}
                  key={view}
                  type="button"
                  onClick={() => setSmartView(view)}
                >
                  {SMART_VIEW_SHORT_LABELS[view]}
                </button>
              ))}
            </nav>

            <nav aria-label="文件库操作" className="file-library-actions">
              <button
                aria-label="导入文件"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                <UploadSimple aria-hidden="true" size={21} />
                <span>导入</span>
              </button>
              <button
                aria-label="保存链接"
                type="button"
                onClick={() => setComposer("link")}
              >
                <LinkSimple aria-hidden="true" size={21} />
                <span>链接</span>
              </button>
              <button
                aria-label="新建文本"
                type="button"
                onClick={() => setComposer("text")}
              >
                <NotePencil aria-hidden="true" size={21} />
                <span>文本</span>
              </button>
              <button
                aria-label="检查重复文件"
                type="button"
                onClick={() => void openDuplicateReview()}
              >
                <CopySimple aria-hidden="true" size={21} />
                <span>查重</span>
              </button>
            </nav>

            <div className="file-library-analysis" aria-live="polite">
              <span className="file-library-analysis-copy">
                <i aria-hidden="true" data-active={hudProgress.active} />
                <span>
                  {hudProgress.label} · {hudProgress.processed}/{hudProgress.total}
                </span>
              </span>
              <small title={message}>{message} · {storageText}</small>
              {storage && !storage.persisted
                ? (
                  <button
                    type="button"
                    onClick={() => void persistStorage()}
                  >
                    保持存储
                  </button>
                )
                : null}
              <span aria-hidden="true" className="file-library-analysis-track">
                <span style={{ width: `${hudProgress.ratio * 100}%` }} />
              </span>
            </div>
          </header>
        )}

      <section aria-label="OpenFX 文件库内容" className="file-library-grid">
        {visibleItems.map((item) => (
          <LibraryCard
            key={item.id}
            item={item}
            library={library}
            duplicateType={duplicateTypes.get(item.id)}
            onOpen={setSelected}
          />
        ))}
        {items.length === 0 && !busy
          ? (
            <button
              className="file-library-empty-tile"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <FolderOpen aria-hidden="true" size={40} weight="thin" />
              <strong>导入你的第一个文件</strong>
              <span>图片、Live Photo、视频、文本或任意文件</span>
            </button>
          )
          : null}
        {items.length > 0 && visibleItems.length === 0
          ? (
            <div className="file-library-empty-tile is-result">
              <MagnifyingGlass aria-hidden="true" size={32} />
              <strong>没有匹配内容</strong>
              <span>换个关键词再试。</span>
            </div>
          )
          : null}
      </section>

      <input
        hidden
        multiple
        ref={inputRef}
        type="file"
        onChange={(event) => {
          if (event.target.files) void importSelected(event.target.files);
        }}
      />

      {dragging
        ? (
          <div className="file-library-drop-layer">
            <UploadSimple aria-hidden="true" size={48} weight="thin" />
            <strong>松开以导入文件</strong>
            <span>同名图片与 MOV / MP4 会自动识别为 Live Photo</span>
          </div>
        )
        : null}
      {selected
        ? (
          <LibraryViewer
            item={selected}
            library={library}
            onClose={() => setSelected(null)}
            onDelete={removeItem}
            onItemsChange={applyItems}
            renderApp={props.renderApp}
          />
        )
        : null}
      {composer
        ? (
          <LibraryComposer
            busy={busy}
            kind={composer}
            onClose={() => setComposer(null)}
            onSubmit={submitComposer}
          />
        )
        : null}
    </main>
  );
}
