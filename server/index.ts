import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { config } from "dotenv";
import { setupAudioWebSocket } from "./websocket/audioHandler";

// Load environment variables from the correct path
// Try multiple locations for .env
const possibleEnvPaths = [
  process.env.DOTENV_CONFIG_PATH,
  path.join(__dirname, "../.env"),      // When running tsx from server/
  path.join(__dirname, "../../.env"),   // When running from dist/server/
  path.join(process.cwd(), ".env"),     // Current working directory
].filter(Boolean) as string[];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  const result = config({ path: envPath });
  if (!result.error && process.env.ANTHROPIC_API_KEY) {
    console.log("Loaded .env from:", envPath);
    envLoaded = true;
    break;
  }
}
if (!envLoaded) {
  console.warn("Warning: Could not load .env file with ANTHROPIC_API_KEY");
}

// Import routes
import briefRouter from "./routes/brief";
import weatherRouter from "./routes/weather";
import speakRouter from "./routes/speak";
import chatRouter from "./routes/chat";
import oauthRouter from "./routes/oauth";
import transcribeRouter from "./routes/transcribe";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
// Use process.cwd() for reliable path resolution during development
const PROJECT_ROOT = process.cwd();
app.use("/audio", express.static(path.join(PROJECT_ROOT, "tmp")));
app.use("/assets", express.static(path.join(PROJECT_ROOT, "assets")));
app.use("/models", express.static(path.join(PROJECT_ROOT, "models")));

// Serve the frontend (for Electron loading from localhost)
app.use(express.static(path.join(__dirname, "..")));  // serves dist/ directory

// Routes
app.use("/api/brief", briefRouter);
app.use("/api/weather", weatherRouter);
app.use("/api/speak", speakRouter);
app.use("/api/chat", chatRouter);
app.use("/api/transcribe", express.raw({ type: "audio/*", limit: "10mb" }), transcribeRouter);
app.use("/oauth", oauthRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
);

// Create HTTP server and attach WebSocket
const server = http.createServer(app);

// Setup WebSocket for audio streaming
setupAudioWebSocket(server);

server.listen(PORT, () => {
  console.log(`Jarvis server running on port ${PORT}`);
});

export default app;
export { server };
