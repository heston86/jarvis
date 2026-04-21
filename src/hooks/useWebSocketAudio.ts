/**
 * WebSocket Audio Hook
 *
 * Client-side hook for bidirectional audio streaming via WebSocket.
 * - Streams mic audio to server
 * - Receives TTS audio chunks from server
 */

import { useCallback, useRef, useState, useEffect } from "react";

interface AudioControlMessage {
  type: "voice_start" | "voice_end" | "tts_start" | "tts_end" | "transcript" | "chat_response" | "error";
  text?: string;
  sessionId?: string;
}

interface UseWebSocketAudioOptions {
  serverUrl: string;
  onTranscript: (text: string) => void;
  onChatResponse: (text: string) => void;
  onTTSStart: () => void;
  onTTSEnd: () => void;
  onError: (error: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

interface UseWebSocketAudioReturn {
  isConnected: boolean;
  isRecording: boolean;
  isPlayingTTS: boolean;
  connect: () => void;
  disconnect: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useWebSocketAudio({
  serverUrl,
  onTranscript,
  onChatResponse,
  onTTSStart,
  onTTSEnd,
  onError,
  onConnectionChange,
}: UseWebSocketAudioOptions): UseWebSocketAudioReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // Refs for callbacks to avoid stale closures
  const onTranscriptRef = useRef(onTranscript);
  const onChatResponseRef = useRef(onChatResponse);
  const onTTSStartRef = useRef(onTTSStart);
  const onTTSEndRef = useRef(onTTSEnd);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onChatResponseRef.current = onChatResponse;
    onTTSStartRef.current = onTTSStart;
    onTTSEndRef.current = onTTSEnd;
    onErrorRef.current = onError;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onTranscript, onChatResponse, onTTSStart, onTTSEnd, onError, onConnectionChange]);

  // Play audio from queue
  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift();
      if (!audioData) continue;

      try {
        // Create AudioContext if needed
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
          audioContextRef.current = new AudioContext();
        }

        // Decode and play audio
        const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.slice(0));
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);

        // Wait for this chunk to finish playing
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start(0);
        });
      } catch (err) {
        console.error("[WS Audio] Error playing audio chunk:", err);
      }
    }

    isPlayingRef.current = false;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = serverUrl.replace(/^http/, "ws") + "/ws/audio";
    console.log("[WS Audio] Connecting to:", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("[WS Audio] Connected");
      setIsConnected(true);
      onConnectionChangeRef.current?.(true);
    };

    ws.onmessage = (event) => {
      // Binary data = TTS audio chunk
      if (event.data instanceof ArrayBuffer) {
        audioQueueRef.current.push(event.data);
        playAudioQueue();
        return;
      }

      // JSON control message
      try {
        const message: AudioControlMessage = JSON.parse(event.data);

        switch (message.type) {
          case "transcript":
            if (message.text) onTranscriptRef.current(message.text);
            break;

          case "chat_response":
            if (message.text) onChatResponseRef.current(message.text);
            break;

          case "tts_start":
            setIsPlayingTTS(true);
            onTTSStartRef.current();
            break;

          case "tts_end":
            setIsPlayingTTS(false);
            onTTSEndRef.current();
            break;

          case "error":
            if (message.text) onErrorRef.current(message.text);
            break;
        }
      } catch (err) {
        console.error("[WS Audio] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS Audio] Disconnected");
      setIsConnected(false);
      onConnectionChangeRef.current?.(false);
    };

    ws.onerror = (err) => {
      console.error("[WS Audio] WebSocket error:", err);
      onErrorRef.current("WebSocket connection error");
    };
  }, [serverUrl, playAudioQueue]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
  }, []);

  // Start recording and streaming
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      onErrorRef.current("WebSocket not connected");
      return;
    }

    try {
      // Get mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;

      // Send voice_start message
      wsRef.current.send(JSON.stringify({ type: "voice_start" }));

      // Stream audio chunks to server
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const arrayBuffer = await event.data.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        }
      };

      mediaRecorder.onstop = () => {
        // Send voice_end message
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "voice_end" }));
        }

        // Stop mic
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
      };

      // Start recording with timeslice for streaming chunks
      mediaRecorder.start(250); // Send chunk every 250ms
      setIsRecording(true);

    } catch (err) {
      console.error("[WS Audio] Failed to start recording:", err);
      onErrorRef.current(err instanceof Error ? err.message : "Failed to access microphone");
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, [disconnect]);

  return {
    isConnected,
    isRecording,
    isPlayingTTS,
    connect,
    disconnect,
    startRecording,
    stopRecording,
  };
}
