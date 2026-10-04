# Changelog

All notable changes to the **Media Studio** (`media-utility-app`) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.9.0] - 2026-10-04

### Audio-Video Synchronization Suite (`video_sync`)

- **New Audio-Video Synchronization Module (`frontend/src/features/video_sync/`, `backend/services/video_sync.py`)**:
  - Designed and built a dedicated audio/video track alignment workflow for repairing unsynchronized media files (.mp4, .mkv, .mov, .avi, .webm, etc.).
  - **Interactive Waveform Timeline (`WaveformTimeline.tsx`)**:
    - High-performance HTML5 Canvas audio amplitude visualization supporting smooth multi-level zoom (1x to 10x).
    - Mouse-wheel zooming centered on the cursor, horizontal scroll syncing, and direct track dragging with Shift-modifier micro-precision.
    - Real-time delay indicators showing positive audio offset (silence insertion) and negative audio offset (lead trimming).
  - **Granular Offset & Track Controls (`OffsetControls.tsx`)**:
    - Digital sub-millisecond readout with color-coded status badges (amber for delay, sky blue for advance, neutral for zero phase).
    - Quick-nudge stepping grid (±1s, ±250ms, ±50ms, zero reset), dynamic slider with toggleable wide (±30s) and fine (±5s) ranges, and manual numeric entry in seconds or milliseconds.
    - Audio source switcher: embedded video stream selection across multi-track video files or external standalone audio track loading.
  - **Fast Preview Player & Scrubber (`VideoPreviewCard.tsx`)**:
    - Dynamic short-slice preview generation (10s, 15s, 30s, 60s) allowing fast verification without re-rendering multi-hour long media files.
    - Custom high-contrast scrubber rail with highlighted preview window slice, glowing draggable thumb handle, tooltip timestamps, ±30s nudging, and looping player.
  - **Dual-Mode Video Export**:
    - Ultrafast lossless stream copy with audio delay/advance timestamp shifting.
    - High-quality full re-encoding (x264 / AAC) with filter complex audio delay (`adelay` / `atrim`).
  - **Backend Engine & Self-Testing**:
    - Complete probe metadata extractor, waveform peak generator, preview generator, and export pipeline.
    - Automated unit tests in `tests/test_video_sync.py` covering probing, waveform extraction, preview clipping, and export with audio offset.

### Internationalization & Quality Assurance

- **Full-Stack i18n Validator (`frontend/scripts/check-i18n.mjs`)**:
  - Overhauled translation check script into a comprehensive AST and regex validator:
    - Verifies key parity and structural balance between English and Polish (`en.json` ↔ `pl.json`).
    - Validates Polish plural inflection variants (`_one`, `_few`, `_many`, `_other`).
    - Scans all 71 frontend TypeScript files (`src/**/*.{ts,tsx}`) to ensure all `t("...")` keys exist in translation files.
    - Scans all 29 backend Python files (`backend/**/*.py`) to ensure all `ctx.progress(...)`, `ctx.log(...)`, and job status keys are localized.
    - Validates dynamic keys for tool titles, categories, and job statuses.
    - Integrated as a mandatory pre-build step in `npm run build` and standalone via `npm run check-i18n`.
- **Localization Bug Fixes**:
  - Resolved unlocalized `video_sync.status.syncing` by properly routing background job progress through `jobMessage(t, runner.job)` in `VideoSyncPage.tsx`.
  - Replaced hardcoded text in `VideoSyncPage`, `VideoPreviewCard`, `OffsetControls`, and `WaveformTimeline` with translated keys in both `pl.json` and `en.json`.

---

## [0.8.0] - 2026-10-04

### Design System & Icon Suite

- **Unified, Collision-Free Icon System (`frontend/src/app/tools.tsx`, `frontend/src/app/customIcons.tsx`)**:
  - Audited and resolved all cross-category icon collisions throughout the application:
    - **AI Background Remover (`rembg`)**: Replaced scissors (`Cut24`) with `Wand24` (`bundleIcon(Wand24Filled, Wand24Regular)`), adopting the universal magic wand with sparkles for AI segmentation, and synchronized the action button with `Wand16Filled`.
    - **Duplicate Finder (`duplicates`)**: Replaced `DocumentCopy24` with `FolderSearch24` (`bundleIcon(FolderSearch24Filled, FolderSearch24Regular)`), eliminating confusion with multi-document PDF merger and reinforcing directory-scanning semantics. Updated `EmptyState` in `DuplicatesPage.tsx`.
    - **PDF Converter (`pdf_convert`)**: Replaced `ImageArrowForward24` with `DocumentConvert24`, decoupling PDF document conversion from the image format converter.
    - **PDF Extractor (`pdf_extract`)**: Replaced generic `DocumentText24` with `DocumentExtract24`.
  - **Pixel-Perfect PDF Family Scale Unification**:
    - Created a standardized vector document template (`customIcons.tsx`) for `DocumentCompress24`, `DocumentSplit24`, `DocumentConvert24`, and `DocumentExtract24`.
    - Harmonized all 4 action-based PDF tools with an identical 14px document sheet silhouette, top-right folded corner, and matching circular action badges in the lower-left corner, eliminating visual size and weight discrepancies.

### Task Management & UX

- **Running Tasks Popup Polish (`frontend/src/app/JobsPopup.tsx`)**:
  - Removed redundant "Pokaż więcej" / "Show more" button from the popup footer.
  - Consolidated full panel expansion to the dedicated header action button (`Open16Regular` with tooltip "Otwórz pełny panel zadań").
  - Made the popup footer dynamic: only renders when completed jobs exist to display "Wyczyść ukończone" (`Delete16Regular`), saving screen real estate during active task execution.

### Toolset Documentation

- Documented newly modularized tools in `README.md`:
  - **Image Suite**: Image Compressor (`compressor`), Image Tools & Cropping (`image_tools`).
  - **PDF Suite**: PDF Compressor (`pdf_compress`), PDF Splitter (`pdf_split`), PDF Converter (`pdf_convert`), and PDF Extractor (`pdf_extract`).

---

## [0.7.0] - 2026-10-03

### Frontend & Task Management

- **Corner Tasks Popup (`frontend/src/app/JobsPopup.tsx`)**:
  - Implemented a floating WinUI 3 / Mica flyout widget anchored in the bottom corner, toggled by clicking the "Zadania" item in the navigation bar.
  - Divided task execution display into **Overall Progress (Całość)** and **Specific Actions (Konkretne akcje)**:
    - Overall section displays aggregate progress bar, completion ratio (e.g. 3/10), overall transfer speed, and ETA.
    - Specific actions list displays individual subtask rows (e.g. 10 individual videos/files) with live statuses (queued clock, active spinner with item-level loading bar and speed, completed checkmark, error).
  - Added "Pokaż więcej" button to seamlessly open the full drawer (`JobsPanel.tsx`).
- **Continuous Real-Time Timer (`frontend/src/components/LiveElapsed.tsx`)**:
  - Implemented real-time second-by-second countdown starting immediately upon task submission (`startedAt`), eliminating the previous lag/delay.
  - Integrated into both `JobsPopup` and `JobsPanel`.

### Packaging & Installer

- **Windows Setup Installer Wizard (`packaging/MediaStudio.iss`)**:
  - Created a modern, multi-language (Polish & English) Windows Installer wizard based on Inno Setup.
  - Supports per-user installation without administrative UAC elevation or system-wide installation.
  - Automatically creates Start Menu and optional Desktop shortcuts, registers the app in Windows "Installed apps" / Control Panel, and provides a clean uninstaller.
  - Generates ultra-compressed setup executables (`MediaStudio-Setup-<version>.exe`, ~70 MB).
- **Interactive Build Wizard (`scripts/build_wizard.py`, `build_installer.bat`)**:
  - Created an interactive step-by-step console wizard guiding the developer through environment checks, frontend build, PyInstaller bundling, self-testing, and installer compilation.
  - Added one-click batch launcher `build_installer.bat` for Windows.
  - Extended `scripts/build.py` with the `--installer` flag.

---

## [0.6.0] - 2026-10-03

Major release introducing state-of-the-art AI tooling (Background Removal & Super-Resolution Upscaling), an in-app runtime ML dependency installer, a re-architected pixel-perfect before/after image comparison engine (Split Slider), and unified destination path selectors across image processing tools.

### Backend

- **AI Background Removal Service (`backend/services/rembg_service.py`)**:
  - Added support for cutting-edge segmentation models: BiRefNet (General / Portrait / Dismantling), RMBG 1.4, U2Net, U2Netp, and IS-Net.
  - Implemented an advanced edge refinement and artifact cleanup pipeline:
    - **Anti-Halo Debleed**: Inpaints semi-transparent boundary transitions using pure foreground colors sampled from the solid interior, eliminating bright/white halos around hair and edges.
    - **Sub-Pixel Choke / Erode**: Shaves the outermost 1–3 contaminated background boundary pixels (`cv2.erode`).
    - **Feathering**: Smooths aliased boundary steps.
    - **Despeckle & Hole-Filling**: Automatically purges detached floating specks and closes accidental interior voids using connected components analysis (`cv2.connectedComponentsWithStats`).
  - Added interactive touch-up canvas mask decoding (red strokes = erase, green strokes = restore).
  - Standardized preview generation with `max_size=None` to preserve full image fidelity and prevent resolution mismatch.
- **AI Image Super-Resolution Service (`backend/services/upscale.py`)**:
  - Integrated the Spandrel model architecture and Real-ESRGAN models (`realesr-general-x4v3`, `RealESRGAN_x4plus`, `RealESRGAN_x2plus`, `RealESRGAN_x4plus_anime_6B`).
  - Added 2× and 4× scale factors with adjustable denoise strength.
  - Built a **Tiled Inference Engine** for high-resolution graphics, featuring feather-blended tile boundaries to prevent CUDA and system RAM out-of-memory (OOM) errors.
  - Added per-tile progress reporting to the job tracking system (`JobManager`).
- **Dynamic AI Dependency & Model Installer (`backend/services/deps_installer.py`, `backend/services/ai_models.py`, `backend/core/deps.py`)**:
  - Enabled in-app installation of heavy ML packages (`torch`, `torchvision`, `rembg`, `onnxruntime`, `spandrel`) without requiring a complete app reinstall or external terminal.
  - Automated weights downloading into `%APPDATA%\MediaStudio\models` with hash/size validation, real-time progress events, and cancellation support.
  - Exposed disk usage statistics and health status per dependency.
- **Watermark Inpainting Enhancements (`backend/services/watermark.py`)**:
  - Added result image dimensions (`width`, `height`) and full-fidelity preview data URLs.
  - Integrated LaMa model availability checks and bridge installation triggers.
- **Bridge API Extensions (`backend/bridge/api.py`)**:
  - Added API namespaces: `api.rembg.*`, `api.upscale.*`, `api.models.*`, and `api.system.installDependency`.
- **Test Suite**:
  - Added `tests/test_rembg.py`, `tests/test_upscale.py`, and `tests/test_deps.py`, expanding automated test coverage to 65 passing tests.

### Frontend

- **New Image Comparison Suite (`frontend/src/components/ImageComparison.tsx`)**:
  - Introduced 4 distinct comparison view modes:
    1. **Split slider**: Interactive vertical divider with draggable handle.
    2. **Side by side**: Synced dual-card presentation.
    3. **Result only**: Focus view on processed output.
    4. **Original only**: Source image inspection.
  - Designed a glassmorphism floating mode switcher with tooltips.
- **Comparison Slider Engine Overhaul (`frontend/src/components/CompareSlider.tsx`)**:
  - **Resolved image size and scale mismatch**: Implemented dynamic aspect-ratio detection (`naturalWidth / naturalHeight` and metadata props) combined with container dimension tracking via `ResizeObserver`.
  - Guaranteed identical bounding box and scale for both base and overlay layers, eliminating letterboxing and edge clipping on wide or vertical portrait images.
  - Seamless clipping via CSS `clipPath: inset(0 ${100 - pos}% 0 0)`.
  - Added pointer capture for ultra-smooth drag interactions outside the element boundary, alongside keyboard accessibility (`ArrowLeft` / `ArrowRight`).
- **New AI Background Remover Page (`frontend/src/features/rembg/RemBgPage.tsx`)**:
  - Model selection dropdown with architecture descriptions.
  - Fine-tuning controls: boundary choke, feathering, anti-halo debleed, and despeckle toggles.
  - Interactive touch-up brush canvas (erase and restore strokes).
  - Stage backdrop presets: transparency checkerboard, dark, light, green screen, and custom color picker.
  - Integrated `ImageComparison` with immediate preview.
  - Direct save and "Save As" destination folder/filename selector with one-click "Show in Explorer" action.
- **New AI Image Upscaler Page (`frontend/src/features/upscale/UpscalePage.tsx`)**:
  - 2× / 4× scale factor selection, Real-ESRGAN model picker, denoise slider, and tiling toggle.
  - Real-time input vs output dimension indicators (e.g., `1024×768 px → 4096×3072 px`).
  - Integrated `ImageComparison` with full-resolution rendering.
  - Unified output path and filename picker.
- **Watermark Remover Page Enhancements (`frontend/src/features/watermark/WatermarkPage.tsx`)**:
  - Upgraded preview to `ImageComparison` across all 4 modes.
  - Added LaMa AI promotional banner with one-click installer, live progress bar, and cancellation button.
  - Added destination directory and filename selector.
- **Settings Page (`frontend/src/features/settings/SettingsPage.tsx`)**:
  - Added dedicated AI Dependencies management section displaying installed status, disk footprint, and one-click install/uninstall actions.
- **Navigation & App Shell (`frontend/src/app/Navigation.tsx`, `frontend/src/app/tools.tsx`)**:
  - Reorganized image tools into intuitive categories with dedicated "AI" badges and Fluent UI icons.
- **Localization (i18n)**:
  - Synchronized 518 translation keys across English (`en.json`) and Polish (`pl.json`).
  - Added missing job progress parameter tokens and UI labels.

---

## [0.5.0] - 2026-10-03

Complete architectural migration from the legacy PyQt6 desktop UI to a modern **pywebview + React 19 + Fluent UI v9** technology stack.

### Backend

- Extracted business logic from Qt widgets into decoupled, standalone services in `backend/services/` (converter, pdf, duplicates, tts, download, watermark, progress).
- Built a centralized `JobManager` and `JobContext` with background worker threading, throttled event delivery (10/s), and graceful cancellation.
- Implemented `backend/bridge/api.py` and `EventBus` for typed asynchronous Python ↔ JavaScript IPC.
- Integrated the native pywebview (WebView2) desktop shell on Windows with Windows 11 Mica backdrop (`win_theme.py`), native custom title bar, and drag-and-drop file ingestion.
- Built a standalone executable packaging pipeline using PyInstaller (`packaging/MediaStudio.spec`) with automated post-build validation (`--selftest`).
- Completely purged legacy PyQt6 dependencies and code.

### Frontend

- Initialized React 19 application powered by TypeScript 5.9, Vite 8, and Microsoft Fluent UI v9.
- Designed system, dark, and light theme integration supporting Mica translucent styling.
- Built a global background tasks drawer with toast notifications (`useNotify`) and progress bars.
- Implemented a `Ctrl+K` command palette for rapid tool navigation and action execution.
- Migrated all utility tools into modular subdirectories under `frontend/src/features/`.
- Full dual-language internationalization (English and Polish) using `react-i18next`.
- Added mock backend provider (`src/lib/mock.ts`) enabling fast frontend development and testing in standard web browsers.

---

## [0.4.0] - 2026-10-03

Ported core desktop utility tools to Fluent UI v9 React components.

### Backend

- Implemented video downloader service (`download.py`) backed by `yt-dlp` with format selection and cookie authentication.
- Implemented text-to-speech service (`tts.py`) supporting Edge Neural TTS and offline Windows SAPI voices.
- Implemented duplicate finder service (`duplicates.py`) using perceptual hashing (`imagehash`, `pymediainfo`).

### Frontend

- Created tool pages: `ConverterPage`, `PdfPage`, `DuplicatesPage`, `DownloadPage`, `TtsPage`, `ProgressPage`.
- Added embedded `AudioPlayer` component with waveform playback controls for TTS output.
- Built drag-and-drop page reordering for PDF merging with `@dnd-kit/sortable`.

---

## [0.3.0] - 2026-10-03

Established modern web UI infrastructure and inter-process communication bridge.

### Backend

- Scaffolding of `backend/bridge/` and `backend/core/` systems.
- Removed direct Qt dependencies from file conversion workflows.

### Frontend

- Initialized Vite project with React and Fluent UI design system.
- Created `Shell` layout, sidebar `Navigation`, and `HomePage`.
- Implemented strongly typed IPC client (`bridge.ts`) with `on(event)` subscription handling.

---

## [0.2.0] - 2026-10-03

Refactored monolithic PyQt application structure prior to web migration.

### General

- Divided monolithic Qt code into isolated feature packages in `features/`.
- Added Watermark Remover tool utilizing OpenCV inpainting algorithms (Telea / Navier-Stokes).

---

## [0.1.0] - 2026-06-24 / 2026-08-12

Initial prototype of Media Utility App built with PyQt6.

### General

- Core utility tabs: Image Converter, YouTube Video Downloader, Text-to-Speech synthesizer.
- PDF Merger tool.
- Image and video duplicate similarity finder.
- Progress bar graphics generator.
