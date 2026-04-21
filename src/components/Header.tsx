import React from "react";

interface Props {
  time: Date;
  temp?: number;
  city?: string;
  isOnline: boolean;
}

export default function Header({ time, temp, city, isOnline }: Props) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <header className="jarvis-header">
      <div className="header-left">
        <span className="brand">J.A.R.V.I.S</span>
        <span className={`online-status ${isOnline ? "online" : "offline"}`}>
          <span className="status-dot"></span>
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      <div className="header-center">
        <div className="time-display">
          <span className="time">{formatTime(time)}</span>
          <span className="separator">|</span>
          <span className="date">{formatDate(time)}</span>
        </div>
      </div>

      <div className="header-right">
        {temp !== undefined && city && (
          <div className="weather-mini">
            <span className="temp-icon">🌡</span>
            <span className="temp">{Math.round(temp)}°F</span>
            <span className="city">{city}</span>
          </div>
        )}
      </div>
    </header>
  );
}
