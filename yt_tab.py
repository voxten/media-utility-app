import threading
import queue
import math
import os
import sys
from pathlib import Path
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton,
    QComboBox, QFileDialog, QMessageBox, QProgressBar, QTabWidget, QFrame
)
from PyQt6.QtCore import QTimer, Qt
import yt_dlp as ytdlp

import requests
from PyQt6.QtGui import QPixmap


# ---------- Helper utils ----------

def fmt_bytes(n):
    """Human readable bytes."""
    if n is None:
        return "Unknown"
    n = int(n)
    if n == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = int(math.floor(math.log(n, 1024)))
    p = math.pow(1024, i)
    s = round(n / p, 2)
    return f"{s} {units[i]}"


# ---------- Worker thread ----------

class YTDLWorker(threading.Thread):
    def __init__(self, url, format_id, out_template, progress_queue):
        super().__init__(daemon=True)
        self.url = url
        self.format_id = format_id
        self.out_template = out_template
        self.progress_queue = progress_queue

    def run(self):
        ydl_opts = {
            "format": self.format_id,
            "outtmpl": self.out_template,
            "noplaylist": True,
            "progress_hooks": [self._progress_hook],
            "quiet": True,
            "no_warnings": True,
            "merge_output_format": "mp4",  # For merging video+audio
        }

        # If it's an audio-only format, set postprocessor for audio extraction
        if self.format_id == "bestaudio" or self.format_id.startswith("bestaudio/"):
            ydl_opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
            }]

        try:
            with ytdlp.YoutubeDL(ydl_opts) as ydl:
                self.progress_queue.put(("status", "Fetching info..."))
                info = ydl.extract_info(self.url, download=False)
                title = info.get("title", "video")
                self.progress_queue.put(("status", f"Downloading: {title}"))
                ydl.download([self.url])
                self.progress_queue.put(("done", f"Finished: {title}"))
        except Exception as e:
            self.progress_queue.put(("error", str(e)))

    def _progress_hook(self, d):
        try:
            status = d.get("status")
            if status == "downloading":
                downloaded = d.get("downloaded_bytes") or 0
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                speed = d.get("speed")
                eta = d.get("eta")
                percent = int(downloaded * 100 / total) if total else 0
                msg = {
                    "percent": percent,
                    "downloaded": downloaded,
                    "total": total,
                    "speed": speed,
                    "eta": eta,
                }
                self.progress_queue.put(("progress", msg))
            elif status == "finished":
                self.progress_queue.put(("status", "Postprocessing..."))
        except Exception as e:
            self.progress_queue.put(("error", f"Progress hook error: {e}"))


# ---------- Main Tab ----------

class YouTubeTab(QWidget):
    def __init__(self):
        super().__init__()
        self.progress_queue = queue.Queue()
        self.worker = None
        self.formats = []
        self.info = None

        self.init_ui()

        # periodic queue processing
        self.timer = QTimer()
        self.timer.timeout.connect(self._process_queue)
        self.timer.start(200)

    def init_ui(self):
        layout = QVBoxLayout()
        layout.setSpacing(12)
        layout.setContentsMargins(20, 20, 20, 20)

        header = QLabel("📥 YouTube Downloader")
        header.setStyleSheet("font-size: 22px; font-weight: bold; color: #87cefa; margin-bottom: 10px;")
        layout.addWidget(header)

        # --- URL input ---
        url_row = QHBoxLayout()
        url_label = QLabel("🔗 URL:")
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("Paste a YouTube video URL here...")
        self.check_btn = QPushButton("Check Formats")
        self.check_btn.clicked.connect(self.check_formats)
        url_row.addWidget(url_label)
        url_row.addWidget(self.url_input)
        url_row.addWidget(self.check_btn)
        layout.addLayout(url_row)

        # --- Thumbnail + Title ---
        thumb_row = QHBoxLayout()
        self.thumbnail_label = QLabel()
        self.thumbnail_label.setFixedSize(150, 84)
        self.thumbnail_label.setStyleSheet("border: 1px solid #444; border-radius: 6px; background: #111;")
        self.thumbnail_label.setScaledContents(True)
        thumb_row.addWidget(self.thumbnail_label)

        self.title_label = QLabel("Title: -")
        self.title_label.setWordWrap(True)
        self.title_label.setStyleSheet("font-size: 14px; color: #ddd;")
        thumb_row.addWidget(self.title_label, 1)
        layout.addLayout(thumb_row)

        # --- Separator ---
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("color: #444; margin: 6px 0;")
        layout.addWidget(sep)

        # --- Format tabs ---
        self.format_tabs = QTabWidget()
        self.format_tabs.setStyleSheet("""
            QTabWidget::pane { border: none; }
            QTabBar::tab {
                background: #2a2c2f;
                color: #bbb;
                border-radius: 6px;
                padding: 6px 16px;
                margin: 2px;
            }
            QTabBar::tab:selected {
                background: #3b3d3f;
                color: #fff;
            }
        """)

        def make_tab(label):
            w = QWidget()
            l = QHBoxLayout()
            l.addWidget(QLabel(label))
            combo = QComboBox()
            l.addWidget(combo)
            w.setLayout(l)
            return w, combo

        self.video_tab, self.video_combo = make_tab("🎥 Video:")
        self.audio_tab, self.audio_combo = make_tab("🎵 Audio:")
        self.all_tab, self.all_combo = make_tab("🧩 All:")

        self.format_tabs.addTab(self.video_tab, "Video")
        self.format_tabs.addTab(self.audio_tab, "Audio")
        self.format_tabs.addTab(self.all_tab, "All")
        layout.addWidget(self.format_tabs)

        # --- Output folder ---
        out_row = QHBoxLayout()
        out_row.addWidget(QLabel("💾 Save to:"))
        self.outdir_input = QLineEdit()
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse_folder)
        out_row.addWidget(self.outdir_input)
        out_row.addWidget(browse_btn)
        layout.addLayout(out_row)

        # --- Filename template ---
        fn_row = QHBoxLayout()
        fn_row.addWidget(QLabel("📝 Filename:"))
        self.filename_input = QLineEdit("{title}.{ext}")
        fn_row.addWidget(self.filename_input)
        layout.addLayout(fn_row)

        # --- Buttons ---
        btn_row = QHBoxLayout()
        self.download_btn = QPushButton("⬇️ Download")
        self.open_btn = QPushButton("📂 Open Folder")
        self.download_btn.clicked.connect(self.start_download)
        self.open_btn.clicked.connect(self.open_folder)
        btn_row.addWidget(self.download_btn)
        btn_row.addWidget(self.open_btn)
        layout.addLayout(btn_row)

        # --- Progress ---
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_bar)

        # --- Status ---
        self.status_label = QLabel("Idle")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("color: #9ab; font-weight: 500;")
        layout.addWidget(self.status_label)

        self.setLayout(layout)

    def browse_folder(self):
        path = QFileDialog.getExistingDirectory(self, "Select Folder", self.outdir_input.text())
        if path:
            self.outdir_input.setText(path)

    def open_folder(self):
        try:
            path = Path(self.outdir_input.text())
            if path.exists():
                if sys.platform == "win32":
                    os.startfile(str(path))
                elif sys.platform == "darwin":
                    os.system(f"open \"{path}\"")
                else:
                    os.system(f'xdg-open "{path}"')
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

    def check_formats(self):
        url = self.url_input.text().strip()
        if not url:
            QMessageBox.warning(self, "Error", "Please enter a YouTube URL.")
            return

        self.status_label.setText("Fetching formats...")
        self.check_btn.setEnabled(False)
        self.download_btn.setEnabled(False)
        # clear combos but keep tabs (we will fill them when ready)
        self.video_combo.clear()
        self.audio_combo.clear()
        self.all_combo.clear()
        self.formats = []

        def _fetch():
            try:
                ydl_opts = {"quiet": True, "no_warnings": True, "extract_flat": False}
                with ytdlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    raw_formats = info.get("formats", [])

                    fmts = []
                    # combined "best" entry
                    fmts.append({
                        "id": "bestvideo+bestaudio/best",
                        "label": "Best available (auto merge)",
                        "ext": "mp4",
                        "vcodec": "auto",
                        "acodec": "auto",
                        "filesize": 0,
                        "height": None,
                    })

                    for f in raw_formats:
                        fmt_id = f.get("format_id", "") or f.get("id", "")
                        ext = f.get("ext", "") or ""
                        # skip MHTML and other non-media hunks
                        if not ext or "mhtml" in ext.lower():
                            continue
                        height = f.get("height")  # None for audio or unknown
                        acodec = f.get("acodec", "") or ""
                        vcodec = f.get("vcodec", "") or ""
                        filesize = f.get("filesize") or f.get("filesize_approx") or 0
                        format_note = f.get("format_note", "")

                        # skip totally useless
                        if not acodec and not vcodec:
                            continue

                        # resolution string
                        if height:
                            res = f"{height}p"
                        elif vcodec == "none" and acodec and acodec != "none":
                            res = "audio"
                        else:
                            # some formats may have e.g. "DASH audio" as note
                            res = format_note or "unknown"

                        label_parts = [res, ext, fmt_bytes(filesize)]
                        if vcodec and vcodec != "none" and (not acodec or acodec == "none"):
                            label_parts.append("(video only)")
                        elif acodec and acodec != "none" and (not vcodec or vcodec == "none"):
                            label_parts.append("(audio only)")

                        label = " — ".join([str(p) for p in label_parts if p])
                        fmts.append({
                            "id": str(fmt_id),
                            "label": label,
                            "ext": ext,
                            "vcodec": vcodec,
                            "acodec": acodec,
                            "filesize": filesize,
                            "height": height
                        })

                    # try download thumbnail bytes (best-effort)
                    thumbnail_bytes = None
                    thumb_url = info.get("thumbnail")
                    if thumb_url:
                        try:
                            r = requests.get(thumb_url, timeout=6)
                            if r.status_code == 200 and r.content:
                                thumbnail_bytes = r.content
                        except Exception:
                            thumbnail_bytes = None

                    # send a plain payload (no Qt objects) back to main thread
                    self.progress_queue.put(
                        ("formats_ready", {"formats": fmts, "info": info, "thumbnail": thumbnail_bytes}))
            except Exception as e:
                self.progress_queue.put(("error", f"Failed to fetch formats: {e}"))
            finally:
                self.progress_queue.put(("check_done", None))

        threading.Thread(target=_fetch, daemon=True).start()

    def _on_formats_ready(self):
        if not self.formats:
            QMessageBox.information(self, "Info", "No formats found.")
            return

        # Clear combos
        self.video_combo.clear()
        self.audio_combo.clear()
        self.all_combo.clear()

        video_formats = []
        audio_formats = []
        all_formats = []

        for f in self.formats:
            ext = f.get("ext")
            if not ext or "mhtml" in ext.lower():
                continue  # skip unwanted formats

            vcodec = f.get("vcodec", "") or ""
            acodec = f.get("acodec", "") or ""

            # classify
            if vcodec and vcodec != "none" and (not acodec or acodec == "none"):
                video_formats.append(f)
            elif acodec and acodec != "none" and (not vcodec or vcodec == "none"):
                audio_formats.append(f)
            else:
                all_formats.append(f)

        # Populate combos (store the index mapping via saved lists)
        # The displayed label already includes resolution, ext, size
        for f in video_formats:
            self.video_combo.addItem(f["label"])
        for f in audio_formats:
            self.audio_combo.addItem(f["label"])
        for f in all_formats:
            self.all_combo.addItem(f["label"])

        # Save classified formats for later download lookup
        self.video_formats = video_formats
        self.audio_formats = audio_formats
        self.all_formats = all_formats

        # show thumbnail if provided in info payload (self.info will contain it)
        # worker attached bytes into self.info payload earlier; the queue handler should set self.info and self._thumbnail_bytes
        if hasattr(self, "_thumbnail_bytes") and self._thumbnail_bytes:
            try:
                pix = QPixmap()
                pix.loadFromData(self._thumbnail_bytes)
                self.thumbnail_label.setPixmap(
                    pix.scaled(self.thumbnail_label.size(), Qt.AspectRatioMode.KeepAspectRatio,
                               Qt.TransformationMode.SmoothTransformation))
            except Exception:
                # ignore thumbnail errors
                pass
        else:
            self.thumbnail_label.clear()

        # set titleText
        title = self.info.get("title", "Unknown") if self.info else "Unknown"
        uploader = self.info.get("uploader", "") if self.info else ""
        self.title_label.setText(f"<b>{title}</b> — {uploader}")

        self.download_btn.setEnabled(True)
        self.status_label.setText("Formats ready. Choose one to download.")

    def _clean_label(self, label: str):
        """Remove ID from label (assumes ID is first part before first ' — ')."""
        if " — " in label:
            parts = label.split(" — ")[1:]  # skip ID part
            return " — ".join(parts)
        return label

    def start_download(self):
        # pick formats list and combo depending on selected tab
        if not hasattr(self, "video_formats"):
            QMessageBox.warning(self, "Error", "Please check formats first.")
            return

        tab_idx = self.format_tabs.currentIndex()
        if tab_idx == 0:
            formats_list = self.video_formats
            combo = self.video_combo
        elif tab_idx == 1:
            formats_list = self.audio_formats
            combo = self.audio_combo
        else:
            formats_list = self.all_formats
            combo = self.all_combo

        sel_idx = combo.currentIndex()
        if sel_idx < 0 or sel_idx >= len(formats_list):
            QMessageBox.warning(self, "Error", "Please select a format.")
            return

        fmt = formats_list[sel_idx]
        fmt_id = fmt.get("id") or "bestvideo+bestaudio/best"

        outdir = Path(self.outdir_input.text()).expanduser()
        outdir.mkdir(parents=True, exist_ok=True)

        # allow user template like {title}.{ext}
        filename_template = self.filename_input.text().strip() or "{title}.{ext}"
        out_template = filename_template.replace("{title}", "%(title)s").replace("{ext}", "%(ext)s")
        out_template = str(outdir / out_template)

        self.download_btn.setEnabled(False)
        self.check_btn.setEnabled(False)
        self.progress_bar.setValue(0)
        self.status_label.setText("Starting download...")

        self.worker = YTDLWorker(
            url=self.url_input.text().strip(),
            format_id=fmt_id,
            out_template=out_template,
            progress_queue=self.progress_queue
        )
        self.worker.start()

    def _process_queue(self):
        try:
            while True:
                typ, data = self.progress_queue.get_nowait()
                if typ == "formats_ready":
                    # data contains 'formats', 'info', 'thumbnail'
                    self.formats = data.get("formats", [])
                    self.info = data.get("info")
                    # keep thumbnail bytes on the instance so _on_formats_ready can use it
                    self._thumbnail_bytes = data.get("thumbnail")
                    self._on_formats_ready()
                elif typ == "check_done":
                    self.check_btn.setEnabled(True)
                elif typ == "progress":
                    msg = data
                    percent = msg.get("percent", 0)
                    self.progress_bar.setValue(percent)
                    downloaded = fmt_bytes(msg.get("downloaded"))
                    total = fmt_bytes(msg.get("total"))
                    eta = msg.get("eta")
                    self.status_label.setText(f"Downloading {percent}% — {downloaded}/{total} — ETA: {eta}s")
                elif typ == "status":
                    self.status_label.setText(str(data))
                elif typ == "done":
                    self.status_label.setText(str(data))
                    self.progress_bar.setValue(100)
                    self.download_btn.setEnabled(True)
                    self.check_btn.setEnabled(True)
                    QMessageBox.information(self, "Done", str(data))
                elif typ == "error":
                    self.status_label.setText("Error")
                    self.download_btn.setEnabled(True)
                    self.check_btn.setEnabled(True)
                    QMessageBox.critical(self, "Error", str(data))
        except queue.Empty:
            pass
