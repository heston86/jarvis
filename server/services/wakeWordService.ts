import { EventEmitter } from "events";

// Wake word detection service
// Uses Picovoice Porcupine for "Hey Jarvis" / "Hi Jarvis" detection

export interface WakeWordConfig {
  accessKey: string;
  keywordPaths?: string[]; // Custom .ppn files for "Jarvis"
  sensitivity?: number;
}

export class WakeWordService extends EventEmitter {
  private isListening = false;
  private accessKey: string;
  private sensitivity: number;

  constructor(config: WakeWordConfig) {
    super();
    this.accessKey = config.accessKey;
    this.sensitivity = config.sensitivity ?? 0.5;
  }

  async start(): Promise<void> {
    if (this.isListening) return;

    // Note: Full Porcupine integration requires:
    // 1. A Picovoice account and access key
    // 2. A trained custom keyword file (.ppn) for "Jarvis"
    // 3. The @picovoice/porcupine-node package

    // For now, we'll set up the structure
    // Real implementation would look like:

    /*
    const Porcupine = require("@picovoice/porcupine-node");
    const { PvRecorder } = require("@picovoice/pvrecorder-node");

    const porcupine = new Porcupine(
      this.accessKey,
      ["path/to/jarvis_mac.ppn"],
      [this.sensitivity]
    );

    const recorder = new PvRecorder(porcupine.frameLength);
    recorder.start();

    while (this.isListening) {
      const pcm = await recorder.read();
      const keywordIndex = porcupine.process(pcm);

      if (keywordIndex >= 0) {
        this.emit("wake");
      }
    }

    recorder.release();
    porcupine.release();
    */

    this.isListening = true;
    console.log("Wake word detection started (mock mode)");

    // For development/demo: emit a fake wake event on keypress
    // This would be replaced with real Porcupine integration
  }

  stop(): void {
    this.isListening = false;
    console.log("Wake word detection stopped");
  }

  // Simulate wake word detection for testing
  simulateWake(): void {
    this.emit("wake");
  }
}

// Factory function
export function createWakeWordService(): WakeWordService {
  const accessKey = process.env.PICOVOICE_ACCESS_KEY || "";

  if (!accessKey) {
    console.warn(
      "No Picovoice access key. Wake word detection will be in mock mode."
    );
  }

  return new WakeWordService({ accessKey });
}
