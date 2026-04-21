import React, { useRef, useEffect } from "react";

interface Props {
  src: string;
  onEnd?: () => void;
  autoPlay?: boolean;
  maxDuration?: number; // Stop after this many seconds
}

export default function AudioPlayer({
  src,
  onEnd,
  autoPlay = false,
  maxDuration,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      onEnd?.();
    };

    const handlePlay = () => {
      if (maxDuration) {
        timeoutRef.current = setTimeout(() => {
          audio.pause();
          onEnd?.();
        }, maxDuration * 1000);
      }
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);

    if (autoPlay) {
      audio.play().catch((err) => {
        console.error("Audio autoplay failed:", err);
      });
    }

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [src, autoPlay, maxDuration, onEnd]);

  // Hidden audio element
  return <audio ref={audioRef} src={src} style={{ display: "none" }} />;
}
