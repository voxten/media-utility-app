from pathlib import Path
from typing import List, Optional

import fitz  # PyMuPDF
from PyQt6.QtCore import QMimeData, Qt
from PyQt6.QtGui import QAction, QDrag, QDragEnterEvent, QDropEvent, QImage, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)


class PageCard(QFrame):
    """A large, interactive page preview card that handles individual actions and drag-reordering."""

    def __init__(
            self,
            file_path: Path,
            page_num: int,
            parent_tab: "PDFMergerTab",
            parent: Optional[QWidget] = None,
    ) -> None:
        super().__init__(parent)
        self.file_path = file_path
        self.page_num = page_num
        self.parent_tab = parent_tab
        self.drag_start_position = None

        self.init_ui()

    def init_ui(self) -> None:
        self.setFixedSize(170, 250)
        self.setAcceptDrops(True)
        self.setObjectName("PageCard")
        self.update_style(dragging=False)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        # Top Meta Info Label
        self.info_label = QLabel(f"{self.file_path.name[:14]}...\nP. {self.page_num + 1}")
        self.info_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.info_label.setStyleSheet("color: #a0a3a6; font-size: 11px; font-weight: bold;")
        layout.addWidget(self.info_label)

        # Big Page Thumbnail Display
        self.thumb_label = QLabel()
        self.thumb_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.thumb_label.setStyleSheet("background-color: #1e1f21; border-radius: 4px;")
        self.load_page_preview()
        layout.addWidget(self.thumb_label, stretch=1)

        # Individual Page Removal Button
        self.delete_btn = QPushButton("Delete Page")
        self.delete_btn.setStyleSheet("""
            QPushButton {
                background-color: #3a3d40;
                border: 1px solid #484b4d;
                color: #ff5c5c;
                font-size: 11px;
                font-weight: bold;
                border-radius: 4px;
                padding: 4px;
            }
            QPushButton:hover {
                background-color: #e81123;
                color: white;
                border: 1px solid #e81123;
            }
        """)
        self.delete_btn.clicked.connect(lambda: self.parent_tab.remove_page_card(self))
        layout.addWidget(self.delete_btn)

    def update_style(self, dragging: bool = False) -> None:
        if dragging:
            self.setStyleSheet("""
                QFrame#PageCard {
                    background-color: #252a30;
                    border: 2px dashed #5294e2;
                    border-radius: 8px;
                }
            """)
        else:
            self.setStyleSheet("""
                QFrame#PageCard {
                    background-color: #2d2f31;
                    border: 1px solid #444;
                    border-radius: 8px;
                }
                QFrame#PageCard:hover {
                    border: 1px solid #5294e2;
                    background-color: #333639;
                }
            """)

    def load_page_preview(self) -> None:
        """Uses PyMuPDF to extract and map a high-speed crisp preview image of the specific page."""
        try:
            doc = fitz.open(str(self.file_path))
            page = doc[self.page_num]

            # Use a transformation matrix to scale down for a fast, crisp target display
            matrix = fitz.Matrix(0.25, 0.25)
            pix = page.get_pixmap(matrix=matrix)

            # FIX: Changed 'pix.line_bytes' to 'pix.stride' and used 'pix.samples_mv' for robust buffer reading
            qimg = QImage(
                pix.samples_mv,
                pix.width,
                pix.height,
                pix.stride,
                QImage.Format.Format_RGB888
            ).copy()

            pixmap = QPixmap.fromImage(qimg)
            self.thumb_label.setPixmap(pixmap.scaled(
                150, 180,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation
            ))
            doc.close()
        except Exception as e:
            # Print to console for inner diagnostics if a file is corrupted
            print(f"Rendering exception encountered: {e}")
            self.thumb_label.setText("📄\nRender Err")
            self.thumb_label.setStyleSheet("color: #ff5c5c; font-weight: bold;")

    # --- Drag & Drop Reordering Framework ---
    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start_position = event.position().toPoint()
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event) -> None:
        if not (event.buttons() & Qt.MouseButton.LeftButton) or not self.drag_start_position:
            return
        if (event.position().toPoint() - self.drag_start_position).manhattanLength() < QApplication.startDragDistance():
            return

        drag = QDrag(self)
        mime_data = QMimeData()
        mime_data.setText(str(id(self)))
        drag.setMimeData(mime_data)

        pixmap = self.grab()
        drag.setPixmap(pixmap)
        drag.setHotSpot(event.position().toPoint())

        self.update_style(dragging=True)
        drag.exec(Qt.DropAction.MoveAction)
        self.update_style(dragging=False)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if event.mimeData().hasText():
            event.acceptProposedAction()
            self.setStyleSheet("QFrame#PageCard { border: 2px solid #5294e2; background-color: #333639; }")

    def dragLeaveEvent(self, event) -> None:
        self.update_style(dragging=False)

    def dropEvent(self, event: QDropEvent) -> None:
        self.update_style(dragging=False)
        source_id = event.mimeData().text()
        if source_id:
            self.parent_tab.handle_card_reorder(source_id, self)
            event.acceptProposedAction()


class PDFMergerTab(QWidget):
    """PyQt6 Tab UI component managing page collections, storyboard grids, and assembly pipelines."""

    def __init__(self) -> None:
        super().__init__()
        self.page_cards: List[PageCard] = []
        self.setAcceptDrops(True)
        self.init_ui()

    def init_ui(self) -> None:
        main_layout = QVBoxLayout(self)
        main_layout.setSpacing(20)
        main_layout.setContentsMargins(25, 25, 25, 25)

        # Header Section
        header_layout = QHBoxLayout()
        title_label = QLabel("📄 Advanced Visual PDF Builder")
        title_label.setStyleSheet("font-size: 20px; font-weight: bold; color: #5294e2;")
        header_layout.addWidget(title_label)

        self.clear_all_btn = QPushButton("Clear All Pages")
        self.clear_all_btn.setStyleSheet(
            "background-color: #2d2f31; color: #ff5c5c; border: 1px solid #444; padding: 5px 12px;")
        self.clear_all_btn.clicked.connect(self.clear_queue)
        self.clear_all_btn.setVisible(False)
        header_layout.addStretch()
        header_layout.addWidget(self.clear_all_btn)
        main_layout.addLayout(header_layout)

        # Dynamic Drop Zone Display Area
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
        self.drop_icon.setStyleSheet("font-size: 44px;")
        self.drop_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.drop_text = QLabel("Drag & Drop PDF files here\nor click the button below to add documents")
        self.drop_text.setStyleSheet("color: #a0a3a6; font-size: 14px; line-height: 1.4;")
        self.drop_text.setAlignment(Qt.AlignmentFlag.AlignCenter)

        drop_layout.addWidget(self.drop_icon)
        drop_layout.addWidget(self.drop_text)
        main_layout.addWidget(self.drop_zone, stretch=1)

        # Page Preview Gallery Grid
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("border: none; background: transparent;")

        self.grid_container = QWidget()
        self.grid_container.setStyleSheet("background: transparent;")
        self.grid_layout = QGridLayout(self.grid_container)
        self.grid_layout.setSpacing(15)
        self.grid_layout.setContentsMargins(0, 0, 0, 0)

        self.scroll_area.setWidget(self.grid_container)
        main_layout.addWidget(self.scroll_area, stretch=4)
        self.scroll_area.setVisible(False)

        # Lower Execution Toolbar Action System
        action_layout = QHBoxLayout()
        self.add_files_btn = QPushButton("+ Open PDF Documents")
        self.add_files_btn.setStyleSheet("padding: 8px 16px; font-weight: bold;")
        self.add_files_btn.clicked.connect(self.browse_files)

        self.merge_btn = QPushButton("⚡ Merge & Save Visual Order")
        self.merge_btn.setStyleSheet("""
            QPushButton {
                background-color: #5294e2;
                color: white;
                font-weight: bold;
                padding: 8px 24px;
                border-radius: 6px;
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

    # --- Drag & Drop Document Upload Handlers ---
    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.drop_zone.setStyleSheet("QFrame#DropZone { border: 2px solid #5294e2; background-color: #252a30; }")

    def leaveEvent(self, event) -> None:
        self.drop_zone.setStyleSheet("QFrame#DropZone { border: 2px dashed #5294e2; background-color: #1e1f21; }")

    def dropEvent(self, event: QDropEvent) -> None:
        self.drop_zone.setStyleSheet("QFrame#DropZone { border: 2px dashed #5294e2; background-color: #1e1f21; }")
        if event.mimeData().hasUrls():
            for url in event.mimeData().urls():
                path = Path(url.toLocalFile())
                if path.suffix.lower() == ".pdf":
                    self.add_file_to_queue(path)

    def browse_files(self) -> None:
        files, _ = QFileDialog.getOpenFileNames(self, "Select PDF Files", "", "PDF Files (*.pdf)")
        for file_path in files:
            self.add_file_to_queue(Path(file_path))

    # --- Core Pipeline Processing Engine ---
    def add_file_to_queue(self, path: Path) -> None:
        try:
            doc = fitz.open(str(path))
            page_count = len(doc)
            doc.close()

            for page_idx in range(page_count):
                card = PageCard(path, page_idx, self)
                self.page_cards.append(card)

            self.rebuild_grid_layout()
            self.update_ui_state()
        except Exception as e:
            QMessageBox.critical(self, "Read Error", f"Failed to analyze PDF pages:\n{e}")

    def remove_page_card(self, card: PageCard) -> None:
        if card in self.page_cards:
            self.page_cards.remove(card)
            card.deleteLater()
            self.rebuild_grid_layout()
            self.update_ui_state()

    def handle_card_reorder(self, source_id: str, target_card: PageCard) -> None:
        source_card = next((c for c in self.page_cards if str(id(c)) == source_id), None)
        if not source_card or source_card == target_card:
            return

        src_idx = self.page_cards.index(source_card)
        tgt_idx = self.page_cards.index(target_card)

        self.page_cards.insert(tgt_idx, self.page_cards.pop(src_idx))
        self.rebuild_grid_layout()

    def rebuild_grid_layout(self) -> None:
        for i in reversed(range(self.grid_layout.count())):
            item = self.grid_layout.itemAt(i)
            if item and item.widget():
                self.grid_layout.removeWidget(item.widget())

        columns_count = 4
        for index, card in enumerate(self.page_cards):
            row = index // columns_count
            col = index % columns_count
            self.grid_layout.addWidget(card, row, col)

    def clear_queue(self) -> None:
        for card in list(self.page_cards):
            card.deleteLater()
        self.page_cards.clear()
        self.update_ui_state()

    def update_ui_state(self) -> None:
        has_items = len(self.page_cards) > 0
        self.scroll_area.setVisible(has_items)
        self.clear_all_btn.setVisible(has_items)
        self.merge_btn.setEnabled(len(self.page_cards) >= 1)

        if has_items:
            self.drop_icon.setStyleSheet("font-size: 20px;")
            self.drop_text.setText("Drop more PDFs here to append more pages to the grid workspace.")
            self.drop_zone.setFixedHeight(75)
        else:
            self.drop_icon.setStyleSheet("font-size: 44px;")
            self.drop_text.setText("Drag & Drop PDF files here\nor click the button below to add documents")
            self.drop_zone.setMinimumHeight(120)
            self.drop_zone.setMaximumHeight(16777215)

    def process_merge(self) -> None:
        if not self.page_cards:
            return

        out_path, _ = QFileDialog.getSaveFileName(
            self, "Save Merged Output File", "custom_merged_document.pdf", "PDF Files (*.pdf)"
        )
        if not out_path:
            return

        try:
            output_doc = fitz.open()

            for card in self.page_cards:
                src_doc = fitz.open(str(card.file_path))
                output_doc.insert_pdf(src_doc, from_page=card.page_num, to_page=card.page_num)
                src_doc.close()

            output_doc.save(out_path)
            output_doc.close()

            QMessageBox.information(
                self, "Success",
                f"Successfully rendered and merged {len(self.page_cards)} pages into your target destination file!"
            )
            self.clear_queue()

        except Exception as e:
            QMessageBox.critical(self, "Merge Failed", f"An error occurred while compiling your target structure:\n{e}")