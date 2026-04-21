import React, { useState, useEffect } from "react";
import ArcReactor from "./ArcReactor";

interface ScreensaverProps {
  onWake: () => void;
  serverUrl?: string;
}

export default function Screensaver({ onWake, serverUrl = "http://localhost:3001" }: ScreensaverProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  const bgStyle = {
    backgroundImage: `url(${serverUrl}/assets/screensaver.jpg)`,
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Wake on any interaction
  useEffect(() => {
    const handleWake = () => onWake();

    window.addEventListener("mousemove", handleWake);
    window.addEventListener("mousedown", handleWake);
    window.addEventListener("keydown", handleWake);
    window.addEventListener("touchstart", handleWake);

    return () => {
      window.removeEventListener("mousemove", handleWake);
      window.removeEventListener("mousedown", handleWake);
      window.removeEventListener("keydown", handleWake);
      window.removeEventListener("touchstart", handleWake);
    };
  }, [onWake]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="screensaver">
      <div className="screensaver-content">
        {/* Background Image */}
        <div className="screensaver-bg" style={bgStyle} />

        {/* Corner Decorations */}
        <div className="corner-decoration top-left" />
        <div className="corner-decoration top-right" />
        <div className="corner-decoration bottom-left" />
        <div className="corner-decoration bottom-right" />

        {/* Time Display */}
        <div className="screensaver-status">
          <div className="time">{formatTime(currentTime)}</div>
          <div className="date">{formatDate(currentTime)}</div>
        </div>

        {/* Center Arc Reactor */}
        <div className="screensaver-reactor">
          <ArcReactor state="idle" size="large" />
        </div>

        {/* JARVIS Text */}
        <div className="screensaver-text">
          <h1>J.A.R.V.I.S</h1>
          <p>STARK INDUSTRIES</p>
        </div>

        {/* Wake Prompt */}
        <div className="wake-prompt">
          SAY "HEY JARVIS" OR MOVE TO WAKE
        </div>
      </div>
    </div>
  );
}
