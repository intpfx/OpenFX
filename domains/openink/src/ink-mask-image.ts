import type { InkMask } from "./photo-cleanup.ts";

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("OpenInk 墨迹图像编码失败")),
      "image/png",
    );
  });
}

function renderInkMaskCanvas(mask: InkMask, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法渲染照片墨迹");
  const image = context.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.coverage.length; index += 1) {
    const offset = index * 4;
    image.data[offset] = 255;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 255;
    image.data[offset + 3] = mask.coverage[index];
  }
  context.putImageData(image, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, mask.width, mask.height);
  return canvas;
}

export function createInkMaskDataUrl(mask: InkMask, color: string): string {
  return renderInkMaskCanvas(mask, color).toDataURL("image/png");
}

export async function createInkMaskUrl(mask: InkMask, color: string): Promise<string> {
  const canvas = renderInkMaskCanvas(mask, color);
  return URL.createObjectURL(await canvasBlob(canvas));
}
