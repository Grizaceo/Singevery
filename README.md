# Espejo Teleprompter

Monorepo for the Smart Mirror Teleprompter project.

## Structure

- **apps/**
  - **device_daemon/**: Python core service (Orchestrator, Audio, Sync).
  - **ui_kiosk/**: React + Vite frontend (Display).
- **libs/**: Shared Python libraries for Audio, Recognition, Lyrics, Sync, etc.
- **infra/**: Infrastructure configurations (Systemd, Docker).
- **tools/**: Development tools and simulators.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- System libraries for audio (PortAudio, etc.)

### Backend (Core)
```bash
cd apps/device_daemon
pip install -r requirements.txt
python main.py
```

### Frontend (UI)
```bash
cd apps/ui_kiosk
npm install
npm run dev
```
