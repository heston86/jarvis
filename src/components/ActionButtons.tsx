import React from "react";

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "followup";

interface Props {
  onMicClick: () => void;
  voiceState: VoiceState;
}

export default function ActionButtons({ onMicClick, voiceState }: Props) {
  return (
    <div className="action-buttons">
      <button className="action-btn-large" title="Camera">
        <span className="btn-icon">📷</span>
      </button>

      <button
        className={`action-btn-large mic-btn ${voiceState === "listening" ? "active" : ""}`}
        onClick={onMicClick}
        title="Microphone"
      >
        <span className="btn-icon">🎤</span>
        {voiceState === "listening" && <span className="pulse-ring"></span>}
      </button>

      <button className="action-btn-large" title="Keyboard">
        <span className="btn-icon">⌨</span>
      </button>
    </div>
  );
}
