/** @jsxRuntime classic */
/** @jsx h */

import { createElement as h, type MouseEvent, useState } from "react";

import type {
  HomepageProjectCard,
  HomepageProjectPreview,
} from "../../homepage-projects.ts";
import "./jsx.ts";

export type ProjectPreviewState = "loading" | "loaded" | "error";

type ProjectPreviewStateUpdater = (
  current: ProjectPreviewState,
) => ProjectPreviewState;

export function createProjectPreviewEventHandlers(
  setPreviewState: (update: ProjectPreviewStateUpdater) => void,
) {
  return {
    onError: () => setPreviewState(() => "error"),
    onLoad: () => setPreviewState(() => "loaded"),
  };
}

export function ProjectCardPreview(props: {
  preview: HomepageProjectPreview;
  previewState: ProjectPreviewState;
  sourcePath: string;
  onError: () => void;
  onLoad: () => void;
}) {
  return (
    <span
      className="pc-source-field"
      data-preview-state={props.previewState}
    >
      <span className="pc-source-layer" aria-hidden="true">
        <span className="pc-field-label">SOURCE</span>
        <span className="pc-field-path">{props.sourcePath}</span>
      </span>
      <span className="pc-runtime-layer">
        <img
          alt={props.preview.alt}
          decoding="async"
          loading="lazy"
          src={props.preview.src}
          style={{ objectPosition: props.preview.position ?? "center" }}
          onError={props.onError}
          onLoad={props.onLoad}
        />
        <span className="pc-field-label" aria-hidden="true">RUNTIME</span>
      </span>
    </span>
  );
}

export function ProjectCard(props: {
  project: HomepageProjectCard;
  revealed: boolean;
  onOpen?: (trigger: HTMLButtonElement) => void;
}) {
  const [previewState, setPreviewState] = useState<ProjectPreviewState>("loading");
  const previewEventHandlers = createProjectPreviewEventHandlers(setPreviewState);
  const classes = [
    "project-card",
    props.project.variant,
    props.project.hidden ? "hidden-card" : "",
    props.revealed ? "revealed" : "",
    props.onOpen ? "clickable" : "",
    props.project.preview ? "has-preview" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={classes} data-card-id={props.project.id}>
      <button
        aria-label={`打开 ${props.project.name} 详情`}
        className="project-card-trigger"
        disabled={!props.onOpen}
        type="button"
        onClick={(event: MouseEvent<HTMLButtonElement>) =>
          props.onOpen?.(event.currentTarget)}
      >
        <span className="project-card-copy">
          <span className="pc-name">{props.project.name}</span>
          <span className="pc-desc">{props.project.description}</span>
          <span className="pc-tech" aria-label="技术栈">
            {props.project.tech.map((item) => (
              <span key={`${props.project.id}-${item}`}>{item}</span>
            ))}
          </span>
          <span className="pc-source pc-source-inline">
            source · {props.project.sourcePath}
          </span>
        </span>

        {props.project.preview
          ? (
            <ProjectCardPreview
              preview={props.project.preview}
              previewState={previewState}
              sourcePath={props.project.sourcePath}
              {...previewEventHandlers}
            />
          )
          : null}
      </button>

      {props.project.provenance
        ? (
          <div className="pc-provenance" aria-label={`${props.project.name} 来源说明`}>
            <p>
              <span>来源</span>
              <a
                href={props.project.provenance.origin.href}
                rel="noreferrer"
                target="_blank"
              >
                {props.project.provenance.origin.label}
              </a>
            </p>
            <p>
              <span>改动</span>
              {props.project.provenance.changes}
            </p>
            <p>
              <span>区别</span>
              {props.project.provenance.differences}
            </p>
          </div>
        )
        : null}

      {props.project.links?.length
        ? (
          <div className="pc-links">
            {props.project.links.map((link) => (
              <a
                key={`${props.project.id}-${link.href}`}
                href={link.href}
                download={link.download}
                rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                target={link.href.startsWith("http") ? "_blank" : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
        )
        : null}
    </article>
  );
}
