import React from "react";

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "followup";

interface Props {
  state: VoiceState;
}

const stateLabels: Record<VoiceState, string> = {
  idle: 'Say "Hey Jarvis"',
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  followup: "Continue?",
};

const stateColors: Record<VoiceState, string> = {
  idle: "#4a4a5a",
  listening: "#4fc3f7",
  thinking: "#ffd54f",
  speaking: "#81c784",
  followup: "#4fc3f7",
};

export default function VoiceIndicator({ state }: Props) {
  const isActive = state !== "idle";

  return (
    <div className={`voice-indicator ${state}`}>
      <div className="orb-container">
        <div className="orb" />
        {isActive && (
          <>
            <div className="ring ring-1" />
            <div className="ring ring-2" />
          </>
        )}
      </div>
      <span className="label">{stateLabels[state]}</span>

      <style>{`
        .voice-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .orb-container {
          position: relative;
          width: 60px;
          height: 60px;
        }

        .orb {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: radial-gradient(
            circle at 30% 30%,
            ${stateColors[state]},
            ${stateColors[state]}80
          );
          transition: all 0.3s ease;
          box-shadow: 0 0 20px ${stateColors[state]}40;
        }

        .voice-indicator.listening .orb,
        .voice-indicator.followup .orb {
          animation: pulse-active 1.5s ease-in-out infinite;
        }

        .voice-indicator.thinking .orb {
          animation: spin 2s linear infinite;
        }

        .voice-indicator.speaking .orb {
          animation: speak-pulse 0.5s ease-in-out infinite;
        }

        .ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 2px solid ${stateColors[state]}40;
          animation: ring-expand 2s ease-out infinite;
        }

        .ring-1 {
          animation-delay: 0s;
        }

        .ring-2 {
          animation-delay: 1s;
        }

        .label {
          font-size: 12px;
          color: #808090;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        @keyframes pulse-active {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes speak-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @keyframes ring-expand {
          0% {
            width: 60px;
            height: 60px;
            opacity: 0.6;
          }
          100% {
            width: 120px;
            height: 120px;
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
