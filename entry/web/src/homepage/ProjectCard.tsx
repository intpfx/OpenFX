import { useState } from "react";

import type { HomepageProjectCard } from "../../homepage-projects.ts";

type PreviewState = "loading" | "loaded" | "error";

export function ProjectCard(props: {
  project: HomepageProjectCard;
  revealed: boolean;
  onOpen?: (trigger: HTMLButtonElement) => void;
}) {
  const [previewState, setPreviewState] = useState<PreviewState>("loading");
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
        onClick={(event) => props.onOpen?.(event.currentTarget)}
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
            <span
              className="pc-source-field"
              data-preview-state={previewState}
            >
              <span className="pc-source-layer" aria-hidden="true">
                <span className="pc-field-label">SOURCE</span>
                <span className="pc-field-path">{props.project.sourcePath}</span>
              </span>
              <span className="pc-runtime-layer">
                <img
                  alt={props.project.preview.alt}
                  decoding="async"
                  loading="lazy"
                  src={props.project.preview.src}
                  style={{ objectPosition: props.project.preview.position ?? "center" }}
                  onError={() => setPreviewState("error")}
                  onLoad={() => setPreviewState("loaded")}
                />
                <span className="pc-field-label" aria-hidden="true">RUNTIME</span>
              </span>
            </span>
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
