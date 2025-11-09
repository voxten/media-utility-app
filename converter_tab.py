import os
from PIL import Image
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QTextEdit, QFileDialog, QSlider, QMessageBox, QComboBox
)
from PyQt6.QtCore import Qt


SUPPORTED_FORMATS = [
    "PNG", "WEBP", "JPEG", "GIF", "TIFF", "BMP", "PDF"
]


class ImageConverterTab(QWidget):
    def __init__(self):
        super().__init__()
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        # Input folder
        input_layout = QHBoxLayout()
        self.input_path = QLineEdit()
        input_btn = QPushButton("Browse Input Folder")
        input_btn.clicked.connect(self.browse_input)
        input_layout.addWidget(QLabel("Input Folder:"))
        input_layout.addWidget(self.input_path)
        input_layout.addWidget(input_btn)
        layout.addLayout(input_layout)

        # Output folder
        output_layout = QHBoxLayout()
        self.output_path = QLineEdit()
        output_btn = QPushButton("Browse Output Folder")
        output_btn.clicked.connect(self.browse_output)
        output_layout.addWidget(QLabel("Output Folder:"))
        output_layout.addWidget(self.output_path)
        output_layout.addWidget(output_btn)
        layout.addLayout(output_layout)

        # Input/Output format dropdowns
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
                font-size: 18px;
                border-radius: 8px;
                background-color: #ddd;
            }
            QPushButton:hover {
                background-color: #ccc;
            }
        """)

        format_layout.addWidget(QLabel("From:"))
        format_layout.addWidget(self.input_format)
        format_layout.addWidget(switch_btn)
        format_layout.addWidget(QLabel("To:"))
        format_layout.addWidget(self.output_format)
        layout.addLayout(format_layout)

        # Quality slider
        layout.addWidget(QLabel("Quality (for WEBP/JPEG):"))
        self.quality_slider = QSlider(Qt.Orientation.Horizontal)
        self.quality_slider.setRange(0, 100)
        self.quality_slider.setValue(80)
        self.quality_slider.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.quality_slider.setTickInterval(10)
        self.quality_slider.valueChanged.connect(self.update_quality_label)

        q_layout = QHBoxLayout()
        self.quality_label = QLabel("80")
        q_layout.addWidget(self.quality_slider)
        q_layout.addWidget(self.quality_label)
        layout.addLayout(q_layout)

        # Method slider (for WEBP)
        layout.addWidget(QLabel("Method (0 = fastest, 6 = best compression):"))
        self.method_slider = QSlider(Qt.Orientation.Horizontal)
        self.method_slider.setRange(0, 6)
        self.method_slider.setValue(6)
        self.method_slider.setTickPosition(QSlider.TickPosition.TicksBelow)
        self.method_slider.setTickInterval(1)
        self.method_slider.valueChanged.connect(self.update_method_label)

        m_layout = QHBoxLayout()
        self.method_label = QLabel("6")
        m_layout.addWidget(self.method_slider)
        m_layout.addWidget(self.method_label)
        layout.addLayout(m_layout)

        # Convert button
        convert_btn = QPushButton("Convert")
        convert_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                font-weight: bold;
                padding: 6px;
                border-radius: 6px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        convert_btn.clicked.connect(self.convert)
        layout.addWidget(convert_btn)

        # Output log box
        layout.addWidget(QLabel("Conversion Log:"))
        self.log_box = QTextEdit()
        self.log_box.setReadOnly(True)
        layout.addWidget(self.log_box)

        self.setLayout(layout)

    def browse_input(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Input Folder")
        if folder:
            self.input_path.setText(folder)

    def browse_output(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Output Folder")
        if folder:
            self.output_path.setText(folder)

    def update_quality_label(self):
        self.quality_label.setText(str(self.quality_slider.value()))

    def update_method_label(self):
        self.method_label.setText(str(self.method_slider.value()))

    def swap_formats(self):
        input_fmt = self.input_format.currentText()
        output_fmt = self.output_format.currentText()
        self.input_format.setCurrentText(output_fmt)
        self.output_format.setCurrentText(input_fmt)

    def convert(self):
        input_folder = self.input_path.text().strip()
        output_folder = self.output_path.text().strip()
        in_fmt = self.input_format.currentText().lower()
        out_fmt = self.output_format.currentText().lower()

        if not input_folder or not os.path.isdir(input_folder):
            QMessageBox.warning(self, "Error", "Please select a valid input folder.")
            return
        if not output_folder:
            QMessageBox.warning(self, "Error", "Please select an output folder.")
            return

        os.makedirs(output_folder, exist_ok=True)
        quality = self.quality_slider.value()
        method = self.method_slider.value()

        count = 0
        self.log_box.clear()

        for filename in os.listdir(input_folder):
            if not filename.lower().endswith(f".{in_fmt}"):
                continue

            input_path = os.path.join(input_folder, filename)
            output_path = os.path.join(output_folder, os.path.splitext(filename)[0] + f".{out_fmt}")

            try:
                with Image.open(input_path) as img:
                    img = img.convert("RGB")

                    save_kwargs = {}
                    if out_fmt in ["webp", "jpeg", "jpg"]:
                        save_kwargs["quality"] = quality
                    if out_fmt == "webp":
                        save_kwargs["method"] = method

                    img.save(output_path, out_fmt.upper(), **save_kwargs)

                    size_kb = os.path.getsize(output_path) // 1024
                    self.log_box.append(f"Converted: {filename} → {os.path.basename(output_path)} ({size_kb} KB)")
                    count += 1

            except Exception as e:
                self.log_box.append(f"Failed: {filename} ({str(e)})")

        if count == 0:
            QMessageBox.information(self, "No Files", "No files found for conversion.")
        else:
            QMessageBox.information(self, "Done", f"Converted {count} files.")
