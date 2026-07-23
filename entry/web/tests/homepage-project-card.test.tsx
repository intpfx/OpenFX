/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";

import type { HomepageProjectCard } from "../homepage-projects.ts";
import {
  createProjectPreviewEventHandlers,
  ProjectCard,
  ProjectCardPreview,
  type ProjectPreviewState,
} from "../src/homepage/ProjectCard.tsx";

const css = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);

const PROJECT: HomepageProjectCard = {
  id: "preview-project",
  type: "project",
  name: "Preview project",
  description: "A project with a runtime preview.",
  tech: ["React"],
  sourcePath: "domains/preview-project/",
  preview: {
    src: "/homepage-previews/preview-project.webp",
    alt: "Preview project runtime",
    position: "top",
  },
};

Deno.test("project card keeps an accessible lazy runtime preview behind its source layer", () => {
  const html = renderToStaticMarkup(
    <ProjectCard project={PROJECT} revealed={false} onOpen={() => {}} />,
  );

  expect(html).toContain('loading="lazy"');
  expect(html).toContain('decoding="async"');
  expect(html).toContain('alt="Preview project runtime"');
  expect(html).toContain('style="object-position:top"');
  expect(html).toContain('data-preview-state="loading"');
  expect(html).toContain('class="pc-source-layer"');
  expect(html).toContain("domains/preview-project/");
  expect(html).toContain('class="pc-runtime-layer"');
});

Deno.test("project card preview handlers render load and error state transitions", () => {
  let previewState: ProjectPreviewState = "loading";
  const handlers = createProjectPreviewEventHandlers((update) => {
    previewState = update(previewState);
  });
  const renderPreview = () =>
    renderToStaticMarkup(
      <ProjectCardPreview
        preview={PROJECT.preview!}
        previewState={previewState}
        sourcePath={PROJECT.sourcePath}
        {...handlers}
      />,
    );

  expect(renderPreview()).toContain('data-preview-state="loading"');

  handlers.onLoad();
  expect(previewState).toBe("loaded");
  expect(renderPreview()).toContain('data-preview-state="loaded"');

  handlers.onError();
  expect(previewState).toBe("error");
  const errorHtml = renderPreview();
  expect(errorHtml).toContain('data-preview-state="error"');
  expect(errorHtml).toContain('class="pc-source-layer"');
  expect(errorHtml).toContain("domains/preview-project/");

  expect(css).toContain(
    '.pc-source-field[data-preview-state="loaded"] .pc-runtime-layer {\n  opacity: 1;',
  );
  expect(css).toContain(
    '.pc-source-field[data-preview-state="error"] .pc-runtime-layer {\n  display: none;',
  );
  expect(css).toContain(".pc-source-layer,");
  expect(css).toContain(".pc-runtime-layer {");
});
