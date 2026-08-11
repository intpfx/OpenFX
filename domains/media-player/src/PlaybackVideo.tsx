import { createPlayer } from '@videojs/react';
import { Video, VideoSkin, videoFeatures } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import { useCallback } from 'react';

const MediaPlayer = createPlayer({
  displayName: 'OpenFxMediaPlayer',
  features: videoFeatures,
});

export function PlaybackVideo(props: {
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
        <Video ref={videoRef} autoPlay playsInline />
      </VideoSkin>
    </MediaPlayer.Provider>
  );
}
