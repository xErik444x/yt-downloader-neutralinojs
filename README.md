# YT Downloader
<img width="515" height="637" alt="screenshot" src="https://github.com/user-attachments/assets/a8b77045-e331-4241-ab4e-154af4598aa9" />

A lightweight, portable desktop application for downloading YouTube videos and audio. Built with Neutralinojs and vanilla web technologies. No frameworks, no bloat, no installation required.

The application runs as a native desktop window with a custom frameless UI. It auto-downloads its backend dependencies (yt-dlp and ffmpeg) on first run, so the binary itself is the only file you need to distribute.

## Features

- **Video and audio downloads** from YouTube and any site supported by yt-dlp.
- **Playlist support** - download entire playlists with sequential progress tracking.
- **Format selection** - choose video quality or extract audio as MP3.
- **Persistent download folder** - set once, reuse for every download.
- **Real-time progress** - live percentage and status updates during downloads.
- **Frameless window** - custom title bar with native window controls (minimize, maximize, close) and drag-to-move support.
- **Fully portable** - single executable, no system installation or registry changes.

## Download

Grab the latest release from the [Releases](../../releases) page.

No installation needed. Just run the executable.

On first launch, the app will download `yt-dlp` and `ffmpeg` into a local `.deps/` folder. This only happens once.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Neutralino CLI](https://neutralino.js.org/docs/cli/)

### Setup

```bash
# Clone the repository
git clone https://github.com/xErik444x/yt-downloader-neutralinojs.git
cd yt-downloader-neutralinojs

# Install the Neutralino CLI globally
npm install -g @neutralinojs/neu

# Run in development mode
neu run
```

### Build

```bash
# Build binaries for all platforms
neu build

# Output will be in dist/
```

## Usage

1. Paste a YouTube URL (single video or playlist) into the input field.
2. Click **Obtener** to fetch video information.
3. Select the desired format and quality from the dropdown.
4. Toggle **Solo audio (MP3)** if you only need the audio track.
5. Set your download folder using the **Cambiar** button.
6. Click **Descargar** to start. Progress appears in real time.

Your download folder preference is saved automatically between sessions.

## Architecture

```
yt-downloader-neutralinojs/
├── bin/                        # Neutralino binaries (gitignored)
├── dist/                       # Build output (gitignored)
├── resources/
│   ├── index.html              # Application UI
│   ├── styles.css              # Styling
│   └── js/
│       ├── main.js             # Application logic
│       └── neutralino.js       # Neutralino client library
├── .deps/                      # Auto-downloaded yt-dlp + ffmpeg (gitignored)
├── .storage/                   # App settings and state (gitignored)
├── neutralino.config.json      # Neutralino configuration
└── .gitignore
```

- **Frontend**: Vanilla HTML, CSS, and JavaScript. No frameworks or bundlers.
- **Backend**: yt-dlp handles all extraction and downloading. ffmpeg handles audio conversion.
- **Runtime**: Neutralinojs provides native APIs for file system access, process spawning, OS dialogs, and window management.

## Tech Stack


| Component  | Technology                                 |
| ---------- | ------------------------------------------ |
| Runtime    | [Neutralinojs](https://neutralino.js.org/) |
| Downloader | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Converter  | [ffmpeg](https://ffmpeg.org/)              |
| UI         | Vanilla HTML / CSS / JS                    |


## Supported Sites

Any site supported by yt-dlp works out of the box, including:

- YouTube (videos, playlists, Shorts)
- Vimeo
- Dailymotion
- Twitch
- SoundCloud
- Bandcamp

See the full list: [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## License

MIT
