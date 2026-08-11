/* pdq-wasm 0.3.9 browser worker adapter; see /pdq/LICENSE. */
const workerRoot = new URL("./", self.location.href);
const wasmUrl = new URL("pdq.wasm", workerRoot).href;
importScripts(new URL("pdq.js", workerRoot).href);

let modulePromise;

function getModule() {
  modulePromise ??= self.createPDQModule({
    locateFile(path) {
      return path.endsWith(".wasm") ? wasmUrl : new URL(path, workerRoot).href;
    },
  });
  return modulePromise;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(blob) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  )));
}

async function pdqHash(blob) {
  const bitmap = await createImageBitmap(blob);
  if (!bitmap.width || !bitmap.height) {
    bitmap.close();
    throw new Error("图像尺寸不可用");
  }
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("OffscreenCanvas 2D 不可用");
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(width * height * 3);
    for (let source = 0, target = 0; source < rgba.length; source += 4) {
      rgb[target++] = rgba[source];
      rgb[target++] = rgba[source + 1];
      rgb[target++] = rgba[source + 2];
    }

    const module = await getModule();
    const imagePointer = module._malloc(rgb.length);
    const hashPointer = module._malloc(32);
    const qualityPointer = module._malloc(4);
    try {
      module.HEAPU8.set(rgb, imagePointer);
      const result = module._pdq_hash_from_rgb(
        imagePointer,
        width,
        height,
        hashPointer,
        qualityPointer,
      );
      if (result !== 0) throw new Error(`PDQ 计算失败：${result}`);
      return bytesToHex(module.HEAPU8.slice(hashPointer, hashPointer + 32));
    } finally {
      module._free(imagePointer);
      module._free(hashPointer);
      module._free(qualityPointer);
    }
  } finally {
    bitmap.close();
  }
}

async function analyze(input) {
  const [sourceHash, motionHash] = await Promise.all([
    sha256(input.source),
    input.motion ? sha256(input.motion) : Promise.resolve(undefined),
  ]);
  const fingerprint = {
    version: 1,
    status: "completed",
    exact: {
      algorithm: "sha-256",
      source: sourceHash,
      motion: motionHash,
    },
    updatedAt: new Date().toISOString(),
  };
  try {
    const [stillHash, videoHashes] = await Promise.all([
      input.still ? pdqHash(input.still) : Promise.resolve(undefined),
      input.video
        ? Promise.all(input.video.frames.map((frame) => pdqHash(frame)))
        : Promise.resolve(undefined),
    ]);
    if (stillHash) {
      fingerprint.still = { algorithm: "pdq-256", hash: stillHash };
    }
    if (input.video && videoHashes?.length) {
      fingerprint.video = {
        algorithm: "pdq-256-sequence",
        durationSec: input.video.durationSec,
        timestampsSec: input.video.timestampsSec,
        hashes: videoHashes,
      };
    }
  } catch (error) {
    fingerprint.error = `视觉指纹不可用：${error instanceof Error ? error.message : String(error)}`;
  }
  return fingerprint;
}

self.onmessage = async (event) => {
  try {
    self.postMessage({ ok: true, fingerprint: await analyze(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "文件指纹分析失败",
    });
  }
};
