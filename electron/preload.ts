import { contextBridge, ipcRenderer } from "electron";

// Test microphone access immediately
(async () => {
  try {
    console.log("Preload: Testing microphone access...");
    console.log("navigator.mediaDevices:", !!navigator.mediaDevices);
    if (navigator.mediaDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      console.log("Audio input devices:", audioInputs.length);
      audioInputs.forEach(d => console.log(" -", d.label || d.deviceId));
    }
  } catch (e) {
    console.error("Preload: Mic access test failed:", e);
  }
})();

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("jarvis", {
  // Get the backend server URL
  getServerUrl: (): Promise<string> => ipcRenderer.invoke("get-server-url"),

  // Get path to assets folder
  getAssetsPath: (): Promise<string> => ipcRenderer.invoke("get-assets-path"),

  // Voice events
  onWakeWord: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("wake-word-detected", handler);
    return () => ipcRenderer.removeListener("wake-word-detected", handler);
  },

  onVoiceStateChange: (callback: (state: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: string) =>
      callback(state);
    ipcRenderer.on("voice-state-change", handler);
    return () => ipcRenderer.removeListener("voice-state-change", handler);
  },

  // Trigger voice actions
  startListening: () => ipcRenderer.send("start-listening"),
  stopListening: () => ipcRenderer.send("stop-listening"),

  // Platform info
  platform: process.platform,
});

// Type declaration for the exposed API
declare global {
  interface Window {
    jarvis: {
      getServerUrl: () => Promise<string>;
      getAssetsPath: () => Promise<string>;
      onWakeWord: (callback: () => void) => () => void;
      onVoiceStateChange: (callback: (state: string) => void) => () => void;
      startListening: () => void;
      stopListening: () => void;
      platform: NodeJS.Platform;
    };
  }
}
