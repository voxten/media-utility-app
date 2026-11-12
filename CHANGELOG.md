# Changelog

All notable changes to the **Media Studio** (`media-utility-app`) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

The app shows this file (and its Polish translation, [CHANGELOG.pl.md](CHANGELOG.pl.md)) under "What's new", so every release goes into both files.

## [Unreleased]

### Added

- On the first start the app uses the language of Windows: Polish on a Polish system, English otherwise (it used to start in Polish every time).
- Video tools (Video & Audio Converter, Video Downloader, Audio-Video Sync, Video to GIF, Transcription) offer to install FFmpeg right on the page when it is missing, instead of failing only after you start a task.
- **Windows integration**: the installer can add "Open in Media Studio" to the right-click menu of images, videos, audio and PDF files, list the app under "Open with" and add it to "Send to". The files open in the "Open in tool" dialog of the running window; several files selected together arrive as one set.
- The taskbar button shows the progress of running tasks.
- **Video & Audio Converter**: change the format of videos (MP4, MKV, MOV, WebM) and audio (MP3, M4A, OGG, Opus, WAV, FLAC), choose a quality or a target file size such as 25 MB, trim on a timeline, scale down, remove the sound, extract only the sound and even out the loudness. Several files can be converted at once; video and audio files can be sent to it from other tools.
### Changed

- **Progress Generator** saves the card into the output folder with a file name you can change, instead of asking where to save every time.
- The bar at the bottom of each tool says what to do next while nothing runs (pick a file, files ready) and shows a task only while it runs. Finished and failed tasks are reported once, in the toast and on the task card, instead of staying in the bar.
- Video Converter, Video Downloader, Instagram, Text to Speech and Audio-Video Sync use the same output folder field as the other tools. Audio-Video Sync saves into the output folder instead of next to the source video, with a file name field.
- Dropping or choosing files a tool cannot open shows how many were skipped instead of ignoring them silently.
- Keyboard and screen reader: the jobs popup takes focus when it opens and gives it back when it closes, the command palette announces the highlighted tool, the thumbnail strip can be reached with Tab and browsed with arrow keys (Delete removes a file), and the before/after view buttons say which one is on.
- Speech rate and Image Upscaler model names are translated.

### Removed

- "Recent folders" in Settings → Storage. The list filled only from Duplicate Finder scans and nothing used it.

### Fixed

- A tool shows the result of a task that finished while another page was open, also after clicking the "done" toast: Duplicate Finder, Image Upscaler, Background Remover, Watermark Remover, Text to Speech, Instagram, the link check in Video Downloader and reading files in PDF Merger.
- "Send to" the tool that is already open loads the files right away instead of on the next visit.
- Watermark Remover keeps the painted mask when you switch pages or go back from the result, and undo uses far less memory on large photos.
- Two download queues running at once no longer overwrite each other's saved links.
- Instagram downloads exactly the ticked posts even when the account posted something new after the check; checking a profile again stops as soon as all ticked posts are found.
- A cancelled GIF, WebP or MP4 render no longer leaves a file that looks finished in the output folder.
- The last Text to Speech recording and the Audio-Video Sync preview no longer start playing every time you open the page.
- Text to Speech and Progress Generator no longer replace an earlier file with the same name; they add "(1)", "(2)" instead.
- "Open file", "Show in folder" and "Move to Recycle Bin" say why they failed (the file is gone, or Windows refused) instead of doing nothing. Duplicate Finder no longer removes files from the list that were not actually moved to the Recycle Bin.
- The last Video Downloader queue result stays on the page even when the queue finished while another tool was open.
- A task card says the file is missing only for finished tasks.
- Image Tools "Apply to all" now edits files you never opened, and crop and resize keep their share of each photo, so portrait photos are no longer stretched to a landscape size.
- Background Remover, Image Upscaler and Watermark Remover turn phone photos upright (EXIF) and read 16-bit PNG and TIFF files.
- Converted, compressed and edited photos keep their color profile, so iPhone photos no longer come out washed out.
- Photos from some Samsung, Sony and Fuji cameras are saved as .jpg instead of .mpo.
- Image Compressor and PDF Compressor keep the original when the result would not be smaller, and mark it "No gain". "Target size" for PNG no longer repeats the same slow attempt 14 times and says when the size could not be reached.
- PDF Compressor now really shrinks large images; every preset used to fail at that step and only repacked the file.
- The Audio-Video Sync waveform no longer drifts when zoomed in. Exporting with the audio delayed keeps the video's length, its subtitles and chapters.
- Links from sites such as dropbox.com or netflix.com are no longer treated as X (Twitter) links.
- Very long video titles are shortened so the file fits the Windows path limit.
- Image Upscaler with the anime model works in tiles and needs far less memory; when memory still runs out it tries again with smaller tiles.
- Settings no longer report FFmpeg as ready when ffprobe is missing, and installing FFmpeg fills in the missing ffprobe.
- Error messages are written in your language and say what went wrong (file missing, file in use by another program, disk full, PDF protected with a password or damaged) instead of showing a translation key or English text with terminal color codes. Technical details stay in the log.
- Quick checks such as reading a link or a PDF answer at once even when many tasks wait in the queue.
- Image Compressor, Image Tools and the PDF page grid show an error instead of loading forever when a file cannot be read; one broken file no longer blocks the others.
- A failed model install no longer repeats its error toast, and leaving and coming back during an install no longer starts the same download a second time.
- Cancel now stops checking a long list of links, the MP3 conversion after a download, Text to Speech and installing AI add-ons. A cancelled add-on install keeps the version that worked before.
- Text to Speech no longer flashes a console window when saving WAV, OGG or FLAC.
- Background Remover downloads its model when you install it, with progress and a checksum, instead of standing still at 15% on the first run. Other models are fetched the same way the first time you pick them.
- Downloading an Image Upscaler model no longer says it is downloading the LaMa model.
- After Quit the app ends within a few seconds, so Restart no longer starts a second copy while the first one is still running.

### Performance

- Large photos, GIFs, recordings and video previews reach the window as files instead of tens of megabytes of text, so Background Remover, Watermark Remover, the GIF tools, Image Compressor, Text to Speech and Audio-Video Sync use far less memory and show results faster.
- GIF Editor keeps the open animation decoded, so each preview no longer decodes every frame again; a preview that finishes after you changed a setting no longer replaces the newer one.
- Duplicate Finder compares 10 000 photos in seconds instead of hours, can be cancelled while it compares, and makes previews only for the files it found.
- File lists load previews for the visible files only, a few at a time, and keep a limited number in memory. PDF page thumbnails are sent once instead of twice.
- The window opens faster: tools load their libraries the first time you use them, and the WebView cache is cleared only after an update.
- AI add-ons, FFmpeg, download engine updates and the cache moved from the roaming profile (%APPDATA%) to %LOCALAPPDATA%, so a roaming profile no longer copies gigabytes at sign-in. Cache files older than a week are removed at start.
- Background Remover keeps one model in memory instead of every model used. Watermark Remover with LaMa processes the painted area and its surroundings instead of the whole photo.

## [0.14.0] - 2026-11-11

### Added

- **Video Downloader: queue format.** The queue and playlists download video up to a chosen maximum quality, or only audio in a chosen format (MP3, M4A, FLAC and others), instead of always the best video.
- **Video Downloader: download archive.** Every finished download is remembered, and "Skip videos downloaded before" lets a queue skip links you already have. Settings → Storage & Cache → "Download archive" shows how many videos it remembers and clears it.
- **Video Downloader:** "Cover and metadata in the file" writes the thumbnail and details such as the title into the downloaded video or audio file.
- **Video Downloader:** playlist entries can be ticked one by one, or a run of them with Shift+click.
- **Video Downloader: resumable queue.** Links that were not downloaded when the app closed or the queue was cancelled are kept, and the tool offers "Resume" or "Discard" next time. Starting a new queue asks before replacing them. The last queue result stays on the page after you switch to another tool.
- **Error screen:** when a page fails, it shows "Try again" and "Go to Home" instead of going blank; a failure of the whole window offers "Reload window". If the app cannot start or does not respond within 30 seconds, it says so instead of loading forever.
- **Logs:** errors and app activity are written to a log file, useful when reporting a problem. Settings → Storage & Cache → "Logs" opens the folder.
- **Output folder** field, filled with the default folder from Settings, in Image Compressor, the GIF tools, Image Tools, the PDF tools, Transcription and when saving AI results.
- **Shortcuts in every tool:** Ctrl+Enter starts, Esc cancels and Ctrl+O adds files.
- **Duplicate Finder** accepts a dropped folder; **Text to Speech** opens a dropped or chosen .txt file.
- Settings → Storage & Cache shows the size of the AI models with an "Open folder" button.

### Changed

- **"Tasks at once"** in Settings now really limits how many tasks run at the same time and takes effect right away. Checking links, reading PDFs and download engine updates never wait in the queue.
- Tools keep their files and settings when you switch to another page and back: Image Compressor, the GIF tools, Image Tools, the PDF tools, Audio-Video Sync and Transcription.
- A finished task shows its result on the tool page; a toast appears only when you are on another page.
- Saving never overwrites an existing file: Image Converter, Image Compressor, Image Tools, PDF Splitter, PDF ↔ Images and every single-file result add "(1)", "(2)" to the name instead.
- Error messages are shorter and translated, without technical prefixes such as "ValueError:".
- AI models are kept in `%LOCALAPPDATA%\MediaStudio\models`, so they no longer travel with a roaming Windows profile; models downloaded earlier are moved there once at start-up.
- **Safer add-ons:** FFmpeg, gifsicle, LaMa, Real-ESRGAN and Whisper downloads are checked against a known checksum before use, and FFmpeg comes from a fixed release. Download engine updates are checked against the checksums published on PyPI.
- Opening a file from the app never runs a program: `.exe`, `.bat`, shortcuts and similar files are shown in Explorer instead.
- Settings → Advanced → custom FFmpeg must point to `ffmpeg.exe` or its folder; anything else shows an error.
- The "GPU acceleration" switch is gone from Settings; it had no effect.
- The installed app is about 9 MB smaller (an unused GUI toolkit is no longer included).
- The Tasks panel stays fast with a long history: a running task redraws only its own card, and the app keeps the last 100 finished tasks in memory.

### Fixed

- **Image Tools:** a batch can be cancelled, and Ctrl+C / Ctrl+V while typing in a field no longer switch tools.
- Photos rotated by the camera come out the right way up, transparent images saved as JPEG, BMP or PDF get a white background instead of black, and TIFF files work with the "Same as original" format.
- FFmpeg can no longer overwrite the file it reads from, and it is stopped when it fails or hangs.
- **PDF tools:** saving a compressed or rotated PDF over the original works; PDF Splitter names files after their pages; extracted text and file names are no longer Polish only.
- **Video Downloader:** links added while a queue is finishing start a new queue instead of being lost, and a link with nothing to download gives a clear error.
- **Duplicate Finder:** the exported CSV shows Polish letters correctly in Excel.
- A PDF page preview that cannot be loaded shows a message instead of staying empty.

---

## [0.13.0] - 2026-11-09

### Added

- **Transcription:** a new tool that turns speech in a video or recording into SRT or VTT subtitles or a TXT transcript, on this computer and without internet. It detects the language or uses the one you choose, can translate into English, and shows the text with timestamps to copy. It uses Whisper speech recognition, downloaded once from Settings or the tool: Base (fast), Small (balanced) or Turbo (most accurate, slow).
- **Video Downloader: subtitles** saved next to the video, from the site (in your language and English) or, when the site has none, made with Whisper. Choose it under "Output" → "Subtitles".
- **Close to tray:** the X button hides the window to the notification area and jobs keep running; the tray icon brings the window back and its menu quits the app. Settings → Advanced → "Close to Tray" turns it off.
- Starting the app again brings back the running window instead of opening a second copy.
- **Download engine updates:** newer yt-dlp and gallery-dl install from Settings → "Download engines" when YouTube, TikTok, X or Instagram downloads break, without waiting for a new app release. The app looks for a new version once a day at start-up and offers to update. A new version is checked before it is used, takes effect after a restart and can be rolled back to the bundled one.
- **Task history:** the Tasks panel has two tabs: "Now" with this session's tasks and "History" with finished tasks, including those from earlier runs. History is grouped into Today, Yesterday and older dates, with "Show in folder" for their files. "Clear history" empties the list; the files stay on disk.
- **Download from the clipboard:** "Download link from clipboard" in the tray icon menu opens a copied YouTube, TikTok, X or Instagram link in the matching download tool and checks it right away. Settings → Advanced → "Offer Copied Links" also offers a newly copied link when you return to the window (off by default).
- **Drop anywhere:** files dropped outside a drop area open "Open in a tool" with the tools that accept them.
- Several copied video links go straight to the Video Downloader's "Queue" tab, from the tray item or the copied-link offer; links already queued are skipped.
- **Tasks:** search, tool and status filters at the top of the "History" tab once it has a few entries; the search finds titles and file names.
- **Tasks:** "Open file" next to "Show in folder" for a finished task that wrote one file, and "Retry" on a failed task to run it again with the same settings.

### Changed

- **Video Downloader:** X and other streamed videos download several times faster; the app fetches 8 pieces of a video at once instead of one after another.
- Desktop notifications are native Windows notifications, shown only when the window is not in front; quick metadata lookups no longer send one.
- **Tasks:** smaller cards. The row of buttons is replaced by "Open file" and "Show in folder" icons and a "⋯" menu with "Send to", "Copy path" and "Open tool". A finished task shows what it produced, such as "1080p · MP4 · 9:56 · 48 MB" or "1.2 MB → 312 KB (−74%)", in "History" too. A running task shows its current step and how much has been downloaded.
- **Video Downloader:** the task card shows the video's thumbnail, and video and audio are shown as separate steps while downloading ("Downloading video (1/2)"). Instagram downloads show the speed and the downloaded size.

### Fixed

- **Video Downloader:** sites that need browser impersonation (TikTok) work again in the installed app; 0.12.0 shipped a curl_cffi version yt-dlp does not support, which silently turned impersonation off.
- **Video Downloader:** downloading a cancelled X video again in the same session no longer fails at the end with "Unable to rename file"; it resumes where it stopped.
- **Tasks:** a task named after a link shows the whole address (it lost the `https:` part), and a finished single-video download offers "Send to…".
- **Video Downloader:** the progress bar no longer jumps back to zero when the audio starts downloading after the video.
- **Tasks:** an error keeps the site tag at its start ("[twitter]" lost its "[t"), and a Video Sync entry in the history keeps its file and its "Show in folder" button.
- Checking a link (video or Instagram) and updating the download engines no longer play the completion sound, show a "finished" toast or desktop notification, or appear as cards in the Tasks panel and on the Home page; the page or the engine update message already shows the result.

---

## [0.12.0] - 2026-11-05

### Added

- **Instagram Download:** "Stop" while a profile is loading keeps the posts found so far, so a long profile no longer has to load in full before saving.

### Changed

- **Instagram Download:** stories, highlights and profiles load through gallery-dl, which follows Instagram's current GraphQL feeds; a profile shows its posts in batches while it loads.
- **Settings → Cookie files:** the hint names the folder the installed app reads cookie files from when no path is set (`%APPDATA%\MediaStudio\cookies`).

### Fixed

- **Instagram Download:** stories, highlights and whole profiles download again (Instagram had dropped the feeds the tool used).
- **Video Downloader:** an X post that fails because no X cookie file is set says so and points to Settings → Cookie files, instead of "No video could be found in this tweet". Failed queue items show translated errors.

---

## [0.11.0] - 2026-11-04

### Added

- **Video to GIF:** new tool that turns a clip of a video into an animated GIF, WebP or APNG: range picked on a frame timeline, frame rate, width, speed, crop and reverse, with a preview and estimated size before saving.
- **GIF Editor:** new tool for animated GIF, WebP and APNG files: trim on a frame timeline, crop, resize, rotate and flip, speed, reverse and boomerang; several files at once; saves as GIF, WebP, APNG or MP4.
- **GIF output:** colour count, dithering, loop count and lossy compression; a size limit (256 KB to 25 MB or custom) shrinks the result until it fits.
- **gifsicle:** optional add-on for lossy GIF compression and size limits, installed from Settings or the GIF tools.
- **Instagram Download:** new tool that saves the photos and videos of an Instagram post, carousel, reel, story, highlight or whole profile in full quality; pick what to save from a preview grid, and a profile goes into a folder named after the account. Stories, profiles and age-restricted or private posts need an Instagram cookie file, which Settings → Cookie files now accepts.
- **Video Downloader:** TikTok photo posts (slideshows) save their photos as JPG, also from `/photo/` links and whole profiles; "Audio only" still saves the soundtrack.

### Changed

- Audio-Video Sync export shows real progress.
- "Send to" offers the GIF Editor for GIF files.
- **Installer:** running it over an installed copy updates it in place, keeping settings and add-ons; it asks before installing an older version.

### Fixed

- **Video Downloader:** TikTok videos and whole TikTok profiles download again; a profile lists every public video.

---

## [0.10.0] - 2026-10-18

### Added

- **PDF Splitter:** pages are grouped by clicking, each group has its own colour and is saved as a separate PDF. Shift+click adds a run of pages.
- **PDF tools:** page thumbnail grid with full-size preview in Compressor, Splitter, Converter and Extractor.
- **PDF Converter:** export only selected pages to images (click pages or type a range).
- **Downloader:** links can be added to a running queue; existing files are no longer overwritten (`(1)`, `(2)` suffix); queue shows total size and duration.
- **Audio-Video Sync:** video frame track on the timeline; accepts videos sent from other tools.
- **Progress Bar Generator:** values as percentages or numbers (e.g. 12/40), each bar with its own total.
- **Upscaler, Watermark Remover:** "Continue with the result" uses the output as the next input.
- **Packaged app:** optional AI packages (PyTorch, rembg) install from Settings into a per-user add-ons folder; self-test checks add-on support.
- **What's new:** release notes in Settings and the command palette; the app points to them after an update.

### Changed

- Tools share one layout: drop zone, file strip, action bar, inline result card and AI model banner.
- Jobs popup and jobs panel use one task card component.
- Image Compressor and Image Tools rebuilt on the shared file strip; thumbnails generated by the backend and cached once for the whole app.
- "Send to" lists only tools that accept the file type.
- Shorter UI copy; file format names defined in one place.
- PyTorch is imported only when an AI model runs, so the app starts without it.

### Fixed

- "Send to" dialog is centred again; dialogs no longer empty out during the closing animation.
- Polish plural forms in PDF success messages; result card title no longer runs into the output path.

---

## [0.9.0] - 2026-10-04

### Added

- **Audio-Video Sync:** new tool for fixing out-of-sync audio: waveform timeline with zoom and dragging, precise offset controls, short preview clips and export by stream copy or re-encode to H.264/AAC.
- Audio can come from the video itself or from a separate file.

### Fixed

- Missing translations in Audio-Video Sync.

---

## [0.8.0] - 2026-10-04

### Changed

- New icons for Background Remover, Duplicate Finder, PDF Converter and PDF Extractor; all PDF tool icons share one style.
- Tasks popup: full panel opens from the header button; "Clear completed" appears only when there is something to clear.

---

## [0.7.0] - 2026-10-03

### Added

- **Tasks popup:** overall progress, speed and remaining time, plus the status of every item in batch tasks.
- **Installer:** Windows setup in Polish and English, per-user without admin rights, with Start menu and desktop shortcuts and an uninstaller.

### Fixed

- Task timer starts right away and counts every second.

---

## [0.6.0] - 2026-10-03

### Added

- **AI Background Remover:** BiRefNet, RMBG, U2Net and IS-Net models, edge cleanup, erase/restore brush and background presets.
- **AI Upscaler:** Real-ESRGAN models, 2× and 4× scale, denoise and tiled processing for large images.
- **AI models in Settings:** install and remove AI packages and models without reinstalling the app.
- **Image comparison:** slider, side by side, result only and original only views.
- **Watermark Remover:** LaMa AI model with one-click install; output folder and file name can be chosen.

### Changed

- Image tools grouped into categories with "AI" badges.

---

## [0.5.0] - 2026-10-03

### Added

- Background tasks panel with notifications.
- Ctrl+K command palette.
- Drag and drop files onto the window.
- Standalone Windows build that does not need Python.

### Changed

- New interface replacing the PyQt window: Windows 11 Mica, light and dark theme, Polish and English.

---

## [0.4.0] - 2026-10-03

### Added

- Video Downloader, Text-to-Speech with a built-in player, Duplicate Finder, Image Converter and Progress Bar Generator in the new interface.
- PDF Merger with drag-and-drop page order.

---

## [0.3.0] - 2026-10-03

### Added

- First version of the new interface: sidebar navigation and home page.

---

## [0.2.0] - 2026-10-03

### Added

- **Watermark Remover** based on OpenCV inpainting.

---

## [0.1.0] - 2026-08-12

### Added

- First version: Image Converter, YouTube Downloader, Text-to-Speech, PDF Merger, image and video duplicate finder and progress bar graphics generator.
