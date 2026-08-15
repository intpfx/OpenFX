import { createPlayer } from '@videojs/react';
import { ChevronIcon } from '@videojs/react/icons';
import { Video, VideoSkin, videoFeatures } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import { type SVGProps, useCallback } from 'react';

import type { OpenFxLibraryFileAction } from './openfx-library-player.js';

const MediaPlayer = createPlayer({
  displayName: 'OpenFxMediaPlayer',
  features: videoFeatures,
});

function EditFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M3.5 16.76V20.5h3.74L18.26 9.48l-3.74-3.74L3.5 16.76Zm17.65-10.17a1 1 0 0 0 0-1.41l-2.33-2.33a1 1 0 0 0-1.41 0l-1.82 1.82 3.74 3.74 1.82-1.82Z" />
    </svg>
  );
}

function DownloadFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M10 3a1 1 0 0 0-1 1v6H5.83a1 1 0 0 0-.7 1.7l6.16 6.17a1 1 0 0 0 1.42 0l6.16-6.16a1 1 0 0 0-.7-1.71H15V4a1 1 0 0 0-1-1h-4ZM5 19a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z" />
    </svg>
  );
}

function DeleteFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M9 3a1 1 0 0 0-.89.55L7.38 5H4a1 1 0 1 0 0 2h1l.77 12.25A1.88 1.88 0 0 0 7.65 21h8.7a1.88 1.88 0 0 0 1.88-1.75L19 7h1a1 1 0 1 0 0-2h-3.38l-.73-1.45A1 1 0 0 0 15 3H9Zm1.38 2 .25-.5h2.74l.25.5h-3.24ZM9 9a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm6 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function PlaybackVideo(props: {
  libraryFile?: {
    name: string;
    onAction: (action: OpenFxLibraryFileAction) => void;
  };
  onVideoElementChange: (video: HTMLVideoElement | null) => void;
}) {
  const videoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      props.onVideoElementChange(video);
      if (!video) return;

      return () => {
        video.pause();
        props.onVideoElementChange(null);
      };
    },
    [props.onVideoElementChange],
  );

  return (
    <MediaPlayer.Provider>
      <VideoSkin className="media-player-controls" aria-label="OpenFX media player">
        {props.libraryFile ? (
          <div className="media-player-library-chrome">
            <nav
              aria-label={`${props.libraryFile.name} 导航`}
              className="media-surface media-player-library-navigation"
            >
              <button
                aria-label="返回文件库"
                className="media-button media-button--subtle media-button--icon"
                title="返回文件库"
                type="button"
                onClick={() => props.libraryFile?.onAction('close')}
              >
                <ChevronIcon className="media-icon media-player-library-back-icon" />
              </button>
              <span title={props.libraryFile.name}>{props.libraryFile.name}</span>
            </nav>
            <nav
              aria-label={`${props.libraryFile.name} 文件操作`}
              className="media-surface media-player-library-actions"
            >
              <button
                aria-label="编辑文件"
                className="media-button media-button--subtle media-button--icon"
                title="编辑文件"
                type="button"
                onClick={() => props.libraryFile?.onAction('edit')}
              >
                <EditFileIcon className="media-icon" />
              </button>
              <button
                aria-label="下载"
                className="media-button media-button--subtle media-button--icon"
                title="下载"
                type="button"
                onClick={() => props.libraryFile?.onAction('download')}
              >
                <DownloadFileIcon className="media-icon" />
              </button>
              <button
                aria-label="删除"
                className="media-button media-button--subtle media-button--icon"
                title="删除"
                type="button"
                onClick={() => props.libraryFile?.onAction('delete')}
              >
                <DeleteFileIcon className="media-icon" />
              </button>
            </nav>
          </div>
        ) : null}
        <Video ref={videoRef} autoPlay playsInline />
      </VideoSkin>
    </MediaPlayer.Provider>
  );
}
