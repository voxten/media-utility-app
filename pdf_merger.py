from pathlib import Path
from typing import Callable, List, Optional

from pypdf import PdfWriter
from PyQt6.QtCore import QEasingCurve, QPropertyAnimation, Qt
from PyQt6.QtGui import QDragEnterEvent, QDropEvent, QImage, QPixmap
from PyQt6.QtWidgets import (
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

# Safe Dynamic Thumbnail Import System
try:
    from pdf2image import convert_from_path

    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False


class FileCard(QFrame):
    """A beautiful interactive card representing a PDF file in the queue."""

    def __init__(
            self,
            file_path: Path,
            on_remove_callback: Callable[["FileCard"], None],
            parent: Optional[QWidget] = None,
    ) -> None:
        super().__init__(parent)
        self.file_path = file_path
        self.on_remove = on_remove_callback
        self.init_ui()
        self.animate_entry()

    def init_ui(self) -> None:
        # FIX 2: Set a fixed height to prevent the card from expanding into a giant box
        self.setFixedHeight(90)

        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setObjectName("FileCard")
        self.setStyleSheet("""
            QFrame#FileCard {
                background-color: #2d2f31;
                border: 1px solid #444;
                border-radius: 10px;
            }
            QFrame#FileCard:hover {
                border: 1px solid #5294e2;
                background-color: #333639;
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(15, 8, 15, 8)
        layout.setSpacing(15)

        # Thumbnail Previews Container
        self.thumb_label = QLabel()
        self.thumb_label.setFixedSize(55, 72)
        self.thumb_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.thumb_label.setStyleSheet(
            "background-color: #1e1f21; border-radius: 4px;"
        )
        self.load_thumbnail()
        layout.addWidget(self.thumb_label)

        # Metadata Layout Architecture
        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)
        info_layout.setAlignment(Qt.AlignmentFlag.AlignVCenter)

        filename_label = QLabel(self.file_path.name)
        filename_label.setStyleSheet(
            "font-weight: bold; color: #fff; font-size: 14px;"
        )

        try:
            size_mb = self.file_path.stat().st_size / (1024 * 1024)
            size_str = f"{size_mb:.2f} MB"
        except OSError:
            size_str = "Unknown size"

        path_label = QLabel(size_str)
        path_label.setStyleSheet("color: #8a8d90; font-size: 12px;")

        info_layout.addWidget(filename_label)
        info_layout.addWidget(path_label)
        layout.addLayout(info_layout, stretch=1)

        # FIX 3: Replaced the hidden '✕' with a highly visible, styled Delete button
        self.remove_btn = QPushButton("X")
        self.remove_btn.setFixedSize(85, 32)
        self.remove_btn.setStyleSheet("""
            QPushButton {
                background-color: #3a3d40;
                border: 1px solid #484b4d;
                color: #ff5c5c;
                font-size: 12px;
                font-weight: bold;
                border-radius: 6px;
            }
            QPushButton:hover {
                background-color: #e81123;
                color: white;
                border: 1px solid #e81123;
            }
        """)
        self.remove_btn.clicked.connect(lambda: self.on_remove(self))
        layout.addWidget(self.remove_btn)

    def load_thumbnail(self) -> None:
        """Generates a crisp live preview thumbnail or slides in a clean fallback icon."""
        if HAS_PDF2IMAGE:
            try:
                images = convert_from_path(
                    str(self.file_path),
                    first_page=1,
                    last_page=1,
                    size=(55, 72),
                )
                if images:
                    img = images[0].convert("RGBA")
                    data = img.tobytes("raw", "RGBA")

                    # FIX 1: Added .copy() here so Python doesn't wipe the image data out of memory
                    qimg = QImage(
                        data,
                        img.size[0],
                        img.size[1],
                        QImage.Format.Format_RGBA8888,
                    ).copy()

                    pixmap = QPixmap.fromImage(qimg)
                    self.thumb_label.setPixmap(pixmap)
                    return
            except Exception:
                pass

        # Clean Fallback Graphic (Removed non-functional CSS 'text-align')
        self.thumb_label.setText("📄\nPDF")
        self.thumb_label.setStyleSheet("""
            color: #5294e2; 
            font-weight: bold; 
            font-size: 11px; 
            background-color: #242526;
            border: 1px dashed #444;
            border-radius: 4px;
        """)

    def animate_entry(self) -> None:
        """Smoothly scale or fade elements dynamically upon generation."""
        self.anim = QPropertyAnimation(self, b"windowOpacity")
        self.anim.setDuration(250)
        self.anim.setStartValue(0.0)
        self.anim.setEndValue(1.0)
        self.anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self.anim.start()


class PDFMergerTab(QWidget):
    """PyQt6 Tab UI component managing file list processing queues, layout states, and pdf outputs."""

    def __init__(self) -> None:
        super().__init__()
        self.file_queue: List[FileCard] = []
        self.setAcceptDrops(True)
        self.init_ui()

    def init_ui(self) -> None:
        main_layout = QVBoxLayout(self)
        main_layout.setSpacing(20)
        main_layout.setContentsMargins(25, 25, 25, 25)

        # Header Control Strip Section
        header_layout = QHBoxLayout()
        title_label = QLabel("📄 Advanced PDF Merger")
        title_label.setStyleSheet(
            "font-size: 20px; font-weight: bold; color: #5294e2;"
        )
        header_layout.addWidget(title_label)

        self.clear_all_btn = QPushButton("Clear Queue")
        self.clear_all_btn.setStyleSheet(
            "background-color: #2d2f31; color: #ff5c5c; border: 1px solid #444;"
        )
        self.clear_all_btn.clicked.connect(self.clear_queue)
        self.clear_all_btn.setVisible(False)
        header_layout.addStretch()
        header_layout.addWidget(self.clear_all_btn)
        main_layout.addLayout(header_layout)

        # Interactive Drag and Drop Target Area Box
        self.drop_zone = QFrame()
        self.drop_zone.setObjectName("DropZone")
        self.drop_zone.setStyleSheet("""
            QFrame#DropZone {
                border: 2px dashed #5294e2;
                border-radius: 12px;
                background-color: #1e1f21;
            }
        """)
        drop_layout = QVBoxLayout(self.drop_zone)
        drop_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.drop_icon = QLabel("📥")
        self.drop_icon.setStyleSheet("font-size: 48px;")
        self.drop_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.drop_text = QLabel(
            "Drag & Drop PDF files here\nor click the browse button below"
        )
        self.drop_text.setStyleSheet(
            "color: #a0a3a6; font-size: 14px; line-height: 1.5;"
        )
        self.drop_text.setAlignment(Qt.AlignmentFlag.AlignCenter)

        drop_layout.addWidget(self.drop_icon)
        drop_layout.addWidget(self.drop_text)
        main_layout.addWidget(self.drop_zone, stretch=2)

        # Processing Queue Viewer Interface Container
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("border: none; background: transparent;")

        self.queue_widget = QWidget()
        self.queue_widget.setStyleSheet("background: transparent;")
        self.queue_layout = QVBoxLayout(self.queue_widget)
        self.queue_layout.setContentsMargins(0, 0, 0, 0)
        self.queue_layout.setSpacing(10)
        self.queue_layout.addStretch()

        self.scroll_area.setWidget(self.queue_widget)
        main_layout.addWidget(self.scroll_area, stretch=4)
        self.scroll_area.setVisible(False)

        # Base Interface Actions Ribbon Toolbar
        action_layout = QHBoxLayout()

        self.add_files_btn = QPushButton("+ Add PDF Documents")
        self.add_files_btn.clicked.connect(self.browse_files)

        self.merge_btn = QPushButton("⚡ Merge Into One")
        self.merge_btn.setStyleSheet("""
            QPushButton {
                background-color: #5294e2;
                color: white;
                font-weight: bold;
                padding: 8px 20px;
            }
            QPushButton:hover { background-color: #4382cf; }
            QPushButton:disabled { background-color: #2d2f31; color: #666; border: 1px solid #333; }
        """)
        self.merge_btn.setEnabled(False)
        self.merge_btn.clicked.connect(self.process_merge)

        action_layout.addWidget(self.add_files_btn)
        action_layout.addStretch()
        action_layout.addWidget(self.merge_btn)
        main_layout.addLayout(action_layout)

    # --- Drag and Drop Events Handling ---
    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.drop_zone.setStyleSheet(
                "QFrame#DropZone { border: 2px solid #5294e2; background-color: #252a30; }"
            )

    def leaveEvent(self, event: Optional[object]) -> None:
        self.drop_zone.setStyleSheet(
            "QFrame#DropZone { border: 2px dashed #5294e2; background-color: #1e1f21; }"
        )

    def dropEvent(self, event: QDropEvent) -> None:
        self.drop_zone.setStyleSheet(
            "QFrame#DropZone { border: 2px dashed #5294e2; background-color: #1e1f21; }"
        )
        if event.mimeData().hasUrls():
            for url in event.mimeData().urls():
                path = Path(url.toLocalFile())
                if path.suffix.lower() == ".pdf":
                    self.add_file_to_queue(path)

    # --- Queue Pipeline Mechanics ---
    def browse_files(self) -> None:
        files, _ = QFileDialog.getOpenFileNames(
            self, "Select PDF Files", "", "PDF Files (*.pdf)"
        )
        for file_path in files:
            self.add_file_to_queue(Path(file_path))

    def add_file_to_queue(self, path: Path) -> None:
        if any(card.file_path == path for card in self.file_queue):
            return

        card = FileCard(path, on_remove_callback=self.remove_file_from_queue)
        self.queue_layout.insertWidget(self.queue_layout.count() - 1, card)
        self.file_queue.append(card)
        self.update_ui_state()

    def remove_file_from_queue(self, card: FileCard) -> None:
        if card in self.file_queue:
            self.file_queue.remove(card)
            card.deleteLater()
            self.update_ui_state()

    def clear_queue(self) -> None:
        for card in list(self.file_queue):
            self.remove_file_from_queue(card)

    def update_ui_state(self) -> None:
        """Toggles layouts state visibility intelligently depending on queue count."""
        has_items = len(self.file_queue) > 0
        self.scroll_area.setVisible(has_items)
        self.clear_all_btn.setVisible(has_items)
        self.merge_btn.setEnabled(len(self.file_queue) >= 2)

        if has_items:
            self.drop_icon.setStyleSheet("font-size: 24px;")
            self.drop_text.setText(
                "Drop more files to append to target list items queue sequence chain."
            )
            self.drop_zone.setMaximumHeight(90)
        else:
            self.drop_icon.setStyleSheet("font-size: 48px;")
            self.drop_text.setText(
                "Drag & Drop PDF files here\nor click the browse button below"
            )
            self.drop_zone.setMaximumHeight(16777215)

    # --- Pipeline Processing Backend ---
    def process_merge(self) -> None:
        if len(self.file_queue) < 2:
            return

        out_path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Merged PDF Output",
            "merged_document.pdf",
            "PDF Files (*.pdf)",
        )
        if not out_path:
            return

        out_path_obj = Path(out_path)
        writer = PdfWriter()

        try:
            for card in self.file_queue:
                writer.append(str(card.file_path))

            with open(out_path_obj, "wb") as f_out:
                writer.write(f_out)

            QMessageBox.information(
                self,
                "Success",
                f"Successfully merged {len(self.file_queue)} PDFs into target output file directory location!",
            )
            self.clear_queue()

        except Exception as e:
            QMessageBox.critical(
                self,
                "Execution Error Failed",
                f"An error occurred while blending your elements:\n{e}",
            )
        finally:
            writer.close()