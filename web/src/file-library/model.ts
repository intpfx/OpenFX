import {
  createPendingFileFingerprint,
  type FileFingerprint,
  findDuplicateGroups,
  normalizeFileFingerprint,
} from "./similarity-core.ts";

export const FILE_LIBRARY_INDEX_VERSION = 4 as const;

export type LibraryWatchState = "unwatched" | "in-progress" | "watched";

export type LibraryPlaybackState = {
  positionSec: number;
  durationSec: number;
  watchState: LibraryWatchState;
  lastPlayedAt: string;
};

export type LibraryMediaMetadata = {
  kind: "video" | "movie" | "show";
  title?: string;
  year?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  thumbnailTimestampSec?: number;
};

export type LibrarySmartView =
  | "all"
  | "recent"
  | "photos"
  | "live-photos"
  | "favorites"
  | "places"
  | "videos"
  | "movies"
  | "shows"
  | "duplicates";

export type LibraryPhotoMetadata = {
  width?: number;
  height?: number;
  orientation?: number;
  capturedAt?: string;
  make?: string;
  model?: string;
  lensModel?: string;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  rating?: number;
};

export type LibraryPhotoProcessingStage = "metadata" | "motion-photo";

export type LibraryPhotoProcessing = {
  status: "pending" | "running" | "completed" | "failed";
  stage: LibraryPhotoProcessingStage;
  attempts: number;
  error?: string;
};

export type LibraryItemKind =
  | "app"
  | "image"
  | "live-photo"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "link"
  | "file";

export type StoredFileRef = {
  path: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

export type LibraryAppRef = {
  id: string;
  description: string;
  preview?: {
    src: string;
    title: string;
    sandbox?: string;
  };
  tech: string[];
  sourcePath: string;
};

export type LibraryItem = {
  id: string;
  kind: LibraryItemKind;
  name: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  source: StoredFileRef;
  preview?: StoredFileRef;
  motion?: StoredFileRef;
  subtitles?: StoredFileRef[];
  playback?: LibraryPlaybackState;
  media?: LibraryMediaMetadata;
  photo?: LibraryPhotoMetadata;
  processing?: LibraryPhotoProcessing;
  fingerprint?: FileFingerprint;
  favorite?: boolean;
  albums?: string[];
  url?: string;
  app?: LibraryAppRef;
};

export type FileLibraryIndex = {
  version: typeof FILE_LIBRARY_INDEX_VERSION;
  items: LibraryItem[];
};

export type LivePhotoPair = {
  image: File;
  motion: File;
};

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

const VIDEO_EXTENSIONS = new Set([
  "3gp",
  "avi",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "ts",
  "webm",
]);

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "aiff",
  "alac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
]);

const TEXT_EXTENSIONS = new Set([
  "c",
  "conf",
  "cpp",
  "css",
  "csv",
  "env",
  "go",
  "h",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "log",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const SUBTITLE_EXTENSIONS = new Set(["srt", "vtt"]);

const EPISODE_PATTERNS = [
  /^(?<series>.+?)[\s._-]+s(?<season>\d{1,2})[\s._-]*e(?<episode>\d{1,3})/i,
  /^(?<series>.+?)[\s._-]+(?<season>\d{1,2})x(?<episode>\d{1,3})/i,
];

const RELEASE_STOP_WORDS = new Set([
  "1080p",
  "2160p",
  "480p",
  "576p",
  "720p",
  "bluray",
  "brrip",
  "eac3",
  "h264",
  "h265",
  "hdr",
  "hevc",
  "remux",
  "uhd",
  "web-dl",
  "webdl",
  "webrip",
  "x264",
  "x265",
]);

export function getFileExtension(name: string): string {
  const match = /\.([^./]+)$/.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

export function getFileStem(name: string): string {
  return name.replace(/\.[^./]+$/, "").trim().toLowerCase();
}

function cleanMediaTitle(value: string): string {
  return value.replace(/[\[\](){}]+/g, " ").replace(/[._]+/g, " ").replace(/\s+/g, " ")
    .trim().replace(/[-\s]+$/, "");
}

function extractTrailingYear(value: string): { title: string; year?: number } {
  const match = value.match(
    /^(?<title>.+?)\s*(?:\(|\[)?(?<year>(?:19|20)\d{2})(?:\)|\])?$/,
  );
  if (!match?.groups) return { title: value.trim() };
  return {
    title: match.groups.title.trim(),
    year: Number.parseInt(match.groups.year, 10),
  };
}

export function parseLibraryMediaMetadata(name: string): LibraryMediaMetadata {
  const baseName = name.split("/").filter(Boolean).at(-1) ?? name;
  const stem = baseName.replace(/\.[^./]+$/, "");

  for (const pattern of EPISODE_PATTERNS) {
    const match = stem.match(pattern);
    if (!match?.groups) continue;
    const extracted = extractTrailingYear(cleanMediaTitle(match.groups.series));
    return {
      kind: "show",
      title: extracted.title,
      year: extracted.year,
      seasonNumber: Number.parseInt(match.groups.season, 10),
      episodeNumber: Number.parseInt(match.groups.episode, 10),
    };
  }

  const tokens = stem.replace(/[._]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const titleTokens: string[] = [];
  let year: number | undefined;
  for (const token of tokens) {
    const yearMatch = token.match(/^(?:\(|\[)?((?:19|20)\d{2})(?:\)|\])?$/);
    if (yearMatch && titleTokens.length > 0) {
      year = Number.parseInt(yearMatch[1], 10);
      break;
    }
    if (RELEASE_STOP_WORDS.has(token.toLowerCase())) break;
    titleTokens.push(token);
  }

  const title = cleanMediaTitle(titleTokens.join(" "));
  return title ? { kind: "movie", title, year } : { kind: "video" };
}

export function classifyFile(
  input: Pick<File, "name" | "type">,
): Exclude<LibraryItemKind, "live-photo" | "link"> {
  const extension = getFileExtension(input.name);
  const mime = input.type.toLowerCase();

  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) return "text";
  return "file";
}

export function pairLivePhotoFiles(files: readonly File[]): {
  pairs: LivePhotoPair[];
  remaining: File[];
} {
  const imagesByStem = new Map<string, File[]>();
  const motionsByStem = new Map<string, File[]>();

  for (const candidate of files) {
    const stem = getFileStem(candidate.name);
    const extension = getFileExtension(candidate.name);
    const kind = classifyFile(candidate);
    if (kind === "image") {
      imagesByStem.set(stem, [...(imagesByStem.get(stem) ?? []), candidate]);
    } else if (kind === "video" && (extension === "mov" || extension === "mp4")) {
      motionsByStem.set(stem, [...(motionsByStem.get(stem) ?? []), candidate]);
    }
  }

  const used = new Set<File>();
  const pairs: LivePhotoPair[] = [];

  for (const [stem, images] of imagesByStem) {
    const motions = motionsByStem.get(stem) ?? [];
    const pairCount = Math.min(images.length, motions.length);
    for (let index = 0; index < pairCount; index += 1) {
      const image = images[index];
      const motion = motions[index];
      used.add(image);
      used.add(motion);
      pairs.push({ image, motion });
    }
  }

  return {
    pairs,
    remaining: files.filter((candidate) => !used.has(candidate)),
  };
}

function isSubtitleForVideo(videoName: string, subtitleName: string): boolean {
  if (!SUBTITLE_EXTENSIONS.has(getFileExtension(subtitleName))) return false;
  const videoStem = getFileStem(videoName);
  const subtitleStem = getFileStem(subtitleName);
  if (subtitleStem === videoStem) return true;
  if (!subtitleStem.startsWith(videoStem)) return false;
  const next = subtitleStem[videoStem.length];
  return next === "." || next === " " || next === "_" || next === "-";
}

export function linkSidecarSubtitles(items: readonly LibraryItem[]): LibraryItem[] {
  const subtitleItems = items.filter((item) =>
    SUBTITLE_EXTENSIONS.has(getFileExtension(item.source.name))
  );
  return items.map((item) => {
    if (item.kind !== "video") return item;
    const subtitles = subtitleItems
      .filter((candidate) =>
        isSubtitleForVideo(item.source.name, candidate.source.name)
      )
      .map((candidate) => candidate.source)
      .sort((left, right) => left.name.localeCompare(right.name));
    return { ...item, subtitles };
  });
}

export function deriveLibraryWatchState(input: {
  positionSec: number;
  durationSec: number;
  previous?: LibraryWatchState;
  ended?: boolean;
}): LibraryWatchState {
  const watchedFraction = input.durationSec > 0
    ? input.positionSec / input.durationSec
    : 0;
  if (
    input.ended ||
    watchedFraction >= 0.95 ||
    (input.durationSec >= 300 && input.durationSec - input.positionSec <= 30)
  ) {
    return "watched";
  }
  const progressThreshold = input.durationSec > 0
    ? Math.min(10, input.durationSec * 0.1)
    : 10;
  if (input.positionSec > progressThreshold) return "in-progress";
  return input.previous ?? "unwatched";
}

export function createEmptyLibraryIndex(): FileLibraryIndex {
  return { version: FILE_LIBRARY_INDEX_VERSION, items: [] };
}

function isStoredFileRef(value: unknown): value is StoredFileRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredFileRef>;
  return typeof candidate.path === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.lastModified === "number";
}

export function parseLibraryIndex(value: unknown): FileLibraryIndex {
  if (!value || typeof value !== "object") return createEmptyLibraryIndex();
  const candidate = value as Partial<FileLibraryIndex>;
  const version = (value as { version?: unknown }).version;
  if (
    (version !== 1 && version !== 2 && version !== 3 &&
      version !== FILE_LIBRARY_INDEX_VERSION) ||
    !Array.isArray(candidate.items)
  ) {
    return createEmptyLibraryIndex();
  }

  const items = candidate.items.filter((item): item is LibraryItem => {
    if (!item || typeof item !== "object") return false;
    const record = item as Partial<LibraryItem>;
    return typeof record.id === "string" &&
      typeof record.kind === "string" &&
      typeof record.name === "string" &&
      typeof record.createdAt === "string" &&
      typeof record.updatedAt === "string" &&
      typeof record.size === "number" &&
      isStoredFileRef(record.source) &&
      (!record.preview || isStoredFileRef(record.preview)) &&
      (!record.motion || isStoredFileRef(record.motion)) &&
      (!record.subtitles ||
        (Array.isArray(record.subtitles) && record.subtitles.every(isStoredFileRef)));
  });

  return {
    version: FILE_LIBRARY_INDEX_VERSION,
    items: linkSidecarSubtitles(
      items.map((item) => {
        const media = item.kind === "video" && !item.media
          ? parseLibraryMediaMetadata(item.name)
          : item.media;
        const isPhoto = item.kind === "image" || item.kind === "live-photo";
        const processing = item.processing?.status === "running"
          ? { ...item.processing, status: "pending" as const }
          : item.processing ?? (isPhoto
            ? {
              status: "pending" as const,
              stage: "metadata" as const,
              attempts: 0,
            }
            : undefined);
        const fingerprint = normalizeFileFingerprint(item.fingerprint) ??
          createPendingFileFingerprint();
        return {
          ...item,
          media,
          processing,
          fingerprint,
          albums: Array.isArray(item.albums)
            ? item.albums.filter((album): album is string => typeof album === "string")
            : undefined,
        };
      }),
    ),
  };
}

export function normalizeLibraryUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("只支持 http 或 https 链接");
  }
  return parsed.href;
}

export function formatLibraryBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[index]
  }`;
}

export function searchLibraryItems(
  items: readonly LibraryItem[],
  query: string,
): LibraryItem[] {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return [...items];
  return items.filter((item) => {
    const haystack = [
      item.name,
      item.kind,
      item.source.type,
      item.url ?? "",
      item.media?.title ?? "",
      item.media?.kind ?? "",
      item.photo?.make ?? "",
      item.photo?.model ?? "",
      item.photo?.lensModel ?? "",
      item.photo?.capturedAt ?? "",
      item.photo?.latitude === undefined ? "" : String(item.photo.latitude),
      item.photo?.longitude === undefined ? "" : String(item.photo.longitude),
      ...(item.albums ?? []),
    ]
      .concat(
        item.app ? [item.app.description, item.app.sourcePath, ...item.app.tech] : [],
      )
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return haystack.includes(normalized);
  });
}

export function filterLibraryItems(
  items: readonly LibraryItem[],
  view: LibrarySmartView,
): LibraryItem[] {
  if (view === "all") return [...items];
  if (view === "recent") {
    return items.filter((item) => item.playback?.lastPlayedAt).sort((left, right) =>
      (right.playback?.lastPlayedAt ?? "").localeCompare(
        left.playback?.lastPlayedAt ?? "",
      )
    );
  }
  if (view === "photos") {
    return items.filter((item) => item.kind === "image" || item.kind === "live-photo")
      .sort((left, right) =>
        (right.photo?.capturedAt ?? right.createdAt).localeCompare(
          left.photo?.capturedAt ?? left.createdAt,
        )
      );
  }
  if (view === "live-photos") {
    return items.filter((item) => item.kind === "live-photo");
  }
  if (view === "favorites") return items.filter((item) => item.favorite);
  if (view === "places") {
    return items.filter((item) =>
      item.photo?.latitude !== undefined && item.photo.longitude !== undefined
    );
  }
  if (view === "videos") return items.filter((item) => item.kind === "video");
  if (view === "duplicates") {
    const duplicateIds = new Set(
      findDuplicateGroups(items).flatMap((group) => group.itemIds),
    );
    return items.filter((item) => duplicateIds.has(item.id));
  }
  if (view === "movies") {
    return items.filter((item) =>
      item.kind === "video" && item.media?.kind === "movie"
    );
  }
  return items.filter((item) => item.kind === "video" && item.media?.kind === "show");
}

export function sortLibraryItems(items: readonly LibraryItem[]): LibraryItem[] {
  return [...items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}
