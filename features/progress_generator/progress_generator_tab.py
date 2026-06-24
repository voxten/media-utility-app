import base64
import json
import mimetypes
from pathlib import Path
from typing import Optional

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (
    QColorDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSlider,
    QVBoxLayout,
    QWidget,
)
from playwright.sync_api import sync_playwright


class ProgressGenerationWorker(QThread):
    """Background worker to handle headless Chromium DOM rendering without locking the PyQt UI."""

    finished = pyqtSignal(bool, str)

    def __init__(self, output_path: str, data: list, banner_data_url: Optional[str]) -> None:
        super().__init__()
        self.output_path = output_path
        self.data = data
        self.banner_data_url = banner_data_url

    def run(self) -> None:
        html_file = Path("index.html").resolve()
        css_file = Path("style.css").resolve()

        if not html_file.exists() or not css_file.exists():
            self.finished.emit(
                False, "Error: index.html or style.css missing from this script's directory."
            )
            return

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(f"file://{html_file}")

                json_data = json.dumps(self.data)
                json_banner = json.dumps(self.banner_data_url)

                js_injection = f"""
                const bannerDataUrl = {json_banner};
                if (bannerDataUrl) {{
                    const bannerImg = document.querySelector('.header img');
                    if (bannerImg) {{
                        bannerImg.src = bannerDataUrl;
                    }}
                }}

                const container = document.getElementById('progressContainer');
                container.innerHTML = ''; 
                const trackingData = {json_data};

                trackingData.forEach(item => {{
                    const row = document.createElement('div');
                    row.className = 'row';

                    // Detect if a raw hexadecimal value was supplied vs standard CSS class names
                    const isHex = item.color.startsWith('#');
                    const classAttr = isHex ? 'fill' : 'fill ' + item.color;
                    const styleAttr = isHex ? 'background: ' + item.color + ';' : '';

                    row.innerHTML = `
                        <div class="${{classAttr}}" style="${{styleAttr}}"></div>
                        <div class="content">
                            <div class="label">${{item.name}}</div>
                            <div class="percent">${{item.value}}%</div>
                        </div>
                    `;
                    container.appendChild(row);
                    setTimeout(() => {{
                        row.querySelector('.fill').style.width = item.value + '%';
                    }}, 100);
                }});
                """
                page.evaluate(js_injection)

                # Wait for the CSS transition animations to finish
                page.wait_for_timeout(1200)

                tracker_element = page.query_selector(".tracker")
                if tracker_element:
                    tracker_element.screenshot(path=self.output_path)
                    browser.close()
                    self.finished.emit(True, f"Successfully saved progress image to:\n{self.output_path}")
                else:
                    browser.close()
                    self.finished.emit(False, "Could not locate '.tracker' container element.")
        except Exception as e:
            self.finished.emit(False, f"Render Engine Pipeline Error: {str(e)}")


class ProjectProgressTab(QWidget):
    """Clean UI Component designed to embed directly inside layouts or stacked panels."""

    def __init__(self) -> None:
        super().__init__()
        self.render_worker: Optional[ProgressGenerationWorker] = None
        self.track_rows = []  # Holds tuples of tracking row layouts: (widget, name_edit, slider, color_btn)
        self.init_ui()

    def init_ui(self) -> None:
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(14)

        main_layout.addWidget(QLabel("<h2>📊 Project Status Dashboard Designer</h2>"))
        main_layout.addWidget(QLabel("Adjust tracking dimensions and customize graphic assets below:"))

        # --- Custom Banner Image Selector Row Block ---
        main_layout.addWidget(QLabel("<b>Custom Header Banner:</b>"))

        banner_layout = QHBoxLayout()
        self.banner_path_field = QLineEdit()
        self.banner_path_field.setReadOnly(True)
        self.banner_path_field.setPlaceholderText("(Optional) Uses default banner.jpg if left blank...")
        self.banner_path_field.setStyleSheet(
            "background-color: #2d2f31; border: 1px solid #555; border-radius: 4px; padding: 6px; color: #fff;"
        )

        btn_browse_banner = QPushButton("🖼️ Browse Image")
        btn_browse_banner.setStyleSheet("""
            QPushButton { background-color: #3e4145; padding: 6px 12px; border: 1px solid #555; border-radius: 4px; }
            QPushButton:hover { background-color: #4f5358; }
        """)
        btn_browse_banner.clicked.connect(self.browse_custom_banner)

        banner_layout.addWidget(self.banner_path_field, 1)
        banner_layout.addWidget(btn_browse_banner)
        main_layout.addLayout(banner_layout)

        main_layout.addSpacing(5)

        # --- Dynamic Action Management Header Bar ---
        actions_header = QHBoxLayout()
        actions_header.addWidget(QLabel("<b>Progress Value Tracks Setup:</b>"))
        actions_header.addStretch()

        btn_add_track = QPushButton("➕ Add Progress Bar")
        btn_add_track.setStyleSheet("""
            QPushButton { background-color: #1e2536; color: #818cf8; border: 1px solid #4f46e5; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
            QPushButton:hover { background-color: #1c2130; color: #6366f1; }
        """)
        btn_add_track.clicked.connect(lambda: self.add_progress_row())
        actions_header.addWidget(btn_add_track)
        main_layout.addLayout(actions_header)

        # --- Scrollable Area for Tracking Bars ---
        self.scroll_widget = QWidget()
        self.tracks_layout = QVBoxLayout(self.scroll_widget)
        self.tracks_layout.setContentsMargins(0, 0, 0, 0)
        self.tracks_layout.setSpacing(10)
        self.tracks_layout.addStretch()  # Anchor dynamic contents to top bounds

        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setWidget(self.scroll_widget)
        scroll_area.setStyleSheet("QScrollArea { border: none; background: transparent; }")
        main_layout.addWidget(scroll_area, stretch=1)

        # Populate Initial Default Configurations Schema
        initial_configs = [
            ("Planning", 100, "#f59e0b"),  # matching original orange hex
            ("Writing", 95, "#7d2cff"),  # purple hex
            ("Art", 90, "#3b82f6"),  # blue hex
            ("Posing", 100, "#00a6ff"),  # cyan hex
            ("Code", 60, "#ff6b6b"),  # red hex
            ("Audio", 5, "#22c55e"),  # green hex
        ]
        for name, value, hex_color in initial_configs:
            self.add_progress_row(name, value, hex_color)

        main_layout.addSpacing(10)

        # --- Final Production Target Render Action Trigger ---
        self.btn_generate = QPushButton("📸 Generate and Save progress.png")
        self.btn_generate.setStyleSheet("""
            QPushButton { background-color: #2b753c; color: white; font-weight: bold; font-size: 14px; padding: 12px; border-radius: 6px; border: none; }
            QPushButton:hover { background-color: #338a47; }
            QPushButton:disabled { background-color: #444; color: #888; }
        """)
        self.btn_generate.clicked.connect(self.trigger_image_generation)
        main_layout.addWidget(self.btn_generate)

    def add_progress_row(self, name: str = "New Metric Track", value: int = 50, hex_color: str = "#6366f1") -> None:
        """Appends a new highly customizable configuration layout track into the interface stack."""
        row_widget = QWidget()
        row_layout = QHBoxLayout(row_widget)
        row_layout.setContentsMargins(4, 4, 4, 4)
        row_layout.setSpacing(10)

        # Name Entry input field box
        name_edit = QLineEdit(name)
        name_edit.setPlaceholderText("Track Label Name...")
        name_edit.setFixedWidth(140)
        name_edit.setStyleSheet(
            "background-color: #171b26; border: 1px solid #273142; border-radius: 6px; padding: 6px; color: #fff;")

        # Track numerical value range sliders
        slider = QSlider(Qt.Orientation.Horizontal)
        slider.setRange(0, 100)
        slider.setValue(value)

        lbl_val = QLabel(f"{value}%")
        lbl_val.setFixedWidth(40)
        lbl_val.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        lbl_val.setStyleSheet("color: #aaa; font-weight: bold;")
        slider.valueChanged.connect(lambda val, target_lbl=lbl_val: target_lbl.setText(f"{val}%"))

        # Color Selection Action Picker button
        color_btn = QPushButton("🎨 Color")
        color_btn.setFixedWidth(85)
        color_btn.setProperty("hex_color", hex_color)
        color_btn.setStyleSheet(
            f"background-color: {hex_color}; color: #fff; font-weight: bold; border: 1px solid #333; border-radius: 6px; padding: 6px;")
        color_btn.clicked.connect(lambda checked, target_btn=color_btn: self.pick_row_color(target_btn))

        # Destruction/Deconstruction track trigger
        btn_delete = QPushButton("🗑️")
        btn_delete.setFixedWidth(38)
        btn_delete.setStyleSheet(
            "background-color: #7f1d1d; border: none; border-radius: 6px; padding: 6px; font-size: 13px;")
        btn_delete.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_delete.clicked.connect(lambda checked, target_widget=row_widget: self.remove_progress_row(target_widget))

        # Map UI components onto Row Layout Container
        row_layout.addWidget(name_edit)
        row_layout.addWidget(slider, 1)
        row_layout.addWidget(lbl_val)
        row_layout.addWidget(color_btn)
        row_layout.addWidget(btn_delete)

        # Inject layout right before the stretch space component anchor layer bounds
        self.tracks_layout.insertWidget(self.tracks_layout.count() - 1, row_widget)
        self.track_rows.append((row_widget, name_edit, slider, color_btn))

    def remove_progress_row(self, row_widget: QWidget) -> None:
        """Removes an active progress row tracked container safely from the layout lifecycle."""
        for entry in self.track_rows:
            if entry[0] == row_widget:
                self.track_rows.remove(entry)
                self.tracks_layout.removeWidget(row_widget)
                row_widget.deleteLater()
                break

    def pick_row_color(self, target_button: QPushButton) -> None:
        """Spawns standard operating system UI color mapping palette to store hexadecimal values."""
        current_hex = target_button.property("hex_color")
        initial_color = QColor(current_hex) if current_hex else QColor("#6366f1")

        selected_color = QColorDialog.getColor(initial_color, self, "Select Track Render Color")
        if selected_color.isValid():
            new_hex = selected_color.name()  # Output returns lowercase standard '#rrggbb' formatting
            target_button.setProperty("hex_color", new_hex)
            target_button.setStyleSheet(
                f"background-color: {new_hex}; color: #fff; font-weight: bold; border: 1px solid #333; border-radius: 6px; padding: 6px;")

    def browse_custom_banner(self) -> None:
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Select Header Banner Graphic File", "", "Images (*.png *.jpg *.jpeg *.webp *.bmp)"
        )
        if file_path:
            self.banner_path_field.setText(file_path)

    def trigger_image_generation(self) -> None:
        if not self.track_rows:
            QMessageBox.warning(self, "Validation Alert", "Please add at least one progress track before generating.")
            return

        save_file, _ = QFileDialog.getSaveFileName(
            self, "Save Exported Progress Image", "progress.png", "PNG Images (*.png)"
        )
        if not save_file:
            return

        # Map dynamic items tracking state out safely
        current_data = []
        for _, name_edit, slider, color_btn in self.track_rows:
            track_name = name_edit.text().strip() or "Untitled Progress Track"
            current_data.append({
                "name": track_name,
                "value": slider.value(),
                "color": color_btn.property("hex_color")
            })

        banner_data_url = None
        banner_path_str = self.banner_path_field.text().strip()

        if banner_path_str and Path(banner_path_str).is_file():
            try:
                banner_path = Path(banner_path_str)
                mime_type, _ = mimetypes.guess_type(banner_path)
                if not mime_type:
                    mime_type = "image/jpeg"

                with open(banner_path, "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
                    banner_data_url = f"data:{mime_type};base64,{encoded_string}"
            except Exception as e:
                QMessageBox.warning(self, "Asset Reading Error", f"Failed reading the banner file: {e}")

        self.btn_generate.setEnabled(False)
        self.btn_generate.setText("Rendering Canvas Content...")

        self.render_worker = ProgressGenerationWorker(save_file, current_data, banner_data_url)
        self.render_worker.finished.connect(self.on_generation_finished)
        self.render_worker.start()

    def on_generation_finished(self, success: bool, message: str) -> None:
        self.btn_generate.setEnabled(True)
        self.btn_generate.setText("📸 Generate & Save progress.png")

        if success:
            QMessageBox.information(self, "Export Complete", message)
        else:
            QMessageBox.critical(self, "Export Failed", message)