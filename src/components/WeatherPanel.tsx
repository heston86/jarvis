import React from "react";

interface WeatherData {
  temp: number;
  feelsLike: number;
  high: number;
  low: number;
  condition: string;
  city: string;
}

interface Props {
  weather: WeatherData | null;
}

export default function WeatherPanel({ weather }: Props) {
  if (!weather) {
    return (
      <div className="panel weather-panel">
        <div className="panel-header">
          <span className="panel-icon">☁</span>
          <span className="panel-title">Weather</span>
        </div>
        <div className="loading-placeholder">Loading...</div>
      </div>
    );
  }

  const getWeatherIcon = (condition: string) => {
    const c = condition.toLowerCase();
    if (c.includes("cloud")) return "☁";
    if (c.includes("rain")) return "🌧";
    if (c.includes("sun") || c.includes("clear")) return "☀";
    if (c.includes("snow")) return "❄";
    if (c.includes("thunder")) return "⛈";
    return "🌤";
  };

  // Convert F to C for display
  const toC = (f: number) => Math.round((f - 32) * 5 / 9);

  return (
    <div className="panel weather-panel">
      <div className="panel-header">
        <span className="panel-icon">☁</span>
        <span className="panel-title">Weather</span>
        <button className="refresh-btn">↻</button>
      </div>

      <div className="weather-main">
        <div className="weather-temp-large">{toC(weather.temp)}°C</div>
        <div className="weather-location">{weather.city}</div>
        <div className="weather-condition">{weather.condition}</div>
      </div>

      <div className="weather-icon-large">{getWeatherIcon(weather.condition)}</div>

      <div className="weather-details">
        <div className="weather-detail">
          <span className="detail-label">Humidity</span>
          <span className="detail-value">65%</span>
        </div>
        <div className="weather-detail">
          <span className="detail-label">Wind</span>
          <span className="detail-value">5.8 m/s</span>
        </div>
        <div className="weather-detail">
          <span className="detail-label">Feels Like</span>
          <span className="detail-value">{toC(weather.feelsLike)}°C</span>
        </div>
      </div>
    </div>
  );
}
