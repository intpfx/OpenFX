// @ts-types="npm:@types/jsmediatags@3.9.6"
import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";

import type { LibraryAudioMetadata } from "./model.ts";

export type AudioTagPicture = {
  format?: string;
  data: readonly number[] | Uint8Array;
};

export type AudioTagData = {
  title?: string;
  artist?: string;
  album?: string;
  lyrics?: string | {
    language?: string;
    lyrics?: string;
  };
  picture?: AudioTagPicture;
};

export type AudioTagReader = (source: File) => Promise<AudioTagData>;

export type AudioAnalysisResult = {
  metadata: LibraryAudioMetadata;
  artwork?: Blob;
};

export type AudioAnalysisWorkerResponse =
  | { ok: true; result: AudioAnalysisResult }
  | { ok: false; error: string };

function cleanTag(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function normalizePlainLyrics(value: AudioTagData["lyrics"]) {
  const text = typeof value === "string" ? value : value?.lyrics;
  const lines = text?.split(/\r\n?|\n/).map((line) => cleanTag(line)).filter(
    (line): line is string => Boolean(line),
  ) ?? [];
  if (lines.length === 0) return undefined;
  const language = typeof value === "string" ? undefined : cleanTag(value?.language);
  return {
    kind: "plain" as const,
    lines,
    ...(language ? { language } : {}),
  };
}

function readAudioTags(source: File): Promise<AudioTagData> {
  return new Promise((resolve, reject) => {
    jsmediatags.read(source, {
      onSuccess: ({ tags }) => resolve(tags),
      onError: (error) => reject(new Error(error.info || "无法读取音频标签")),
    });
  });
}

export async function analyzeAudioFile(
  source: File,
  readTags: AudioTagReader = readAudioTags,
): Promise<AudioAnalysisResult> {
  const tags = await readTags(source).catch((): AudioTagData => ({}));
  const fallbackTitle = source.name.replace(/\.[^./]+$/, "").trim() || source.name;
  const title = cleanTag(tags.title) ?? fallbackTitle;
  const artist = cleanTag(tags.artist);
  const album = cleanTag(tags.album);
  const lyrics = normalizePlainLyrics(tags.lyrics);
  const metadata = {
    title,
    ...(artist ? { artist } : {}),
    ...(album ? { album } : {}),
    ...(lyrics ? { lyrics } : {}),
  } satisfies LibraryAudioMetadata;
  const format = cleanTag(tags.picture?.format)?.toLowerCase();
  const artwork = tags.picture?.data.length
    ? new Blob([Uint8Array.from(tags.picture.data)], {
      type: format?.startsWith("image/") ? format : "image/jpeg",
    })
    : undefined;
  return { metadata, artwork };
}

export function analyzeAudioInWorker(
  source: File,
  signal?: AbortSignal,
): Promise<AudioAnalysisResult> {
  if (typeof Worker === "undefined") return analyzeAudioFile(source);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./audio-analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("音频分析已取消", "AbortError"));
    };
    worker.onmessage = (event: MessageEvent<AudioAnalysisWorkerResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "音频分析 Worker 失败"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage(source);
  });
}
