# Audio Metadata Viewer

A lightweight desktop app to inspect the metadata, bit depth, sample rate, bitrate, and overall quality of any audio file — powered by **ffprobe**, with a dark macOS-style interface and **JetBrains Mono** font.

Works on **macOS, Windows, and Linux**. `ffprobe` is bundled automatically (via `ffprobe-static`), so there's nothing extra to install — just download and run.

![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- Drag & drop a file, or pick one from a file dialog
- LED-style "VU meter" panel showing sample rate, bit depth, and bitrate at a glance
- Full breakdown of the container format, audio stream, embedded cover art / video stream, and ID3/Vorbis/etc. tags
- Raw ffprobe JSON available in a collapsible panel for power users
- Custom macOS-style titlebar (traffic lights) that looks the same on every platform

## Download

Grab the latest build for your operating system from the [Releases](../../releases) page:

- **macOS** — `.dmg` or `.zip`
- **Windows** — `.exe` installer or portable version
- **Linux** — `.AppImage` or `.deb`

> On first launch, macOS/Windows may show a warning because the app isn't code-signed by an Apple/Microsoft developer certificate. This is expected for open-source, community-built apps — right-click → Open on macOS, or click "More info" → "Run anyway" on Windows.

## Usage

1. Open the app.
2. Drag an audio file onto the window, or click **Choose a file…**.
3. Instantly see the format, sample rate, bit depth, bitrate, channel layout, embedded tags, and cover art (if present).
4. Click **Analyze another file** to start over.

Supported formats include MP3, WAV, FLAC, AAC, ALAC, AIFF, OGG, OPUS, DSD, and more — anything `ffprobe` can read.

## Development

### Requirements

- [Node.js](https://nodejs.org) 18 or later
- npm

### Run locally

```bash
npm install
npm start
```

> **macOS note:** if `npm start` gets killed right after installing, macOS Gatekeeper likely quarantined the Electron binary. Run:
> ```bash
> xattr -cr node_modules/electron/dist/Electron.app
> ```

### Build for distribution

This project uses [electron-builder](https://www.electron.build/). Each platform must be built from its own OS (an Electron/electron-builder limitation), or via the included GitHub Action.

```bash
npm run dist:mac     # run on macOS   -> .dmg / .zip
npm run dist:win     # run on Windows -> .exe installer + portable version
npm run dist:linux   # run on Linux   -> .AppImage / .deb
```

Output files are written to the `dist/` folder.

### Automated multi-platform builds on GitHub

The repo includes `.github/workflows/build.yml`. Pushing a `v*` tag (e.g. `git tag v1.0.0 && git push --tags`) or manually triggering the workflow from the Actions tab builds the app on macOS, Windows, and Linux runners and uploads the installers as build artifacts — no need to own all three operating systems yourself.

## Project structure

```
audio-metadata-viewer/
├── main.js                    # Electron main process, invokes ffprobe
├── preload.js                 # secure bridge between main and renderer
├── src/
│   ├── index.html
│   ├── styles.css             # dark macOS theme + JetBrains Mono
│   └── renderer.js            # parses ffprobe output and renders the UI
├── .github/workflows/build.yml
└── package.json
```

## Technical notes

- Bit depth is read from `bits_per_raw_sample` / `bits_per_sample` when available, otherwise inferred from `sample_fmt` (e.g. `s16` → 16-bit, `s32`/`flt` → 32-bit).
- A file is tagged **LOSSLESS** if its codec is FLAC, ALAC, WavPack, APE, TAK, TrueHD/MLP, PCM, or DSD.
- `ffprobe-static` is excluded from the `asar` archive (`asarUnpack`) because native binaries need to remain directly executable on disk once the app is packaged.

## Contributing

Issues and pull requests are welcome. If you find a bug or have a feature idea, feel free to open an issue.

## License

Distributed under the [MIT License](LICENSE). Copyright © 2026 [BartolomeoRusso9](https://github.com/BartolomeoRusso9).
