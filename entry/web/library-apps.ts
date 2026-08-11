import rawConfig from "./content/library-apps.json" with { type: "json" };

export type LibraryAppDefinition = {
  id: string;
  hidden?: boolean;
  name: string;
  description: string;
  coverDescription?: string;
  tech: string[];
  sourcePath: string;
  preview?: LibraryAppLivePreview;
  provenance?: LibraryAppProvenance;
  links?: LibraryAppLink[];
};

export type LibraryAppLivePreview = {
  src: string;
  title: string;
  sandbox?: string;
};

export type LibraryAppProvenance = {
  origin: {
    label: string;
    href: string;
  };
  changes: string;
  differences: string;
};

export type LibraryAppLink = {
  label: string;
  href: string;
  download?: string;
};

export type LibraryAppsConfig = {
  apps: LibraryAppDefinition[];
};

export const LIBRARY_APPS_CONFIG = rawConfig as LibraryAppsConfig;

export const LIBRARY_APPS = LIBRARY_APPS_CONFIG.apps;

export const listHiddenLibraryApps = (): LibraryAppDefinition[] => {
  return LIBRARY_APPS.filter((app) => app.hidden);
};
