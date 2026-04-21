import React, { useState, useEffect, useCallback, useRef } from "react";
import Header from "./components/Header";
import SystemStats from "./components/SystemStats";
import WeatherPanel from "./components/WeatherPanel";
import ArcReactor from "./components/ArcReactor";
import Screensaver from "./components/Screensaver";
import { useLocalSpeechRecognition } from "./hooks/useLocalSpeechRecognition";
import { useOpenWakeWord } from "./hooks/useOpenWakeWord";
import "./styles/ironman.css";

const SCREENSAVER_TIMEOUT = 120000; // 2 minutes of inactivity
const ACTIVE_TIMEOUT = 10000; // 10 seconds to give command after wake word
const FOLLOWUP_TIMEOUT = 8000; // 8 seconds to continue conversation

type VoiceState = "idle" | "active" | "listening" | "thinking" | "speaking";

interface WeatherData {
  temp: number;
  feelsLike: number;
  high: number;
  low: number;
  condition: string;
  city: string;
}

interface BriefData {
  greeting: string;
  weather: WeatherData;
  brief: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function App() {
  const [serverUrl, setServerUrl] = useState<string>("http://localhost:3001");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showScreensaver, setShowScreensaver] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [lastResponse, setLastResponse] = useState<string>("");

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>("idle");
  const startListeningRef = useRef<() => void>(() => {});
  const stopWakeWordRef = useRef<() => void>(() => {});
  const startWakeWordRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Keep voiceStateRef in sync
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // Handle wake word detection from OpenWakeWord
  const handleWakeWord = useCallback(() => {
    console.log("Wake word detected by OpenWakeWord!");

    // Stop wake word detection while we're processing
    stopWakeWordRef.current();

    // Start speech recording for the command
    setVoiceState("listening");
    startListeningRef.current();
  }, []);

  // Handle transcript from speech recognition (no wake word check - OpenWakeWord handles that)
  const handleTranscript = useCallback((text: string) => {
    console.log("Received transcript:", text, "Active mode:", isActiveRef.current);
    setTranscript(text);

    // Always treat transcript as a command (wake word already detected)
    if (text.length > 2) {
      isActiveRef.current = false;
      if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
      handleMessage(text);
    } else {
      // Too short - just respond with "Yes?"
      speakText("Yes?", { enableFollowup: true });
    }
  }, []);

  // Speech recognition hook
  const speechRecognition = useLocalSpeechRecognition({
    serverUrl,
    onTranscript: handleTranscript,
    onListeningChange: (listening) => {
      // Track listening state but don't change UI until speech detected
    },
    onError: (err) => {
      console.error("Speech recognition error:", err);
      setVoiceState("idle");
      // Go back to wake word detection on error
      startWakeWordRef.current();
    },
    silenceThreshold: 2000,
    minRecordingTime: 1000,
    speechThreshold: 12,
  });

  // OpenWakeWord hook for "Hey Jarvis" detection
  const wakeWord = useOpenWakeWord({
    onWakeWord: handleWakeWord,
    modelPath: `${serverUrl}/models/hey_jarvis.onnx`,
    threshold: 0.5,
    enabled: true,
  });

  // Keep refs updated
  useEffect(() => {
    startListeningRef.current = speechRecognition.startListening;
  }, [speechRecognition.startListening]);

  useEffect(() => {
    stopWakeWordRef.current = wakeWord.stopListening;
    startWakeWordRef.current = wakeWord.startListening;
  }, [wakeWord.stopListening, wakeWord.startListening]);

  // Start wake word detection once when model is ready (not on every state change)
  const wakeWordStartedRef = useRef(false);
  useEffect(() => {
    if (wakeWord.isReady && !wakeWordStartedRef.current) {
      wakeWordStartedRef.current = true;
      console.log("Starting OpenWakeWord detection (initial)...");
      wakeWord.startListening();
    }
  }, [wakeWord.isReady]);

  // Play greeting song
  const playGreetingSong = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const audio = new Audio(`${serverUrl}/assets/greeting.mp3`);
      audio.volume = 0.4;
      setTimeout(() => {
        const fadeOut = setInterval(() => {
          if (audio.volume > 0.05) {
            audio.volume -= 0.05;
          } else {
            clearInterval(fadeOut);
            audio.pause();
          }
        }, 200);
      }, 20000);
      await audio.play();
    } catch (err) {
      console.log("No greeting song found");
    }
  }, [serverUrl]);

  // Speak text using TTS
  const speakText = useCallback(async (text: string, options: { playMusicAfter?: boolean; enableFollowup?: boolean } = {}): Promise<void> => {
    const { playMusicAfter = false, enableFollowup = false } = options;
    if (!serverUrl) return;

    speechRecognition.stopListening();
    stopWakeWordRef.current();  // Stop wake word detection while speaking
    setVoiceState("speaking");
    setLastResponse(text);

    try {
      const response = await fetch(`${serverUrl}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const { audioUrl } = await response.json();
        const audio = new Audio(`${serverUrl}${audioUrl}`);

        audio.onended = () => {
          if (playMusicAfter) playGreetingSong();

          if (enableFollowup) {
            // Enter active mode - listen for direct command (no wake word needed)
            isActiveRef.current = true;
            setVoiceState("active");
            activeTimeoutRef.current = setTimeout(() => {
              if (isActiveRef.current) {
                isActiveRef.current = false;
                setVoiceState("idle");
                // Go back to wake word detection after timeout
                startWakeWordRef.current();
              }
            }, FOLLOWUP_TIMEOUT);
            // Start listening for command directly
            startListeningRef.current();
          } else {
            // No followup - go back to wake word detection
            setVoiceState("idle");
            startWakeWordRef.current();
          }
        };

        audio.onerror = () => {
          setVoiceState("idle");
          startWakeWordRef.current();
        };

        await audio.play();
      } else {
        setVoiceState("idle");
        startWakeWordRef.current();
      }
    } catch (err) {
      console.error("Error speaking:", err);
      setVoiceState("idle");
      startWakeWordRef.current();
    }
  }, [serverUrl, playGreetingSong, speechRecognition]);

  // Handle user message
  const handleMessage = useCallback(async (message: string) => {
    if (!serverUrl || !message.trim()) return;

    speechRecognition.stopListening();
    setVoiceState("thinking");
    setTranscript(message);

    const userMessage: Message = { role: "user", content: message, timestamp: new Date() };
    setConversation(prev => [...prev, userMessage]);

    try {
      const response = await fetch(`${serverUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: conversation.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const { reply } = await response.json();
      const assistantMessage: Message = { role: "assistant", content: reply, timestamp: new Date() };
      setConversation(prev => [...prev, assistantMessage]);
      await speakText(reply, { enableFollowup: true });
    } catch (err) {
      console.error("Error in conversation:", err);
      setVoiceState("idle");
      // Go back to wake word detection on error
      startWakeWordRef.current();
    }
  }, [serverUrl, conversation, speakText, speechRecognition]);

  // Reset idle timer
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (voiceState === "idle") setShowScreensaver(true);
    }, SCREENSAVER_TIMEOUT);
  }, [voiceState]);

  // Wake from screensaver
  const handleWake = useCallback(() => {
    setShowScreensaver(false);
    resetIdleTimer();
    // Start wake word detection when waking from screensaver
    startWakeWordRef.current();
  }, [resetIdleTimer]);

  // Track user activity
  useEffect(() => {
    const handleActivity = () => {
      if (!showScreensaver) resetIdleTimer();
    };
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("click", handleActivity);
    resetIdleTimer();
    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer, showScreensaver]);

  // Update time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize server URL
  useEffect(() => {
    async function init() {
      try {
        if (window.jarvis) {
          const url = await window.jarvis.getServerUrl();
          setServerUrl(url);
        }
      } catch (err) {
        console.error("Failed to get server URL:", err);
      }
    }
    init();
  }, []);

  // Fetch daily brief on startup
  useEffect(() => {
    if (!serverUrl) return;

    async function fetchBrief() {
      try {
        setIsLoading(true);
        const response = await fetch(`${serverUrl}/api/brief`);
        if (!response.ok) throw new Error(`Failed to fetch brief: ${response.status}`);

        const data: BriefData = await response.json();
        setBriefData(data);
        setIsOnline(true);
        setConversation([{ role: "assistant", content: data.brief, timestamp: new Date() }]);
        setIsLoading(false);

        playGreetingSong();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await speakText(data.brief, { enableFollowup: true });
      } catch (err) {
        console.error("Error fetching brief:", err);
        setIsOnline(false);
        setIsLoading(false);
        // Start wake word detection even if brief fails
        startWakeWordRef.current();
      }
    }

    fetchBrief();
  }, [serverUrl]);

  // Loading screen
  if (isLoading) {
    return (
      <div className="jarvis-app loading">
        <div className="loading-bg" style={{ backgroundImage: `url(${serverUrl}/assets/loading.jpg)` }} />
        <ArcReactor state="thinking" size="large" />
        <h2 className="loading-text">INITIALIZING J.A.R.V.I.S</h2>
        <p className="loading-subtext">STARK INDUSTRIES</p>
      </div>
    );
  }

  // Screensaver
  if (showScreensaver) {
    return <Screensaver onWake={handleWake} serverUrl={serverUrl} />;
  }

  return (
    <div className="jarvis-app">
      <Header time={currentTime} temp={briefData?.weather.temp} city={briefData?.weather.city} isOnline={isOnline} />
      <div className="main-content voice-mode">
        <div className="left-panel">
          <SystemStats />
          <WeatherPanel weather={briefData?.weather || null} />
        </div>
        <div className="center-panel">
          <ArcReactor state={voiceState} size="large" />
          <div className="jarvis-title">
            <h1>J.A.R.V.I.S</h1>
            <div className="status-indicator">
              <span className={`status-dot ${voiceState}`}></span>
              <span className="status-text">
                {voiceState === "idle" && "Say 'Hey Jarvis' to start..."}
                {voiceState === "active" && "I'm listening..."}
                {voiceState === "listening" && "Listening..."}
                {voiceState === "thinking" && "Processing..."}
                {voiceState === "speaking" && "Speaking..."}
              </span>
            </div>
          </div>
          <div className="voice-transcript">
            {transcript && voiceState === "listening" && (
              <div className="transcript-user">
                <span className="transcript-label">YOU</span>
                <p>{transcript}</p>
              </div>
            )}
            {lastResponse && (voiceState === "speaking" || voiceState === "idle") && (
              <div className="transcript-jarvis">
                <span className="transcript-label">JARVIS</span>
                <p>{lastResponse}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
