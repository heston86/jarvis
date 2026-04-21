import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// Use process.cwd() for reliable path resolution
const PROJECT_ROOT = process.cwd();
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");
const WHISPER_MODEL = path.join(PROJECT_ROOT, "assets/models/ggml-base.en.bin");

console.log("STT Service initialized:");
console.log("  TMP_DIR:", TMP_DIR);
console.log("  WHISPER_MODEL:", WHISPER_MODEL);

// Convert webm/any audio to 16kHz mono WAV for Whisper
async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",  // Overwrite output
      "-i", inputPath,
      "-ar", "16000",  // 16kHz sample rate (Whisper requirement)
      "-ac", "1",  // Mono
      "-f", "wav",
      outputPath,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("ffmpeg failed with code " + code));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error("ffmpeg error: " + err.message));
    });
  });
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const id = randomUUID();
  const inputPath = path.join(TMP_DIR, "input-" + id + ".webm");
  const wavPath = path.join(TMP_DIR, "input-" + id + ".wav");

  try {
    // Write the audio buffer to a temp file
    await writeFile(inputPath, audioBuffer);

    // Convert to WAV format for Whisper
    await convertToWav(inputPath, wavPath);

    // Run whisper-cli on the WAV file
    return new Promise((resolve, reject) => {
      let output = "";
      let stderr = "";

      const whisper = spawn("whisper-cli", [
        "-m", WHISPER_MODEL,
        "-nt",  // no timestamps
        "-l", "en",
        "-np",  // no extra prints
        wavPath,
      ]);

      whisper.stdout.on("data", (data) => {
        output += data.toString();
      });

      whisper.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      whisper.on("close", async (code) => {
        // Clean up temp files
        try {
          await unlink(inputPath);
          await unlink(wavPath);
        } catch (e) {
          // Ignore cleanup errors
        }

        if (code === 0) {
          // Parse the output to get just the text
          const text = output
            .split("\n")
            .filter(line => line.trim() && !line.startsWith("["))
            .join(" ")
            .trim();
          console.log("STT: Transcribed:", text);
          resolve(text);
        } else {
          console.error("Whisper error:", stderr);
          reject(new Error("Whisper failed with code " + code + ": " + stderr));
        }
      });

      whisper.on("error", (err) => {
        reject(new Error("Failed to spawn whisper: " + err.message));
      });
    });
  } catch (error) {
    // Clean up on error
    try {
      await unlink(inputPath);
      await unlink(wavPath);
    } catch (e) {
      // Ignore
    }
    throw error;
  }
}
