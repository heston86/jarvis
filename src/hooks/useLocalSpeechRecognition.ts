import { useCallback, useRef, useState, useEffect } from "react";

interface UseLocalSpeechRecognitionOptions {
  serverUrl: string;
  onTranscript: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
  onError?: (error: Error) => void;
  silenceThreshold?: number;  // ms of silence before stopping (after speech detected)
  minRecordingTime?: number;  // minimum recording time before processing
  speechThreshold?: number;   // audio level threshold for speech detection
}

export function useLocalSpeechRecognition({
  serverUrl,
  onTranscript,
  onListeningChange,
  onError,
  silenceThreshold = 2000,
  minRecordingTime = 1000,
  speechThreshold = 15,
}: UseLocalSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const lastStartTimeRef = useRef<number>(0);  // Debounce tracking
  const pendingStartRef = useRef<NodeJS.Timeout | null>(null);  // Pending start timer

  // Cleanup function
  const cleanup = useCallback(() => {
    if (pendingStartRef.current) {
      clearTimeout(pendingStartRef.current);
      pendingStartRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore
      }
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioContextRef.current = null;
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  // Send audio to server for transcription
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    try {
      console.log("Sending audio for transcription, size:", audioBlob.size);
      const audioBuffer = await audioBlob.arrayBuffer();

      const response = await fetch(serverUrl + "/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
        },
        body: audioBuffer,
      });

      if (!response.ok) {
        throw new Error("Transcription failed: " + response.status);
      }

      const { text } = await response.json();
      console.log("Transcription result:", text);
      if (text && text.trim()) {
        onTranscript(text.trim());
      }
    } catch (err) {
      console.error("Transcription error:", err);
      onError?.(err as Error);
    }
  }, [serverUrl, onTranscript, onError]);

  // Stop listening and process audio
  const stopListening = useCallback(() => {
    if (!isActiveRef.current) return;

    isActiveRef.current = false;

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    onListeningChange?.(false);
    console.log("Local speech recognition stopped");
  }, [onListeningChange]);

  // Check for voice activity - only triggers stop AFTER speech has been detected
  const checkVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !isActiveRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const isSpeaking = average > speechThreshold;

    const now = Date.now();
    const recordingDuration = now - (recordingStartRef.current || now);

    if (isSpeaking) {
      // Speech detected
      if (!hasSpeechRef.current) {
        hasSpeechRef.current = true;
        console.log("Speech detected! Level:", average.toFixed(1));
      }
      silenceStartRef.current = null;
    } else {
      // Silence - only start counting AFTER we've detected speech
      if (hasSpeechRef.current && recordingDuration >= minRecordingTime) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        }

        const silenceDuration = now - silenceStartRef.current;
        if (silenceDuration >= silenceThreshold) {
          console.log("Silence after speech, stopping. Duration:", silenceDuration);
          stopListening();
          return;
        }
      }
    }

    rafIdRef.current = requestAnimationFrame(checkVoiceActivity);
  }, [silenceThreshold, minRecordingTime, speechThreshold, stopListening]);

  // Internal start function - does the actual work
  const doStartListening = useCallback(async () => {
    if (isActiveRef.current) {
      return;
    }

    try {
      cleanup();
      isActiveRef.current = true;
      hasSpeechRef.current = false;
      chunksRef.current = [];
      silenceStartRef.current = null;
      recordingStartRef.current = Date.now();
      lastStartTimeRef.current = Date.now();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Check if we were stopped while waiting for getUserMedia
      if (!isActiveRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;

      // Set up audio analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Set up recording
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        console.log("Recording stopped, blob size:", audioBlob.size);
        if (audioBlob.size > 1000) {
          transcribeAudio(audioBlob);
        } else {
          console.log("Audio too small, skipping transcription");
        }
        chunksRef.current = [];
      };

      mediaRecorderRef.current.start(100);
      setIsListening(true);
      onListeningChange?.(true);

      // Start voice activity detection
      checkVoiceActivity();

      console.log("Local speech recognition started, waiting for speech...");
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      isActiveRef.current = false;
      onError?.(err as Error);
    }
  }, [cleanup, transcribeAudio, checkVoiceActivity, onListeningChange, onError]);

  // Public start function - debounced to prevent rapid restarts
  const startListening = useCallback(() => {
    // Clear any pending start
    if (pendingStartRef.current) {
      clearTimeout(pendingStartRef.current);
      pendingStartRef.current = null;
    }

    // If already active, skip
    if (isActiveRef.current) {
      console.log("Already listening, skipping");
      return;
    }

    // Debounce: require at least 500ms between starts
    const timeSinceLastStart = Date.now() - lastStartTimeRef.current;
    if (timeSinceLastStart < 500) {
      const delay = 500 - timeSinceLastStart;
      console.log(`Debouncing start, waiting ${delay}ms`);
      pendingStartRef.current = setTimeout(() => {
        pendingStartRef.current = null;
        doStartListening();
      }, delay);
      return;
    }

    doStartListening();
  }, [doStartListening]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isListening,
    startListening,
    stopListening,
    hasSpeech: hasSpeechRef.current,
  };
}
