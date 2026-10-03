import { useEffect, useRef, useState } from "react";
import { Button, Caption1, makeStyles, Slider, tokens } from "@fluentui/react-components";
import { Pause20Filled, Play20Filled } from "@fluentui/react-icons";
import { formatDuration } from "../lib/format";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  play: { borderRadius: "50%", minWidth: "40px", width: "40px", height: "40px" },
  slider: { flexGrow: 1 },
  time: { fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground3, minWidth: "88px", textAlign: "right" },
});

export function AudioPlayer({ src, autoPlay }: { src: string; autoPlay?: boolean }) {
  const styles = useStyles();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPosition(0);
    setPlaying(false);
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  };

  return (
    <div className={styles.root}>
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setPlaying(false)}
      />
      <Button appearance="primary" className={styles.play} icon={playing ? <Pause20Filled /> : <Play20Filled />} onClick={toggle} aria-label={playing ? "Pause" : "Play"} />
      <Slider
        className={styles.slider}
        min={0}
        max={Math.max(duration, 0.1)}
        value={Math.min(position, duration || 0)}
        onChange={(_, d) => {
          if (audioRef.current) audioRef.current.currentTime = d.value;
          setPosition(d.value);
        }}
        aria-label="Seek"
      />
      <Caption1 className={styles.time}>
        {formatDuration(position)} / {formatDuration(duration)}
      </Caption1>
    </div>
  );
}
