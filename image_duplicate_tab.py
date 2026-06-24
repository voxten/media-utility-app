import csv
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import imagehash
from PIL import Image
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

# Configuration Constants
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".gif")
HASH_THRESHOLD = 12  # Hamming distance threshold for perceptual similarity


class ImageScanWorker(QThread):
    """Asynchronous background worker to scan directory and process images without freezing the UI."""

    progress_changed = pyqtSignal(int)
    status_updated = pyqtSignal(str)
    log_updated = pyqtSignal(str, str)  # Message, Type ('info', 'error')
    scan_completed = pyqtSignal(list)

    def __init__(self, folder_path: str) -> None:
        super().__init__()
        self.folder_path = Path(folder_path)

    def run(self) -> None:
        images: List[Dict[str, Any]] = []
        self.status_updated.emit("Gathering file list...")

        try:
            file_paths = [
                p
                for p in self.folder_path.rglob("*")
                if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
            ]
        except Exception as e:
            self.log_updated.emit(f"Error accessing target directory: {e}", "error")
            self.scan_completed.emit([])
            return

        total_files = len(file_paths)
        if total_files == 0:
            self.status_updated.emit("No image files found.")
            self.scan_completed.emit([])
            return

        for idx, path in enumerate(file_paths):
            filename = path.name
            self.status_updated.emit(f"Scanning: {filename}")
            self.log_updated.emit(f"Processing: {path}", "info")

            # Extract data using memory-efficient reading
            meta = self.process_image_file(path)
            if meta is None:
                self.log_updated.emit(
                    f"[ERROR/CORRUPTED] Could not parse or decode image: {path}",
                    "error",
                )
                self.progress_changed.emit(int(((idx + 1) / total_files) * 100))
                continue

            images.append(meta)
            self.progress_changed.emit(int(((idx + 1) / total_files) * 100))

        self.status_updated.emit("Scan process completed.")
        self.scan_completed.emit(images)

    def process_image_file(self, path: Path) -> Optional[Dict[str, Any]]:
        try:
            # Use OpenCV for fast decoding and direct compatibility with your UI pipeline
            frame = cv2.imread(str(path))
            if frame is None:
                return None

            height, width, ch = frame.shape
            file_size = path.stat().st_size

            # Convert BGR to RGB for PIL hashing and UI display
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(frame_rgb)
            img_hash = imagehash.phash(pil_img)

            # Generate lightweight downsampled thumbnail to avoid UI thread lag
            thumb_img = cv2.resize(frame_rgb, (110, 70), interpolation=cv2.INTER_AREA)

            return {
                "path": str(path),
                "filename": path.name,
                "width": width,
                "height": height,
                "size": file_size,
                "hash": img_hash,
                "thumb_img": thumb_img,
            }
        except Exception:
            return None


class ImageDuplicateFinderTab(QWidget):
    """PyQt6 Tab UI component containing folder selections, visual bars, live processing info and image outputs."""

    def __init__(self) -> None:
        super().__init__()
        self.worker: Optional[ImageScanWorker] = None
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
            "Logs will report processing files and flag damaged/corrupted images explicitly here..."
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

        self.btn_scan.setEnabled(False)
        self.progress_bar.setValue(0)
        self.console_output.clear()

        while self.report_layout.count():
            child = self.report_layout.takeAt(0)
            if child and child.widget():
                child.widget().deleteLater()

        self.worker = ImageScanWorker(folder_str)
        self.worker.progress_changed.connect(self.progress_bar.setValue)
        self.worker.status_updated.connect(self.lbl_status.setText)
        self.worker.log_updated.connect(self.append_log)
        self.worker.scan_completed.connect(self.process_results)
        self.worker.start()

    def append_log(self, msg: str, msg_type: str) -> None:
        if msg_type == "error":
            html = f'<span style="color: #ff6b6b; font-weight: bold;">{msg}</span>'
        else:
            html = f'<span style="color: #ccc;">{msg}</span>'
        self.console_output.append(html)

    def process_results(self, images: List[Dict[str, Any]]) -> None:
        self.btn_scan.setEnabled(True)
        if not images:
            self.lbl_status.setText("Scan processed 0 valid records.")
            return

        groups = self.group_similar_images(images)
        self.save_csv_report(groups)
        self.populate_visual_report(groups)

    def group_similar_images(
            self, images: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        n = len(images)
        adj: Dict[int, List[int]] = {i: [] for i in range(n)}

        # Build adjacency graph based on structural hamming distance metric
        for i in range(n):
            for j in range(i + 1, n):
                img1, img2 = images[i], images[j]

                # Compare perceptual hashes directly via subtraction override
                if (img1["hash"] - img2["hash"]) <= HASH_THRESHOLD:
                    adj[i].append(j)
                    adj[j].append(i)

        # Breadth-first search grouping for connected components identification
        visited = set()
        groups = []
        for i in range(n):
            if i not in visited:
                component = []
                queue = [i]
                visited.add(i)
                while queue:
                    curr = queue.pop(0)
                    component.append(images[curr])
                    for neighbor in adj[curr]:
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)
                if len(component) > 1:
                    groups.append(component)
        return groups

    def save_csv_report(self, groups: List[List[Dict[str, Any]]]) -> None:
        csv_path = Path("image_similarity_report.csv")
        try:
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        "Group ID",
                        "Filename",
                        "Resolution",
                        "Size (Bytes)",
                        "Full Path",
                    ]
                )
                for idx, group in enumerate(groups, start=1):
                    for img in group:
                        writer.writerow(
                            [
                                f"Group {idx}",
                                img["filename"],
                                f'{img["width"]}x{img["height"]}',
                                img["size"],
                                img["path"],
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

    def populate_visual_report(self, groups: List[List[Dict[str, Any]]]) -> None:
        if not groups:
            no_lbl = QLabel("No image duplicates discovered inside selection context.")
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
            group_box.setProperty("item_count", len(group))
            box_layout = QVBoxLayout(group_box)

            title_lbl = QLabel(
                f"📦 Group Cluster #{idx} ({len(group)} Duplicate Items Matches)"
            )
            title_lbl.setStyleSheet(
                "font-weight: bold; color: #5294e2; font-size: 14px; border: none;"
            )
            box_layout.addWidget(title_lbl)

            for item_idx, img_data in enumerate(group):
                item_widget = QWidget()
                item_widget.setStyleSheet("border: none; background: transparent;")
                item_layout = QHBoxLayout(item_widget)
                item_layout.setContentsMargins(5, 5, 5, 5)

                lbl_thumb = QLabel()
                lbl_thumb.setFixedSize(110, 70)
                lbl_thumb.setStyleSheet(
                    "background-color: #141516; border: 1px solid #444;"
                )
                lbl_thumb.setAlignment(Qt.AlignmentFlag.AlignCenter)

                if img_data.get("thumb_img") is not None:
                    rgb_frame = img_data["thumb_img"]
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

                path_str = img_data["path"]
                file_url = Path(path_str).as_uri()
                size_mb = round(img_data["size"] / (1024 * 1024), 2)

                meta_text = (
                    f"<b>File:</b> {img_data['filename']}<br>"
                    f"<small style='color:#bbb;'>"
                    f"Res: {img_data['width']}x{img_data['height']} | Size: {size_mb} MB"
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

                sep = None
                if item_idx < len(group) - 1:
                    sep = QFrame()
                    sep.setFrameShape(QFrame.Shape.HLine)
                    sep.setStyleSheet(
                        "background-color: #444; max-height: 1px; border: none;"
                    )

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
            self,
            path_str: str,
            item_widget: QWidget,
            group_box: QFrame,
            sep_widget: Optional[QFrame],
    ) -> None:
        target_path = Path(path_str)

        reply = QMessageBox.question(
            self,
            "Confirm File Deletion",
            f"Are you sure you want to permanently delete this image from your disk?\n\n{target_path.name}",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )

        if reply != QMessageBox.StandardButton.Yes:
            return

        try:
            if target_path.exists():
                target_path.unlink()
                self.append_log(
                    f"Successfully deleted from disk: {target_path.name}", "info"
                )
            else:
                self.append_log(f"File already missing on disk: {path_str}", "error")
        except Exception as e:
            QMessageBox.critical(
                self,
                "Deletion Failure",
                f"An error occurred while unlinking the file:\n{str(e)}",
            )
            self.append_log(f"Failed to delete {target_path.name}: {str(e)}", "error")
            return

        item_widget.deleteLater()
        if sep_widget is not None:
            sep_widget.deleteLater()

        current_count = group_box.property("item_count") - 1
        group_box.setProperty("item_count", current_count)

        if current_count <= 1:
            group_box.deleteLater()


# Execution verification entry point block
if __name__ == "__main__":
    import sys

    app = QApplication(sys.argv)
    # Basic application dark-palette configuration fallback
    app.setStyle("Fusion")
    window = ImageDuplicateFinderTab()
    window.resize(800, 600)
    window.show()
    sys.exit(app.exec())