import csv
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import imagehash
from PIL import Image
from pymediainfo import MediaInfo
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap
from PyQt6.QtWidgets import (
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,  # Added for safety confirmation dialog
    QProgressBar,
    QPushButton,
    QScrollArea,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

# Configuration Constants
VIDEO_EXTENSIONS = (".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv", ".m4v")
DURATION_TOLERANCE_MS = 1000
HASH_THRESHOLD = 12
SAMPLE_POINTS = [0.1, 0.3, 0.5, 0.7, 0.9]


class ScanWorker(QThread):
    """Asynchronous background worker to scan directory and process files without freezing the UI."""

    progress_changed = pyqtSignal(int)
    status_updated = pyqtSignal(str)
    log_updated = pyqtSignal(str, str)  # Message, Type ('info', 'error')
    scan_completed = pyqtSignal(list)

    def __init__(self, folder_path: str) -> None:
        super().__init__()
        self.folder_path = Path(folder_path)

    def run(self) -> None:
        videos: List[Dict[str, Any]] = []
        self.status_updated.emit("Gathering file list...")

        # 1. Collect all valid video paths using modern pathlib implementation
        try:
            file_paths = [
                p
                for p in self.folder_path.rglob("*")
                if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS
            ]
        except Exception as e:
            self.log_updated.emit(f"Error accessing target directory: {e}", "error")
            self.scan_completed.emit([])
            return

        total_files = len(file_paths)
        if total_files == 0:
            self.status_updated.emit("No video files found.")
            self.scan_completed.emit([])
            return

        # 2. Process each file matching video criterion
        for idx, path in enumerate(file_paths):
            filename = path.name
            self.status_updated.emit(f"Scanning: {filename}")
            self.log_updated.emit(f"Processing: {path}", "info")

            meta = self.get_metadata(path)
            if meta is None:
                self.log_updated.emit(
                    f"[ERROR/CORRUPTED] Could not parse media metadata for: {path}",
                    "error",
                )
                self.progress_changed.emit(int(((idx + 1) / total_files) * 100))
                continue

            hashes, thumb = self.extract_hashes_and_thumbnail(path)
            if not hashes:
                self.log_updated.emit(
                    f"[WARN/CORRUPTED] OpenCV failed to extract frames/stream packets from: {path}",
                    "error",
                )
                self.progress_changed.emit(int(((idx + 1) / total_files) * 100))
                continue

            meta["hashes"] = hashes
            meta["thumb_img"] = thumb
            videos.append(meta)

            # Update progress percentage
            self.progress_changed.emit(int(((idx + 1) / total_files) * 100))

        self.status_updated.emit("Scan process completed.")
        self.scan_completed.emit(videos)

    def get_metadata(self, path: Path) -> Optional[Dict[str, Any]]:
        try:
            media = MediaInfo.parse(str(path))
            duration: Optional[int] = None
            width: Optional[int] = None
            height: Optional[int] = None

            for track in media.tracks:
                if track.track_type == "Video":
                    duration = (
                        int(float(track.duration)) if track.duration else None
                    )
                    width = track.width
                    height = track.height
                    break

            if duration is None:
                return None

            return {
                "path": str(path),
                "filename": path.name,
                "duration": duration,
                "width": width,
                "height": height,
                "size": path.stat().st_size,
            }
        except Exception:
            return None

    def extract_hashes_and_thumbnail(
            self, video_path: Path
    ) -> Tuple[List[imagehash.ImageHash], Optional[Any]]:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return [], None

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            return [], None

        hashes: List[imagehash.ImageHash] = []
        middle_frame_img: Optional[Any] = None
        middle_index = len(SAMPLE_POINTS) // 2

        for idx, p in enumerate(SAMPLE_POINTS):
            frame_no = int(total_frames * p)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
            ok, frame = cap.read()

            if ok:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                img = Image.fromarray(frame_rgb)
                hashes.append(imagehash.phash(img))

                if idx == middle_index:
                    middle_frame_img = (
                        frame_rgb  # Save raw RGB ndarray for PyQt performance
                    )

        cap.release()
        return hashes, middle_frame_img


class DuplicateFinderTab(QWidget):
    """PyQt6 Tab UI component containing folder selections, visual bars, live processing info and outputs."""

    def __init__(self) -> None:
        super().__init__()
        self.worker: Optional[ScanWorker] = None
        self.init_ui()

    def init_ui(self) -> None:
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(12)

        # Folder Chooser Header Block
        dir_layout = QHBoxLayout()
        self.lbl_path = QLabel("No target directory chosen.")
        self.lbl_path.setStyleSheet("color: #aaa; font-style: italic;")

        btn_browse = QPushButton("📁 Choose Folder")
        btn_browse.clicked.connect(self.browse_folder)

        self.btn_scan = QPushButton("🔍 Start Scan")
        self.btn_scan.setEnabled(False)
        self.btn_scan.clicked.connect(self.start_scan)

        dir_layout.addWidget(btn_browse)
        dir_layout.addWidget(self.lbl_path, 1)
        dir_layout.addWidget(self.btn_scan)
        main_layout.addLayout(dir_layout)

        # Progress elements
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.lbl_status = QLabel("Idle")
        self.lbl_status.setStyleSheet("font-weight: bold; color: #5294e2;")

        main_layout.addWidget(self.lbl_status)
        main_layout.addWidget(self.progress_bar)

        # Logs Console
        main_layout.addWidget(
            QLabel("Live System Scan Console & Detected File Failures:")
        )
        self.console_output = QTextEdit()
        self.console_output.setReadOnly(True)
        self.console_output.setAcceptRichText(True)
        self.console_output.setPlaceholderText(
            "Logs will report processing files and flag damaged/corrupted files explicitly here..."
        )
        self.console_output.setMaximumHeight(130)
        main_layout.addWidget(self.console_output)

        # Visual Report Canvas container
        main_layout.addWidget(QLabel("Duplicate Clusters Visual Report Area:"))
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet(
            "background-color: #1c1d20; border: 1px solid #444; border-radius: 6px;"
        )

        self.report_container = QWidget()
        self.report_layout = QVBoxLayout(self.report_container)
        self.report_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll_area.setWidget(self.report_container)
        main_layout.addWidget(self.scroll_area)

    def browse_folder(self) -> None:
        folder = QFileDialog.getExistingDirectory(
            self, "Select Target Folder to Scan"
        )
        if folder:
            self.lbl_path.setText(folder)
            self.btn_scan.setEnabled(True)

    def start_scan(self) -> None:
        folder_str = self.lbl_path.text()
        if not Path(folder_str).exists():
            return

        # UI reset
        self.btn_scan.setEnabled(False)
        self.progress_bar.setValue(0)
        self.console_output.clear()

        # Clear old items out of layout
        while self.report_layout.count():
            child = self.report_layout.takeAt(0)
            if child and child.widget():
                child.widget().deleteLater()

        # Spin Thread
        self.worker = ScanWorker(folder_str)
        self.worker.progress_changed.connect(self.progress_bar.setValue)
        self.worker.status_updated.connect(self.lbl_status.setText)
        self.worker.log_updated.connect(self.append_log)
        self.worker.scan_completed.connect(self.process_results)
        self.worker.start()

    def append_log(self, msg: str, msg_type: str) -> None:
        if msg_type == "error":
            html = (
                f'<span style="color: #ff6b6b; font-weight: bold;">{msg}</span>'
            )
        else:
            html = f'<span style="color: #ccc;">{msg}</span>'
        self.console_output.append(html)

    def process_results(self, videos: List[Dict[str, Any]]) -> None:
        self.btn_scan.setEnabled(True)
        if not videos:
            self.lbl_status.setText("Scan processed 0 valid records.")
            return

        groups = self.group_similar_videos(videos)
        self.save_csv_report(groups)
        self.populate_visual_report(groups)

    def average_hash_distance(
            self, h1: List[imagehash.ImageHash], h2: List[imagehash.ImageHash]
    ) -> float:
        n = min(len(h1), len(h2))
        if n == 0:
            return 999.0
        return sum(a - b for a, b in zip(h1, h2)) / n

    def group_similar_videos(
            self, videos: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        n = len(videos)
        adj: Dict[int, List[int]] = {i: [] for i in range(n)}

        for i in range(n):
            for j in range(i + 1, n):
                v1, v2 = videos[i], videos[j]
                if (
                        abs(v1["duration"] - v2["duration"])
                        > DURATION_TOLERANCE_MS
                ):
                    continue
                if (
                        self.average_hash_distance(v1["hashes"], v2["hashes"])
                        <= HASH_THRESHOLD
                ):
                    adj[i].append(j)
                    adj[j].append(i)

        visited = set()
        groups = []
        for i in range(n):
            if i not in visited:
                component = []
                queue = [i]
                visited.add(i)
                while queue:
                    curr = queue.pop(0)
                    component.append(videos[curr])
                    for neighbor in adj[curr]:
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)
                if len(component) > 1:
                    groups.append(component)
        return groups

    def save_csv_report(self, groups: List[List[Dict[str, Any]]]) -> None:
        csv_path = Path("video_similarity_report.csv")
        try:
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        "Group ID",
                        "Filename",
                        "Resolution",
                        "Duration (ms)",
                        "Size (Bytes)",
                        "Full Path",
                    ]
                )
                for idx, group in enumerate(groups, start=1):
                    for video in group:
                        writer.writerow(
                            [
                                f"Group {idx}",
                                video["filename"],
                                f'{video["width"]}x{video["height"]}',
                                video["duration"],
                                video["size"],
                                video["path"],
                            ]
                        )
            self.append_log(
                f"<br><b>Report saved safely to spreadsheet file:</b> {csv_path.resolve()}",
                "info",
            )
        except Exception as e:
            self.append_log(
                f"Failed to generate CSV export details: {str(e)}", "error"
            )

    def populate_visual_report(
            self, groups: List[List[Dict[str, Any]]]
    ) -> None:
        if not groups:
            no_lbl = QLabel(
                "No duplicates discovered inside selection context."
            )
            no_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.report_layout.addWidget(no_lbl)
            return

        self.lbl_status.setText(
            f"Clusters processed! Found {len(groups)} duplication matches."
        )

        for idx, group in enumerate(groups, start=1):
            group_box = QFrame()
            group_box.setStyleSheet(
                "background-color: #2d2f31; border: 1px solid #555; border-radius: 6px; margin-bottom: 10px;"
            )
            # Track how many active items are inside this cluster
            group_box.setProperty("item_count", len(group))
            box_layout = QVBoxLayout(group_box)

            title_lbl = QLabel(
                f"📦 Group Cluster #{idx} ({len(group)} Duplicate Items Matches)"
            )
            title_lbl.setStyleSheet(
                "font-weight: bold; color: #5294e2; font-size: 14px; border: none;"
            )
            box_layout.addWidget(title_lbl)

            for item_idx, video in enumerate(group):
                item_widget = QWidget()
                item_widget.setStyleSheet(
                    "border: none; background: transparent;"
                )
                item_layout = QHBoxLayout(item_widget)
                item_layout.setContentsMargins(5, 5, 5, 5)

                # Thumbnail Layout Configuration
                lbl_thumb = QLabel()
                lbl_thumb.setFixedSize(110, 70)
                lbl_thumb.setStyleSheet(
                    "background-color: #141516; border: 1px solid #444;"
                )
                lbl_thumb.setAlignment(Qt.AlignmentFlag.AlignCenter)

                if video.get("thumb_img") is not None:
                    rgb_frame = video["thumb_img"]
                    h, w, ch = rgb_frame.shape
                    bytes_per_line = ch * w
                    q_img = QImage(
                        rgb_frame.data,
                        w,
                        h,
                        bytes_per_line,
                        QImage.Format.Format_RGB888,
                    )
                    pixmap = QPixmap.fromImage(q_img).scaled(
                        110,
                        70,
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation,
                    )
                    lbl_thumb.setPixmap(pixmap)
                else:
                    lbl_thumb.setText("No Preview")
                    lbl_thumb.setStyleSheet("color: #777; font-size: 10px;")

                path_str = video["path"]
                file_url = Path(path_str).as_uri()

                dur_sec = round(video["duration"] / 1000, 1)
                size_mb = round(video["size"] / (1024 * 1024), 2)
                meta_text = (
                    f"<b>File:</b> {video['filename']}<br>"
                    f"<small style='color:#bbb;'>"
                    f"Res: {video['width']}x{video['height']} | "
                    f"Length: {dur_sec}s | Size: {size_mb} MB"
                    f"</small><br>"
                    f"<span style='color:#8ab4f8; font-size:11px;'>"
                    f"Path: <a href='{file_url}' style='color:#8ab4f8; text-decoration:none;'>"
                    f"{path_str}"
                    f"</a></span>"
                )

                lbl_desc = QLabel(meta_text)
                lbl_desc.setWordWrap(True)
                lbl_desc.setTextFormat(Qt.TextFormat.RichText)
                lbl_desc.setTextInteractionFlags(
                    Qt.TextInteractionFlag.TextBrowserInteraction
                )
                lbl_desc.setOpenExternalLinks(True)

                # Create the Structural Separator Frame Early so we can hand it to the delete action
                sep = None
                if item_idx < len(group) - 1:
                    sep = QFrame()
                    sep.setFrameShape(QFrame.Shape.HLine)
                    sep.setStyleSheet(
                        "background-color: #444; max-height: 1px; border: none;"
                    )

                # Modern Destructive Delete Button Formulation
                btn_delete = QPushButton("🗑️ Delete")
                btn_delete.setFixedWidth(85)
                btn_delete.setStyleSheet("""
                    QPushButton {
                        background-color: #cf6679;
                        color: #121212;
                        font-weight: bold;
                        border-radius: 4px;
                        padding: 6px;
                        border: none;
                    }
                    QPushButton:hover {
                        background-color: #b05464;
                        color: #ffffff;
                    }
                """)

                # Connecting clicked signature using default argument lambda encapsulation to dodge closures trap
                btn_delete.clicked.connect(
                    lambda checked, p=path_str, iw=item_widget, gb=group_box, sw=sep:
                    self.delete_file(p, iw, gb, sw)
                )

                item_layout.addWidget(lbl_thumb)
                item_layout.addWidget(lbl_desc, 1)
                item_layout.addWidget(btn_delete)
                box_layout.addWidget(item_widget)

                if sep is not None:
                    box_layout.addWidget(sep)

            self.report_layout.addWidget(group_box)

    def delete_file(
            self, path_str: str, item_widget: QWidget, group_box: QFrame, sep_widget: Optional[QFrame]
    ) -> None:
        """Physically deletes the target file from the drive and updates the interface layouts."""
        target_path = Path(path_str)

        # 1. Ask user confirmation before hard system unlinking
        reply = QMessageBox.question(
            self,
            "Confirm File Deletion",
            f"Are you sure you want to permanently delete this file from your disk?\n\n{target_path.name}",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )

        if reply != QMessageBox.StandardButton.Yes:
            return

        # 2. Try to eliminate the item from the host filesystem
        try:
            if target_path.exists():
                target_path.unlink()
                self.append_log(f"Successfully deleted from disk: {target_path.name}", "info")
            else:
                self.append_log(f"File already missing on disk: {path_str}", "error")
        except Exception as e:
            QMessageBox.critical(
                self, "Deletion Failure", f"An error occurred while unlinking the file:\n{str(e)}"
            )
            self.append_log(f"Failed to delete {target_path.name}: {str(e)}", "error")
            return

        # 3. Clean up the row and separator elements out of the GUI layout tree
        item_widget.deleteLater()
        if sep_widget is not None:
            sep_widget.deleteLater()

        # 4. If only 1 file is left in this cluster, it is no longer a duplicate group. Clear it entirely.
        current_count = group_box.property("item_count") - 1
        group_box.setProperty("item_count", current_count)

        if current_count <= 1:
            group_box.deleteLater()