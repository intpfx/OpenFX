import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaysVideoEngine } from 'playsvideo';

export type MediaEnginePhase = 'idle' | 'opening' | 'ready' | 'error';

export function useMediaEngine(
  file: File | null,
  resumePositionSec: number | undefined,
  video: HTMLVideoElement | null,
) {
  const engineRef = useRef<PlaysVideoEngine | null>(null);
  const [phase, setPhase] = useState<MediaEnginePhase>('idle');
  const [error, setError] = useState('');
  const [subtitleStatus, setSubtitleStatus] = useState('');

  useEffect(() => {
    if (!file || !video) return;

    let pendingResume = resumePositionSec && resumePositionSec > 0 ? resumePositionSec : 0;
    const applyResume = () => {
      if (pendingResume <= 0) return;
      video.currentTime = pendingResume;
      pendingResume = 0;
    };
    const engine = new PlaysVideoEngine(video, {
      embeddedSubtitlePolicy: 'auto',
    });
    engineRef.current = engine;
    setPhase('opening');

    const onLoading = (() => {
      setPhase('opening');
      setError('');
      setSubtitleStatus('');
    }) as EventListener;
    const onReady = (() => {
      setPhase('ready');
      setError('');
      applyResume();
    }) as EventListener;
    const onError = ((event: CustomEvent) => {
      setError(event.detail.message);
      setPhase('error');
    }) as EventListener;
    const onSubtitleStatus = ((event: CustomEvent) => {
      setSubtitleStatus(event.detail.message);
    }) as EventListener;
    const onLoadedMetadata = () => applyResume();

    engine.addEventListener('loading', onLoading);
    engine.addEventListener('ready', onReady);
    engine.addEventListener('error', onError);
    engine.addEventListener('subtitle-status', onSubtitleStatus);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    engine.loadFile(file);

    return () => {
      engine.removeEventListener('loading', onLoading);
      engine.removeEventListener('ready', onReady);
      engine.removeEventListener('error', onError);
      engine.removeEventListener('subtitle-status', onSubtitleStatus);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [file, resumePositionSec, video]);

  const loadSubtitleFile = useCallback(async (subtitle: File) => {
    const engine = engineRef.current;
    if (!engine) throw new Error('Player is not ready');
    try {
      await engine.loadExternalSubtitle(subtitle);
      setSubtitleStatus(`Subtitles: ${subtitle.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubtitleStatus(`Subtitle error: ${message}`);
      throw error;
    }
  }, []);

  const clearExternalSubtitles = useCallback(() => {
    engineRef.current?.clearExternalSubtitles();
    setSubtitleStatus('');
  }, []);

  return {
    clearExternalSubtitles,
    error,
    loadSubtitleFile,
    phase,
    subtitleStatus,
  };
}
