import csv
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSlider,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

SUPPORTED_FORMATS = ["PNG", "WEBP", "JPEG", "GIF", "TIFF", "BMP", "PDF"]


class ConvertWorker(QThread):
    """Background worker to handle batch image conversion sequentially without locking the UI."""

    progress_changed = pyqtSignal(int)
    status_updated = pyqtSignal(str)
    log_updated = pyqtSignal(str, str)  # Message, Type ('info', 'error')
    conversion_completed = pyqtSignal(int)

    def __init__(
        self,
        input_folder: str,
        output_folder: str,
        in_fmt: str,
        out_fmt: str,
        quality: int,
        method: int,
    ) -> None:
        super().__init__()
        self.input_folder = Path(input_folder)
        self.output_folder = Path(output_folder)
        self.in_fmt = in_fmt.lower()
        self.out_fmt = out_fmt.lower()
        self.quality = quality
        self.method = method

    def run(self) -> None:
        self.status_updated.emit("Scanning directory files...")

        try:
            # Gather valid matching files
            valid_extensions = {f".{self.in_fmt}"}
            if self.in_fmt == "jpeg":
                valid_extensions.add(".jpg")

            files_to_convert = [
                p
                for p in self.input_folder.iterdir()
                if p.is_file() and p.suffix.lower() in valid_extensions
            ]
        except Exception as e:
            self.log_updated.emit(f"Error accessing directory: {e}", "error")
            self.conversion_completed.emit(0)
            return

        total_files = len(files_to_convert)
        if total_files == 0:
            self.status_updated.emit("No source files matching constraints.")
            self.conversion_completed.emit(0)
            return

        # Ensure output target generation
        try:
            self.output_folder.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            self.log_updated.emit(
                f"Failed to establish output directory path: {e}", "error"
            )
            self.conversion_completed.emit(0)
            return

        converted_count = 0

        for idx, file_path in enumerate(files_to_convert):
            self.status_updated.emit(f"Converting: {file_path.name}")

            # Match alternative extension naming to standard formats
            target_out_fmt = self.out_fmt
            if target_out_fmt == "jpeg":
                target_out_fmt = "jpg"

            target_path = self.output_folder / f"{file_path.stem}.{target_out_fmt}"

            try:
                with Image.open(file_path) as img:
                    # Convert to standard color channel if target formatting drops transparency fields
                    if img.mode in ("RGBA", "LA") and self.out_fmt in (
                        "jpeg",
                        "pdf",
                    ):
                        img = img.convert("RGB")
                    elif img.mode not in ("RGB", "RGBA"):
                        img = img.convert("RGB")

                    save_kwargs: Dict[str, Any] = {}
                    if self.out_fmt in ("webp", "jpeg"):
                        save_kwargs["quality"] = self.quality
                    if self.out_fmt == "webp":
                        save_kwargs["method"] = self.method

                    img.save(target_path, self.out_fmt.upper(), **save_kwargs)

                size_kb = target_path.stat().st_size // 1024
                self.log_updated.emit(
                    f"Converted: {file_path.name} → {target_path.name} ({size_kb} KB)",
                    "info",
                )
                converted_count += 1

            except Exception as e:
                self.log_updated.emit(
                    f"[ERROR] Asset conversion failed for {file_path.name}: {e}",
                    "error",
                )

            self.progress_changed.emit(int(((idx + 1) / total_files) * 100))

        self.status_updated.emit("Batch processing complete.")
        self.conversion_completed.emit(converted_count)


class ImageConverterTab(QWidget):
    """PyQt6 Tab UI component managing directory selectors, output compression thresholds, and logs."""

    def __init__(self) -> None:
        super().__init__()
        self.worker: Optional[ConvertWorker] = None
        self.init_ui()

    def init_ui(self) -> None:
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(12)

        # Style Sheets Definitions
        input_style = "background-color: #2d2f31; border: 1px solid #555; border-radius: 4px; padding: 4px; color: #fff;"

        # Input Row Block
        input_layout = QHBoxLayout()
        self.input_path = QLineEdit()
        self.input_path.setStyleSheet(input_style)
        self.input_path.setPlaceholderText("Select target source folder...")

        btn_browse_in = QPushButton("📁 Browse Input")
        btn_browse_in.clicked.connect(self.browse_input)

        input_layout.addWidget(QLabel("Input Folder:"))
        input_layout.addWidget(self.input_path, 1)
        input_layout.addWidget(btn_browse_in)
        main_layout.addLayout(input_layout)

        # Output Row Block
        output_layout = QHBoxLayout()
        self.output_path = QLineEdit()
        self.output_path.setStyleSheet(input_style)
        self.output_path.setPlaceholderText("Select pipeline target destination...")

        btn_browse_out = QPushButton("📁 Browse Output")
        btn_browse_out.clicked.connect(self.browse_output)

        output_layout.addWidget(QLabel("Output Folder:"))
        output_layout.addWidget(self.output_path, 1)
        output_layout.addWidget(btn_browse_out)
        main_layout.addLayout(output_layout)

        # Conversion Extension Formats Routing Setup
        format_layout = QHBoxLayout()
        self.input_format = QComboBox()
        self.input_format.addItems(SUPPORTED_FORMATS)
        self.input_format.setCurrentText("PNG")

        self.output_format = QComboBox()
        self.output_format.addItems(SUPPORTED_FORMATS)
        self.output_format.setCurrentText("WEBP")

        switch_btn = QPushButton("⇆")
        switch_btn.setFixedWidth(40)
        switch_btn.clicked.connect(self.swap_formats)
        switch_btn.setStyleSheet("""
            QPushButton {
                font-size: 16px;
                font-weight: bold;
                border-radius: 4px;
                background-color: #3e4145;
                color: #fff;
                border: 1px solid #555;
            }
            QPushButton:hover {
                background-color: #4f5358;
            }
        """)

        format_layout.addWidget(QLabel("From Format:"))
        format_layout.addWidget(self.input_format, 1)
        format_layout.addWidget(switch_btn)
        format_layout.addWidget(QLabel("To Format:"))
        format_layout.addWidget(self.output_format, 1)
        main_layout.addLayout(format_layout)

        # Compression Threshold Slider Block
        main_layout.addWidget(QLabel("Encoding Quality Factor (WEBP/JPEG):"))
        self.quality_slider = QSlider(Qt.Orientation.Horizontal)
        self.quality_slider.setRange(0, 100)
        self.quality_slider.setValue(80)
        self.quality_slider.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.quality_slider.setTickInterval(10)
        self.quality_slider.valueChanged.connect(self.update_quality_label)

        q_layout = QHBoxLayout()
        self.quality_label = QLabel("80")
        self.quality_label.setStyleSheet(
            "font-weight: bold; min-width: 25px; text-align: center;"
        )
        q_layout.addWidget(self.quality_slider)
        q_layout.addWidget(self.quality_label)
        main_layout.addLayout(q_layout)

        # WEBP Processing Algorithms Parameters
        main_layout.addWidget(
            QLabel("Compression Method Speed/Ratio Tuning (WEBP Explicit):")
        )
        self.method_slider = QSlider(Qt.Orientation.Horizontal)
        self.method_slider.setRange(0, 6)
        self.method_slider.setValue(6)
        self.method_slider.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.method_slider.setTickInterval(1)
        self.method_slider.valueChanged.connect(self.update_method_label)

        m_layout = QHBoxLayout()
        self.method_label = QLabel("6")
        self.method_label.setStyleSheet(
            "font-weight: bold; min-width: 25px; text-align: center;"
        )
        m_layout.addWidget(self.method_slider)
        m_layout.addWidget(self.method_label)
        main_layout.addLayout(m_layout)

        # Asynchronous Progress Tracking Indicators
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.lbl_status = QLabel("Engine Ready")
        self.lbl_status.setStyleSheet("font-weight: bold; color: #5294e2;")

        main_layout.addWidget(self.lbl_status)
        main_layout.addWidget(self.progress_bar)

        # Command Fire Action Selector
        self.btn_convert = QPushButton("🚀 Execute Batch Conversion")
        self.btn_convert.setStyleSheet("""
            QPushButton {
                background-color: #2b753c;
                color: white;
                font-weight: bold;
                font-size: 13px;
                padding: 8px;
                border-radius: 5px;
                border: none;
            }
            QPushButton:hover {
                background-color: #338a47;
            }
            QPushButton:disabled {
                background-color: #444;
                color: #888;
            }
        """)
        self.btn_convert.clicked.connect(self.start_conversion)
        main_layout.addWidget(self.btn_convert)

        # Output Text Logger Sandbox
        main_layout.addWidget(QLabel("Active Runtime Trace Console Log:"))
        self.log_box = QTextEdit()
        self.log_box.setReadOnly(True)
        self.log_box.setAcceptRichText(True)
        self.log_box.setStyleSheet(
            "background-color: #1c1d20; border: 1px solid #444; border-radius: 6px; color: #ccc;"
        )
        self.log_box.setPlaceholderText(
            "Execution streaming details report out safely here..."
        )
        main_layout.addWidget(self.log_box)

    def browse_input(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "Select Input Folder")
        if folder:
            self.input_path.setText(folder)

    def browse_output(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "Select Output Folder")
        if folder:
            self.output_path.setText(folder)

    def update_quality_label(self) -> None:
        self.quality_label.setText(str(self.quality_slider.value()))

    def update_method_label(self) -> None:
        self.method_label.setText(str(self.method_slider.value()))

    def swap_formats(self) -> None:
        in_fmt = self.input_format.currentText()
        out_fmt = self.output_format.currentText()
        self.input_format.setCurrentText(out_fmt)
        self.output_format.setCurrentText(in_fmt)

    def append_log(self, msg: str, msg_type: str) -> None:
        if msg_type == "error":
            html = f'<span style="color: #ff6b6b; font-weight: bold;">{msg}</span>'
        else:
            html = f'<span style="color: #ccc;">{msg}</span>'
        self.log_box.append(html)

    def start_conversion(self) -> None:
        input_dir = self.input_path.text().strip()
        output_dir = self.output_path.text().strip()

        if not input_dir or not Path(input_dir).is_dir():
            QMessageBox.warning(
                self,
                "Directory Mapping Error",
                "Please configure a valid source input folder location.",
            )
            return
        if not output_dir:
            QMessageBox.warning(
                self,
                "Pipeline Missing Element",
                "Please assign an target destination folder layout.",
            )
            return

        # Interface Controls Lockout Reset
        self.btn_convert.setEnabled(False)
        self.progress_bar.setValue(0)
        self.log_box.clear()

        # Thread Setup Initialization
        self.worker = ConvertWorker(
            input_folder=input_dir,
            output_folder=output_dir,
            in_fmt=self.input_format.currentText(),
            out_fmt=self.output_format.currentText(),
            quality=self.quality_slider.value(),
            method=self.method_slider.value(),
        )

        self.worker.progress_changed.connect(self.progress_bar.setValue)
        self.worker.status_updated.connect(self.lbl_status.setText)
        self.worker.log_updated.connect(self.append_log)
        self.worker.conversion_completed.connect(self.conversion_finished)
        self.worker.start()

    def conversion_finished(self, total_converted: int) -> None:
        self.btn_convert.setEnabled(True)
        if total_converted == 0:
            QMessageBox.information(
                self,
                "Process Completed",
                "Zero operational files converted during execution loop.",
            )
        else:
            QMessageBox.information(
                self,
                "Process Completed Successfully",
                f"Successfully wrapped batch pipeline! {total_converted} records migrated.",
            )