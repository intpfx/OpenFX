import {
  Button,
  buttonSetBordered,
  buttonSetImage,
  buttonSetImagePosition,
  buttonSetTextColor,
  buttonSetTitle,
  HStack,
  ImageFile,
  imageSetScaling,
  imageSetSize,
  imageSetTint,
  ImageSymbol,
  openFileDialog,
  ScrollView,
  scrollviewSetChild,
  setCornerRadius,
  Spacer,
  stackSetAlignment,
  Text,
  textSetColor,
  textSetFontSize,
  textSetFontWeight,
  textSetString,
  textSetTextAlignment,
  textSetWraps,
  VideoFile,
  videoSetPlaying,
  VStack,
  type Widget,
  widgetAddChild,
  widgetAddOverlay,
  widgetAnimateOpacity,
  widgetClearChildren,
  widgetSetBackgroundColor,
  widgetSetBackgroundGradient,
  widgetSetBorderColor,
  widgetSetBorderWidth,
  widgetSetEdgeInsets,
  widgetSetHeight,
  widgetSetHidden,
  widgetSetOnClick,
  widgetSetOnDoubleClick,
  widgetSetOnHover,
  widgetSetOpacity,
  widgetSetOverlayFrame,
  widgetSetShadow,
  widgetSetTooltip,
  widgetSetWidth,
  ZStack,
} from "perry/ui";

import type {
  FileLibraryItem,
  FileLibraryKind,
  FileLibrarySnapshot,
  FileThumbnailResolver,
  ManagedFileLibrary,
} from "../native/file-library.ts";
import {
  FILE_WALL_HEIGHT,
  FILE_WALL_WIDTH,
  fileWallBackgroundAlpha,
  fileWallLayout,
} from "./file-wall-layout.ts";
import { fileDisplayTitle, fileOpenPresentation } from "./file-presentation.ts";

const VIEW_WIDTH = FILE_WALL_WIDTH;
const VIEW_HEIGHT = FILE_WALL_HEIGHT;

export interface FileBrowserOptions {
  library: ManagedFileLibrary;
  thumbnails: FileThumbnailResolver;
  reduceMotion: boolean;
}

export interface FileBrowserController {
  body: Widget;
  showLibrary(): void;
  refresh(): void;
  setReduceMotion(reduceMotion: boolean): void;
}

export function createFileBrowser(
  options: FileBrowserOptions,
): FileBrowserController {
  let renderRevision = 0;
  let selectedPath = "";
  let detailVisible = false;
  let mediaPreviewVisible = false;
  let activeVideo: Widget | null = null;
  let reduceMotion = options.reduceMotion;
  let importBusy = false;
  const thumbnailPaths = new Map<string, string>();

  const root = ZStack();
  widgetSetWidth(root, VIEW_WIDTH);
  widgetSetHeight(root, VIEW_HEIGHT);
  applyFileWallBackground(root, 0);

  const scrollView = ScrollView();
  widgetSetWidth(scrollView, VIEW_WIDTH);
  widgetSetHeight(scrollView, VIEW_HEIGHT);
  widgetAddChild(root, scrollView);

  const importButton = floatingIconButton(
    "square.and.arrow.down",
    "导入文件",
    importFile,
  );
  const refreshButton = floatingIconButton(
    "arrow.clockwise",
    "刷新文件库",
    refreshLibrary,
  );
  const folderButton = floatingIconButton(
    "folder",
    "打开文件库",
    openLibraryDirectory,
  );
  const toolbar = HStack(6, [
    importButton,
    refreshButton,
    folderButton,
  ]);
  widgetAddOverlay(root, toolbar);
  widgetSetOverlayFrame(toolbar, 694, 590, 114, 36);

  const emptyImportButton = Button("导入文件", importFile);
  buttonSetTextColor(emptyImportButton, 0.96, 0.95, 0.91, 1);
  const emptyTitle = styledText(
    "把文件收藏进来",
    22,
    true,
    0.9,
    0.9,
    0.88,
  );
  textSetTextAlignment(emptyTitle, 2);
  const emptyDescription = styledText(
    "导入后由 OpenFX Node 创建并管理独立副本。",
    12,
    false,
    0.56,
    0.57,
    0.58,
  );
  textSetTextAlignment(emptyDescription, 2);
  const emptyState = VStack(12, [
    emptyTitle,
    emptyDescription,
    emptyImportButton,
  ]);
  stackSetAlignment(emptyState, 9);
  widgetSetWidth(emptyState, 500);
  widgetSetHeight(emptyState, 160);
  widgetAddOverlay(root, emptyState);
  widgetSetOverlayFrame(emptyState, 160, 240, 500, 160);

  const hoverTitle = styledText("", 13, true, 0.97, 0.97, 0.94);
  const hoverDetail = styledText("", 11, false, 0.68, 0.69, 0.7);
  const hoverCopy = VStack(2, [hoverTitle, hoverDetail]);
  stackSetAlignment(hoverCopy, 7);
  const hoverOpen = iconButton(
    "arrow.up.forward.app",
    "用默认应用打开",
    () => {
      const selected = options.library.snapshot().items.find((item) =>
        item.path === selectedPath
      );
      if (selected) openManagedFile(selected);
    },
  );
  const hoverBar = HStack(12, [hoverCopy, Spacer(), hoverOpen]);
  widgetSetEdgeInsets(hoverBar, 9, 14, 9, 10);
  widgetSetBackgroundColor(hoverBar, 0.045, 0.045, 0.05, 0.9);
  widgetSetBorderColor(hoverBar, 1, 1, 1, 0.12);
  widgetSetBorderWidth(hoverBar, 1);
  setCornerRadius(hoverBar, 18);
  widgetSetShadow(hoverBar, 0, 0, 0, 0.32, 18, 0, 7);
  widgetSetHidden(hoverBar, 1);
  widgetAddOverlay(root, hoverBar);
  widgetSetOverlayFrame(hoverBar, 230, 22, 360, 56);

  const scrim = VStack(0, []);
  widgetSetBackgroundColor(scrim, 0.01, 0.01, 0.012, 0.76);
  widgetSetHidden(scrim, 1);
  widgetSetOnClick(scrim, () => closeOverlay());
  widgetAddOverlay(root, scrim);
  widgetSetOverlayFrame(scrim, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const detailBody = VStack(14, []);
  stackSetAlignment(detailBody, 7);
  const detailCard = VStack(0, [detailBody]);
  widgetSetEdgeInsets(detailCard, 24, 24, 22, 24);
  widgetSetBackgroundColor(detailCard, 0.93, 0.92, 0.88, 0.98);
  widgetSetBorderColor(detailCard, 1, 1, 1, 0.36);
  widgetSetBorderWidth(detailCard, 1);
  setCornerRadius(detailCard, 4);
  widgetSetShadow(detailCard, 0, 0, 0, 0.48, 28, 0, 12);
  widgetSetHidden(detailCard, 1);
  widgetAddOverlay(root, detailCard);
  widgetSetOverlayFrame(detailCard, 220, 110, 380, 420);

  const mediaContentHost = VStack(0, []);
  stackSetAlignment(mediaContentHost, 9);
  widgetSetWidth(mediaContentHost, VIEW_WIDTH);
  widgetSetHeight(mediaContentHost, VIEW_HEIGHT - 56);

  const mediaPreviewTitle = styledText(
    "",
    12,
    true,
    0.94,
    0.94,
    0.92,
  );
  textSetTextAlignment(mediaPreviewTitle, 2);
  widgetSetWidth(mediaPreviewTitle, 470);

  const mediaBackButton = iconButton(
    "chevron.left",
    "返回文件墙",
    closeMediaPreview,
  );
  const mediaOpenButton = iconButton(
    "arrow.up.forward.app",
    "用默认应用打开",
    () => {
      const selected = selectedLibraryItem();
      if (selected) openManagedFile(selected);
    },
  );
  const mediaRevealButton = iconButton(
    "folder",
    "在 Finder 中选择",
    () => {
      const selected = selectedLibraryItem();
      if (selected) void options.library.reveal(selected);
    },
  );
  const mediaToolbar = HStack(8, [
    mediaBackButton,
    mediaPreviewTitle,
    Spacer(),
    mediaOpenButton,
    mediaRevealButton,
  ]);
  widgetSetEdgeInsets(mediaToolbar, 10, 96, 10, 12);
  widgetSetBackgroundColor(mediaToolbar, 0.035, 0.035, 0.04, 0.86);
  widgetSetBorderColor(mediaToolbar, 1, 1, 1, 0.08);
  widgetSetBorderWidth(mediaToolbar, 0.5);

  const mediaPreview = ZStack();
  widgetSetWidth(mediaPreview, VIEW_WIDTH);
  widgetSetHeight(mediaPreview, VIEW_HEIGHT);
  widgetSetBackgroundColor(mediaPreview, 0.018, 0.018, 0.022, 1);
  widgetAddChild(mediaPreview, mediaContentHost);
  widgetAddOverlay(mediaPreview, mediaToolbar);
  widgetSetOverlayFrame(mediaToolbar, 0, VIEW_HEIGHT - 56, VIEW_WIDTH, 56);
  widgetSetHidden(mediaPreview, 1);
  widgetAddOverlay(root, mediaPreview);
  widgetSetOverlayFrame(mediaPreview, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  render(options.library.snapshot());

  function importFile(): void {
    if (importBusy) return;
    openFileDialog((path) => {
      importBusy = true;
      textSetString(hoverTitle, "正在导入文件");
      textSetString(hoverDetail, "OpenFX Node 正在创建自己的管理副本…");
      widgetSetHidden(hoverBar, 0);
      void options.library.importPath(path).then((snapshot) => {
        closeOverlay();
        render(snapshot);
      }).catch(() => {
        showMessage(
          "导入失败",
          "无法创建管理副本，请确认源文件可读取且磁盘空间充足。",
        );
      }).finally(() => {
        importBusy = false;
      });
    });
  }

  function refreshLibrary(): void {
    closeOverlay();
    render(options.library.refresh());
  }

  function openLibraryDirectory(): void {
    void options.library.openLibraryDirectory().catch(() => {
      showMessage(
        "无法打开文件库",
        "请确认当前账户可以访问 OpenFX Node 的应用数据目录。",
      );
    });
  }

  function render(snapshot: FileLibrarySnapshot): void {
    closeMediaPreview();
    renderRevision += 1;
    const revision = renderRevision;
    selectedPath = "";
    widgetSetHidden(hoverBar, 1);
    widgetSetHidden(emptyState, snapshot.items.length === 0 ? 0 : 1);

    const layout = fileWallLayout(snapshot.items.length);
    const backgroundAlpha = fileWallBackgroundAlpha(snapshot.items.length);
    applyFileWallBackground(root, backgroundAlpha);
    const rowGap = layout[0]?.gap ?? 0;
    const wall = VStack(rowGap, []);
    widgetSetWidth(wall, VIEW_WIDTH);
    applyFileWallBackground(wall, backgroundAlpha);
    const wallHeight = layout.reduce((sum, row) => sum + row.height, 0) +
      Math.max(0, layout.length - 1) * rowGap;
    widgetSetHeight(wall, Math.max(VIEW_HEIGHT, wallHeight));
    for (const rowLayout of layout) {
      const tiles: Widget[] = [];
      for (let slot = 0; slot < rowLayout.itemCount; slot += 1) {
        const item = snapshot.items[rowLayout.itemOffset + slot]!;
        tiles.push(
          createTile(
            item,
            rowLayout.itemWidths[slot]!,
            rowLayout.height,
            revision,
          ),
        );
      }
      const rowChildren = rowLayout.fillsWidth ? tiles : [...tiles, Spacer()];
      const row = HStack(rowLayout.gap, rowChildren);
      widgetSetWidth(row, VIEW_WIDTH);
      widgetSetHeight(row, rowLayout.height);
      applyFileWallBackground(row, backgroundAlpha);
      widgetAddChild(wall, row);
    }
    scrollviewSetChild(scrollView, wall);
  }

  function createTile(
    item: FileLibraryItem,
    width: number,
    height: number,
    revision: number,
  ): Widget {
    const tile = ZStack();
    widgetSetWidth(tile, width);
    widgetSetHeight(tile, height);
    widgetSetBackgroundColor(tile, 0.08, 0.08, 0.09, 1);
    widgetSetBorderColor(tile, 0.02, 0.02, 0.025, 1);
    widgetSetBorderWidth(tile, 0.5);

    const mediaHost = ZStack();
    widgetSetWidth(mediaHost, width);
    widgetSetHeight(mediaHost, height);
    applyKindGradient(mediaHost, item.kind);
    const fallback = fallbackCover(item, width, height);
    widgetAddChild(mediaHost, fallback);
    widgetAddChild(tile, mediaHost);

    widgetSetOnHover(tile, (isHovering) => {
      if (detailVisible || mediaPreviewVisible) return;
      widgetSetOpacity(mediaHost, isHovering ? 0.78 : 1);
      if (isHovering) {
        selectedPath = item.path;
        textSetString(hoverTitle, item.name);
        const openHint = fileOpenPresentation(item.kind) === "details"
          ? "单击查看详情"
          : "单击在应用内查看";
        textSetString(
          hoverDetail,
          `${kindLabel(item.kind)} · ${openHint}`,
        );
        widgetSetHidden(hoverBar, 0);
      } else if (selectedPath === item.path) {
        widgetSetHidden(hoverBar, 1);
      }
    });
    widgetSetOnClick(tile, () => openFile(item));
    if (fileOpenPresentation(item.kind) === "details") {
      widgetSetOnDoubleClick(tile, () => openManagedFile(item));
    }

    const pixelWidth = Math.max(1, Math.round(width * 2));
    const pixelHeight = Math.max(1, Math.round(height * 2));
    const cacheKey = thumbnailKey(item, pixelWidth, pixelHeight);
    const cachedPath = thumbnailPaths.get(cacheKey);
    if (cachedPath) {
      addThumbnail(mediaHost, cachedPath, width, height, fallback);
    } else {
      void options.thumbnails.resolve(item, pixelWidth, pixelHeight).then((path) => {
        if (!path || renderRevision !== revision) return;
        thumbnailPaths.set(cacheKey, path);
        addThumbnail(mediaHost, path, width, height, fallback);
      });
    }
    return tile;
  }

  function openFile(item: FileLibraryItem): void {
    const presentation = fileOpenPresentation(item.kind);
    if (presentation === "details") {
      showDetail(item);
      return;
    }
    showMediaPreview(item);
  }

  function showMediaPreview(item: FileLibraryItem): void {
    closeOverlay();
    closeMediaPreview();
    selectedPath = item.path;
    mediaPreviewVisible = true;
    textSetString(mediaPreviewTitle, fileDisplayTitle(item.name));
    widgetClearChildren(mediaContentHost);

    const mediaHeight = VIEW_HEIGHT - 56;
    if (fileOpenPresentation(item.kind) === "immersive-video") {
      const video = VideoFile(item.path);
      widgetSetWidth(video, VIEW_WIDTH);
      widgetSetHeight(video, mediaHeight);
      activeVideo = video;
      widgetAddChild(mediaContentHost, video);
    } else {
      const image = ImageFile(item.path);
      imageSetScaling(image, 3);
      widgetSetWidth(image, VIEW_WIDTH);
      widgetSetHeight(image, mediaHeight);
      widgetAddChild(mediaContentHost, image);
    }

    widgetSetHidden(scrollView, 1);
    widgetSetHidden(toolbar, 1);
    widgetSetHidden(emptyState, 1);
    widgetSetHidden(hoverBar, 1);
    widgetSetHidden(mediaPreview, 0);
    if (!reduceMotion) {
      widgetSetOpacity(mediaPreview, 0);
      widgetAnimateOpacity(mediaPreview, 1, 0.18);
    }
  }

  function showDetail(item: FileLibraryItem): void {
    selectedPath = item.path;
    detailVisible = true;
    widgetClearChildren(detailBody);
    const detailWidth = 332;
    const detailHeight = 170;
    const detailPixelWidth = detailWidth * 2;
    const detailPixelHeight = detailHeight * 2;
    const cacheKey = thumbnailKey(
      item,
      detailPixelWidth,
      detailPixelHeight,
    );
    const detailFallback = fallbackCover(item, detailWidth, detailHeight);
    const cover = detailCover(item, detailFallback);
    const cachedPath = thumbnailPaths.get(cacheKey);
    if (cachedPath) {
      addThumbnail(
        cover,
        cachedPath,
        detailWidth,
        detailHeight,
        detailFallback,
      );
    } else {
      void options.thumbnails
        .resolve(item, detailPixelWidth, detailPixelHeight)
        .then((path) => {
          if (!path || !detailVisible || selectedPath !== item.path) return;
          thumbnailPaths.set(cacheKey, path);
          addThumbnail(
            cover,
            path,
            detailWidth,
            detailHeight,
            detailFallback,
          );
        });
    }
    widgetAddChild(detailBody, cover);
    const title = styledText(
      fileDisplayTitle(item.name),
      18,
      true,
      0.09,
      0.085,
      0.075,
    );
    textSetTextAlignment(title, 2);
    widgetAddChild(detailBody, title);
    const metadata = styledText(
      `${kindLabel(item.kind)}  ·  ${formatFileSize(item.sizeBytes)}  ·  ${
        formatModifiedAt(item.modifiedAtMs)
      }`,
      10,
      false,
      0.3,
      0.29,
      0.27,
    );
    textSetTextAlignment(metadata, 2);
    widgetAddChild(detailBody, metadata);
    widgetAddChild(
      detailBody,
      styledText(
        "此文件由 OpenFX Node 管理；导入完成后不再依赖原文件。",
        11,
        false,
        0.27,
        0.26,
        0.23,
      ),
    );
    const path = styledText(
      `管理副本：${item.path}`,
      11,
      false,
      0.36,
      0.35,
      0.32,
    );
    textSetWraps(path, 332);
    widgetAddChild(detailBody, path);
    const openButton = Button("用默认应用打开", () => openManagedFile(item));
    buttonSetTextColor(openButton, 0.09, 0.085, 0.075, 1);
    const revealButton = Button("在 Finder 中选择", () => {
      void options.library.reveal(item).catch(() => {
        textSetString(hoverTitle, "无法在 Finder 中显示");
        textSetString(hoverDetail, "文件可能已移动，或当前账户没有访问权限。");
        closeOverlay();
        widgetSetHidden(hoverBar, 0);
      });
    });
    buttonSetTextColor(revealButton, 0.09, 0.085, 0.075, 1);
    widgetAddChild(
      detailBody,
      HStack(10, [
        openButton,
        revealButton,
      ]),
    );
    widgetSetHidden(scrim, 0);
    widgetSetHidden(detailCard, 0);
    if (!reduceMotion) {
      widgetSetOpacity(scrim, 0);
      widgetSetOpacity(detailCard, 0);
      widgetAnimateOpacity(scrim, 0.76, 0.18);
      widgetAnimateOpacity(detailCard, 1, 0.22);
    }

    const thumbnail = thumbnailPaths.get(cacheKey);
    if (!thumbnail) {
      void options.thumbnails
        .resolve(item, detailPixelWidth, detailPixelHeight)
        .then((resolved) => {
          if (!resolved || selectedPath !== item.path || !detailVisible) return;
          thumbnailPaths.set(cacheKey, resolved);
          showDetail(item);
        });
    }
  }

  function openManagedFile(item: FileLibraryItem): void {
    void options.library.open(item).catch(() => {
      showMessage(
        "无法打开",
        "管理副本可能已被外部移走，或当前账户没有访问权限。",
      );
    });
  }

  function selectedLibraryItem(): FileLibraryItem | undefined {
    return options.library.snapshot().items.find((item) => item.path === selectedPath);
  }

  function showMessage(title: string, detail: string): void {
    textSetString(hoverTitle, title);
    textSetString(hoverDetail, detail);
    closeOverlay();
    widgetSetHidden(hoverBar, 0);
  }

  function closeOverlay(): void {
    detailVisible = false;
    widgetSetHidden(detailCard, 1);
    widgetSetHidden(scrim, 1);
  }

  function closeMediaPreview(): void {
    if (activeVideo) videoSetPlaying(activeVideo, 0);
    activeVideo = null;
    mediaPreviewVisible = false;
    widgetClearChildren(mediaContentHost);
    widgetSetHidden(mediaPreview, 1);
    widgetSetHidden(scrollView, 0);
    widgetSetHidden(toolbar, 0);
    widgetSetHidden(
      emptyState,
      options.library.snapshot().items.length === 0 ? 0 : 1,
    );
  }

  return {
    body: root,
    showLibrary() {
      closeOverlay();
      render(options.library.refresh());
    },
    refresh: () => render(options.library.refresh()),
    setReduceMotion(value) {
      reduceMotion = value;
    },
  };
}

function applyFileWallBackground(widget: Widget, alpha: number): void {
  widgetSetBackgroundColor(widget, 0.025, 0.025, 0.03, alpha);
}

function detailCover(
  item: FileLibraryItem,
  fallback: Widget,
): Widget {
  const cover = ZStack();
  widgetSetWidth(cover, 332);
  widgetSetHeight(cover, 170);
  applyKindGradient(cover, item.kind);
  widgetAddChild(cover, fallback);
  setCornerRadius(cover, 2);
  return cover;
}

function thumbnailKey(
  item: FileLibraryItem,
  pixelWidth: number,
  pixelHeight: number,
): string {
  return `${item.path}\0${item.sizeBytes}\0${item.modifiedAtMs}\0${pixelWidth}x${pixelHeight}`;
}

function addThumbnail(
  mediaHost: Widget,
  path: string,
  width: number,
  height: number,
  fallback?: Widget,
): void {
  if (fallback) widgetSetHidden(fallback, 1);
  const image = ImageFile(path);
  imageSetSize(image, width, height);
  widgetSetWidth(image, width);
  widgetSetHeight(image, height);
  widgetAddChild(mediaHost, image);
}

function fallbackCover(
  item: FileLibraryItem,
  width: number,
  height: number,
): Widget {
  const symbol = ImageSymbol(symbolForKind(item.kind));
  imageSetSize(symbol, 46, 46);
  imageSetTint(symbol, 0.96, 0.94, 0.86, 0.94);
  const extension = styledText(
    item.extension.replace(".", "").toUpperCase() || "FILE",
    width > 220 ? 28 : 21,
    true,
    0.98,
    0.96,
    0.88,
  );
  textSetTextAlignment(extension, 2);
  const cover = VStack(8, [Spacer(), symbol, extension, Spacer()]);
  stackSetAlignment(cover, 9);
  widgetSetWidth(cover, width);
  widgetSetHeight(cover, height);
  return cover;
}

function applyKindGradient(widget: Widget, kind: FileLibraryKind): void {
  const colors = kindColors(kind);
  widgetSetBackgroundGradient(
    widget,
    colors[0],
    colors[1],
    colors[2],
    1,
    colors[3],
    colors[4],
    colors[5],
    1,
    35,
  );
}

function kindColors(
  kind: FileLibraryKind,
): [number, number, number, number, number, number] {
  switch (kind) {
    case "image":
      return [0.56, 0.23, 0.12, 0.1, 0.04, 0.025];
    case "video":
      return [0.22, 0.08, 0.38, 0.045, 0.025, 0.09];
    case "audio":
      return [0.08, 0.36, 0.34, 0.02, 0.095, 0.11];
    case "document":
      return [0.17, 0.3, 0.49, 0.035, 0.08, 0.16];
    case "archive":
      return [0.38, 0.2, 0.07, 0.11, 0.055, 0.025];
    case "code":
      return [0.12, 0.31, 0.19, 0.025, 0.09, 0.065];
    case "package":
      return [0.28, 0.24, 0.4, 0.07, 0.055, 0.12];
    default:
      return [0.25, 0.26, 0.28, 0.06, 0.06, 0.07];
  }
}

function iconButton(
  symbol: string,
  accessibilityLabel: string,
  action: () => void,
): Widget {
  const button = Button(accessibilityLabel, action);
  buttonSetTitle(button, "");
  buttonSetBordered(button, 0);
  buttonSetImage(button, symbol);
  buttonSetImagePosition(button, 1);
  buttonSetTextColor(button, 0.92, 0.92, 0.9, 1);
  widgetSetTooltip(button, accessibilityLabel);
  widgetSetWidth(button, 34);
  widgetSetHeight(button, 34);
  return button;
}

function floatingIconButton(
  symbol: string,
  accessibilityLabel: string,
  action: () => void,
): Widget {
  return iconButton(symbol, accessibilityLabel, action);
}

function styledText(
  value: string,
  size: number,
  strong: boolean,
  r: number,
  g: number,
  b: number,
): Widget {
  const text = Text(value);
  textSetFontSize(text, size);
  textSetColor(text, r, g, b, 1);
  if (strong) textSetFontWeight(text, size, 0.76);
  return text;
}

function symbolForKind(kind: FileLibraryKind): string {
  switch (kind) {
    case "image":
      return "photo";
    case "video":
      return "film";
    case "audio":
      return "waveform";
    case "document":
      return "doc.text";
    case "archive":
      return "archivebox";
    case "code":
      return "chevron.left.forwardslash.chevron.right";
    case "package":
      return "shippingbox";
    default:
      return "doc";
  }
}

function kindLabel(kind: FileLibraryKind): string {
  switch (kind) {
    case "image":
      return "图像";
    case "video":
      return "视频";
    case "audio":
      return "音频";
    case "document":
      return "文档";
    case "archive":
      return "压缩包";
    case "code":
      return "代码";
    case "package":
      return "应用与包";
    default:
      return "文件";
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatModifiedAt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "时间未知";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
