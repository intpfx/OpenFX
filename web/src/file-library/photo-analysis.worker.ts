/// <reference lib="webworker" />

import {
  analyzePhotoFile,
  type PhotoAnalysisWorkerResponse,
} from "./photo-analysis.ts";

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const response: PhotoAnalysisWorkerResponse = {
      ok: true,
      result: await analyzePhotoFile(event.data),
    };
    self.postMessage(response);
  } catch (error) {
    const response: PhotoAnalysisWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "照片分析失败",
    };
    self.postMessage(response);
  }
};
