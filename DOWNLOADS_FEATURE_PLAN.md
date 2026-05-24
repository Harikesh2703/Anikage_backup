# Anikage — Offline Downloads Feature (Planned)

## Overview
The offline download feature is slated for a future update. This feature will allow users to download anime episodes directly to their local machine for offline viewing, without any DRM restrictions.

## Core Philosophy
Unlike commercial streaming platforms (Netflix, Crunchyroll) that encrypt downloaded content within the app, **Anikage will provide fully localized, DRM-free downloads**. 

Users will receive standard, high-quality video files (e.g., `.mp4` or `.mkv`) saved directly to their system's `Downloads` or `Videos` folders. These files can be:
- Played on any media player (VLC, mpv, Windows Media Player)
- Moved to mobile devices
- Kept forever

## Technical Architecture (Proposed)

### 1. Backend Service (Node.js/Electron)
- **HLS/m3u8 Resolution**: Since most anime streams are served as HLS playlists (`.m3u8`), the backend will resolve these chunked streams.
- **FFmpeg Integration**: The backend will utilize `ffmpeg` (or `fluent-ffmpeg` / `yt-dlp`) to sequentially download video chunks and stitch them into a continuous, local `.mp4` file.
- **Concurrent Downloads**: Support for a queue system to manage multiple episode downloads simultaneously.

### 2. Desktop Interface (React/Vite)
- **Download Action**: A prominent "Download" button adjacent to the "Watch Now" button on the anime details screen.
- **Quality Selection**: A prompt allowing users to select their preferred resolution (1080p, 720p, etc.) before the download begins.
- **Download Manager**: A dedicated "Downloads" tab in the sidebar where users can:
  - Monitor active download progress bars.
  - Pause, resume, or cancel active downloads.
  - Open the destination folder directly from the app.
  - Play completed downloads using the internal player or a local default player.

## Next Steps for Implementation
1. Add `ffmpeg-static` or `fluent-ffmpeg` to the project dependencies.
2. Build an IPC handler in `electron-main.mjs` to accept a stream URL and destination path, and stream the progress back to the frontend.
3. Design and integrate the "Downloads" UI components in the React frontend.
