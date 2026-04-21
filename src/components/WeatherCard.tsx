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

export default function WeatherCard({ weather }: Props) {
  if (!weather) {
    return (
      <div className="weather-card">
        <p className="loading">Loading weather...</p>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="weather-card">
      <div className="weather-main">
        <span className="temp">{Math.round(weather.temp)}°</span>
        <span className="condition">{weather.condition}</span>
      </div>
      <div className="weather-details">
        <span className="city">{weather.city}</span>
        <span className="range">
          H: {Math.round(weather.high)}° L: {Math.round(weather.low)}°
        </span>
      </div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .weather-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 24px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .weather-main {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .temp {
    font-size: 48px;
    font-weight: 300;
    color: #4fc3f7;
  }

  .condition {
    font-size: 16px;
    color: #a0a0b0;
    text-transform: capitalize;
  }

  .weather-details {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    color: #808090;
  }

  .city {
    font-weight: 500;
  }

  .loading {
    color: #606070;
    font-style: italic;
  }
`;
