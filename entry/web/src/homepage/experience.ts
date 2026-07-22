import type { HomepageProjectCard } from "../../homepage-projects.ts";

export function getProjectSearchText(project: HomepageProjectCard): string {
  return [
    project.name,
    project.description,
    project.sourcePath,
    ...project.tech,
  ].join(" ").toLowerCase();
}

export function shouldAnimateHomepageCards(options: {
  reducedMotion: boolean;
  narrowViewport: boolean;
}): boolean {
  return !options.reducedMotion && !options.narrowViewport;
}

export function shouldUseHomepageViewTransition(options: {
  available: boolean;
  narrowViewport: boolean;
  reducedMotion: boolean;
  visibility: DocumentVisibilityState;
}): boolean {
  return options.available && !options.narrowViewport && !options.reducedMotion &&
    options.visibility === "visible";
}
