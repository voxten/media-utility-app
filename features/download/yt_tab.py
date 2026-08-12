import threading
import queue
import math
import os
import sys
from pathlib import Path
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton,
    QComboBox, QFileDialog, QMessageBox, QProgressBar, QTabWidget, QFrame, QPlainTextEdit
)
from PyQt6.QtCore import QTimer, Qt
from PyQt6.QtGui import QPixmap, QColor
import yt_dlp as ytdlp
import requests


# ---------- Helper utils ----------

def fmt_bytes(n):
    if n is None or n == 0:
        return "Unknown Size"
    n = int(n)
    units = ["B", "KB", "MB", "GB", "TB"]
    i = int(math.floor(math.log(n, 1024)))
    p = math.pow(1024, i)
    s = round(n / p, 2)
    return f"{s} {units[i]}"


def is_youtube(url):
    url_lower = url.lower()
    return "youtube.com" in url_lower or "youtu.be" in url_lower


def sanitize_x_url(url):
    """Cleans up trailing video markers from X/Twitter URLs that cause 404 errors."""
    if "x.com" in url.lower() or "twitter.com" in url.lower():
        if "/video/" in url:
            url = url.split("/video/")[0]
    return url


# ---------- Worker thread ----------

class YTDLWorker(threading.Thread):
    def __init__(self, url, format_id, out_template, progress_queue, is_audio_only=False, preferred_codec="mp3"):
        super().__init__(daemon=True)
        self.url = sanitize_x_url(url.strip())
        self.format_id = format_id
        self.out_template = out_template
        self.progress_queue = progress_queue
        self.is_audio_only = is_audio_only
        self.preferred_codec = preferred_codec

    def run(self):
        cookie_path = "features/download/youtube_cookies.txt" if is_youtube(self.url) else "features/download/x.com_cookies.txt"

        ydl_opts = {
            "format": self.format_id,
            "outtmpl": self.out_template,
            "noplaylist": True,
            "progress_hooks": [self._progress_hook],
            "quiet": True,
            "no_warnings": True,
            "cookiefile": cookie_path,
        }

        # Dynamically set postprocessors depending on if we are running audio conversion
        if self.is_audio_only:
            ydl_opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": self.preferred_codec,
                "preferredquality": "192",
            }]
        else:
            ydl_opts["merge_output_format"] = "mp4"
            ydl_opts["postprocessors"] = [{
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mp4",
            }]

        try:
            with ytdlp.YoutubeDL(ydl_opts) as ydl:
                self.progress_queue.put(("status", "Fetching media metadata..."))
                info = ydl.extract_info(self.url, download=False)
                title = info.get("title", "video")
                self.progress_queue.put(("status", f"Downloading: {title}"))
                ydl.download([self.url])
                self.progress_queue.put(("done", f"Successfully Downloaded: {title}"))
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
                self.progress_queue.put(("status", "Encoding & merging structural layouts..."))
        except Exception as e:
            self.progress_queue.put(("error", f"Progress hook exception: {e}"))


# ---------- Batch Worker Thread ----------

class YTBatchWorker(threading.Thread):
    def __init__(self, urls, outdir, filename_template, progress_queue):
        super().__init__(daemon=True)
        self.urls = urls
        self.outdir = Path(outdir)
        self.filename_template = filename_template
        self.progress_queue = progress_queue

    def run(self):
        total_videos = len(self.urls)

        for index, url in enumerate(self.urls, start=1):
            url = sanitize_x_url(url.strip())
            if not url:
                continue

            self.progress_queue.put(("batch_status", f"Processing Queue Item {index}/{total_videos}: {url}"))
            fmt_id = "bestvideo+bestaudio/best" if is_youtube(url) else "best"
            out_template = self.filename_template.replace("{title}", "%(title)s").replace("{ext}", "%(ext)s")
            final_out_path = str(self.outdir / out_template)
            cookie_path = "features/download/youtube_cookies.txt" if is_youtube(url) else "features/download/x.com_cookies.txt"

            ydl_opts = {
                "format": fmt_id,
                "outtmpl": final_out_path,
                "noplaylist": True,
                "progress_hooks": [self._progress_hook],
                "quiet": True,
                "no_warnings": True,
                "merge_output_format": "mp4",
                "postprocessors": [{
                    "key": "FFmpegVideoConvertor",
                    "preferedformat": "mp4",
                }],
                "cookiefile": cookie_path,
            }

            try:
                with ytdlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as e:
                self.progress_queue.put(("batch_err", f"Failed Parsing: {url}\nReason: {e}"))

        self.progress_queue.put(("batch_done", "All pipeline operations concluded successfully!"))

    def _progress_hook(self, d):
        try:
            status = d.get("status")
            if status == "downloading":
                downloaded = d.get("downloaded_bytes") or 0
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                percent = int(downloaded * 100 / total) if total else 0
                msg = {
                    "percent": percent,
                    "downloaded": downloaded,
                    "total": total,
                    "speed": d.get("speed"),
                    "eta": d.get("eta"),
                }
                self.progress_queue.put(("progress", msg))
            elif status == "finished":
                self.progress_queue.put(("status", "Post-processing pipeline streams..."))
        except Exception:
            pass


# ---------- Main Custom Styled Tab Interface ----------

class YouTubeTab(QWidget):
    def __init__(self):
        super().__init__()
        self.progress_queue = queue.Queue()
        self.worker = None
        self.formats = []
        self.info = None

        self.init_ui()

        self.timer = QTimer()
        self.timer.timeout.connect(self._process_queue)
        self.timer.start(150)

    def init_ui(self):
        self.setStyleSheet("""
            QFrame#CardWrapper {
                background-color: #1a1f2c;
                border: 1px solid #242c3e;
                border-radius: 12px;
            }
            QFrame#ControlPanel {
                background-color: #11151d;
                border: 1px solid #1e2533;
                border-radius: 12px;
            }
            QLabel#PanelHeader {
                font-size: 20px;
                font-weight: bold;
                color: #ffffff;
            }
            QPushButton#ActionBtn {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #ef4444, stop:1 #b91c1c);
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 12px 24px;
                font-weight: bold;
                font-size: 14px;
            }
            QPushButton#ActionBtn:hover {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #f87171, stop:1 #dc2626);
            }
            QPushButton#ActionBtn:pressed {
                background: #991b1b;
            }
            QProgressBar {
                border: 1px solid #242c3e;
                border-radius: 6px;
                background-color: #11151d;
                text-align: center;
                font-weight: bold;
                color: #ffffff;
                height: 22px;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #6366f1, stop:1 #4f46e5);
                border-radius: 5px;
            }
            QTabWidget::pane#SubTabs {
                border: 1px solid #242c3e;
                background-color: #141822;
                border-radius: 8px;
            }
            QTabBar::tab#SubTabs {
                background-color: #11151d;
                color: #9ca3af;
                padding: 8px 16px;
                border-radius: 6px;
                margin: 4px;
            }
            QTabBar::tab:selected#SubTabs {
                background-color: #22293a;
                color: #ffffff;
            }
        """)

        main_layout = QVBoxLayout(self)
        main_layout.setSpacing(16)
        main_layout.setContentsMargins(20, 20, 20, 20)

        header = QLabel("Universal Cloud Downloader")
        header.setObjectName("PanelHeader")
        main_layout.addWidget(header)

        self.mode_tabs = QTabWidget()
        self.mode_tabs.tabBar().setObjectName("SubTabs")
        self.mode_tabs.setObjectName("SubTabs")

        self.single_widget = QWidget()
        self.setup_single_ui()

        self.batch_widget = QWidget()
        self.setup_batch_ui()

        self.mode_tabs.addTab(self.single_widget, "🔗  Single Stream URL")
        self.mode_tabs.addTab(self.batch_widget, "🗂️  Batch Download Automation")
        main_layout.addWidget(self.mode_tabs)

        output_card = QFrame()
        output_card.setObjectName("CardWrapper")
        output_layout = QVBoxLayout(output_card)
        output_layout.setContentsMargins(16, 16, 16, 16)
        output_layout.setSpacing(12)

        out_row = QHBoxLayout()
        lbl_save = QLabel("Save Location:")
        lbl_save.setStyleSheet("color: #9ca3af; font-weight: 600;")
        self.outdir_input = QLineEdit(str(Path.home() / "Downloads"))
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse_folder)
        out_row.addWidget(lbl_save)
        out_row.addWidget(self.outdir_input, 1)
        out_row.addWidget(browse_btn)
        output_layout.addLayout(out_row)

        fn_row = QHBoxLayout()
        lbl_file = QLabel("Output Name:")
        lbl_file.setStyleSheet("color: #9ca3af; font-weight: 600;")
        self.filename_input = QLineEdit("{title}.{ext}")
        fn_row.addWidget(lbl_file)
        fn_row.addWidget(self.filename_input, 1)
        output_layout.addLayout(fn_row)

        main_layout.addWidget(output_card)

        control_card = QFrame()
        control_card.setObjectName("ControlPanel")
        control_layout = QVBoxLayout(control_card)
        control_layout.setContentsMargins(16, 16, 16, 16)
        control_layout.setSpacing(12)

        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        control_layout.addWidget(self.progress_bar)

        self.status_label = QLabel("Ready / System Idle")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("color: #a0aec0; font-weight: 600; font-size: 13px;")
        control_layout.addWidget(self.status_label)

        btn_row = QHBoxLayout()
        self.download_btn = QPushButton("⬇️ Execute Download")
        self.download_btn.setObjectName("ActionBtn")
        self.open_btn = QPushButton("📂 Open Storage Folder")
        self.download_btn.clicked.connect(self.start_download)
        self.open_btn.clicked.connect(self.open_folder)
        btn_row.addWidget(self.download_btn, 2)
        btn_row.addWidget(self.open_btn, 1)
        control_layout.addLayout(btn_row)

        main_layout.addWidget(control_card)

    def setup_single_ui(self):
        layout = QVBoxLayout(self.single_widget)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(14)

        url_row = QHBoxLayout()
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("Paste a YouTube stream, X.com, or specific network video link here...")
        self.check_btn = QPushButton("Inspect Formats")
        self.check_btn.clicked.connect(self.check_formats)
        url_row.addWidget(self.url_input, 1)
        url_row.addWidget(self.check_btn)
        layout.addLayout(url_row)

        media_preview_card = QFrame()
        media_preview_card.setStyleSheet("background-color: #11151d; border-radius: 8px; border: 1px solid #242c3e;")
        preview_layout = QHBoxLayout(media_preview_card)
        preview_layout.setContentsMargins(10, 10, 10, 10)

        self.thumbnail_label = QLabel()
        self.thumbnail_label.setFixedSize(140, 78)
        self.thumbnail_label.setStyleSheet("border-radius: 4px; background: #0b0d11;")
        self.thumbnail_label.setScaledContents(True)
        preview_layout.addWidget(self.thumbnail_label)

        self.title_label = QLabel("No Live Media Inspected")
        self.title_label.setWordWrap(True)
        self.title_label.setStyleSheet("font-size: 13px; color: #cbd5e1; font-weight: 500; border: none;")
        preview_layout.addWidget(self.title_label, 1)
        layout.addWidget(media_preview_card)

        self.format_tabs = QTabWidget()
        self.format_tabs.setObjectName("SubTabs")
        self.format_tabs.tabBar().setObjectName("SubTabs")

        def build_dropdown_tab(placeholder_txt):
            widget = QWidget()
            box_layout = QHBoxLayout(widget)
            box_layout.setContentsMargins(10, 10, 10, 10)
            box_layout.addWidget(QLabel(placeholder_txt))
            combo = QComboBox()
            box_layout.addWidget(combo, 1)
            return widget, combo

        self.video_tab, self.video_combo = build_dropdown_tab("🎥 Layout Streams:")

        self.audio_tab = QWidget()
        audio_layout = QHBoxLayout(self.audio_tab)
        audio_layout.setContentsMargins(10, 10, 10, 10)

        lbl_audio = QLabel("🎵 Track Renderers:")
        self.audio_combo = QComboBox()
        audio_layout.addWidget(lbl_audio)
        audio_layout.addWidget(self.audio_combo, 1)

        lbl_ext = QLabel("Extension:")
        lbl_ext.setStyleSheet("color: #9ca3af; margin-left: 10px; font-weight: 600;")
        self.audio_ext_combo = QComboBox()
        self.audio_ext_combo.addItems(["mp3", "wav", "m4a", "flac", "aac"])
        audio_layout.addWidget(lbl_ext)
        audio_layout.addWidget(self.audio_ext_combo)

        self.all_tab, self.all_combo = build_dropdown_tab("🧩 Legacy Elements:")

        self.format_tabs.addTab(self.video_tab, "Video Options")
        self.format_tabs.addTab(self.audio_tab, "Audio Extraction")
        self.format_tabs.addTab(self.all_tab, "Legacy Mixed")
        layout.addWidget(self.format_tabs)

    def setup_batch_ui(self):
        layout = QVBoxLayout(self.batch_widget)
        layout.setContentsMargins(14, 14, 14, 14)

        lbl = QLabel("📋 Queue URLs Pipeline Configuration (One link per line bounds):")
        lbl.setStyleSheet("color: #9ca3af; font-weight: 600; margin-bottom: 4px;")
        layout.addWidget(lbl)

        self.batch_input = QPlainTextEdit()
        self.batch_input.setPlaceholderText("https://youtube.com/watch?v=...\nhttps://x.com/...\nhttps://youtu.be/...")
        self.batch_input.setStyleSheet("""
            QPlainTextEdit {
                background-color: #0f1117; 
                color: #34d399; 
                font-family: 'Consolas', 'Courier New', monospace; 
                font-size: 13px;
                border: 1px solid #242c3e;
            }
        """)
        layout.addWidget(self.batch_input)

    def browse_folder(self):
        path = QFileDialog.getExistingDirectory(self, "Configure Target Path", self.outdir_input.text())
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
            QMessageBox.critical(self, "Execution Error", str(e))

    def check_formats(self):
        raw_url = self.url_input.text().strip()
        if not raw_url:
            QMessageBox.warning(self, "Input Alert", "Please supply a qualified uniform link path.")
            return

        self.status_label.setText("Querying remote system formats matrix...")
        self.check_btn.setEnabled(False)
        self.download_btn.setEnabled(False)
        self.video_combo.clear()
        self.audio_combo.clear()
        self.all_combo.clear()
        self.formats = []

        def _fetch():
            try:
                url = sanitize_x_url(raw_url)
                cookie_path = "features/download/youtube_cookies.txt" if is_youtube(url) else "features/download/x.com_cookies.txt"
                ydl_opts = {
                    "quiet": True,
                    "no_warnings": True,
                    "extract_flat": False,
                    "cookiefile": cookie_path,
                }
                with ytdlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    raw_formats = info.get("formats", [])

                    fmts = [{
                        "id": "bestvideo+bestaudio/best" if is_youtube(url) else "best",
                        "label": "Adaptive Peak Resolution (Auto Pipeline Optimized)",
                        "ext": "mp4",
                        "vcodec": "auto",
                        "acodec": "auto",
                        "filesize": float('inf'),
                        "height": 9999,
                    }]

                    for f in raw_formats:
                        fmt_id = f.get("format_id", "") or f.get("id", "")
                        ext = f.get("ext", "") or ""
                        if not ext or "mhtml" in ext.lower():
                            continue
                        height = f.get("height")
                        acodec = f.get("acodec", "") or ""
                        vcodec = f.get("vcodec", "") or ""
                        filesize = f.get("filesize") or f.get("filesize_approx") or 0
                        format_note = f.get("format_note", "")

                        if not acodec and not vcodec and not height:
                            continue

                        if height:
                            res = f"{height}p"
                        elif vcodec == "none" and acodec and acodec != "none":
                            res = "Audio Stream"
                        else:
                            res = format_note or "Unspecified"

                        label_parts = [res, ext, fmt_bytes(filesize)]
                        if vcodec and vcodec != "none" and (not acodec or acodec == "none"):
                            label_parts.append("(HD Video Only)")
                        elif acodec and acodec != "none" and (not vcodec or vcodec == "none"):
                            label_parts.append("(HQ Track Only)")

                        label = "  |  ".join([str(p) for p in label_parts if p])
                        fmts.append({
                            "id": str(fmt_id),
                            "label": label,
                            "ext": ext,
                            "vcodec": vcodec,
                            "acodec": acodec,
                            "filesize": filesize,
                            "height": height
                        })

                    thumbnail_bytes = None
                    thumb_url = info.get("thumbnail")
                    if thumb_url:
                        try:
                            r = requests.get(thumb_url, timeout=5)
                            if r.status_code == 200 and r.content:
                                thumbnail_bytes = r.content
                        except Exception:
                            thumbnail_bytes = None

                    self.progress_queue.put(
                        ("formats_ready", {"formats": fmts, "info": info, "thumbnail": thumbnail_bytes}))
            except Exception as e:
                self.progress_queue.put(("error", f"Network handshake failure: {e}"))
            finally:
                self.progress_queue.put(("check_done", None))

        threading.Thread(target=_fetch, daemon=True).start()

    def _on_formats_ready(self):
        if not self.formats:
            QMessageBox.information(self, "Inquire Update", "No structural media links exposed.")
            return

        self.video_combo.clear()
        self.audio_combo.clear()
        self.all_combo.clear()

        video_formats = []
        audio_formats = []
        all_formats = []

        for f in self.formats:
            ext = f.get("ext")
            if not ext or "mhtml" in ext.lower():
                continue

            vcodec = f.get("vcodec", "") or ""
            acodec = f.get("acodec", "") or ""

            if f.get("id") in ["bestvideo+bestaudio/best", "best"]:
                video_formats.append(f)
                all_formats.append(f)
                continue

            if vcodec and vcodec != "none" and (not acodec or acodec == "none"):
                video_formats.append(f)
            elif acodec and acodec != "none" and (not vcodec or vcodec == "none"):
                audio_formats.append(f)
            else:
                video_formats.append(f)
                all_formats.append(f)

        video_formats.sort(key=lambda x: x.get("filesize", 0) or 0, reverse=True)
        audio_formats.sort(key=lambda x: x.get("filesize", 0) or 0, reverse=True)
        all_formats.sort(key=lambda x: x.get("filesize", 0) or 0, reverse=True)

        seen_video = set()
        for f in video_formats:
            if f["label"] not in seen_video:
                self.video_combo.addItem(f["label"])
                seen_video.add(f["label"])

        for f in audio_formats:
            self.audio_combo.addItem(f["label"])
        for f in all_formats:
            self.all_combo.addItem(f["label"])

        self.video_formats = video_formats
        self.audio_formats = audio_formats
        self.all_formats = all_formats

        if hasattr(self, "_thumbnail_bytes") and self._thumbnail_bytes:
            try:
                pix = QPixmap()
                pix.loadFromData(self._thumbnail_bytes)
                self.thumbnail_label.setPixmap(
                    pix.scaled(self.thumbnail_label.size(), Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                               Qt.TransformationMode.SmoothTransformation))
            except Exception:
                pass
        else:
            self.thumbnail_label.clear()

        title = self.info.get("title", "Unknown Context") if self.info else "Unknown Frame"
        uploader = self.info.get("uploader", "Unknown Anchor") if self.info else ""
        self.title_label.setText(
            f"<b style='color:#ffffff;'>{title}</b><br/><span style='color:#8a99ad;'>{uploader}</span>")

        self.download_btn.setEnabled(True)
        self.status_label.setText("Stream verified. Proceed with engine deployment.")

    def start_download(self):
        outdir = Path(self.outdir_input.text()).expanduser()
        outdir.mkdir(parents=True, exist_ok=True)
        filename_template = self.filename_input.text().strip() or "{title}.{ext}"

        if self.mode_tabs.currentIndex() == 1:
            raw_text = self.batch_input.toPlainText().strip()
            if not raw_text:
                QMessageBox.warning(self, "Data Bounds Empty", "Please inject target uniform streams.")
                return

            urls = [line.strip() for line in raw_text.split("\n") if line.strip()]
            self.download_btn.setEnabled(False)
            self.progress_bar.setValue(0)

            self.worker = YTBatchWorker(urls, outdir, filename_template, self.progress_queue)
            self.worker.start()
            return

        if not hasattr(self, "video_formats"):
            QMessageBox.warning(self, "Action Denied", "Run inspector metrics validation first.")
            return

        tab_idx = self.format_tabs.currentIndex()
        is_audio_only = (tab_idx == 1)
        preferred_codec = "mp3"

        if tab_idx == 0:
            formats_list = self.video_formats
            combo = self.video_combo
        elif tab_idx == 1:
            formats_list = self.audio_formats
            combo = self.audio_combo
            preferred_codec = self.audio_ext_combo.currentText()
        else:
            formats_list = self.all_formats
            combo = self.all_combo

        sel_idx = combo.currentIndex()
        if sel_idx < 0 or sel_idx >= len(formats_list):
            QMessageBox.warning(self, "Target Empty", "Selected matrix frame mapping out of index.")
            return

        fmt = formats_list[sel_idx]
        fmt_id = fmt.get("id")
        url = self.url_input.text().strip()

        if is_youtube(url):
            if tab_idx == 0 and fmt_id != "bestvideo+bestaudio/best":
                fmt_id = f"{fmt_id}+bestaudio"

        out_template = filename_template.replace("{title}", "%(title)s").replace("{ext}", "%(ext)s")
        out_template = str(outdir / out_template)

        self.download_btn.setEnabled(False)
        self.check_btn.setEnabled(False)
        self.progress_bar.setValue(0)
        self.status_label.setText("Spawning downloader threads...")

        self.worker = YTDLWorker(
            url=url,
            format_id=fmt_id,
            out_template=out_template,
            progress_queue=self.progress_queue,
            is_audio_only=is_audio_only,
            preferred_codec=preferred_codec
        )
        self.worker.start()

    def _process_queue(self):
        try:
            while True:
                typ, data = self.progress_queue.get_nowait()
                if typ == "formats_ready":
                    self.formats = data.get("formats", [])
                    self.info = data.get("info")
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
                    self.status_label.setText(
                        f"Synchronizing Pipe: {percent}%  |  {downloaded} of {total}  |  ETA: {eta}s")
                elif typ == "status":
                    self.status_label.setText(str(data))
                elif typ == "done":
                    self.status_label.setText("Pipe Processing Terminated Cleanly")
                    self.progress_bar.setValue(100)
                    self.download_btn.setEnabled(True)
                    self.check_btn.setEnabled(True)
                    QMessageBox.information(self, "Pipeline Complete", str(data))
                elif typ == "error":
                    self.status_label.setText("Operation Pipeline Halted Abruptly")
                    self.download_btn.setEnabled(True)
                    self.check_btn.setEnabled(True)
                    QMessageBox.critical(self, "Stream Intercept Exception", str(data))
                elif typ == "batch_status":
                    self.status_label.setText(str(data))
                elif typ == "batch_err":
                    print(f"[Automation Error Log]: {data}")
                elif typ == "batch_done":
                    self.status_label.setText("Batch Operations Cycle Concluded Successfully")
                    self.progress_bar.setValue(100)
                    self.download_btn.setEnabled(True)
                    QMessageBox.information(self, "Automation Finalized", str(data))
        except queue.Empty:
            pass


if __name__ == "__main__":
    from PyQt6.QtWidgets import QApplication, QMainWindow

    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    window = QMainWindow()
    tab = YouTubeTab()
    window.setCentralWidget(tab)
    window.setWindowTitle("Module Sandbox Window")
    window.setStyleSheet("background-color: #0f1117;")
    window.resize(650, 650)
    window.show()
    sys.exit(app.exec())