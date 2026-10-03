# Media Studio (media-utility-app)

Windows desktop toolbox for media, documents and text. It is a native window (pywebview / WebView2) with a React + Fluent UI interface; the processing runs in Python.

| Tool | What it does |
|---|---|
| Video downloader | YouTube / X / other sites via yt-dlp: format table, audio-only, batch queue |
| Image converter | Folder or file batch conversion (PNG, WEBP, JPEG, GIF, TIFF, BMP, PDF) |
| Watermark remover | Paint a mask, inpaint with OpenCV (Telea / Navier-Stokes) or the optional LaMa AI model |
| Text to speech | Edge neural voices (online) or Windows voices (offline), with an in-app player |
| PDF merger | Drag-to-reorder pages from several PDFs and merge them |
| Duplicate finder | Perceptual-hash search for similar images and videos; moves duplicates to the Recycle Bin, exports CSV |
| Progress generator | Designs progress-bar graphics and exports them as PNG |

Other features:
- light, dark and system themes;
- Polish and English interface;
- Windows 11 Mica backdrop;
- `Ctrl+K` command palette;
- background tasks panel.

## Requirements

- Windows 10/11 with the **WebView2 Runtime**. It is built into Windows 11; on Windows 10 install it from Microsoft if the window stays blank.
- Python 3.12+ (developed on 3.14) and Node.js 20+.
- **FFmpeg** on `PATH`. The downloader (merging/conversion) and non-MP3 TTS output need it.
- MediaInfo is bundled with `pymediainfo`; the video duplicate finder uses it.

## Setup

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
cd frontend && npm ci
```

## Development

```bash
cd frontend && npm run dev        # terminal 1: Vite dev server with HMR
python main.py --dev              # terminal 2: native window + DevTools
```

Opening <http://localhost:5173> in a normal browser also works. It uses a mock backend (`frontend/src/lib/mock.ts`), so you can work on the UI without Python.

To run the production UI locally, run `npm run build` in `frontend/` and then `python main.py`.

## Tests

```bash
.venv\Scripts\python -m pytest            # backend services
cd frontend && npm run build              # i18n check + type check + build
python scripts/e2e_ui.py                  # drives every tool in a real window (needs a build)
```

## Building the .exe

```bash
python scripts/build.py
```

The script builds the frontend, runs PyInstaller (`packaging/MediaStudio.spec`), then runs the bundle's self-test (`MediaStudio.exe --selftest report.json`) from a temporary folder. The result is `dist/MediaStudio/MediaStudio.exe`, a one-folder build of about 220 MB.

## Project layout

```
main.py                 entry point (window, drag & drop, title bar, Mica)
backend/bridge/         API exposed to JavaScript + Python→JS event bus
backend/core/           jobs (threads, progress, cancel), settings, paths, OS helpers
backend/services/       one module per tool – plain Python, unit-tested
frontend/src/           React app: app shell, shared components, one folder per tool
tests/                  pytest suite
scripts/                build, end-to-end test, icon and i18n helpers
packaging/              PyInstaller spec
tools/                  standalone helper scripts (UI sprite generators, folder comparison)
```

Settings live in `%APPDATA%\MediaStudio\settings.json`.

Cookie files for sites that need a login can be chosen in **Settings → Cookie files**. If none is set, the app falls back to `features/download/*_cookies.txt`.

See `MIGRATION_NOTES.md` for the history of the PyQt → web UI rewrite and known pitfalls.
