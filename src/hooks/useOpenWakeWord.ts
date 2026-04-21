import { useCallback, useRef, useState, useEffect } from "react";

// Import openwakeword-js dynamically to handle ONNX runtime
let Model: any = null;

interface UseOpenWakeWordOptions {
  onWakeWord: () => void;
  modelPath?: string;
  threshold?: number;
  enabled?: boolean;
}

interface UseOpenWakeWordReturn {
  isReady: boolean;
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: Error | null;
}

export function useOpenWakeWord({
  onWakeWord,
  modelPath = "/models/hey_jarvis.onnx",
  threshold = 0.5,
  enabled = true,
}: UseOpenWakeWordOptions): UseOpenWakeWordReturn {
  const [isReady, setIsReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const modelRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isActiveRef = useRef(false);
  const onWakeWordRef = useRef(onWakeWord);
  const lastDetectionRef = useRef<number>(0);

  // Keep callback ref updated
  useEffect(() => {
    onWakeWordRef.current = onWakeWord;
  }, [onWakeWord]);

  // Initialize the model
  useEffect(() => {
    if (!enabled) return;

    async function initModel() {
      try {
        // Dynamic import of openwakeword-js
        const oww = await import("openwakeword-js");
        Model = oww.Model;

        const model = new Model({
          wakewordModels: [modelPath],
          melspectrogramModelPath: "/models/melspectrogram.onnx",
          embeddingModelPath: "/models/embedding_model.onnx",
          vadModelPath: "/models/silero_vad.onnx",
          vadThreshold: 0.3,
          inferenceFramework: "onnx",
          wasmPaths: "/models/",
        });

        await model.init();
        modelRef.current = model;
        setIsReady(true);
        console.log("OpenWakeWord model initialized");
      } catch (err) {
        console.error("Failed to initialize OpenWakeWord:", err);
        setError(err as Error);
      }
    }

    initModel();

    return () => {
      modelRef.current = null;
    };
  }, [enabled, modelPath]);

  // Process audio samples
  const processAudio = useCallback(async (audioData: Float32Array) => {
    if (!modelRef.current || !isActiveRef.current) return;

    try {
      const scores = await modelRef.current.predict(audioData);
      const modelName = modelPath.split("/").pop()?.replace(".onnx", "") || "hey_jarvis";
      const score = scores[modelName] || 0;

      // Debounce: only trigger once per 2 seconds
      const now = Date.now();
      if (score > threshold && now - lastDetectionRef.current > 2000) {
        lastDetectionRef.current = now;
        console.log(`Wake word detected! Score: ${score.toFixed(3)}`);
        onWakeWordRef.current();
      }
    } catch (err) {
      console.error("Error processing audio:", err);
    }
  }, [modelPath, threshold]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!modelRef.current || isActiveRef.current) {
      console.log("OpenWakeWord: Cannot start - model not ready or already listening");
      return;
    }

    try {
      isActiveRef.current = true;
      setIsListening(true);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Create audio context at 16kHz
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);

      // Use ScriptProcessorNode for audio processing (deprecated but widely supported)
      // Buffer size of 1280 samples = 80ms at 16kHz (required by OpenWakeWord)
      const processor = audioContextRef.current.createScriptProcessor(1280, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!isActiveRef.current) return;
        const inputData = event.inputBuffer.getChannelData(0);
        // Clone the data to avoid issues with buffer reuse
        const audioData = new Float32Array(inputData);
        processAudio(audioData);
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      console.log("OpenWakeWord listening started");
    } catch (err) {
      console.error("Failed to start OpenWakeWord listening:", err);
      setError(err as Error);
      isActiveRef.current = false;
      setIsListening(false);
    }
  }, [processAudio]);

  // Stop listening
  const stopListening = useCallback(() => {
    isActiveRef.current = false;

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    console.log("OpenWakeWord listening stopped");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isReady,
    isListening,
    startListening,
    stopListening,
    error,
  };
}
