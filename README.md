# Media Studio (media-utility-app)

Windows desktop toolbox for media, documents and text. It is a native window (pywebview / WebView2) with a React + Fluent UI interface; the processing runs in Python.

| Tool | What it does |
|---|---|
| Background remover | AI cutouts with BiRefNet, RMBG 1.4, U2Net, IS-Net; edge anti-halo debleed, touch-up brush & split slider |
| Image upscaler | AI 2× / 4× super-resolution via Real-ESRGAN (general & anime) with tiled inference for large graphics |
| Image compressor | Reduce file size of images (PNG, JPEG, WebP) with adjustable quality and dimension caps |
| Image editor / Crop | Freeform & aspect-ratio cropping, rotation, flip, and geometry adjustments |
| Image converter | Folder or file batch conversion (PNG, WEBP, JPEG, GIF, TIFF, BMP, PDF) with per-file status |
| Watermark remover | Paint a mask, inpaint with OpenCV (Telea / Navier-Stokes) or the optional LaMa AI model |
| Video downloader | YouTube / X / other sites via yt-dlp: format table, audio-only, batch queue with live item progress |
| Text to speech | Edge neural voices (online) or Windows voices (offline), with an in-app player |
| PDF merger | Drag-to-reorder pages from several PDFs and merge them into one document |
| PDF compressor | Optimize and compress PDF documents with DPI and quality presets |
| PDF splitter | Split PDF documents into single pages, page ranges, or extracts |
| PDF converter | Convert PDF pages into image sequences (PNG, JPEG, WebP) or compile images into PDF |
| PDF extractor | Extract embedded text and imagery from PDF documents |
| Duplicate finder | Perceptual-hash search for similar images and videos; moves duplicates to the Recycle Bin, exports CSV |
| Progress generator | Designs progress-bar graphics and exports them as PNG |

Other features:
- light, dark and system themes;
- Polish and English interface;
- Windows 11 Mica backdrop;
- `Ctrl+K` command palette;
- **Unified Fluent UI Icon System**: curated, collision-free icons with matching geometries and scale across image, video, PDF, text, and system tools;
- **Floating tasks popup & live timer**: corner flyout showing overall batch progress alongside individual subtask queues (e.g. 10 video downloads or batch file conversions) with continuous real-time ticking; expandable into the full tasks drawer with one-click cleanup of finished jobs;
- **Runtime AI dependency installer**: one-click automatic installation of PyTorch, model weights (BiRefNet, Real-ESRGAN, LaMa), and portable FFmpeg directly within the application;
- **Interactive image comparison viewer**: draggable split slider, side-by-side, original and processed cutout/upscale inspection modes.

## Requirements

- Windows 10/11 with the **WebView2 Runtime**. It is built into Windows 11; on Windows 10 install it from Microsoft if the window stays blank.
- Python 3.12+ (developed on 3.14) and Node.js 20+.
- **FFmpeg** on `PATH` (can also be downloaded and configured automatically via the in-app dependency installer in **Settings → Dependencies**).
- MediaInfo is bundled with `pymediainfo`; the video duplicate finder uses it.
- **Optional AI dependencies**: PyTorch, torchvision, and neural network weights (BiRefNet, Real-ESRGAN, LaMa) can be installed with a single click in **Settings → Dependencies** or directly via banners inside the respective tool pages.

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

## Building the .exe & Windows Installer

### 1. Interactive Build Wizard (Recommended)

Run the interactive build wizard from the terminal or double-click `build_installer.bat` on Windows:

```bash
python scripts/build_wizard.py           # interactive step-by-step wizard
python scripts/build_wizard.py --all     # automated full build & installer
python scripts/build_wizard.py --installer-only # compile installer from existing dist
```

The wizard guides you through:
- Frontend compilation (`npm run build`)
- PyInstaller standalone bundle (`dist/MediaStudio/`)
- Bundle integrity self-test
- Native Windows Setup Wizard compilation (`dist/installer/MediaStudio-Setup-<version>.exe`)
- Optional portable ZIP creation

### 2. Command-Line Build Script

```bash
python scripts/build.py                  # PyInstaller one-folder build
python scripts/build.py --installer      # build bundle + Inno Setup installer
```

The resulting installer (`dist/installer/MediaStudio-Setup-0.8.0.exe`, ~200 MB) provides a modern Windows setup wizard (Polish & English, Start Menu & Desktop shortcuts, clean uninstaller registered in Windows Settings / Control Panel).

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
