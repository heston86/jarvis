import { useEffect, useCallback, useRef, useState } from "react";

interface UseWakeWordOptions {
  enabled?: boolean;
  onWake?: () => void;
  keywords?: string[]; // e.g., ["hey jarvis", "hi jarvis"]
}

// Web Speech Recognition for wake word detection
// This is a simpler alternative to Porcupine that runs in the browser
export function useWakeWord(options: UseWakeWordOptions = {}) {
  const {
    enabled = true,
    onWake,
    keywords = ["hey jarvis", "hi jarvis", "jarvis"],
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window)) {
      setError("Speech recognition not supported");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();

        // Check if any keyword was spoken
        for (const keyword of keywords) {
          if (transcript.includes(keyword)) {
            console.log("Wake word detected:", keyword);
            onWake?.();
            // Restart recognition to prevent multiple triggers
            recognition.stop();
            return;
          }
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "no-speech") {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      // Restart if we're still supposed to be listening
      if (enabled) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            // Already started
          }
        }, 100);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      setError(null);
    } catch (e) {
      console.error("Failed to start recognition:", e);
    }
  }, [enabled, keywords, onWake]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Start/stop based on enabled prop
  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
    }

    return () => {
      stopListening();
    };
  }, [enabled, startListening, stopListening]);

  return {
    isListening,
    error,
    startListening,
    stopListening,
  };
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
