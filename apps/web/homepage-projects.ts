import rawConfig from "./content/homepage-projects.json" with { type: "json" };

export type HomepageProjectCard = {
  id: string;
  type: "project";
  variant?: "lg";
  hidden?: boolean;
  name: string;
  description: string;
  tech: string[];
  sourcePath: string;
};

export type HomepageColumn = {
  id: string;
  offsetRem?: number;
  cards: HomepageProjectCard[];
};

export type HomepageProjects = {
  layout: {
    gridTemplateColumns: string;
  };
  columns: HomepageColumn[];
};

export const HOMEPAGE_PROJECTS = rawConfig as HomepageProjects;

export const listHiddenHomepageProjects = (): HomepageProjectCard[] => {
  return HOMEPAGE_PROJECTS.columns.flatMap((column) =>
    column.cards.filter((card) => card.hidden)
  );
};
