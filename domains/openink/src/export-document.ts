import type { DrawingDocument } from "./drawing-document.ts";
import { renderDocumentSvg, type RenderedInkLayer } from "./stroke-renderer.ts";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function exportBaseName(document: DrawingDocument): string {
  const safeTitle = document.title.trim().replaceAll(/[^\p{L}\p{N}-]+/gu, "-") ||
    "openink";
  return safeTitle.replaceAll(/^-+|-+$/g, "");
}

export function downloadSvg(
  document: DrawingDocument,
  renderedInkLayers: readonly RenderedInkLayer[] = [],
): void {
  downloadBlob(
    new Blob([renderDocumentSvg(document, renderedInkLayers)], {
      type: "image/svg+xml;charset=utf-8",
    }),
    `${exportBaseName(document)}.svg`,
  );
}

export async function downloadPng(
  document: DrawingDocument,
  renderedInkLayers: readonly RenderedInkLayer[] = [],
): Promise<void> {
  const svgBlob = new Blob([renderDocumentSvg(document, renderedInkLayers)], {
    type: "image/svg+xml",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = svgUrl;
    await image.decode();
    const exportScale = Math.min(2, 4096 / Math.max(document.width, document.height));
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(document.width * exportScale));
    canvas.height = Math.max(1, Math.round(document.height * exportScale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法创建 PNG 画布");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("PNG 编码失败")),
        "image/png",
      );
    });
    downloadBlob(png, `${exportBaseName(document)}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
