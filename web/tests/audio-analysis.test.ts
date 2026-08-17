import { expect } from "@std/expect";

import { analyzeAudioFile } from "../src/file-library/audio-analysis.ts";

Deno.test("audio analysis extracts music metadata and embedded artwork without changing the source", async () => {
  const source = new File([new Uint8Array([1, 2, 3])], "fallback-title.mp3", {
    type: "audio/mpeg",
  });

  const result = await analyzeAudioFile(source, () =>
    Promise.resolve({
      title: "夜航星",
      artist: "不才",
      album: "我的三体",
      picture: {
        format: "image/jpeg",
        data: [0xff, 0xd8, 0xff, 0xd9],
      },
    }));

  expect(result.metadata).toEqual({
    title: "夜航星",
    artist: "不才",
    album: "我的三体",
  });
  expect(result.artwork).toBeDefined();
  expect(result.artwork?.type).toBe("image/jpeg");
  expect(new Uint8Array(await result.artwork!.arrayBuffer())).toEqual(
    new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  );
  expect(source.name).toBe("fallback-title.mp3");
  expect(source.size).toBe(3);
});

Deno.test("audio analysis preserves embedded plain lyrics as readable lines", async () => {
  const source = new File([new Uint8Array([1])], "evening.mp3", {
    type: "audio/mpeg",
  });

  const result = await analyzeAudioFile(source, () =>
    Promise.resolve({
      artist: "Schoolgirl byebye",
      lyrics: {
        language: "eng",
        lyrics: "天色将晚\r人潮渐散\n\n  你伸出手  \r\n目光柔软",
      },
    }));

  expect(result.metadata.lyrics).toEqual({
    kind: "plain",
    language: "eng",
    lines: ["天色将晚", "人潮渐散", "你伸出手", "目光柔软"],
  });
});

Deno.test("audio analysis falls back to the file name when tags are unavailable", async () => {
  const source = new File([new Uint8Array([1])], "Local Song.flac", {
    type: "audio/flac",
  });

  const result = await analyzeAudioFile(
    source,
    () => Promise.reject(new Error("unsupported tags")),
  );

  expect(result).toEqual({
    metadata: { title: "Local Song" },
    artwork: undefined,
  });
});
