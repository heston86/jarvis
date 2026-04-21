import { useState, useCallback, useRef, useEffect } from "react";

export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "followup";

interface UseVoiceStateOptions {
  followupTimeout?: number; // ms before returning to idle
  onStateChange?: (state: VoiceState) => void;
}

export function useVoiceState(options: UseVoiceStateOptions = {}) {
  const { followupTimeout = 5000, onStateChange } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const timeoutRef = useRef<NodeJS.Timeout>();

  const clearScheduledTransition = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const transition = useCallback(
    (newState: VoiceState) => {
      clearScheduledTransition();
      setState(newState);
      onStateChange?.(newState);
    },
    [clearScheduledTransition, onStateChange]
  );

  // State transition methods
  const wake = useCallback(() => {
    if (state === "idle" || state === "followup") {
      transition("listening");
    }
  }, [state, transition]);

  const startThinking = useCallback(() => {
    if (state === "listening") {
      transition("thinking");
    }
  }, [state, transition]);

  const startSpeaking = useCallback(() => {
    transition("speaking");
  }, [transition]);

  const finishSpeaking = useCallback(() => {
    transition("followup");

    // Schedule return to idle
    timeoutRef.current = setTimeout(() => {
      setState("idle");
      onStateChange?.("idle");
    }, followupTimeout);
  }, [transition, followupTimeout, onStateChange]);

  const continueListening = useCallback(() => {
    if (state === "followup") {
      transition("listening");
    }
  }, [state, transition]);

  const reset = useCallback(() => {
    transition("idle");
  }, [transition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearScheduledTransition();
    };
  }, [clearScheduledTransition]);

  return {
    state,
    wake,
    startThinking,
    startSpeaking,
    finishSpeaking,
    continueListening,
    reset,
    isIdle: state === "idle",
    isListening: state === "listening",
    isThinking: state === "thinking",
    isSpeaking: state === "speaking",
    isFollowup: state === "followup",
    isActive: state !== "idle",
  };
}
