/// <reference lib="webworker" />

import {
  analyzeAudioFile,
  type AudioAnalysisWorkerResponse,
} from "./audio-analysis.ts";

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const response: AudioAnalysisWorkerResponse = {
      ok: true,
      result: await analyzeAudioFile(event.data),
    };
    self.postMessage(response);
  } catch (error) {
    const response: AudioAnalysisWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "音频分析失败",
    };
    self.postMessage(response);
  }
};
