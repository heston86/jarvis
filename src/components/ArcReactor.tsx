import React from "react";

type VoiceState = "idle" | "active" | "listening" | "thinking" | "speaking";

interface Props {
  state: VoiceState;
  size?: "small" | "medium" | "large";
}

export default function ArcReactor({ state, size = "medium" }: Props) {
  const sizeClasses = {
    small: "arc-reactor-small",
    medium: "arc-reactor-medium",
    large: "arc-reactor-large",
  };

  return (
    <div className={`arc-reactor ${sizeClasses[size]} ${state}`}>
      {/* Outer ring */}
      <div className="arc-ring arc-ring-outer">
        <div className="arc-segment"></div>
        <div className="arc-segment"></div>
        <div className="arc-segment"></div>
        <div className="arc-segment"></div>
      </div>

      {/* Middle ring */}
      <div className="arc-ring arc-ring-middle">
        <div className="arc-glow"></div>
      </div>

      {/* Inner ring */}
      <div className="arc-ring arc-ring-inner">
        <div className="arc-core"></div>
      </div>

      {/* Scanning lines */}
      <div className="scan-line scan-line-1"></div>
      <div className="scan-line scan-line-2"></div>

      {/* Pulse effect */}
      <div className="arc-pulse"></div>
      <div className="arc-pulse arc-pulse-2"></div>

      {/* Center core */}
      <div className="arc-center">
        <div className="arc-center-glow"></div>
      </div>

      {/* Data points */}
      <div className="data-points">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="data-point"
            style={{
              transform: `rotate(${i * 45}deg) translateY(-120px)`,
            }}
          ></div>
        ))}
      </div>
    </div>
  );
}
