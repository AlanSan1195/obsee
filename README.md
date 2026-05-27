# OBSREC

OBSREC is a desktop assistant for OBS that analyzes your computer, recommends streaming and recording settings, and helps compare those recommendations against your current OBS configuration.

The goal is not to replace OBS. The goal is to make OBS easier to understand.

## Why This Exists

OBS already includes an automatic configuration wizard. That wizard is useful, but it behaves mostly like a black box: it runs a test, chooses settings, and applies them.

OBSREC is evolving in a different direction:

- explain why a configuration makes sense
- show what will change before applying it
- compare current OBS settings against recommended settings
- let the user edit recommendations manually
- provide local fallback recommendations if AI is unavailable
- eventually help diagnose full OBS setups, not only bitrate and FPS

In short: OBSREC is meant to become an OBS coach and diagnostics layer, not just another auto-configurator.

## Current Features

- Electron desktop app.
- React + Vite renderer.
- OBS WebSocket connection with configurable host, port, and password.
- Local system analysis using CPU, GPU, RAM, and OS information.
- AI-powered OBS recommendation flow through Groq.
- Local fallback recommendation when the AI service fails.
- Editable recommendation fields:
  - resolution
  - FPS
  - encoder
  - video bitrate
  - audio bitrate
  - recording format
  - recording quality
- OBS import flow through WebSocket.
- Current OBS vs recommended settings comparison.
- IPC validation between renderer and Electron main process.
- ESLint and TypeScript checks.

## How It Differs From OBS Native Auto-Configuration

OBS native auto-configuration is better today at:

- running real bandwidth tests
- applying internal OBS settings safely
- using OBS-native knowledge directly
- producing a quick setup with minimal user decisions

OBSREC is focused on:

- transparency
- explanation
- editing before applying
- diagnostics
- platform-aware recommendations
- profile-oriented workflows

The long-term idea is that OBSREC should help answer questions like:

- Why is my bitrate too high or too low?
- Should my canvas be 4K if my output is 1080p?
- Should I record in MKV or MP4?
- Is my encoder choice good for my hardware?
- What will change if I apply this preset?
- Is my current OBS profile aligned with Twitch, YouTube, recording, or both?

## Tech Stack

- Electron
- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand
- OBS WebSocket
- Groq SDK
- systeminformation

## Requirements

- Node.js
- pnpm
- OBS Studio
- OBS WebSocket enabled
- Groq API key for AI recommendations

OBS WebSocket is built into modern OBS versions. In OBS, open:

`Tools > WebSocket Server Settings`

Recommended local defaults:

- Host: `localhost`
- Port: `4455`
- Password: the password shown in OBS WebSocket settings

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

```bash
GROQ_API_KEY=
OBS_WEBSOCKET_HOST=localhost
OBS_WEBSOCKET_PORT=4455
OBS_WEBSOCKET_PASSWORD=
```

OBS connection values can also be entered directly in the app.

## Development

Install dependencies:

```bash
pnpm install
```

Run the app:

```bash
pnpm run dev
```

Build main process:

```bash
pnpm run build:main
```

Build renderer:

```bash
pnpm run build:renderer
```

Run checks:

```bash
pnpm run lint
pnpm run typecheck
```

Create production build:

```bash
pnpm run build
```

## Project Structure

```text
src/
  main/        Electron main process, IPC handlers, OBS integration
  renderer/    React UI
  shared/      Shared types, validators, and recommendation logic
```

## Current Status

OBSREC is still early. The core direction is in place, but the app should be treated as an experimental assistant while OBS integration is expanded and tested across more OBS versions and profiles.

Completed foundations:

- app shell
- OBS connection
- AI recommendation flow
- local fallback recommendation
- editable recommendation UI
- OBS settings comparison
- validation and basic tooling

Important next steps:

- improve mapping of OBS profile parameters
- add safer preset backup/restore
- show richer diagnostic explanations
- save connection preferences locally
- support multiple OBS profiles/presets
- test against more hardware and OBS configurations

## Safety Notes

OBSREC changes OBS settings through WebSocket. Before relying on it for production streaming or recording, verify the generated settings in OBS.

Prefer recording in MKV when possible to reduce the risk of losing a recording if OBS or the system crashes.

## Repository

GitHub:

https://github.com/AlanSan1195/OBSREC

