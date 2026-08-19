import { expect } from "@std/expect";

const css = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);
const libraryCss = await Deno.readTextFile(
  new URL("../src/file-library/file-library.css", import.meta.url),
);
const app = await Deno.readTextFile(
  new URL("../src/App.tsx", import.meta.url),
);
const homepage = await Deno.readTextFile(
  new URL("../src/file-library/FileLibraryHomepage.tsx", import.meta.url),
);
const audioPlayer = await Deno.readTextFile(
  new URL("../src/file-library/library-audio-player.tsx", import.meta.url),
);
const manifest = JSON.parse(
  await Deno.readTextFile(new URL("../public/site.webmanifest", import.meta.url)),
);
const serviceWorker = await Deno.readTextFile(
  new URL("../public/sw.js", import.meta.url),
);

function cssRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`),
  );
  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

Deno.test("file library declares complete light and dark semantic tokens", () => {
  expect(css).toContain(':root,\n:root[data-theme="light"]');
  expect(css).toContain(':root[data-theme="dark"]');
  expect(libraryCss).toContain('html[data-theme="light"]');

  for (
    const token of [
      "--surface",
      "--surface-raised",
      "--text-primary",
      "--text-secondary",
      "--accent",
      "--border",
    ]
  ) {
    expect(css.match(new RegExp(`${token}:`, "g"))?.length).toBeGreaterThanOrEqual(2);
  }
});

Deno.test("summary-only App panels are removed from the standalone viewer", () => {
  expect(app).not.toMatch(/color:\s*["']#[0-9a-f]{3,8}["']/i);
  expect(app).toContain('if (renderer.kind === "summary") return null');
  expect(app).not.toContain('className="chinagas-install-link"');
  expect(app).not.toContain('className="chinagas-install-note"');
  expect(css).not.toContain(".chinagas-install-link");
  expect(css).not.toContain(".chinagas-install-note");
  expect(css).not.toContain(".panel-download-link");
});

Deno.test("file-library and App viewer surfaces retain semantic theming", () => {
  expect(libraryCss).toContain(".file-library-card");
  expect(libraryCss).toContain(".file-library-hud");
  expect(libraryCss).toContain(".file-library-viewer.is-app");
  expect(css).toContain(".domain-panel");
  expect(css).toContain("background: var(--surface");
});

Deno.test("embedded App viewer keeps fixed host chrome outside the iframe", () => {
  const stage = cssRule(
    libraryCss,
    ".file-library-viewer.is-app .file-library-viewer-stage",
  );
  expect(stage).toContain(
    "padding-top: max(68px, calc(env(safe-area-inset-top) + 60px));",
  );
  expect(
    cssRule(libraryCss, ".file-library-viewer.is-app .embedded-library-app"),
  ).toContain("padding: 0;");
});

Deno.test("homepage uses a full-bleed preview or storage HUD and borderless controls", () => {
  expect(homepage).toContain(
    'className="file-library-hud-preview"',
  );
  expect(homepage).toContain('className="file-library-storage-overview"');
  expect(homepage).toContain('aria-label="文件库存储空间"');
  expect(homepage).toContain("summarizeFileLibraryStorageHeatmap(props.items");
  expect(homepage).toContain('className="file-library-storage-heatmap"');
  expect(homepage).toContain('className="file-library-storage-tile-copy"');
  expect(homepage).toContain("data-storage-kind={tile.id}");
  expect(homepage).not.toContain(
    'items.find((item) => item.app?.id === "finlyzer")',
  );
  expect(homepage).toContain(
    'className="file-library-search file-library-hud-search"',
  );
  expect(homepage).toContain('className="file-library-import-tile"');
  expect(homepage).toContain('aria-label="从 Photos 选择照片或实况原片"');
  expect(homepage).toContain('aria-label="从文件导入"');
  expect(homepage).toContain("ref={photosInputRef}");
  expect(homepage).toContain("createNativePhotoImporter");
  expect(homepage).toContain("nativePhotosAvailable");
  expect(homepage).toContain("session.importFromPhotos()");
  expect(homepage).toContain('className="file-library-selection-actions"');
  expect(homepage).toContain("<GithubLogo");
  expect(homepage).toContain("selectedGitHubLinks.map((link)");
  expect(homepage).toContain("!isGitHubHref(link.href)");
  expect(homepage).toContain('className="file-library-hud-open"');
  expect(homepage).toContain("onClick={() => setViewerItemId(selected.id)}");
  expect(homepage).not.toContain('aria-label="打开所选内容"');
  expect(homepage).not.toContain('aria-label="保存链接"');
  expect(homepage).not.toContain('aria-label="新建文本"');
  expect(homepage).not.toContain("LibraryComposer");
  expect(homepage).not.toContain("setComposer");
  expect(homepage).toContain("file-library-hud-preview-app-copy");
  expect(homepage).toContain('className="file-library-hud-app-summary"');
  expect(homepage).toContain("appSummary.highlights?.slice(0, 3)");
  expect(homepage).toContain("canOpenLibraryItem(selected)");
  expect(homepage).toContain("isLibraryAppOpenable(item.app.id)");
  expect(homepage).toContain("props.item.app?.description");
  expect(homepage).toContain("placeholder={`搜索 ${props.resultCount} 项`}");
  expect(homepage.indexOf('className="file-library-import-tile"')).toBeLessThan(
    homepage.indexOf("{visibleEntries.map((entry) =>"),
  );
  expect(homepage).toContain("buildSimilarityGridEntries(items)");
  expect(homepage).toContain('className="file-library-group-hud"');
  expect(homepage).toContain('className="file-library-group-hud-members"');
  expect(homepage).toContain("new IntersectionObserver");
  expect(homepage).toContain('rootMargin: "200px"');
  expect(homepage).not.toContain('aria-label="检查重复文件"');
  expect(homepage).not.toContain("reviewDuplicates");
  expect(homepage).not.toContain('className="file-library-selection"');
  expect(homepage).not.toContain('className="file-library-count"');
  expect(homepage).not.toContain("HomepageThemeControl");
  expect(homepage).not.toContain("SMART_VIEW_LABELS");
  expect(homepage).not.toContain("file-library-actions-popover");
  expect(homepage).not.toContain('aria-label="更多文件库操作"');
  expect(homepage).not.toContain('aria-label="文件库筛选"');
  expect(homepage).not.toContain("file-library-hud-preview-bar");
  expect(homepage).not.toContain("file-library-collapse");
  expect(homepage).not.toContain("hudExpanded");
  expect(homepage).toContain("--file-library-grid-columns");
  expect(homepage).toContain("resolveLibraryGridColumnsFromPinch");
  expect(homepage).not.toContain('className="file-library-brand"');
  expect(libraryCss).toContain(
    "grid-template-columns: repeat(var(--file-library-grid-columns)",
  );
  expect(libraryCss).toContain(
    "grid-auto-rows: calc(100vw / var(--file-library-grid-columns))",
  );
  expect(libraryCss).toContain("border-radius: 0;\n  overflow: hidden");
  expect(libraryCss).not.toContain("border-radius: 18px 18px 0 0");
  expect(libraryCss).toContain("gap: 0");
  expect(libraryCss).toContain("padding: 0");
  expect(cssRule(libraryCss, ".file-library-hud-preview")).toContain(
    "height: clamp(300px, 50svh, 560px)",
  );
  expect(cssRule(libraryCss, ".file-library-hud-preview-app-copy")).toContain(
    "width: min(760px, calc(100% - 48px))",
  );
  expect(cssRule(libraryCss, ".file-library-hud-open")).toContain("inset: 0");
  expect(cssRule(libraryCss, ".file-library-hud-open")).toContain(
    "cursor: zoom-in",
  );
  expect(cssRule(libraryCss, ".file-library-selection-actions")).toContain(
    "background: transparent",
  );
  expect(cssRule(libraryCss, ".file-library-selection-actions")).toContain(
    "backdrop-filter: none",
  );
  expect(cssRule(libraryCss, ".file-library-hud-preview-app-copy.is-summary"))
    .toContain(
      "overflow-y: auto",
    );
  expect(cssRule(libraryCss, ".file-library-hud-app-links > a")).toContain(
    "min-height: 44px",
  );
  expect(cssRule(libraryCss, ".file-library-storage-overview")).toContain(
    "isolation: isolate",
  );
  expect(cssRule(libraryCss, ".file-library-storage-heatmap")).toContain(
    "position: absolute",
  );
  expect(cssRule(libraryCss, ".file-library-storage-tile")).toContain(
    "position: absolute",
  );
  expect(libraryCss).not.toContain(".file-library-storage-meter-track");
  expect(libraryCss).not.toContain(".file-library-storage-meter-details");
  const operationHover = cssRule(
    libraryCss,
    ".file-library-selection-actions > button:hover,\n.file-library-selection-actions > button:focus-visible,\n.file-library-selection-actions > a:hover,\n.file-library-selection-actions > a:focus-visible",
  );
  expect(operationHover).toContain("background: transparent");
  expect(operationHover).toContain("box-shadow: none");
  expect(operationHover).toContain("color: #9ebddd");
});

Deno.test("selected video and Live Photo HUD previews autoplay silently without a duplicate LIVE tag", () => {
  expect(homepage).toContain('"live-photo": "实况照片"');
  expect(homepage).toContain(
    "aria-label={`${props.item.name} 静音循环预览`}",
  );
  expect(homepage).toMatch(
    /aria-label=\{`\$\{props\.item\.name\} 静音循环预览`\}[\s\S]*?autoPlay[\s\S]*?loop[\s\S]*?muted[\s\S]*?playsInline/,
  );
  expect(homepage).not.toContain('className="file-library-live-badge"');
  expect(homepage).not.toContain("/> LIVE");
  expect(libraryCss).not.toContain(".file-library-live-badge");
  expect(cssRule(libraryCss, ".file-library-hud-preview-surface > video"))
    .toContain("object-fit: cover");
});

Deno.test("music previews prioritize album artwork across the grid, HUD, and viewer", () => {
  expect(homepage).toContain("getLibraryItemVisualRef(props.item)");
  expect(homepage).toContain("item.audio?.title");
  expect(homepage).toContain("file-library-hud-audio");
  expect(homepage).toContain("file-library-audio-viewer");
  expect(homepage).toContain('className="file-library-audio-artwork"');
  expect(homepage).toContain("onPlayingChange={setPlaying}");
  expect(homepage).toContain(
    'import { LibraryAudioPlayer } from "./library-audio-player.tsx";',
  );
  expect(homepage).toContain("<LibraryAudioPlayer");
  expect(homepage).not.toMatch(/<audio[\s\S]*?\bcontrols\b/);
  expect(audioPlayer).toContain('import { createPlayer } from "@videojs/react"');
  expect(audioPlayer).toContain("audioFeatures");
  expect(audioPlayer).toContain("AudioSkin");
  expect(audioPlayer).toContain("features: audioFeatures");
  expect(audioPlayer).toContain("<AudioSkin");
  expect(audioPlayer).toContain("<Audio");
  expect(audioPlayer).toContain("onPlay={() => props.onPlayingChange(true)}");
  expect(audioPlayer).toContain("onPause={() => props.onPlayingChange(false)}");
  expect(cssRule(libraryCss, ".file-library-audio-controls")).toContain(
    "--media-color-primary: #fff",
  );
  expect(
    cssRule(libraryCss, ".file-library-audio-controls .media-controls"),
  ).toContain("border-radius: 999px");
  expect(cssRule(libraryCss, ".file-library-hud-audio-cover > img")).toContain(
    "object-fit: cover",
  );
  expect(cssRule(libraryCss, ".file-library-audio-artwork > img")).toContain(
    "object-fit: cover",
  );
  expect(cssRule(libraryCss, ".file-library-audio-artwork")).toContain(
    "transition: transform",
  );
});

Deno.test("music without artwork uses a solid title tile and exposes embedded plain lyrics", () => {
  expect(homepage).toContain("getLibraryAudioTileColor");
  expect(homepage).toContain('className="file-library-audio-title-tile"');
  expect(homepage).toContain('className="file-library-audio-lyrics"');
  expect(homepage).toContain("内嵌歌词 · 无时间轴");
  expect(homepage).toContain("这首歌没有可显示的内嵌歌词");
  expect(homepage).not.toContain("MusicNotesSimple");
  expect(cssRule(libraryCss, ".file-library-audio-title-tile")).toContain(
    "font-size: clamp(",
  );
  expect(
    cssRule(
      libraryCss,
      ".file-library-card.has-audio-title-fallback .file-library-card-media",
    ),
  )
    .toContain("background: var(--audio-fallback-color)");
  expect(cssRule(libraryCss, ".file-library-audio-lyrics-lines")).toContain(
    "overflow-y: auto",
  );
  expect(cssRule(libraryCss, ".file-library-audio-lyric-line")).toContain(
    "font-size: clamp(",
  );
});

Deno.test("portrait mobile keeps HUD search above the scrolling grid", () => {
  const portraitRule = "@media (max-width: 900px) and (orientation: portrait)";
  expect(libraryCss).toContain(portraitRule);
  expect(libraryCss.lastIndexOf(portraitRule)).toBeGreaterThan(
    libraryCss.lastIndexOf("height: min(58svh, 540px)"),
  );
  expect(libraryCss.slice(libraryCss.lastIndexOf(portraitRule))).toContain(
    "position: fixed",
  );
  expect(libraryCss).toContain("height: 40svh");
  expect(libraryCss).toContain("inset: 40svh 0 0");
  expect(libraryCss).not.toContain("inset: calc(40svh + 60px) 0 0");
  expect(libraryCss).toContain("overflow-y: auto");
  expect(libraryCss).toContain("overscroll-behavior: contain");
  expect(libraryCss).not.toContain("margin-top: calc(40svh + 60px)");
  expect(libraryCss).not.toContain(".file-library-head.is-collapsed");
});

Deno.test("landscape and wide desktop share a split HUD and scrolling matrix", () => {
  const wideRule = "@media (orientation: landscape), (min-width: 1100px)";
  const wideLayout = libraryCss.slice(libraryCss.lastIndexOf(wideRule));

  expect(libraryCss).toContain(wideRule);
  expect(wideLayout).toContain(
    "--file-library-hud-width: clamp(360px, 42vw, 640px)",
  );
  expect(wideLayout).toContain(
    "grid-template-columns: var(--file-library-hud-width) minmax(0, 1fr)",
  );
  expect(wideLayout).toContain(
    "grid-template-rows: minmax(0, 1fr)",
  );
  expect(wideLayout).not.toContain("--file-library-toolbar-height");
  expect(wideLayout).toContain("border-radius: 0");
  expect(wideLayout).not.toContain("border-radius: 18px 0 0 18px");
  expect(wideLayout).toContain("grid-auto-rows: min-content");
  expect(wideLayout).not.toContain("grid-auto-rows: auto");
  expect(wideLayout).toContain("overflow-y: auto");
  expect(wideLayout).toContain("object-fit: contain");
});

Deno.test("the file viewer uses media-style floating controls and an index-backed editor", () => {
  expect(homepage).toContain('aria-label="编辑文件"');
  expect(homepage).toContain(
    'className="file-library-item-editor file-library-hud"',
  );
  expect(homepage).toContain("normalizeLibraryItemName(nameDraft)");
  expect(homepage).toContain("onUpdate={session.updateItemDetails}");
  expect(homepage).toContain("isMediaPlayerFileActionMessage(event.data)");
  expect(homepage).toContain("makeMediaPlayerFileDetailsMessage(props.item.id");
  expect(homepage).toContain("ref={mediaPlayerIframeRef}");
  expect(homepage).toContain(
    'className="file-library-viewer-actions file-library-viewer-surface"',
  );

  const viewerHead = cssRule(libraryCss, ".file-library-viewer-head");
  expect(viewerHead).toContain("left: max(8px, env(safe-area-inset-left))");
  expect(cssRule(libraryCss, ".file-library-viewer-surface")).toContain(
    "top: max(8px, env(safe-area-inset-top))",
  );
  expect(cssRule(libraryCss, ".file-library-viewer-surface")).toContain(
    "backdrop-filter: blur(16px) saturate(150%)",
  );
  expect(cssRule(libraryCss, ".file-library-viewer-stage")).toContain(
    "padding: 0",
  );
  expect(cssRule(libraryCss, ".file-library-item-editor")).toContain(
    "top: max(64px, calc(env(safe-area-inset-top) + 56px))",
  );
  expect(homepage).toContain('aria-label="选择实况图片下载格式"');
  expect(homepage).toContain('downloadLivePhoto("original-pair")');
  expect(homepage).toContain('downloadLivePhoto("jpeg-pair")');
  expect(homepage).toContain('downloadLivePhoto("livp")');
  expect(cssRule(libraryCss, ".file-library-live-export")).toContain(
    "border-radius: 24px",
  );
});

Deno.test("video playback progress cannot replace the active player iframe", () => {
  expect(homepage).toContain("const [mediaPlayerSource] = useState(() =>");
  expect(homepage).toContain("src={mediaPlayerSource}");
  expect(homepage).toContain("key={viewerItem.id}");
  expect(homepage).not.toContain("src={makeMediaPlayerUrl(playerRef");
});

Deno.test("installed OpenFX receives system-opened and shared files for OPFS import", () => {
  expect(manifest.file_handlers?.[0]?.action).toBe("/?source=file-handler");
  expect(manifest.share_target?.action).toBe("/share-target");
  expect(serviceWorker).toContain('form.getAll("files")');
  expect(homepage).toContain("connectFileLibrarySessionToBrowser");
});

Deno.test("theme color transitions remain bounded", () => {
  expect(cssRule(css, "body")).toContain(
    "background-color 0.18s ease, color 0.18s ease",
  );
  expect(cssRule(css, ".domain-panel")).toContain(
    "background-color 0.18s ease",
  );
  expect(cssRule(libraryCss, ".file-library-card::after")).toContain(
    "border-color 160ms ease",
  );
  expect(cssRule(libraryCss, ".file-library-card")).toContain(
    "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)",
  );
  expect(cssRule(libraryCss, ".file-library-card.is-selected")).toContain(
    "transform: translateY(-3px) scale(1.025)",
  );
  expect(cssRule(libraryCss, ".file-library-card.is-selected::after")).toContain(
    "border-color: transparent",
  );
});
