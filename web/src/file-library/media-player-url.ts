import type { StoredFileRef } from "./model.ts";

export type MediaPlayerProgressMessage = {
  type: "openfx:media-player:progress";
  itemId: string;
  positionSec: number;
  durationSec: number;
  ended: boolean;
};

export function isMediaPlayerProgressMessage(
  value: unknown,
): value is MediaPlayerProgressMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<MediaPlayerProgressMessage>;
  return message.type === "openfx:media-player:progress" &&
    typeof message.itemId === "string" &&
    typeof message.positionSec === "number" &&
    typeof message.durationSec === "number" &&
    typeof message.ended === "boolean";
}

export function makeMediaPlayerUrl(
  reference: Pick<StoredFileRef, "path" | "name" | "type">,
  options: {
    itemId?: string;
    resumePositionSec?: number;
    subtitles?: readonly StoredFileRef[];
  } = {},
): string {
  const query = new URLSearchParams({
    embedded: "openfx-library",
    opfs: reference.path,
    name: reference.name,
    type: reference.type,
  });
  if (options.itemId) query.set("item", options.itemId);
  if (options.resumePositionSec && options.resumePositionSec > 0) {
    query.set("resume", String(options.resumePositionSec));
  }
  if (options.subtitles?.length) {
    query.set("subtitles", JSON.stringify(options.subtitles));
  }
  return `/media-player/?${query.toString()}`;
}
