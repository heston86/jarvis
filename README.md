# Jarvis Personal AI Assistant

A conversational AI desktop assistant built with Electron, React, and Claude.

## Features

- **Wake phrase detection**: Say "Hey Jarvis" or "Hi Jarvis" to activate
- **Daily brief**: Weather and personalized greeting on startup
- **Jarvis voice**: Uses Piper TTS with a custom Jarvis voice model
- **Continuous conversation**: Natural back-and-forth without button pressing
- **Greeting song**: Plays your chosen audio on startup (first 30 seconds)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENWEATHER_API_KEY=...
PICOVOICE_ACCESS_KEY=...  # Optional, for advanced wake word
LOCATION_LAT=37.7621
LOCATION_LON=-121.9783
LOCATION_CITY=San Ramon
```

### 3. Download the Jarvis voice model

Get the voice model from HuggingFace:

```bash
# Download to assets/voices/
cd assets/voices
wget https://huggingface.co/jgkawell/jarvis/resolve/main/en/en_GB/jarvis/medium/en_GB-jarvis-medium.onnx
wget https://huggingface.co/jgkawell/jarvis/resolve/main/en/en_GB/jarvis/medium/en_GB-jarvis-medium.onnx.json
```

### 4. Install Piper TTS

```bash
# macOS (Apple Silicon)
wget https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz
tar -xzf piper_macos_aarch64.tar.gz
sudo mv piper /usr/local/bin/

# Or Intel Mac
wget https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz
```

### 5. Add your greeting song

Place an MP3 file in `assets/greeting.mp3`. The first 30 seconds will play on startup.

### 6. Run the app

```bash
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App (UI)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ GreetingCard│  │ WeatherCard │  │ ConversationPanel   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Backend Server (Express)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │BriefService│  │WeatherSvc  │  │     TTSService         │ │
│  │  (Claude)  │  │(OpenWeather)│  │     (Piper)            │ │
│  └────────────┘  └────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Voice States

The assistant uses a state machine for voice interaction:

- **idle**: Listening for wake phrase
- **listening**: Recording user speech
- **thinking**: Processing with Claude
- **speaking**: Playing TTS response
- **followup**: Brief window to continue conversation

## API Keys Required

1. **Anthropic API Key** - For Claude conversations
   - Get from: https://console.anthropic.com

2. **OpenWeather API Key** - For weather data
   - Get from: https://openweathermap.org/api

3. **Picovoice Access Key** (optional) - For advanced wake word
   - Get from: https://console.picovoice.ai

## Development

```bash
# Run all services
npm run dev

# Run just the server
npm run dev:server

# Build for production
npm run build
```

## Project Structure

```
jarvis/
├── electron/          # Electron main process
├── src/               # React UI
│   ├── components/    # UI components
│   └── hooks/         # Voice state hooks
├── server/            # Express backend
│   ├── routes/        # API endpoints
│   └── services/      # Core services
└── assets/            # Voice models, audio
```
