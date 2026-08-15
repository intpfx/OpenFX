import { createPlayer } from "@videojs/react";
import { Audio, audioFeatures, AudioSkin } from "@videojs/react/audio";
import "@videojs/react/audio/skin.css";

const AudioPlayer = createPlayer({
  displayName: "OpenFxLibraryAudioPlayer",
  features: audioFeatures,
});

export function LibraryAudioPlayer(props: {
  autoPlay?: boolean;
  label: string;
  sourceUrl: string;
  onPlayingChange: (playing: boolean) => void;
}) {
  return (
    <AudioPlayer.Provider>
      <AudioSkin
        aria-label={`${props.label} 音乐播放器`}
        className="file-library-audio-controls"
      >
        <Audio
          autoPlay={props.autoPlay}
          preload="metadata"
          src={props.sourceUrl}
          onEnded={() => props.onPlayingChange(false)}
          onPause={() => props.onPlayingChange(false)}
          onPlay={() => props.onPlayingChange(true)}
        />
      </AudioSkin>
    </AudioPlayer.Provider>
  );
}
