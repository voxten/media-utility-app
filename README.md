# Media Studio (media-utility-app)

Windows desktop toolbox for media, documents and text. It is a native window (pywebview / WebView2) with a React + Fluent UI interface; the processing runs in Python.

| Tool | What it does |
|---|---|
| Video downloader | YouTube, TikTok, X and other sites via yt-dlp: format table, audio only, subtitles, cover art and metadata, playlists with per-entry picks, a batch queue with a quality or audio format for every link, a download archive that skips links saved before, a queue that resumes after a restart, part of a video by time range or chapter, SponsorBlock for YouTube and cookies from a cookie file or straight from a browser |
| Video & audio converter | MP4, MKV, MOV, WebM and MP3, M4A, OGG, Opus, WAV, FLAC: quality presets or a target file size (two-pass), trim on a timeline, scale down, remove or extract the sound, loudness normalization, several files at once |
| Instagram download | Posts, carousels, reels, stories, highlights and whole profiles in full quality, picked from a preview grid (yt-dlp for posts, gallery-dl for stories and profiles) |
| Audio-video sync | Waveform and frame timeline for fixing out-of-sync audio, short preview clips, export by stream copy or re-encode |
| Video to GIF | A clip of a video as GIF, WebP or APNG: frame range, frame rate, width, speed, crop, reverse, size estimate |
| GIF editor | Trim, crop, resize, rotate, speed, reverse and boomerang for GIF, WebP and APNG; colour count, dithering, lossy compression and a size limit (optional gifsicle) |
| Transcription | Speech to SRT, VTT or TXT on this computer with Whisper (Base, Small, Turbo), optional translation into English |
| Background remover | AI cutouts with BiRefNet (full and lite), IS-Net and U2Net; edge debleed and split slider |
| Image upscaler | AI 2× / 4× super-resolution via Real-ESRGAN (general and anime) with tiled inference for large images |
| Watermark remover | Paint a mask, inpaint with OpenCV (Telea / Navier-Stokes) or the optional LaMa model |
| Image compressor | Smaller PNG, JPEG and WebP files with adjustable quality and size caps |
| Image tools | Crop, rotate, flip and resize, one file or a batch |
| Image converter | File or folder conversion (PNG, WebP, JPEG, GIF, TIFF, BMP, PDF) with per-file status |
| Text to speech | Edge neural voices (online) or Windows voices (offline), with an in-app player |
| PDF merger | Drag-to-reorder pages from several PDFs and merge them into one document |
| PDF compressor | Smaller PDFs with DPI and quality presets |
| PDF splitter | Click pages into coloured groups, each saved as its own PDF |
| PDF converter | PDF pages to PNG, JPEG or WebP, or images to a PDF |
| PDF extractor | Text from PDF documents, saved as a TXT file |
| Duplicate finder | Perceptual-hash search for similar images and videos; moves duplicates to the Recycle Bin, exports CSV |
| Progress generator | Progress-bar graphics exported as PNG |

Other features:
- **Tasks panel:** "Now" and "History" tabs, history from earlier runs with search and filters, "Open file", "Show in folder", "Retry" and "Send to" on every task; tasks run in a queue with an adjustable number at once;
- **Tray icon:** closing the window hides it to the notification area while jobs keep running; "Download link from clipboard" opens a copied link in the matching download tool;
- **Drop anywhere:** files dropped outside a drop area open "Open in a tool";
- **Windows integration:** the installer can add "Open in Media Studio" to the Explorer menu, "Open with" and "Send to"; the taskbar button shows task progress;
- **Download engine updates:** newer yt-dlp and gallery-dl install from Settings, are checked before use and can be rolled back;
- **Add-ons:** PyTorch, rembg, model weights (BiRefNet, Real-ESRGAN, LaMa, Whisper), FFmpeg and gifsicle install from Settings; model weights, FFmpeg and gifsicle are checked against pinned SHA-256 checksums and Python add-ons install at pinned versions;
- `Ctrl+K` command palette; `Ctrl+Enter` runs, `Esc` cancels and `Ctrl+O` adds files in every tool;
- light, dark and system themes, Windows 11 Mica backdrop, Polish and English interface;
- "What's new" in Settings shows [CHANGELOG.md](CHANGELOG.md) / [CHANGELOG.pl.md](CHANGELOG.pl.md).

## Installing

1. Download `MediaStudio-Setup-<version>.exe` and run it. It installs for your user only and needs no administrator rights.
2. Windows SmartScreen may say "Windows protected your PC" because the installer is not signed. Choose **More info → Run anyway**.
3. Video tools offer to install FFmpeg on first use; AI tools offer their models the same way.

Uninstalling asks whether to remove the settings, history, cookies, models and add-ons as well. Files you saved are never removed.

Media Studio is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Requirements

- Windows 10/11 with the **WebView2 Runtime**. It is built into Windows 11; on Windows 10 install it from Microsoft if the window stays blank.
- Python 3.12+ (developed on 3.14) and Node.js 20+.
- **FFmpeg** on `PATH`, or installed from **Settings → Dependencies**.
- MediaInfo is bundled with `pymediainfo`; the video duplicate finder uses it.
- Optional AI add-ons (PyTorch, rembg, model weights) install from **Settings → Dependencies** or from the banner in each AI tool.

## Setup

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
cd frontend && npm ci
```

`requirements.lock` lists the exact versions the release is built with; `scripts/build.py` warns when the installed ones differ.

## Development

```bash
cd frontend && npm run dev        # terminal 1: Vite dev server with HMR on port 5173
python main.py --dev              # terminal 2: native window on the dev server + DevTools
```

The frontend reloads on save; the Python side needs a restart of `main.py --dev` after backend changes. The dev run logs to `%APPDATA%\MediaStudio\logs\dev.log`.

Opening <http://localhost:5173> in a normal browser also works. It uses a mock backend (`frontend/src/lib/mock.ts`), so you can work on the UI without Python. `npm run storybook` shows the shared components on port 6006.

To run the production UI locally, run `npm run build` in `frontend/` and then `python main.py`.

## Tests

```bash
.venv\Scripts\python -m pytest            # backend services and the window bridge
cd frontend && npm test                   # Vitest unit tests
cd frontend && npm run lint               # ESLint (TypeScript + React hooks)
cd frontend && npm run build              # i18n check + type check + build
python scripts/e2e_ui.py                  # drives every tool in a real window (needs a build)
```

## Building the .exe and Windows installer

### 1. Build wizard (recommended)

Run the wizard from the terminal or double-click `build_installer.bat`:

```bash
python scripts/build_wizard.py                  # step-by-step wizard
python scripts/build_wizard.py --all            # full build and installer
python scripts/build_wizard.py --installer-only # installer from an existing dist
```

The wizard runs the frontend build (`npm run build`), the PyInstaller bundle (`dist/MediaStudio/`), the bundle self-test, the Inno Setup installer (`dist/installer/MediaStudio-Setup-<version>.exe`) and an optional portable ZIP.

### 2. Build script

```bash
python scripts/build.py                  # PyInstaller one-folder build + self-test
python scripts/build.py --installer      # bundle + Inno Setup installer
```

The installer is a Windows setup wizard in Polish and English with Start menu and desktop shortcuts and an uninstaller in Windows Settings. Running it over an installed copy updates it in place and keeps settings and add-ons.

## Project layout

```
main.py                 entry point (window, drag & drop, tray, single instance, Mica)
backend/bridge/         API exposed to JavaScript (api.py) + Python→JS event bus
backend/core/           jobs, settings, paths, logs, history, add-ons, engine updates, tray, OS helpers
backend/services/       one module per tool – plain Python, unit-tested
backend/selftest.py     bundle smoke test (main.py --selftest)
frontend/src/app/       shell, navigation, command palette, tasks panel
frontend/src/components shared components (Panel, PathPicker, ActionBar, JobCard …)
frontend/src/features/  one folder per tool and Settings
frontend/src/i18n/      en.json / pl.json
frontend/src/lib/       bridge to Python, browser mock, helpers
frontend/src/stores/    zustand stores
frontend/scripts/       i18n check and other frontend helpers
tests/                  pytest suite
scripts/                build, build wizard, version, requirements check, end-to-end test, icon
packaging/              PyInstaller spec and Inno Setup script
assets/                 app icon
tools/                  standalone helper scripts (folder comparison)
```

Settings live in `%APPDATA%\MediaStudio\settings.json`, logs in `%APPDATA%\MediaStudio\logs` and AI models in `%LOCALAPPDATA%\MediaStudio\models`.

Cookie files for sites that need a login can be chosen in **Settings → Cookie files**. If none is set, the app falls back to `cookies/*_cookies.txt` in development and `%APPDATA%\MediaStudio\cookies` in the installed app.
