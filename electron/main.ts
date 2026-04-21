import { app, BrowserWindow, ipcMain, session } from "electron";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import * as dotenv from "dotenv";
import * as net from "net";

// Load .env from the right location (packaged vs development)
const isDev = !app.isPackaged;
const envPath = isDev
  ? path.join(__dirname, "../../.env")
  : path.join(process.resourcesPath, ".env");
dotenv.config({ path: envPath });

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const SERVER_PORT = process.env.PORT || 3001;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow speech recognition to work
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Load from localhost to enable Web Speech API
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  // Open DevTools in development
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Check if a port is already in use
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

async function startServer() {
  const port = Number(SERVER_PORT);

  // Check if server is already running
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    console.log(`Server already running on port ${port}, skipping startup`);
    return;
  }

  const serverPath = isDev
    ? path.join(__dirname, "../server/index.js")
    : path.join(app.getAppPath(), "dist/server/index.js");

  console.log("Starting server from:", serverPath);
  console.log("Env path:", envPath);

  serverProcess = spawn("node", [serverPath], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      DOTENV_CONFIG_PATH: envPath,
    },
    stdio: "inherit",
    cwd: isDev ? path.join(__dirname, "..") : app.getAppPath(),
  });

  serverProcess.on("error", (err) => {
    console.error("Failed to start server:", err);
  });

  serverProcess.on("exit", (code) => {
    console.log(`Server exited with code ${code}`);
  });
}

// IPC Handlers
ipcMain.handle("get-server-url", () => {
  return `http://localhost:${SERVER_PORT}`;
});

ipcMain.handle("get-assets-path", () => {
  return path.join(app.getAppPath(), "assets");
});

// Enable Web Speech API and allow network access
app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,WebSpeechRecognition');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-running-insecure-content');
// Try to allow unsafe origins
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://localhost:3001');

// App lifecycle
app.whenReady().then(async () => {
  // Grant all permissions for media/microphone
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'midi', 'midiSysex'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Also grant permission check requests
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return true; // Allow all permission checks
  });

  await startServer();

  // Give server time to start (if we started it)
  setTimeout(createWindow, 500);
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
