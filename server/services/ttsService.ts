import { spawn } from "child_process";
import { mkdir, access, constants, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// Paths relative to dist/server/services when compiled
const TMP_DIR = path.join(__dirname, "../../../tmp");
const VOICE_MODEL = path.join(
  __dirname,
  "../../../assets/voices/en_GB-jarvis-medium.onnx"
);

async function ensureTmpDir() {
  try {
    await access(TMP_DIR, constants.W_OK);
  } catch {
    await mkdir(TMP_DIR, { recursive: true });
  }
}

// Fish Audio TTS - High quality Jarvis voice (using direct API)
async function synthesizeWithFishAudio(text: string): Promise<string> {
  await ensureTmpDir();

  const apiKey = process.env.FISH_AUDIO_API_KEY || process.env.FISHAUDIO_API_KEY;
  const modelId = process.env.FISH_AUDIO_MODEL_ID || "612b878b113047d9a770c069c8b4fdfe";

  if (!apiKey) {
    throw new Error("FISH_AUDIO_API_KEY not set");
  }

  const filename = `speech-${randomUUID()}.mp3`;
  const outputPath = path.join(TMP_DIR, filename);

  // Use Fish Audio API directly to avoid ESM/CommonJS issues with SDK
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      reference_id: modelId,
      format: "mp3",
      mp3_bitrate: 128,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fish Audio API error: ${response.status} - ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, audioBuffer);

  console.log("TTS: Generated audio with Fish Audio (Jarvis voice)");
  return outputPath;
}

// Convert AIFF to WAV using afconvert (macOS)
async function convertToWav(aiffPath: string, wavPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const convert = spawn("afconvert", [
      "-f", "WAVE",
      "-d", "LEI16",
      aiffPath,
      wavPath
    ]);

    convert.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`afconvert failed with code ${code}`));
      }
    });

    convert.on("error", (err) => {
      reject(new Error(`Failed to run afconvert: ${err.message}`));
    });
  });
}

// Use macOS say command as fallback
async function synthesizeWithSay(text: string): Promise<string> {
  await ensureTmpDir();

  const id = randomUUID();
  const aiffPath = path.join(TMP_DIR, `speech-${id}.aiff`);
  const wavPath = path.join(TMP_DIR, `speech-${id}.wav`);

  return new Promise((resolve, reject) => {
    // Use Daniel voice (British) for Jarvis-like sound
    const say = spawn("say", [
      "-v", "Daniel",
      "-r", "175",
      "-o", aiffPath,
      text
    ]);

    say.on("close", async (code) => {
      if (code === 0) {
        try {
          await convertToWav(aiffPath, wavPath);
          console.log("TTS: Generated audio with macOS say (fallback)");
          resolve(wavPath);
        } catch (err) {
          console.warn("WAV conversion failed, using AIFF:", err);
          resolve(aiffPath);
        }
      } else {
        reject(new Error(`say command failed with code ${code}`));
      }
    });

    say.on("error", (err) => {
      reject(new Error(`Failed to run say: ${err.message}`));
    });
  });
}

async function piperExists(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn("which", ["piper"]);
    check.on("close", (code) => resolve(code === 0));
  });
}

async function voiceModelExists(): Promise<boolean> {
  try {
    await access(VOICE_MODEL, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// Use Piper with local Jarvis voice model
async function synthesizeWithPiper(text: string): Promise<string> {
  await ensureTmpDir();

  const filename = `speech-${randomUUID()}.wav`;
  const outputPath = path.join(TMP_DIR, filename);

  return new Promise((resolve, reject) => {
    const piper = spawn("piper", [
      "--model", VOICE_MODEL,
      "--output_file", outputPath,
    ]);

    let stderr = "";

    piper.stdin.write(text);
    piper.stdin.end();

    piper.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    piper.on("close", (code) => {
      if (code === 0) {
        console.log("TTS: Generated audio with Piper");
        resolve(outputPath);
      } else {
        reject(new Error(`Piper failed with code ${code}: ${stderr}`));
      }
    });

    piper.on("error", (err) => {
      reject(new Error(`Failed to spawn Piper: ${err.message}`));
    });
  });
}

export async function synthesizeSpeech(text: string): Promise<string> {
  // Priority 1: Fish Audio (best Jarvis voice)
  if (process.env.FISH_AUDIO_API_KEY || process.env.FISHAUDIO_API_KEY) {
    try {
      return await synthesizeWithFishAudio(text);
    } catch (error) {
      console.warn("Fish Audio failed, trying fallback:", error);
    }
  }

  // Priority 2: Local Piper with Jarvis model
  const [hasPiper, hasVoiceModel] = await Promise.all([
    piperExists(),
    voiceModelExists()
  ]);

  if (hasPiper && hasVoiceModel) {
    try {
      return await synthesizeWithPiper(text);
    } catch (error) {
      console.warn("Piper failed, falling back to macOS say:", error);
    }
  }

  // Priority 3: macOS say command
  console.log("TTS: Using macOS say (fallback)");
  return await synthesizeWithSay(text);
}
