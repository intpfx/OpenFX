import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  getLibraryApp,
  getLibraryAppRenderer,
  type LibraryAppId,
} from "../library-app-catalog.ts";
import { MapPosterPanelContent } from "./MapPosterPanel.tsx";
import { FileLibraryHomepage } from "./file-library/FileLibraryHomepage.tsx";
import { FloatingVisualDock } from "./floating-visuals/FloatingVisualDock.tsx";
import { FLOATING_VISUAL_PLUGINS } from "./floating-visuals/floating-visual-plugins.ts";

function EmbeddedLibraryApp(props: {
  appId: LibraryAppId;
  src: string;
  title: string;
  sandbox?: string;
  fill?: boolean;
}) {
  return (
    <div
      className={`domain-panel embedded-library-app${props.fill ? " is-fill" : ""}`}
      data-panel-id={props.appId}
    >
      <iframe
        src={props.src}
        title={props.title}
        sandbox={props.sandbox}
      />
    </div>
  );
}

function LibraryAppPanel(props: { appId: LibraryAppId }) {
  const renderer = getLibraryAppRenderer(props.appId);
  if (renderer.kind === "summary") return null;
  if (renderer.kind === "embedded") {
    const app = getLibraryApp(props.appId);
    if (!app.preview) throw new Error(`嵌入式 App 缺少 preview：${props.appId}`);
    return (
      <EmbeddedLibraryApp
        appId={props.appId}
        fill={"layout" in renderer && renderer.layout === "fill"}
        sandbox={"sandbox" in renderer && renderer.sandbox === "preview"
          ? app.preview.sandbox
          : undefined}
        src={app.preview.src}
        title={app.name}
      />
    );
  }

  switch (renderer.component) {
    case "how-much":
      return <HowMuchPanel />;
    case "map-poster":
      return <MapPosterPanel />;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function PanelShell(props: {
  panelId: LibraryAppId;
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="domain-panel" data-panel-id={props.panelId}>
      <section className="domain-panel-hero">
        <p className="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        <p>{props.lede}</p>
      </section>
      <div className="domain-panel-grid">
        {props.children}
      </div>
    </div>
  );
}

function MapPosterPanel() {
  return (
    <PanelShell
      panelId="map-poster"
      eyebrow="poster domain"
      title="Map Poster"
      lede="在地图上选择中心点，再调整主题、画幅和地图范围，直接生成可预览、可下载的 OpenStreetMap 城市海报。"
    >
      <MapPosterPanelContent />
    </PanelShell>
  );
}

function HowMuchPanel() {
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    async function loadComponents() {
      await Promise.all([
        loadScript("/how-much/vector-map.js"),
        loadScript("/how-much/dynamic-capsule.js"),
      ]);
      if (!disposed) setLoaded(true);
    }
    loadComponents();
    return () => {
      disposed = true;
    };
  }, []);

  if (!loaded) {
    return <div className="how-much-loading">加载中...</div>;
  }

  return (
    <div className="how-much-panel" ref={panelRef}>
      <vector-map data-url="/how-much/map.topo.json"></vector-map>
      <dynamic-capsule></dynamic-capsule>
    </div>
  );
}

export function App() {
  return (
    <>
      <FileLibraryHomepage
        renderApp={(appId) => <LibraryAppPanel appId={appId} />}
      />
      <FloatingVisualDock plugins={FLOATING_VISUAL_PLUGINS} />
    </>
  );
}
