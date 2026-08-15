import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isOpenFxLibraryFileDetailsMessage,
  makeOpenFxLibraryFileActionMessage,
  type OpenFxLibraryFileAction,
  parseOpenFxLibraryFileRequest,
  readOpenFxLibraryFile,
} from './openfx-library-player.js';
import { PlaybackVideo } from './PlaybackVideo.js';
import { useMediaEngine } from './useMediaEngine.js';

export function FilePlayer() {
  const [request] = useState(() => parseOpenFxLibraryFileRequest(window.location.search));
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState(request?.name ?? '');
  const [readError, setReadError] = useState('');
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [activeSubtitlePath, setActiveSubtitlePath] = useState('');
  const loadedSubtitlePathRef = useRef('');

  useEffect(() => {
    if (!request) {
      setReadError('Invalid OpenFX file-library request');
      return;
    }
    let active = true;
    readOpenFxLibraryFile(request)
      .then((stored) => {
        if (active) setFile(stored);
      })
      .catch((error) => {
        if (!active) return;
        setReadError(error instanceof Error ? error.message : 'Unable to read the OPFS file');
      });
    return () => {
      active = false;
    };
  }, [request]);

  const {
    clearExternalSubtitles,
    error: engineError,
    loadSubtitleFile,
    phase,
  } = useMediaEngine(file, request?.resumePositionSec, videoElement);

  useEffect(() => {
    if (!request?.itemId) return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.source === window.parent &&
        isOpenFxLibraryFileDetailsMessage(event.data) &&
        event.data.itemId === request.itemId
      ) {
        setFileName(event.data.name);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [request?.itemId]);

  useEffect(() => {
    if (!request?.itemId || !videoElement) return;
    let lastReportedPosition = Number.NEGATIVE_INFINITY;
    const emitProgress = (ended = videoElement.ended, force = false) => {
      if (!Number.isFinite(videoElement.duration) || videoElement.duration <= 0) return;
      const reportInterval = Math.min(5, Math.max(0.5, videoElement.duration * 0.1));
      if (!force && Math.abs(videoElement.currentTime - lastReportedPosition) < reportInterval)
        return;
      lastReportedPosition = videoElement.currentTime;
      window.parent.postMessage(
        {
          type: 'openfx:media-player:progress',
          itemId: request.itemId,
          positionSec: videoElement.currentTime,
          durationSec: videoElement.duration,
          ended,
        },
        location.origin,
      );
    };
    const onTimeUpdate = () => emitProgress(false);
    const onPause = () => emitProgress(false, true);
    const onEnded = () => emitProgress(true, true);
    const onPageHide = () => emitProgress(videoElement.ended, true);
    videoElement.addEventListener('timeupdate', onTimeUpdate);
    videoElement.addEventListener('pause', onPause);
    videoElement.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      videoElement.removeEventListener('timeupdate', onTimeUpdate);
      videoElement.removeEventListener('pause', onPause);
      videoElement.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [request, videoElement]);

  const loadEmbeddedSubtitle = useCallback(
    async (path: string) => {
      const reference = request?.subtitles?.find((subtitle) => subtitle.path === path);
      if (!reference) {
        clearExternalSubtitles();
        setActiveSubtitlePath('');
        loadedSubtitlePathRef.current = '';
        return;
      }
      const subtitle = await readOpenFxLibraryFile(reference);
      await loadSubtitleFile(subtitle);
      setActiveSubtitlePath(reference.path);
      loadedSubtitlePathRef.current = reference.path;
    },
    [clearExternalSubtitles, loadSubtitleFile, request],
  );

  const emitFileAction = useCallback(
    (action: OpenFxLibraryFileAction) => {
      if (!request?.itemId || window.parent === window) return;
      window.parent.postMessage(
        makeOpenFxLibraryFileActionMessage(request.itemId, action),
        location.origin,
      );
    },
    [request?.itemId],
  );

  useEffect(() => {
    const first = request?.subtitles?.[0];
    if (phase !== 'ready' || !first || loadedSubtitlePathRef.current) return;
    void loadEmbeddedSubtitle(first.path).catch(() => undefined);
  }, [loadEmbeddedSubtitle, phase, request]);

  return (
    <main className="media-player-page">
      <div className="media-player-stage">
        <PlaybackVideo
          libraryFile={
            request?.itemId
              ? {
                  name: fileName,
                  onAction: emitFileAction,
                }
              : undefined
          }
          onVideoElementChange={setVideoElement}
        />
      </div>
      {request?.subtitles?.length ? (
        <label className="media-player-subtitles">
          <span>字幕</span>
          <select
            aria-label="字幕"
            value={activeSubtitlePath}
            onChange={(event) => void loadEmbeddedSubtitle(event.target.value)}
          >
            <option value="">关闭</option>
            {request.subtitles.map((subtitle) => (
              <option key={subtitle.path} value={subtitle.path}>
                {subtitle.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {readError || engineError ? (
        <output className="media-player-error">Error: {readError || engineError}</output>
      ) : null}
    </main>
  );
}
