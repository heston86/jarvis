/**
 * WebSocket Audio Handler
 *
 * Bidirectional audio streaming for voice interaction:
 * - Mic audio chunks streamed from client → server
 * - TTS audio chunks streamed from server → client
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { transcribeAudio } from "../services/sttService";
import { synthesizeSpeech } from "../services/ttsService";
import { getJarvis } from "../services/jarvisService";
import { readFile } from "fs/promises";

// Message types for WebSocket communication
interface AudioControlMessage {
  type: "voice_start" | "voice_end" | "tts_start" | "tts_end" | "transcript" | "error" | "chat_response";
  text?: string;
  sessionId?: string;
}

interface ClientSession {
  ws: WebSocket;
  audioChunks: Buffer[];
  sessionId?: string;
  isRecording: boolean;
}

const sessions = new Map<WebSocket, ClientSession>();

// Process accumulated audio and get response
async function processAudio(session: ClientSession): Promise<void> {
  const { ws, audioChunks } = session;

  if (audioChunks.length === 0) {
    sendMessage(ws, { type: "error", text: "No audio received" });
    return;
  }

  try {
    // Combine audio chunks
    const audioBuffer = Buffer.concat(audioChunks);
    console.log(`[WS Audio] Processing ${audioBuffer.length} bytes of audio`);

    // Transcribe
    const transcript = await transcribeAudio(audioBuffer);
    console.log(`[WS Audio] Transcript: "${transcript}"`);

    // Send transcript to client
    sendMessage(ws, { type: "transcript", text: transcript });

    if (!transcript.trim()) {
      return;
    }

    // Get chat response
    const jarvis = getJarvis();
    const { reply, sessionId } = await jarvis.chat(transcript, session.sessionId);
    session.sessionId = sessionId;

    // Send chat response text
    sendMessage(ws, { type: "chat_response", text: reply, sessionId });

    // Stream TTS back to client
    await streamTTS(ws, reply);

  } catch (error) {
    console.error("[WS Audio] Processing error:", error);
    sendMessage(ws, {
      type: "error",
      text: error instanceof Error ? error.message : "Audio processing failed"
    });
  }
}

// Stream TTS audio to client
async function streamTTS(ws: WebSocket, text: string): Promise<void> {
  try {
    sendMessage(ws, { type: "tts_start" });

    // Split text into sentences for faster streaming
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      // Synthesize sentence
      const audioPath = await synthesizeSpeech(trimmed);
      const audioBuffer = await readFile(audioPath);

      // Send as binary
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(audioBuffer);
      }
    }

    sendMessage(ws, { type: "tts_end" });

  } catch (error) {
    console.error("[WS Audio] TTS streaming error:", error);
    sendMessage(ws, { type: "tts_end" });
    sendMessage(ws, {
      type: "error",
      text: error instanceof Error ? error.message : "TTS failed"
    });
  }
}

// Send JSON message to client
function sendMessage(ws: WebSocket, message: AudioControlMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Setup WebSocket server
export function setupAudioWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: "/ws/audio"
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WS Audio] Client connected");

    // Initialize session
    const session: ClientSession = {
      ws,
      audioChunks: [],
      isRecording: false,
    };
    sessions.set(ws, session);

    ws.on("message", async (data: Buffer | string) => {
      const session = sessions.get(ws);
      if (!session) return;

      // Handle binary audio data
      if (Buffer.isBuffer(data)) {
        if (session.isRecording) {
          session.audioChunks.push(data);
        }
        return;
      }

      // Handle JSON control messages
      try {
        const message: AudioControlMessage = JSON.parse(data.toString());

        switch (message.type) {
          case "voice_start":
            session.isRecording = true;
            session.audioChunks = [];
            console.log("[WS Audio] Recording started");
            break;

          case "voice_end":
            session.isRecording = false;
            console.log("[WS Audio] Recording ended, processing...");
            await processAudio(session);
            session.audioChunks = [];
            break;

          default:
            console.log("[WS Audio] Unknown message type:", message.type);
        }
      } catch (err) {
        console.error("[WS Audio] Failed to parse message:", err);
      }
    });

    ws.on("close", () => {
      console.log("[WS Audio] Client disconnected");
      sessions.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("[WS Audio] WebSocket error:", err);
      sessions.delete(ws);
    });
  });

  console.log("[WS Audio] WebSocket server ready on /ws/audio");
  return wss;
}
