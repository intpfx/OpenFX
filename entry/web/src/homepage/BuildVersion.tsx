/** @jsxRuntime classic */
/** @jsx h */

import { createElement as h } from "react";

export type BuildVersionInfo = {
  shortLabel: string;
  fullLabel: string;
  dateTime?: string;
};

export function createBuildVersion(env: {
  hash?: string;
  time?: string;
}): BuildVersionInfo {
  const hash = env.hash?.trim();
  const time = env.time?.trim();
  if (!hash || !time) {
    return { shortLabel: "local", fullLabel: "local build" };
  }
  const date = new Date(time);
  if (Number.isNaN(date.valueOf())) {
    return { shortLabel: hash, fullLabel: `${time} + ${hash}` };
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  const fullLabel = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${
    pad(date.getUTCDate())
  } ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC + ${hash}`;
  return { shortLabel: hash, fullLabel, dateTime: date.toISOString() };
}

export function BuildVersion(props: { info: BuildVersionInfo }) {
  return (
    <p className="build-version" title={props.info.fullLabel}>
      <span className="footer-eyebrow">BUILD</span>
      <span className="build-version-value">{props.info.shortLabel}</span>
    </p>
  );
}
