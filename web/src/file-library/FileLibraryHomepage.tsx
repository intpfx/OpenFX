import {
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  Check,
  DownloadSimple,
  FileZip,
  FilmStrip,
  FolderOpen,
  GithubLogo,
  Heart,
  HeartStraight,
  ImagesSquare,
  Info,
  LinkSimple,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  PlayCircle,
  SpeakerHigh,
  SpeakerSlash,
  StackSimple,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getLibraryApp,
  isLibraryAppId,
  isLibraryAppOpenable,
  LIBRARY_APP_COUNT,
  type LibraryAppId,
} from "../../library-app-catalog.ts";
import {
  formatLibraryBytes,
  getFileExtension,
  getLibraryItemVisualRef,
  type LibraryItem,
  type LibraryItemDetailsPatch,
  normalizeLibraryItemName,
  searchLibraryItems,
  type StoredFileRef,
} from "./model.ts";
import type { LivePhotoExportFormat } from "./live-photo-export.ts";
import {
  createOpfsFileLibrary,
  type OpfsFileLibrary,
  type StorageEstimate,
} from "./opfs-library.ts";
import {
  connectFileLibrarySessionToBrowser,
  createFileLibrarySession,
  type FileLibrarySession,
  type PrivateMeshRemoteFileSnapshot,
  type PrivateMeshSessionSnapshot,
} from "./file-library-session.ts";
import { createOpfsPrivateMeshStore } from "./private-mesh-store.ts";
import {
  createOpfsPrivateMeshCatalogStore,
  createOpfsPrivateMeshThumbnailStore,
} from "./private-mesh-catalog-store.ts";
import { createPrivateMeshThumbnail } from "./private-mesh-thumbnail.ts";
import { createIndexedDbPrivateMeshKeyVault } from "./private-mesh-key-vault.ts";
import { createNativePhotoImporter } from "./native-photo-import.ts";
import { getLibraryAppTileColor, getLibraryAudioTileColor } from "./app-tile.ts";
import { LibraryAudioPlayer } from "./library-audio-player.tsx";
import {
  summarizeFileLibraryHudProgress,
  summarizeFileLibraryStorageHeatmap,
  toggleFileLibraryEntrySelection,
} from "./hud-state.ts";
import {
  type LibraryGridColumns,
  parseLibraryGridColumns,
  resolveLibraryGridColumnsFromPinch,
} from "./grid-density.ts";
import {
  isMediaPlayerFileActionMessage,
  makeMediaPlayerFileDetailsMessage,
  makeMediaPlayerUrl,
} from "./media-player-url.ts";
import { createVideoThumbnail } from "./video-thumbnail.ts";
import {
  buildSimilarityGridEntries,
  type SimilarityGridEntry,
} from "./similarity-core.ts";
import "./file-library.css";

const KIND_LABELS: Record<LibraryItem["kind"], string> = {
  app: "App",
  image: "图片",
  "live-photo": "实况照片",
  video: "视频",
  audio: "音频",
  pdf: "PDF",
  text: "文本",
  link: "链接",
  file: "文件",
};

const LIBRARY_GRID_COLUMNS_KEY = "openfx-library-grid-columns";

type PinchGesture = {
  initialColumns: LibraryGridColumns;
  initialDistance: number;
  pointers: Map<number, { x: number; y: number }>;
};

type LibraryGridEntry = SimilarityGridEntry<LibraryItem>;
type LibraryGroupEntry = Extract<LibraryGridEntry, { kind: "group" }>;

function canOpenLibraryItem(item: LibraryItem): boolean {
  if (item.kind !== "app") return true;
  return Boolean(
    item.app &&
      isLibraryAppId(item.app.id) &&
      isLibraryAppOpenable(item.app.id),
  );
}

function isGitHubHref(href: string): boolean {
  try {
    return new URL(href).hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

function formatMediaTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatPhotoNumber(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

function getAudioTitle(item: LibraryItem): string {
  return item.audio?.title ?? item.name.replace(/\.[^./]+$/, "");
}

function getAudioByline(item: LibraryItem): string {
  return [item.audio?.artist, item.audio?.album].filter(Boolean).join(" · ") ||
    `音频 · ${formatLibraryBytes(item.size)}`;
}

function getAudioFallbackColor(item: LibraryItem): string {
  return getLibraryAudioTileColor(
    [getAudioTitle(item), item.audio?.artist].filter(Boolean).join(":"),
  );
}

function saveDownload(stored: File): void {
  const url = URL.createObjectURL(stored);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = stored.name;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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

function PrivateMeshRemoteThumbnail(props: {
  session: FileLibrarySession;
  entry: PrivateMeshRemoteFileSnapshot;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl("");
    if (!props.entry.thumbnail) return;
    let active = true;
    let objectUrl = "";
    props.session.getPrivateMeshRemoteThumbnail(
      props.entry.nodeId,
      props.entry.itemId,
    ).then((thumbnail) => {
      if (!active || !thumbnail) return;
      objectUrl = URL.createObjectURL(thumbnail);
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    props.entry.itemId,
    props.entry.nodeId,
    props.entry.thumbnail?.revision,
    props.session,
  ]);

  return (
    <span className="file-library-private-mesh-remote-thumbnail">
      {url
        ? <img alt="" src={url} />
        : getFileExtension(props.entry.name).toUpperCase() || "FILE"}
    </span>
  );
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

function LibraryHudAudio(props: {
  item: LibraryItem;
  artworkUrl: string;
}) {
  const hasArtwork = Boolean(props.artworkUrl);
  return (
    <div
      className={`file-library-hud-audio${
        hasArtwork ? "" : " has-audio-title-fallback"
      }`}
      style={{
        "--audio-fallback-color": getAudioFallbackColor(props.item),
      } as CSSProperties}
    >
      {hasArtwork
        ? (
          <img
            alt=""
            aria-hidden="true"
            className="file-library-hud-audio-backdrop"
            src={props.artworkUrl}
          />
        )
        : null}
      <span className="file-library-hud-audio-cover">
        {hasArtwork
          ? <img alt={`${getAudioTitle(props.item)} 专辑封面`} src={props.artworkUrl} />
          : (
            <span className="file-library-audio-title-tile">
              {getAudioTitle(props.item)}
            </span>
          )}
      </span>
      <span className="file-library-hud-audio-copy">
        <strong>{getAudioTitle(props.item)}</strong>
        <span>{getAudioByline(props.item)}</span>
        {props.item.audioProcessing?.status === "pending" ||
            props.item.audioProcessing?.status === "running"
          ? <small>正在读取音频标签与专辑封面…</small>
          : null}
      </span>
    </div>
  );
}

function LibraryAudioViewer(props: {
  item: LibraryItem;
  artworkUrl: string;
  sourceUrl: string;
}) {
  const [playing, setPlaying] = useState(false);
  const lyrics = props.item.audio?.lyrics;
  return (
    <div
      className={`file-library-audio-viewer${
        props.artworkUrl ? "" : " has-audio-title-fallback"
      }`}
      style={{
        "--audio-fallback-color": getAudioFallbackColor(props.item),
      } as CSSProperties}
    >
      {props.artworkUrl
        ? (
          <img
            alt=""
            aria-hidden="true"
            className="file-library-audio-backdrop"
            src={props.artworkUrl}
          />
        )
        : null}
      <section className="file-library-audio-identity">
        <div
          className={`file-library-audio-artwork-frame${playing ? " is-playing" : ""}`}
        >
          <div className="file-library-audio-artwork">
            {props.artworkUrl
              ? (
                <img
                  alt={`${getAudioTitle(props.item)} 专辑封面`}
                  src={props.artworkUrl}
                />
              )
              : (
                <span className="file-library-audio-title-tile">
                  {getAudioTitle(props.item)}
                </span>
              )}
          </div>
        </div>
        <section className="file-library-audio-player-copy">
          <span>{props.item.audio?.artist || "未知歌手"}</span>
          <h1>{getAudioTitle(props.item)}</h1>
          <p>{props.item.audio?.album || "本地音乐"}</p>
          <LibraryAudioPlayer
            autoPlay
            label={getAudioTitle(props.item)}
            sourceUrl={props.sourceUrl}
            onPlayingChange={setPlaying}
          />
        </section>
      </section>
      <section className="file-library-audio-lyrics" aria-label="歌词">
        <header>
          <strong>歌词</strong>
          <span>{lyrics ? "内嵌歌词 · 无时间轴" : "本地音乐"}</span>
        </header>
        {lyrics
          ? (
            <div className="file-library-audio-lyrics-lines" tabIndex={0}>
              {lyrics.lines.map((line, index) => (
                <p
                  className="file-library-audio-lyric-line"
                  key={`${index}-${line}`}
                  style={{
                    "--lyric-line-delay": `${Math.min(index, 10) * 34}ms`,
                  } as CSSProperties}
                >
                  {line}
                </p>
              ))}
            </div>
          )
          : (
            <div className="file-library-audio-lyrics-empty">
              <strong>这首歌没有可显示的内嵌歌词</strong>
              <span>仍可正常播放和下载原始音乐文件。</span>
            </div>
          )}
      </section>
    </div>
  );
}

function LibraryCard(props: {
  item: LibraryItem;
  library: OpfsFileLibrary;
  selected: boolean;
  onSelect: () => void;
}) {
  const appPreview = props.item.kind === "app" ? props.item.app?.preview : undefined;
  const showsAppColor = props.item.kind === "app" && !appPreview;
  const visualRef = getLibraryItemVisualRef(props.item);
  const showsVisual = Boolean(visualRef);
  const { url, failed } = useStoredObjectUrl(
    props.library,
    showsVisual ? visualRef : undefined,
  );
  const [textPreview, setTextPreview] = useState("");
  const showsAudioTitleFallback = props.item.kind === "audio" &&
    (!visualRef || failed);

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
    : props.item.kind === "audio"
    ? getAudioTitle(props.item)
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
      }${showsAppColor ? " has-color-app-preview" : ""}${
        showsAudioTitleFallback ? " has-audio-title-fallback" : ""
      }${props.selected ? " is-selected" : ""}`}
      data-library-item={props.item.id}
      style={{
        "--audio-fallback-color": getAudioFallbackColor(props.item),
      } as CSSProperties}
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
        {showsAudioTitleFallback
          ? (
            <span className="file-library-audio-title-tile">
              {getAudioTitle(props.item)}
            </span>
          )
          : null}
        {url
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
        {(props.item.kind === "pdf" ||
            props.item.kind === "file" ||
            (props.item.kind === "video" && !props.item.preview) ||
            (props.item.kind !== "audio" && showsVisual && (!url || failed)))
          ? (
            <span className="file-library-card-file-preview" aria-hidden="true">
              <span>{extension.slice(0, 6)}</span>
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
        {props.item.processing?.status === "failed" ||
            props.item.audioProcessing?.status === "failed"
          ? (
            <span
              className="file-library-processing-badge"
              title={props.item.kind === "audio" ? "音频标签分析失败" : "照片分析失败"}
            >
              !
            </span>
          )
          : null}
      </span>
      {showsAppColor || showsAudioTitleFallback
        ? null
        : <span className="file-library-card-shade" />}
      <span className="file-library-card-copy">
        {showsAppColor || showsAudioTitleFallback
          ? null
          : <strong>{displayName}</strong>}
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
            : props.item.kind === "audio"
            ? getAudioByline(props.item)
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
        aria-pressed={props.selected}
        className="file-library-card-open"
        type="button"
        onClick={props.onSelect}
      />
    </article>
  );
}

function LibraryGroupMemberVisual(props: {
  defer?: boolean;
  item: LibraryItem;
  library: OpfsFileLibrary;
}) {
  const visualElementRef = useRef<HTMLSpanElement>(null);
  const [visualReady, setVisualReady] = useState(!props.defer);
  const visualRef = getLibraryItemVisualRef(props.item);
  const showsVisual = Boolean(visualRef);
  const { url } = useStoredObjectUrl(
    props.library,
    showsVisual && visualReady ? visualRef : undefined,
  );
  const extension = props.item.source.name.split(".").pop()?.toUpperCase() ||
    KIND_LABELS[props.item.kind].toUpperCase();

  useEffect(() => {
    if (!props.defer || visualReady) return;
    const element = visualElementRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisualReady(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisualReady(true);
      observer.disconnect();
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.defer, visualReady]);

  return (
    <span
      aria-hidden="true"
      className={`file-library-group-member-visual is-${props.item.kind}`}
      ref={visualElementRef}
    >
      {url
        ? (
          <img
            alt=""
            decoding="async"
            loading={props.defer ? "lazy" : "eager"}
            src={url}
          />
        )
        : null}
      {!url && props.item.kind === "link"
        ? <LinkSimple aria-hidden="true" size={30} />
        : null}
      {!url && props.item.kind !== "link" ? <span>{extension.slice(0, 6)}</span> : null}
      {props.item.kind === "live-photo"
        ? <PlayCircle aria-hidden="true" size={14} weight="fill" />
        : null}
    </span>
  );
}

function LibrarySimilarityCard(props: {
  entry: LibraryGroupEntry;
  library: OpfsFileLibrary;
  selected: boolean;
  onSelect: () => void;
}) {
  const relationLabel = props.entry.group.type === "exact" ? "完全相同" : "相似内容";
  const visibleItems = props.entry.items.slice(0, 4);

  return (
    <article
      className={`file-library-card file-library-group-card${
        props.selected ? " is-selected" : ""
      }`}
      data-library-group={props.entry.group.id}
    >
      <span
        className={`file-library-group-card-media has-${visibleItems.length}`}
      >
        {visibleItems.map((item) => (
          <LibraryGroupMemberVisual
            item={item}
            key={item.id}
            library={props.library}
          />
        ))}
        {props.entry.items.length > visibleItems.length
          ? (
            <span className="file-library-group-card-more" aria-hidden="true">
              +{props.entry.items.length - visibleItems.length}
            </span>
          )
          : null}
      </span>
      <span className="file-library-card-shade" />
      <span className="file-library-card-copy">
        <strong>{relationLabel}</strong>
        <span>{props.entry.items.length} 个文件 · 自动归组</span>
      </span>
      <span className="file-library-group-card-count" aria-hidden="true">
        <StackSimple size={15} weight="fill" />
        {props.entry.items.length}
      </span>
      <button
        aria-label={`${relationLabel}组，${props.entry.items.length} 个文件`}
        aria-pressed={props.selected}
        className="file-library-card-open"
        type="button"
        onClick={props.onSelect}
      />
    </article>
  );
}

function LibrarySimilarityHud(props: {
  entry: LibraryGroupEntry;
  library: OpfsFileLibrary;
  onOpen: (item: LibraryItem) => void;
}) {
  const relationLabel = props.entry.group.type === "exact" ? "完全相同" : "相似内容";

  return (
    <section
      aria-label={`${relationLabel}组，${props.entry.items.length} 个文件`}
      className="file-library-group-hud"
    >
      <header className="file-library-group-hud-head">
        <span>
          <StackSimple aria-hidden="true" size={18} weight="fill" />
          <strong>{relationLabel}</strong>
        </span>
        <small>{props.entry.items.length} 个文件 · 选择一个打开</small>
      </header>
      <div className="file-library-group-hud-members">
        {props.entry.items.map((item) => (
          <button
            aria-label={`打开 ${item.name}`}
            className="file-library-group-hud-member"
            key={item.id}
            type="button"
            onClick={() => props.onOpen(item)}
          >
            <LibraryGroupMemberVisual
              defer
              item={item}
              library={props.library}
            />
            <span className="file-library-group-hud-member-copy">
              <strong>{item.name}</strong>
              <small>
                {KIND_LABELS[item.kind]} · {formatLibraryBytes(item.size)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LibraryHudPreview(props: {
  item: LibraryItem;
  library: OpfsFileLibrary;
}) {
  const appDefinition = props.item.kind === "app" && props.item.app &&
      isLibraryAppId(props.item.app.id)
    ? getLibraryApp(props.item.app.id)
    : null;
  const appSummary = appDefinition && !isLibraryAppOpenable(appDefinition.id)
    ? appDefinition
    : null;
  const appSummaryLinks =
    appSummary?.links?.filter((link) => !isGitHubHref(link.href)) ?? [];
  const appPreview = props.item.kind === "app" ? props.item.app?.preview : undefined;
  const showsAppColor = props.item.kind === "app" && !appPreview;
  const visualRef = getLibraryItemVisualRef(props.item);
  const showsVisual = Boolean(visualRef);
  const { url } = useStoredObjectUrl(
    props.library,
    showsVisual ? visualRef : undefined,
  );
  const { url: motionUrl } = useStoredObjectUrl(
    props.library,
    props.item.kind === "video"
      ? props.item.source
      : props.item.kind === "live-photo"
      ? props.item.motion
      : undefined,
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
        if (active) setTextPreview(text.slice(0, 2_000));
      },
    ).catch(() => {
      if (active) setTextPreview("");
    });
    return () => {
      active = false;
    };
  }, [props.item, props.library]);

  return (
    <div
      className={`file-library-hud-preview-surface is-${props.item.kind}${
        appPreview ? " has-live-app-preview" : ""
      }${showsAppColor ? " has-color-app-preview" : ""}`}
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
            loading="eager"
            sandbox={appPreview.sandbox}
            src={appPreview.src}
            tabIndex={-1}
            title={`${appPreview.title} HUD 预览`}
          />
        )
        : null}
      {showsAppColor
        ? (
          <div
            className={`file-library-hud-preview-app-copy${
              appSummary ? " is-summary" : ""
            }`}
          >
            <span>
              {KIND_LABELS.app}
              {(appDefinition?.tech ?? props.item.app?.tech)?.length
                ? ` · ${
                  (appDefinition?.tech ?? props.item.app?.tech)?.slice(0, 3).join(" / ")
                }`
                : ""}
            </span>
            <strong>{props.item.name}</strong>
            <p>{appDefinition?.description ?? props.item.app?.description}</p>
            {appSummary
              ? (
                <div className="file-library-hud-app-summary">
                  <ul>
                    {appSummary.highlights?.slice(0, 3).map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                  <span className="file-library-hud-app-source">
                    {appSummary.sourcePath}
                  </span>
                  {appSummaryLinks.length
                    ? (
                      <nav
                        aria-label={`${appSummary.name} 入口`}
                        className="file-library-hud-app-links"
                      >
                        {appSummaryLinks.map((link) => {
                          const external = /^https?:\/\//.test(link.href);
                          return (
                            <a
                              download={link.download}
                              href={link.href}
                              key={`${link.label}:${link.href}`}
                              rel={external ? "noreferrer" : undefined}
                              target={external ? "_blank" : undefined}
                            >
                              {link.download
                                ? <DownloadSimple aria-hidden="true" size={18} />
                                : <ArrowSquareOut aria-hidden="true" size={18} />}
                              {link.label}
                            </a>
                          );
                        })}
                      </nav>
                    )
                    : null}
                </div>
              )
              : null}
          </div>
        )
        : null}
      {props.item.kind === "audio"
        ? <LibraryHudAudio artworkUrl={url} item={props.item} />
        : motionUrl
        ? (
          <video
            aria-label={`${props.item.name} 静音循环预览`}
            autoPlay
            loop
            muted
            playsInline
            poster={url || undefined}
            preload="metadata"
            src={motionUrl}
          />
        )
        : url
        ? <img alt="" src={url} />
        : null}
      {props.item.kind === "text" ? <pre>{textPreview || "文本内容"}</pre> : null}
      {props.item.kind === "link" && props.item.url
        ? (
          <div className="file-library-hud-preview-link">
            <LinkSimple aria-hidden="true" size={44} />
            <span>{new URL(props.item.url).hostname}</span>
          </div>
        )
        : null}
      {!appPreview && !showsAppColor && !url && props.item.kind !== "audio" &&
          props.item.kind !== "text" && props.item.kind !== "link"
        ? (
          <span className="file-library-hud-preview-file">
            {props.item.source.name.split(".").pop()?.toUpperCase() || "FILE"}
          </span>
        )
        : null}
    </div>
  );
}

function LibraryStorageOverview(props: {
  storage: StorageEstimate | null;
  items: readonly LibraryItem[];
  fileCount: number;
  query: string;
  resultCount: number;
  privateMesh: PrivateMeshSessionSnapshot;
  onQueryChange: (query: string) => void;
  onOpenPrivateMesh: () => void;
}) {
  const heatmap = summarizeFileLibraryStorageHeatmap(props.items, props.storage);
  const summary = heatmap.summary;
  const availableTile = heatmap.tiles.find((tile) => tile.id === "available");
  const storageOverlayWidth = Math.max(58, availableTile?.rect.width ?? 100);

  return (
    <section
      aria-label="文件库存储空间"
      className="file-library-storage-overview"
      style={{
        "--file-library-storage-overlay-width": `${storageOverlayWidth}%`,
      } as CSSProperties}
    >
      <div
        aria-label="按文件类型显示的存储空间热力图"
        className="file-library-storage-heatmap"
        role="list"
      >
        {heatmap.tiles.map((tile) => (
          <div
            aria-label={`${tile.label} ${tile.valueLabel}`}
            className="file-library-storage-tile"
            data-emphasis={tile.emphasis}
            data-storage-kind={tile.id}
            key={tile.id}
            role="listitem"
            style={{
              left: `${tile.rect.x}%`,
              top: `${tile.rect.y}%`,
              width: `${tile.rect.width}%`,
              height: `${tile.rect.height}%`,
            }}
          >
            <span className="file-library-storage-tile-copy">
              <strong>{tile.label}</strong>
              <span>{tile.valueLabel}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="file-library-storage-overview-copy">
        <span>OPFS · {props.fileCount} 项</span>
        <strong>{summary?.usageLabel ?? "—"}</strong>
        <div className="file-library-storage-overview-meta">
          <p>
            {summary
              ? `已使用 · ${props.fileCount} 项`
              : "正在读取当前浏览器的存储空间"}
          </p>
          <p>{summary ? `共 ${summary.quotaLabel}` : "OPFS 本地存储"}</p>
        </div>
      </div>

      <div className="file-library-storage-overview-foot">
        <p className="file-library-storage-persistence">
          {summary
            ? summary.persisted ? "持久存储已启用" : "未启用持久存储"
            : "存储状态将在文件库打开后显示"}
        </p>
        <button
          className="file-library-private-mesh-trigger"
          type="button"
          onClick={props.onOpenPrivateMesh}
        >
          <LinkSimple aria-hidden="true" size={18} />
          {props.privateMesh.status === "ready"
            ? `${props.privateMesh.meshName} · ${props.privateMesh.memberCount} 台设备`
            : props.privateMesh.status === "loading"
            ? "正在读取私有网络"
            : props.privateMesh.status === "error"
            ? "私有网络需要处理"
            : props.privateMesh.pendingPairing
            ? "继续设备配对"
            : "创建或加入私有网络"}
        </button>
        <label className="file-library-search file-library-hud-search">
          <MagnifyingGlass aria-hidden="true" size={21} />
          <input
            aria-label={`搜索文件，当前 ${props.resultCount} 项`}
            placeholder={`搜索 ${props.resultCount} 项`}
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") props.onQueryChange("");
            }}
          />
        </label>
      </div>
    </section>
  );
}

function PrivateMeshPanel(props: {
  session: FileLibrarySession;
  snapshot: PrivateMeshSessionSnapshot;
  onClose: () => void;
}) {
  const [meshName, setMeshName] = useState("我的文件网络");
  const [nodeName, setNodeName] = useState("");
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [recoveryPassphraseConfirmation, setRecoveryPassphraseConfirmation] = useState(
    "",
  );
  const [requestCode, setRequestCode] = useState("");
  const [approvalCode, setApprovalCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [transportTargetNodeId, setTransportTargetNodeId] = useState("");
  const [transportOffer, setTransportOffer] = useState<
    { nodeId: string; code: string } | null
  >(null);
  const [transportAnswerCode, setTransportAnswerCode] = useState("");
  const [incomingTransportOffer, setIncomingTransportOffer] = useState("");
  const [transportAnswerResult, setTransportAnswerResult] = useState("");
  const [epochUpdateCode, setEpochUpdateCode] = useState("");
  const [revokeCandidateNodeId, setRevokeCandidateNodeId] = useState<string | null>(
    null,
  );
  const [usePublicStun, setUsePublicStun] = useState(false);
  const [remoteFileReadKey, setRemoteFileReadKey] = useState<string | null>(null);
  const remoteFileReadCanceled = useRef(false);
  const [approvalResult, setApprovalResult] = useState<
    null | {
      approvalCode: string;
      verificationCode: string;
    }
  >(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const revokeCandidate = props.snapshot.status === "ready"
    ? props.snapshot.members.find((member) =>
      member.nodeId === revokeCandidateNodeId &&
      member.nodeId !== props.snapshot.localNodeId &&
      member.role !== "owner"
    )
    : undefined;

  async function run(action: () => Promise<boolean>): Promise<void> {
    setWorking(true);
    setError("");
    try {
      if (!await action()) setError("操作未完成，请检查输入后重试");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setWorking(false);
    }
  }

  async function readRemoteFile(
    remoteNodeId: string,
    itemId: string,
  ): Promise<void> {
    const key = `${remoteNodeId}:${itemId}`;
    remoteFileReadCanceled.current = false;
    setRemoteFileReadKey(key);
    setWorking(true);
    setError("");
    try {
      const completed = await props.session.importPrivateMeshRemoteFile(
        remoteNodeId,
        itemId,
      );
      if (!completed && !remoteFileReadCanceled.current) {
        setError("无法读取远程文件，请检查设备连接后重试");
      }
    } catch (cause) {
      if (!remoteFileReadCanceled.current) {
        setError(cause instanceof Error ? cause.message : "无法读取远程文件");
      }
    } finally {
      setWorking(false);
      setRemoteFileReadKey(null);
    }
  }

  return (
    <section
      aria-label="私有网络"
      aria-modal="true"
      className="file-library-private-mesh-panel file-library-hud"
      role="dialog"
    >
      <header>
        <span>
          <small>PRIVATE MESH</small>
          <strong>私有设备网络</strong>
        </span>
        <button
          aria-label="关闭私有网络面板"
          type="button"
          onClick={() => {
            props.session.cancelPrivateMeshRemoteFileImport();
            props.onClose();
          }}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      {props.snapshot.status === "loading"
        ? <p>正在读取当前设备的网络身份…</p>
        : props.snapshot.status === "error"
        ? (
          <div className="file-library-private-mesh-notice is-error" role="alert">
            <strong>无法打开私有网络身份</strong>
            <span>{props.snapshot.message}</span>
            <small>为防止身份丢失，OpenFX 不会自动覆盖损坏状态。</small>
          </div>
        )
        : props.snapshot.status === "ready"
        ? (
          <div className="file-library-private-mesh-content">
            <div className="file-library-private-mesh-summary">
              <span>
                {props.snapshot.localNodeRole === "owner" ? "所有者设备" : "成员设备"}
              </span>
              <strong>{props.snapshot.meshName}</strong>
              <small>
                本机：{props.snapshot.localNodeName} · 密钥代次 {props.snapshot.epoch}
              </small>
              <code>{props.snapshot.meshId}</code>
            </div>
            <div className="file-library-private-mesh-members">
              <strong>{props.snapshot.memberCount} 台成员设备</strong>
              <ul>
                {props.snapshot.members.map((member) => (
                  <li key={member.nodeId}>
                    <span>
                      <strong>{member.nodeName}</strong>
                      <small>{member.role === "owner" ? "所有者" : "成员"}</small>
                    </span>
                    {props.snapshot.canInvite &&
                        member.nodeId !== props.snapshot.localNodeId &&
                        member.role !== "owner"
                      ? (
                        <button
                          aria-label={`撤销 ${member.nodeName}`}
                          disabled={working}
                          type="button"
                          onClick={() => setRevokeCandidateNodeId(member.nodeId)}
                        >
                          撤销
                        </button>
                      )
                      : null}
                  </li>
                ))}
              </ul>
              {revokeCandidate
                ? (
                  <div
                    aria-label={`确认撤销 ${revokeCandidate.nodeName}`}
                    className="file-library-private-mesh-revoke-confirm"
                    role="alertdialog"
                  >
                    <strong>撤销“{revokeCandidate.nodeName}”？</strong>
                    <small>
                      确认后会立即轮换网络密钥；仍获授权的离线设备需要专用更新码才能进入当前代次。
                    </small>
                    <span>
                      <button
                        disabled={working}
                        type="button"
                        onClick={() => setRevokeCandidateNodeId(null)}
                      >
                        取消
                      </button>
                      <button
                        disabled={working}
                        type="button"
                        onClick={() =>
                          void run(async () => {
                            const revoked = await props.session
                              .revokePrivateMeshMember(revokeCandidate.nodeId);
                            if (revoked) setRevokeCandidateNodeId(null);
                            return revoked;
                          })}
                      >
                        {working ? "正在撤销…" : "确认撤销并轮换密钥"}
                      </button>
                    </span>
                  </div>
                )
                : null}
            </div>
            {props.snapshot.pendingEpochUpdates.length > 0
              ? (
                <div className="file-library-private-mesh-epoch-updates">
                  <strong>等待密钥更新</strong>
                  <small>
                    在线设备会自动确认；请把下面的逐设备更新码交给仍获授权的离线设备。
                  </small>
                  <ul>
                    {props.snapshot.pendingEpochUpdates.map((update) => (
                      <li key={update.nodeId}>
                        <span>{update.nodeName}</span>
                        <textarea
                          aria-label={`${update.nodeName} 的密钥更新码`}
                          readOnly
                          rows={3}
                          value={update.updateCode}
                          onFocus={(event) =>
                            event.currentTarget.select()}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )
              : null}
            {props.snapshot.localNodeRole === "member"
              ? (
                <form
                  className="file-library-private-mesh-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const accepted = await props.session
                        .acceptPrivateMeshEpochUpdate(epochUpdateCode);
                      if (accepted) setEpochUpdateCode("");
                      return accepted;
                    });
                  }}
                >
                  <strong>更新网络密钥代次</strong>
                  <small>若本机在轮换时离线，请粘贴所有者设备提供的专用更新码。</small>
                  <textarea
                    aria-label="私有网络密钥更新码"
                    placeholder="openfx-epoch-v1.…"
                    required
                    rows={4}
                    value={epochUpdateCode}
                    onChange={(event) => setEpochUpdateCode(event.target.value)}
                  />
                  <button disabled={working} type="submit">验证并更新</button>
                </form>
              )
              : null}
            {props.snapshot.members.some((member) =>
                member.nodeId !== props.snapshot.localNodeId
              )
              ? (
                <div className="file-library-private-mesh-transport">
                  <label className="file-library-private-mesh-stun-option">
                    <input
                      checked={usePublicStun}
                      type="checkbox"
                      onChange={(event) => setUsePublicStun(event.target.checked)}
                    />
                    <span>
                      <strong>允许公共 STUN 辅助寻址</strong>
                      <small>
                        关闭时只尝试局域网直连；开启后会向 Cloudflare STUN
                        暴露当前公网地址，但连接码、目录和文件仍不经过该服务。
                      </small>
                    </span>
                  </label>
                  <form
                    className="file-library-private-mesh-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        const offered = await props.session
                          .createPrivateMeshTransportOffer(
                            transportTargetNodeId,
                            { usePublicStun },
                          );
                        if (!offered) return false;
                        setTransportOffer({
                          nodeId: transportTargetNodeId,
                          code: offered.offerCode,
                        });
                        setTransportAnswerCode("");
                        return true;
                      });
                    }}
                  >
                    <strong>
                      {usePublicStun ? "公共 STUN 辅助直连" : "同一局域网直连"}
                    </strong>
                    <small>
                      {usePublicStun
                        ? "连接码由成员密钥签名，不经过 Deno Deploy；STUN 只帮助发现可直连地址，不提供中继。"
                        : "连接码由成员密钥签名，不经过 Deno Deploy；当前只收集本机 WebRTC 地址，跨公网连接仍需后续发现或中继层。"}
                    </small>
                    <select
                      aria-label="要连接的成员设备"
                      required
                      value={transportTargetNodeId}
                      onChange={(event) => setTransportTargetNodeId(event.target.value)}
                    >
                      <option value="">选择目标设备</option>
                      {props.snapshot.members.flatMap((member) =>
                        member.nodeId === props.snapshot.localNodeId ? [] : [
                          <option key={member.nodeId} value={member.nodeId}>
                            {member.nodeName}
                          </option>,
                        ]
                      )}
                    </select>
                    <button disabled={working} type="submit">生成连接 offer</button>
                    {transportOffer
                      ? (
                        <div className="file-library-private-mesh-code">
                          <textarea
                            aria-label="WebRTC 连接 offer"
                            readOnly
                            rows={4}
                            value={transportOffer.code}
                            onFocus={(event) => event.currentTarget.select()}
                          />
                          <textarea
                            aria-label="WebRTC 连接 answer"
                            placeholder="粘贴目标设备返回的 openfx-rtc-v1.…"
                            required
                            rows={4}
                            value={transportAnswerCode}
                            onChange={(event) =>
                              setTransportAnswerCode(event.target.value)}
                          />
                          <button
                            disabled={working}
                            type="button"
                            onClick={() => {
                              void run(() =>
                                props.session.completePrivateMeshTransportOffer(
                                  transportOffer.nodeId,
                                  transportAnswerCode,
                                )
                              );
                            }}
                          >
                            完成直连
                          </button>
                        </div>
                      )
                      : null}
                  </form>
                  <form
                    className="file-library-private-mesh-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        const accepted = await props.session
                          .acceptPrivateMeshTransportOffer(
                            incomingTransportOffer,
                            { usePublicStun },
                          );
                        if (!accepted) return false;
                        setTransportAnswerResult(accepted.answerCode);
                        return true;
                      });
                    }}
                  >
                    <strong>接受成员连接</strong>
                    <textarea
                      aria-label="收到的 WebRTC 连接 offer"
                      placeholder="粘贴成员设备发来的 openfx-rtc-v1.…"
                      required
                      rows={4}
                      value={incomingTransportOffer}
                      onChange={(event) =>
                        setIncomingTransportOffer(event.target.value)}
                    />
                    <button disabled={working} type="submit">验证并生成 answer</button>
                    {transportAnswerResult
                      ? (
                        <textarea
                          aria-label="返回的 WebRTC 连接 answer"
                          readOnly
                          rows={4}
                          value={transportAnswerResult}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      )
                      : null}
                  </form>
                  {props.snapshot.connections.length > 0
                    ? (
                      <div className="file-library-private-mesh-connections">
                        <strong>当前设备连接</strong>
                        <ul>
                          {props.snapshot.connections.map((connection) => (
                            <li key={connection.nodeId}>
                              <span>{connection.nodeName}</span>
                              <small>
                                {connection.status === "connected"
                                  ? "已连接"
                                  : connection.status === "connecting"
                                  ? "连接中"
                                  : connection.message ?? "连接失败"}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                    : null}
                  {props.snapshot.remoteFiles.length > 0
                    ? (
                      <div className="file-library-private-mesh-remote-files">
                        <strong>远程文件目录</strong>
                        <small>
                          这里只持久保存受限元数据；设备在线时点按才会读取原件。
                        </small>
                        <ul>
                          {props.snapshot.remoteFiles.map((entry) => {
                            const remoteFileKey = `${entry.nodeId}:${entry.itemId}`;
                            const reading = working &&
                              remoteFileReadKey === remoteFileKey;
                            return (
                              <li key={remoteFileKey}>
                                <div className="file-library-private-mesh-remote-main">
                                  <PrivateMeshRemoteThumbnail
                                    entry={entry}
                                    session={props.session}
                                  />
                                  <span className="file-library-private-mesh-remote-details">
                                    <strong>{entry.name}</strong>
                                    <small>
                                      {entry.nodeName} ·{" "}
                                      {formatLibraryBytes(entry.size)} ·
                                      {entry.availability === "online"
                                        ? " 在线"
                                        : " 离线缓存"}
                                    </small>
                                  </span>
                                </div>
                                <button
                                  aria-label={reading
                                    ? `取消读取 ${entry.name}`
                                    : `读取 ${entry.name}`}
                                  disabled={!reading &&
                                    (working || entry.availability !== "online" ||
                                      entry.size > 4 * 1024 * 1024)}
                                  type="button"
                                  onClick={() => {
                                    if (reading) {
                                      remoteFileReadCanceled.current = true;
                                      props.session.cancelPrivateMeshRemoteFileImport();
                                    } else {
                                      void readRemoteFile(
                                        entry.nodeId,
                                        entry.itemId,
                                      );
                                    }
                                  }}
                                >
                                  {reading
                                    ? "取消"
                                    : entry.availability !== "online"
                                    ? "设备离线"
                                    : entry.size > 4 * 1024 * 1024
                                    ? "暂不支持"
                                    : "读取"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )
                    : null}
                </div>
              )
              : null}
            {props.snapshot.canInvite
              ? (
                <form
                  className="file-library-private-mesh-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const approved = await props.session.approvePrivateMeshPairing(
                        requestCode,
                      );
                      if (!approved) return false;
                      setApprovalResult(approved);
                      return true;
                    });
                  }}
                >
                  <strong>批准新设备</strong>
                  <small>在新设备生成请求码，粘贴到这里并核对六位验证码。</small>
                  <textarea
                    aria-label="新设备配对请求码"
                    placeholder="openfx-pair-v1.…"
                    required
                    rows={3}
                    value={requestCode}
                    onChange={(event) => setRequestCode(event.target.value)}
                  />
                  <button disabled={working} type="submit">
                    {working ? "正在验证…" : "验证并批准"}
                  </button>
                  {approvalResult
                    ? (
                      <div className="file-library-private-mesh-code">
                        <span>双方验证码</span>
                        <strong>{approvalResult.verificationCode}</strong>
                        <textarea
                          aria-label="设备配对批准码"
                          readOnly
                          rows={4}
                          value={approvalResult.approvalCode}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <small>把批准码交回刚才的新设备，完成加入。</small>
                      </div>
                    )
                    : null}
                </form>
              )
              : (
                <div className="file-library-private-mesh-notice">
                  当前设备可以访问和存储文件，但不能邀请其他设备。
                </div>
              )}
          </div>
        )
        : (
          <div className="file-library-private-mesh-content">
            {props.snapshot.pendingPairing
              ? (
                <form
                  className="file-library-private-mesh-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const accepted = await props.session.acceptPrivateMeshPairing(
                        approvalCode,
                      );
                      if (accepted) setApprovalCode("");
                      return accepted;
                    });
                  }}
                >
                  <strong>等待已有设备批准</strong>
                  <small>
                    请求设备：{props.snapshot.pendingPairing.nodeName} · 验证码
                  </small>
                  <div className="file-library-private-mesh-verification">
                    {props.snapshot.pendingPairing.verificationCode}
                  </div>
                  <textarea
                    aria-label="当前设备配对请求码"
                    readOnly
                    rows={4}
                    value={props.snapshot.pendingPairing.requestCode}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <textarea
                    aria-label="已有设备返回的批准码"
                    placeholder="粘贴 openfx-approve-v1.…"
                    required
                    rows={4}
                    value={approvalCode}
                    onChange={(event) => setApprovalCode(event.target.value)}
                  />
                  <button disabled={working} type="submit">
                    {working ? "正在加入…" : "完成加入"}
                  </button>
                </form>
              )
              : (
                <>
                  <form
                    className="file-library-private-mesh-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        if (
                          recoveryPassphrase !== recoveryPassphraseConfirmation
                        ) {
                          throw new Error("两次输入的恢复口令不一致");
                        }
                        const created = await props.session.createPrivateNetwork({
                          meshName,
                          nodeName,
                          recoveryPassphrase,
                        });
                        if (!created) return false;
                        setRecoveryCode(created.recoveryCode);
                        setRecoveryPassphrase("");
                        setRecoveryPassphraseConfirmation("");
                        return true;
                      });
                    }}
                  >
                    <strong>创建私有网络</strong>
                    <small>
                      本机成为所有者，不创建账号，也不向 Deno Deploy 上传身份。
                    </small>
                    <input
                      aria-label="私有网络名称"
                      maxLength={80}
                      required
                      value={meshName}
                      onChange={(event) => setMeshName(event.target.value)}
                    />
                    <input
                      aria-label="当前设备名称"
                      maxLength={80}
                      placeholder="例如：MacBook"
                      required
                      value={nodeName}
                      onChange={(event) => setNodeName(event.target.value)}
                    />
                    <input
                      aria-label="恢复口令"
                      autoComplete="new-password"
                      maxLength={256}
                      minLength={12}
                      placeholder="恢复口令（至少 12 个字符）"
                      required
                      type="password"
                      value={recoveryPassphrase}
                      onChange={(event) => setRecoveryPassphrase(event.target.value)}
                    />
                    <input
                      aria-label="确认恢复口令"
                      autoComplete="new-password"
                      maxLength={256}
                      minLength={12}
                      placeholder="再次输入恢复口令"
                      required
                      type="password"
                      value={recoveryPassphraseConfirmation}
                      onChange={(event) =>
                        setRecoveryPassphraseConfirmation(event.target.value)}
                      onInvalid={(event) => {
                        event.currentTarget.setCustomValidity(
                          recoveryPassphraseConfirmation === recoveryPassphrase
                            ? ""
                            : "两次输入的恢复口令不一致",
                        );
                      }}
                      onInput={(event) => {
                        event.currentTarget.setCustomValidity(
                          event.currentTarget.value === recoveryPassphrase
                            ? ""
                            : "两次输入的恢复口令不一致",
                        );
                      }}
                    />
                    <button disabled={working} type="submit">
                      {working ? "正在生成密钥…" : "创建网络"}
                    </button>
                  </form>
                  <form
                    className="file-library-private-mesh-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () =>
                        Boolean(
                          await props.session.beginPrivateMeshPairing({ nodeName }),
                        )
                      );
                    }}
                  >
                    <strong>加入已有网络</strong>
                    <small>先生成一次性请求码，再由网络中的所有者设备批准。</small>
                    <input
                      aria-label="待加入设备名称"
                      maxLength={80}
                      placeholder="当前设备名称"
                      required
                      value={nodeName}
                      onChange={(event) => setNodeName(event.target.value)}
                    />
                    <button disabled={working} type="submit">生成配对请求</button>
                  </form>
                </>
              )}
          </div>
        )}

      {recoveryCode
        ? (
          <div className="file-library-private-mesh-recovery" role="status">
            <strong>立即保存恢复码</strong>
            <small>
              它已由恢复口令加密，二者缺一不可；本次关闭后不会再次自动显示。
            </small>
            <textarea
              aria-label="私有网络恢复码"
              readOnly
              rows={5}
              value={recoveryCode}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )
        : null}
      {error
        ? <p className="file-library-private-mesh-error" role="alert">{error}</p>
        : null}
    </section>
  );
}

function LibraryViewer(props: {
  item: LibraryItem;
  library: OpfsFileLibrary;
  onClose: () => void;
  onDelete: (item: LibraryItem) => Promise<void>;
  onItemsChange: (items: LibraryItem[]) => void;
  onUpdate: (id: string, patch: LibraryItemDetailsPatch) => Promise<boolean>;
  renderApp: (appId: LibraryAppId) => ReactNode;
}) {
  const mediaPlayerIframeRef = useRef<HTMLIFrameElement>(null);
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
  const audioArtwork = useStoredObjectUrl(
    props.library,
    props.item.kind === "audio" ? props.item.preview : undefined,
  );
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloadingFormat, setDownloadingFormat] = useState<
    LivePhotoExportFormat | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [nameDraft, setNameDraft] = useState(props.item.name);
  const [albums, setAlbums] = useState((props.item.albums ?? []).join(", "));
  const [mediaPlayerSource] = useState(() =>
    props.item.kind === "video"
      ? makeMediaPlayerUrl(props.item.source, {
        itemId: props.item.id,
        resumePositionSec: props.item.playback?.watchState === "in-progress"
          ? props.item.playback.positionSec
          : 0,
        subtitles: props.item.subtitles,
      })
      : ""
  );

  useEffect(() => {
    setNameDraft(props.item.name);
    setAlbums((props.item.albums ?? []).join(", "));
    setEditError("");
  }, [props.item.id, props.item.name, props.item.albums]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmDelete) {
        setConfirmDelete(false);
      } else if (showDownloadOptions) {
        setShowDownloadOptions(false);
        setDownloadError("");
      } else if (showEditor) {
        setShowEditor(false);
        setEditError("");
      } else if (showInfo) {
        setShowInfo(false);
      } else {
        props.onClose();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, props.onClose, showDownloadOptions, showEditor, showInfo]);

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
    const stored = await props.library.getStoredFile(reference ?? props.item.source);
    saveDownload(stored);
  }

  async function downloadLivePhoto(format: LivePhotoExportFormat) {
    if (props.item.kind !== "live-photo") return;
    setDownloadError("");
    setDownloadingFormat(format);
    try {
      saveDownload(await props.library.exportLivePhoto(props.item, format));
      setShowDownloadOptions(false);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "无法导出实况图片");
    } finally {
      setDownloadingFormat(null);
    }
  }

  function toggleDownloadOptions() {
    setShowEditor(false);
    setShowInfo(false);
    setConfirmDelete(false);
    setDownloadError("");
    setShowDownloadOptions((current) => !current);
  }

  async function remove() {
    setDeleting(true);
    try {
      await props.onDelete(props.item);
    } finally {
      setDeleting(false);
    }
  }

  async function saveEdits() {
    setEditError("");
    setSaving(true);
    try {
      const name = normalizeLibraryItemName(nameDraft);
      const saved = await props.onUpdate(props.item.id, {
        name,
        albums: props.item.kind === "image" || props.item.kind === "live-photo"
          ? albums.split(",")
          : undefined,
      });
      if (!saved) throw new Error("无法保存文件信息");
      setShowEditor(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "无法保存文件信息");
    } finally {
      setSaving(false);
    }
  }

  function toggleEditor() {
    setShowInfo(false);
    setShowDownloadOptions(false);
    setDownloadError("");
    setConfirmDelete(false);
    setNameDraft(props.item.name);
    setAlbums((props.item.albums ?? []).join(", "));
    setEditError("");
    setShowEditor((current) => !current);
  }

  function syncMediaPlayerFileDetails() {
    mediaPlayerIframeRef.current?.contentWindow?.postMessage(
      makeMediaPlayerFileDetailsMessage(props.item.id, props.item.name),
      location.origin,
    );
  }

  useEffect(() => {
    if (props.item.kind === "video") syncMediaPlayerFileDetails();
  }, [props.item.id, props.item.kind, props.item.name]);

  useEffect(() => {
    if (props.item.kind !== "video") return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== mediaPlayerIframeRef.current?.contentWindow ||
        !isMediaPlayerFileActionMessage(event.data) ||
        event.data.itemId !== props.item.id
      ) return;

      if (event.data.action === "close") {
        props.onClose();
      } else if (event.data.action === "edit") {
        toggleEditor();
      } else if (event.data.action === "download") {
        void download();
      } else if (event.data.action === "delete") {
        setShowEditor(false);
        setConfirmDelete(true);
      }
    };
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, [props.item.id, props.item.kind, props.onClose]);

  return (
    <section
      aria-label={`${props.item.name} 预览`}
      aria-modal="true"
      className={`file-library-viewer is-${props.item.kind}`}
      role="dialog"
    >
      {props.item.kind === "video" ? null : (
        <>
          <div className="file-library-viewer-head file-library-viewer-surface">
            <button aria-label="返回文件库" type="button" onClick={props.onClose}>
              <ArrowLeft aria-hidden="true" size={22} />
            </button>
            <span className="file-library-viewer-title">
              <strong>
                {props.item.kind === "audio"
                  ? getAudioTitle(props.item)
                  : props.item.name}
              </strong>
              <small>
                {props.item.kind === "app"
                  ? KIND_LABELS[props.item.kind]
                  : `${KIND_LABELS[props.item.kind]} · ${
                    formatLibraryBytes(props.item.size)
                  }`}
              </small>
            </span>
          </div>
          {props.item.kind === "app" ? null : (
            <nav
              aria-label={`${props.item.name} 文件操作`}
              className="file-library-viewer-actions file-library-viewer-surface"
            >
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
                      onClick={() => {
                        setShowEditor(false);
                        setShowDownloadOptions(false);
                        setDownloadError("");
                        setShowInfo((current) => !current);
                      }}
                    >
                      <Info aria-hidden="true" size={21} />
                    </button>
                  </>
                )
                : null}
              <button
                aria-label="编辑文件"
                aria-pressed={showEditor}
                type="button"
                onClick={toggleEditor}
              >
                <PencilSimple aria-hidden="true" size={20} />
              </button>
              <button
                aria-label={props.item.kind === "live-photo" ? "选择下载格式" : "下载"}
                aria-pressed={props.item.kind === "live-photo"
                  ? showDownloadOptions
                  : undefined}
                type="button"
                onClick={() =>
                  props.item.kind === "live-photo"
                    ? toggleDownloadOptions()
                    : void download()}
              >
                <DownloadSimple aria-hidden="true" size={21} />
              </button>
              <button
                aria-label="删除"
                disabled={deleting}
                type="button"
                onClick={() => {
                  setShowDownloadOptions(false);
                  setDownloadError("");
                  setConfirmDelete(true);
                }}
              >
                <Trash aria-hidden="true" size={20} />
              </button>
            </nav>
          )}
        </>
      )}

      <div className="file-library-viewer-stage">
        {props.item.kind === "app" && props.item.app &&
            isLibraryAppId(props.item.app.id)
          ? props.renderApp(props.item.app.id)
          : null}
        {props.item.kind === "image" && image.url
          ? <img alt={props.item.name} src={image.url} />
          : null}
        {props.item.kind === "video" && mediaPlayerSource
          ? (
            <iframe
              allow="autoplay; fullscreen"
              ref={mediaPlayerIframeRef}
              src={mediaPlayerSource}
              title={`${props.item.name} · OpenFX Media Player`}
              onLoad={syncMediaPlayerFileDetails}
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
          ? (
            <LibraryAudioViewer
              artworkUrl={audioArtwork.url}
              item={props.item}
              sourceUrl={media.url}
            />
          )
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
      {showDownloadOptions && props.item.kind === "live-photo" && props.item.motion
        ? (
          <aside
            aria-label="选择实况图片下载格式"
            className="file-library-live-export file-library-hud"
            role="dialog"
          >
            <header>
              <span>
                <strong>下载实况图片</strong>
                <small>原片始终保留在 OPFS 中</small>
              </span>
              <button
                aria-label="关闭下载格式"
                type="button"
                onClick={() => {
                  setShowDownloadOptions(false);
                  setDownloadError("");
                }}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="file-library-live-export-options">
              <button
                autoFocus
                disabled={downloadingFormat !== null}
                type="button"
                onClick={() => void downloadLivePhoto("original-pair")}
              >
                <span className="file-library-live-export-glyphs">
                  <ImagesSquare aria-hidden="true" size={23} />
                  <FilmStrip aria-hidden="true" size={23} />
                </span>
                <span>
                  <strong>原片组合</strong>
                  <small>
                    {(getFileExtension(
                      props.item.still?.name ?? props.item.source.name,
                    ) ||
                      "HEIC").toUpperCase()} +{" "}
                    {(getFileExtension(props.item.motion.name) ||
                      "MOV").toUpperCase()} · ZIP
                  </small>
                </span>
              </button>
              <button
                disabled={downloadingFormat !== null ||
                  !["jpg", "jpeg"].includes(
                    getFileExtension(
                      props.item.preview?.name ?? props.item.still?.name ??
                        props.item.source.name,
                    ),
                  )}
                type="button"
                onClick={() => void downloadLivePhoto("jpeg-pair")}
              >
                <span className="file-library-live-export-glyphs">
                  <ImagesSquare aria-hidden="true" size={23} />
                  <FilmStrip aria-hidden="true" size={23} />
                </span>
                <span>
                  <strong>兼容组合</strong>
                  <small>JPEG + MOV · ZIP</small>
                </span>
              </button>
              <button
                disabled={downloadingFormat !== null}
                type="button"
                onClick={() => void downloadLivePhoto("livp")}
              >
                <FileZip aria-hidden="true" size={24} />
                <span>
                  <strong>OpenFX LIVP</strong>
                  <small>原片 + 动态 · 单文件</small>
                </span>
              </button>
            </div>
            {downloadError ? <small role="alert">{downloadError}</small> : null}
          </aside>
        )
        : null}
      {showEditor && props.item.kind !== "app"
        ? (
          <aside
            aria-label="编辑文件"
            className="file-library-item-editor file-library-hud"
          >
            <header>
              <strong>编辑文件</strong>
              <button
                aria-label="关闭编辑"
                type="button"
                onClick={() => {
                  setShowEditor(false);
                  setEditError("");
                }}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdits();
              }}
            >
              <label>
                <span>文件名</span>
                <input
                  autoFocus
                  maxLength={255}
                  required
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </label>
              {props.item.kind === "image" || props.item.kind === "live-photo"
                ? (
                  <label>
                    <span>相册</span>
                    <input
                      placeholder="以逗号分隔，例如：旅行, 家人"
                      value={albums}
                      onChange={(event) => setAlbums(event.target.value)}
                    />
                  </label>
                )
                : null}
              {editError ? <small role="alert">{editError}</small> : null}
              <footer>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditor(false);
                    setEditError("");
                  }}
                >
                  取消
                </button>
                <button disabled={saving} type="submit">
                  <Check aria-hidden="true" size={18} />
                  {saving ? "保存中…" : "保存"}
                </button>
              </footer>
            </form>
          </aside>
        )
        : null}
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

export function FileLibraryHomepage(props: {
  renderApp: (appId: LibraryAppId) => ReactNode;
}) {
  const [library] = useState(createOpfsFileLibrary);
  const [privateMeshKeyVault] = useState(createIndexedDbPrivateMeshKeyVault);
  const [privateMeshStore] = useState(() =>
    createOpfsPrivateMeshStore(privateMeshKeyVault)
  );
  const [privateMeshCatalogStore] = useState(createOpfsPrivateMeshCatalogStore);
  const [privateMeshThumbnailStore] = useState(
    createOpfsPrivateMeshThumbnailStore,
  );
  const [nativePhotoImporter] = useState(createNativePhotoImporter);
  const [session] = useState(() =>
    createFileLibrarySession({
      store: library,
      createVideoThumbnail,
      defaultAppCount: LIBRARY_APP_COUNT,
      isVisible: () => document.visibilityState !== "hidden",
      nativePhotoImporter,
      privateMeshStore,
      privateMeshCatalogStore,
      privateMeshThumbnailStore,
      privateMeshKeyVault,
      createPrivateMeshThumbnail,
    })
  );
  const [sessionSnapshot, setSessionSnapshot] = useState(session.getSnapshot);
  const { items, busy, message, nativePhotosAvailable, storage, privateMesh } =
    sessionSnapshot;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [gridColumns, setGridColumns] = useState<LibraryGridColumns>(() => {
    try {
      return parseLibraryGridColumns(
        globalThis.localStorage?.getItem(LIBRARY_GRID_COLUMNS_KEY),
      );
    } catch {
      return 3;
    }
  });
  const [dragging, setDragging] = useState(false);
  const [showPrivateMesh, setShowPrivateMesh] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const pinchGesture = useRef<PinchGesture | null>(null);
  const gridEntries = useMemo(
    () => buildSimilarityGridEntries(items),
    [items],
  );
  const matchingIds = useMemo(
    () => new Set(searchLibraryItems(items, query).map((item) => item.id)),
    [items, query],
  );
  const visibleEntries = useMemo(
    () =>
      gridEntries.filter((entry) =>
        entry.items.some((item) => matchingIds.has(item.id))
      ),
    [gridEntries, matchingIds],
  );
  const selectedEntry = selectedId
    ? gridEntries.find((entry) => entry.items.some((item) => item.id === selectedId)) ??
      null
    : null;
  const selected = selectedEntry?.kind === "item" ? selectedEntry.items[0] : null;
  const selectedGitHubLinks = selected?.kind === "app" && selected.app &&
      isLibraryAppId(selected.app.id)
    ? getLibraryApp(selected.app.id).links?.filter((link) => isGitHubHref(link.href)) ??
      []
    : [];
  const viewerItem = viewerItemId
    ? items.find((item) => item.id === viewerItemId && canOpenLibraryItem(item)) ?? null
    : null;
  const hudProgress = useMemo(
    () => summarizeFileLibraryHudProgress(items),
    [items],
  );

  useEffect(() => {
    document.body.classList.add("homepage-body", "file-library-body");
    document.title = "OpenFX 文件库";
    const unsubscribe = session.subscribe(setSessionSnapshot);
    void session.start();
    const disconnectBrowser = connectFileLibrarySessionToBrowser(session);
    return () => {
      disconnectBrowser();
      session.stop();
      unsubscribe();
      document.body.classList.remove("homepage-body", "file-library-body");
    };
  }, [session]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(
        LIBRARY_GRID_COLUMNS_KEY,
        String(gridColumns),
      );
    } catch {
      // A blocked preference store must not disable pinch-to-zoom.
    }
  }, [gridColumns]);

  async function importSelected(files: FileList | readonly File[]) {
    await session.importFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function removeItem(item: LibraryItem) {
    const nextSelectedId =
      selectedEntry?.items.find((candidate) => candidate.id !== item.id)?.id ?? null;
    if (await session.removeItem(item.id)) {
      setSelectedId((current) =>
        selectedEntry?.items.some((candidate) => candidate.id === current)
          ? nextSelectedId
          : current
      );
      setViewerItemId(null);
    }
  }

  function toggleEntrySelection(entry: LibraryGridEntry) {
    setSelectedId((current) =>
      toggleFileLibraryEntrySelection(current, entry, gridEntries)
    );
    setViewerItemId(null);
  }

  const storageText = storage
    ? `${formatLibraryBytes(storage.usage)} / ${formatLibraryBytes(storage.quota)}`
    : "OPFS 本地存储";

  function updatePinchPointer(pointerId: number, x: number, y: number) {
    const gesture = pinchGesture.current;
    if (!gesture || !gesture.pointers.has(pointerId)) return;
    gesture.pointers.set(pointerId, { x, y });
    if (gesture.pointers.size !== 2) return;
    const [first, second] = [...gesture.pointers.values()];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    setGridColumns(
      resolveLibraryGridColumnsFromPinch(
        gesture.initialColumns,
        distance / gesture.initialDistance,
      ),
    );
  }

  function addPinchPointer(pointerId: number, x: number, y: number) {
    if (!pinchGesture.current) {
      pinchGesture.current = {
        initialColumns: gridColumns,
        initialDistance: 0,
        pointers: new Map(),
      };
    }
    const gesture = pinchGesture.current;
    gesture.pointers.set(pointerId, { x, y });
    if (gesture.pointers.size === 2) {
      const [first, second] = [...gesture.pointers.values()];
      gesture.initialColumns = gridColumns;
      gesture.initialDistance = Math.hypot(
        first.x - second.x,
        first.y - second.y,
      );
    }
  }

  function removePinchPointer(pointerId: number) {
    const gesture = pinchGesture.current;
    if (!gesture) return;
    gesture.pointers.delete(pointerId);
    if (gesture.pointers.size === 0) pinchGesture.current = null;
  }

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
      <header className="file-library-head">
        <div className="file-library-hud-preview">
          {selectedEntry?.kind === "group"
            ? (
              <LibrarySimilarityHud
                entry={selectedEntry}
                library={library}
                onOpen={(item) => setViewerItemId(item.id)}
              />
            )
            : selected
            ? <LibraryHudPreview item={selected} library={library} />
            : (
              <LibraryStorageOverview
                fileCount={hudProgress.total}
                items={items}
                query={query}
                resultCount={visibleEntries.length}
                storage={storage}
                privateMesh={privateMesh}
                onQueryChange={setQuery}
                onOpenPrivateMesh={() => setShowPrivateMesh(true)}
              />
            )}
          {selected
            ? canOpenLibraryItem(selected)
              ? (
                <button
                  aria-label={`打开 ${selected.name} 全屏详情`}
                  className="file-library-hud-open"
                  type="button"
                  onClick={() => setViewerItemId(selected.id)}
                />
              )
              : null
            : null}
          {selected
            ? (
              <nav className="file-library-selection-actions" aria-label="所选文件操作">
                {selectedGitHubLinks.map((link) => (
                  <a
                    aria-label={`在 GitHub 打开 ${selected.name}`}
                    href={link.href}
                    key={`${link.label}:${link.href}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <GithubLogo aria-hidden="true" size={22} weight="light" />
                  </a>
                ))}
                <button
                  aria-label={selected.favorite ? "取消收藏" : "收藏"}
                  aria-pressed={Boolean(selected.favorite)}
                  type="button"
                  onClick={() =>
                    void session.setFavorite(selected.id, !selected.favorite)}
                >
                  <HeartStraight aria-hidden="true" size={22} weight="light" />
                </button>
              </nav>
            )
            : null}
        </div>
        <span className="sr-only" aria-live="polite">
          {hudProgress.label}，{hudProgress.processed}/{hudProgress.total}；{message}；
          {storageText}
        </span>
      </header>

      <section
        aria-label={`OpenFX 文件库内容，${gridColumns} 列，可双指缩放`}
        className="file-library-grid"
        style={{ "--file-library-grid-columns": gridColumns } as CSSProperties}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") {
            event.currentTarget.setPointerCapture(event.pointerId);
            addPinchPointer(event.pointerId, event.clientX, event.clientY);
          }
        }}
        onPointerMove={(event) => {
          updatePinchPointer(event.pointerId, event.clientX, event.clientY);
        }}
        onPointerUp={(event) => removePinchPointer(event.pointerId)}
        onPointerCancel={(event) => removePinchPointer(event.pointerId)}
      >
        <article
          aria-label="导入照片或文件"
          className="file-library-import-tile"
          role="group"
        >
          <span className="file-library-import-tile-kicker">OPFS INPUT</span>
          <ImagesSquare aria-hidden="true" size={42} weight="thin" />
          <span className="file-library-import-tile-copy">
            <strong>{busy ? "正在导入…" : "导入内容"}</strong>
            <span>从照片图库选取，或导入任意文件</span>
          </span>
          <span className="file-library-import-actions">
            <button
              aria-label="从 Photos 选择照片或实况原片"
              disabled={busy}
              type="button"
              onClick={() => {
                if (nativePhotosAvailable) {
                  void session.importFromPhotos();
                } else {
                  photosInputRef.current?.click();
                }
              }}
            >
              <ImagesSquare aria-hidden="true" size={19} />
              Photos
            </button>
            <button
              aria-label="从文件导入"
              disabled={busy}
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <FolderOpen aria-hidden="true" size={19} />
              文件
            </button>
          </span>
        </article>
        {visibleEntries.map((entry) =>
          entry.kind === "group"
            ? (
              <LibrarySimilarityCard
                entry={entry}
                key={entry.id}
                library={library}
                selected={selectedEntry?.id === entry.id}
                onSelect={() => toggleEntrySelection(entry)}
              />
            )
            : (
              <LibraryCard
                item={entry.items[0]}
                key={entry.id}
                library={library}
                selected={selectedEntry?.id === entry.id}
                onSelect={() => toggleEntrySelection(entry)}
              />
            )
        )}
        {query.trim() && visibleEntries.length === 0
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
      <input
        accept=".heic,.heif,.jpg,.jpeg,.mov,.mp4,image/heic,image/heif,image/jpeg,video/quicktime,video/mp4"
        hidden
        multiple
        ref={photosInputRef}
        type="file"
        onChange={(event) => {
          if (event.target.files) void importSelected(event.target.files);
          event.currentTarget.value = "";
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
      {viewerItem
        ? (
          <LibraryViewer
            item={viewerItem}
            key={viewerItem.id}
            library={library}
            onClose={() => setViewerItemId(null)}
            onDelete={removeItem}
            onItemsChange={session.replaceItems}
            onUpdate={session.updateItemDetails}
            renderApp={props.renderApp}
          />
        )
        : null}
      {showPrivateMesh
        ? (
          <PrivateMeshPanel
            session={session}
            snapshot={privateMesh}
            onClose={() => setShowPrivateMesh(false)}
          />
        )
        : null}
    </main>
  );
}
