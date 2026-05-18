import { HOMEPAGE_PROJECTS, type HomepageProjectCard } from "../homepage-projects.ts";
import BrandToggle from "../islands/BrandToggle.tsx";
import ControlCluster from "../islands/ControlCluster.tsx";
import HiddenReveal from "../islands/HiddenReveal.tsx";

function BrandWord(props: { word: "FENGXIAO" | "OpenFX" }) {
  return props.word.split("").map((ch, index) => {
    const accent = (props.word === "FENGXIAO" && ch === "O") ||
      (props.word === "OpenFX" && (ch === "F" || ch === "X"));

    return (
      <span
        class="glitch-char"
        data-idx={String(index)}
        style={accent ? { color: "var(--accent)" } : undefined}
      >
        {ch}
      </span>
    );
  });
}

function BrandShell() {
  return (
    <div class="brand-zone">
      <BrandToggle />
    </div>
  );
}

function ProjectCard(
  { project, className = "", id }: {
    project: HomepageProjectCard;
    className?: string;
    id?: string;
  },
) {
  const classes = ["project-card", className].filter(Boolean).join(" ");

  return (
    <div class={classes} id={id} data-card-id={project.id}>
      <div class="pc-name">{project.name}</div>
      <div class="pc-desc">{project.description}</div>
      <div class="pc-tech">
        {project.tech.map((item) => <span>{item}</span>)}
      </div>
      <div class="pc-source">source · {project.sourcePath}</div>
    </div>
  );
}

export default function Home() {
  return (
    <html lang="zh">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>FENGXIAO</title>
        <link rel="stylesheet" href="/homepage.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <div class="page">
          <BrandShell />
          <HiddenReveal />

          <div
            class="projects-zone"
            style={{ gridTemplateColumns: HOMEPAGE_PROJECTS.layout.gridTemplateColumns }}
          >
            {HOMEPAGE_PROJECTS.columns.map((column) => (
              <div
                class="project-column"
                style={column.offsetRem
                  ? { paddingTop: `${column.offsetRem}rem` }
                  : undefined}
              >
                {column.cards.map((card) => {
                  return (
                    <ProjectCard
                      project={card}
                      className={[
                        card.variant,
                        card.hidden ? "hidden-card" : "",
                      ].filter(Boolean).join(" ")}
                      id={card.id}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <ControlCluster />
        </div>
      </body>
    </html>
  );
}
