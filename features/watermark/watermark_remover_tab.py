import os
import cv2
import numpy as np
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QFileDialog, QSlider, QComboBox, QMessageBox, QProgressBar,
    QFrame, QSizePolicy
)
from PyQt6.QtGui import QImage, QPixmap, QPainter, QPen, QColor
from PyQt6.QtCore import Qt, QPoint, QThread, pyqtSignal


class PaintCanvas(QLabel):
    """Płótno wyświetlające obraz z możliwością malowania maski znaku wodnego."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setMinimumSize(400, 300)

        self.original_pixmap = None
        self.mask_image = None
        self.last_point = None
        self.brush_size = 24
        self.has_mask = False

    def load_image(self, file_path: str) -> bool:
        pix = QPixmap(file_path)
        if pix.isNull():
            return False

        self.original_pixmap = pix
        # Maska: 8-bitowy czarny obraz w natywnych wymiarach oryginału
        self.mask_image = QImage(
            self.original_pixmap.size(),
            QImage.Format.Format_Grayscale8
        )
        self.mask_image.fill(0)
        self.has_mask = False
        self.setCursor(Qt.CursorShape.CrossCursor)
        self.update_display()
        return True

    def set_brush_size(self, size: int):
        self.brush_size = size

    def clear_mask(self):
        if self.mask_image:
            self.mask_image.fill(0)
            self.has_mask = False
            self.update_display()

    def get_scaled_rect(self):
        """Zwraca (x, y, width, height), w którym wyświetla się przeskalowany obraz wewnątrz QLabel."""
        if not self.original_pixmap or self.original_pixmap.isNull():
            return None
        w, h = self.width(), self.height()
        orig_w = self.original_pixmap.width()
        orig_h = self.original_pixmap.height()
        if orig_w == 0 or orig_h == 0 or w == 0 or h == 0:
            return None

        scale = min(w / orig_w, h / orig_h)
        s_w = int(orig_w * scale)
        s_h = int(orig_h * scale)
        x = (w - s_w) // 2
        y = (h - s_h) // 2
        return x, y, s_w, s_h

    def map_to_original(self, pos: QPoint, clamp: bool = False):
        """Przelicza współrzędne z widoku widżetu na natywne piksele obrazu."""
        rect_info = self.get_scaled_rect()
        if not rect_info:
            return None
        x_offset, y_offset, s_w, s_h = rect_info
        if s_w <= 0 or s_h <= 0:
            return None

        if not clamp:
            if not (x_offset <= pos.x() <= x_offset + s_w and y_offset <= pos.y() <= y_offset + s_h):
                return None

        px = max(x_offset, min(pos.x(), x_offset + s_w))
        py = max(y_offset, min(pos.y(), y_offset + s_h))

        orig_w = self.original_pixmap.width()
        orig_h = self.original_pixmap.height()

        orig_x = int((px - x_offset) * (orig_w / s_w))
        orig_y = int((py - y_offset) * (orig_h / s_h))
        orig_x = max(0, min(orig_x, orig_w - 1))
        orig_y = max(0, min(orig_y, orig_h - 1))
        return QPoint(orig_x, orig_y)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.original_pixmap:
            mapped = self.map_to_original(event.position().toPoint(), clamp=False)
            if mapped:
                self.last_point = mapped
                self.paint_on_mask(mapped, mapped)

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.MouseButton.LeftButton and self.original_pixmap:
            mapped = self.map_to_original(event.position().toPoint(), clamp=True)
            if mapped and self.last_point:
                self.paint_on_mask(self.last_point, mapped)
                self.last_point = mapped

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.last_point = None

    def paint_on_mask(self, p1: QPoint, p2: QPoint):
        if not self.mask_image:
            return
        painter = QPainter(self.mask_image)
        if p1 == p2:
            # Pojedyncze kliknięcie – narysuj wypełnione koło o średnicy równej wielkości pędzla
            painter.setBrush(QColor(255, 255, 255))
            painter.setPen(Qt.PenStyle.NoPen)
            radius = max(1, int(self.brush_size / 2.0))
            painter.drawEllipse(p1, radius, radius)
        else:
            pen = QPen(
                QColor(255, 255, 255),
                self.brush_size,
                Qt.PenStyle.SolidLine,
                Qt.PenCapStyle.RoundCap,
                Qt.PenJoinStyle.RoundJoin
            )
            painter.setPen(pen)
            painter.drawLine(p1, p2)
        painter.end()
        self.has_mask = True
        self.update_display()

    def update_display(self):
        if not self.original_pixmap or self.original_pixmap.isNull():
            return
        if self.width() <= 0 or self.height() <= 0:
            return

        composed = self.original_pixmap.copy()

        # Nakładamy czerwoną półprzezroczystą maskę jeśli użytkownik coś narysował
        if self.mask_image and self.has_mask:
            colored_mask = QImage(self.mask_image.size(), QImage.Format.Format_ARGB32_Premultiplied)
            colored_mask.fill(QColor(0, 0, 0, 0))

            mask_p = QPainter(colored_mask)
            mask_p.setCompositionMode(QPainter.CompositionMode.CompositionMode_Source)
            mask_p.drawImage(0, 0, self.mask_image)
            mask_p.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceIn)
            mask_p.fillRect(colored_mask.rect(), QColor(239, 68, 68, 160))
            mask_p.end()

            painter = QPainter(composed)
            painter.drawImage(0, 0, colored_mask)
            painter.end()

        scaled = composed.scaled(
            self.size(),
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation
        )
        self.setPixmap(scaled)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.update_display()

    def get_opencv_mask(self):
        """Zwraca maskę jako tablicę numpy (uint8) o wymiarach (height, width).
        Uwzględnia 4-bajtowe wyrównanie linii w QImage (stride-aware)."""
        if not self.mask_image:
            return None
        ptr = self.mask_image.bits()
        ptr.setsize(self.mask_image.sizeInBytes())
        bytes_per_line = self.mask_image.bytesPerLine()
        arr = np.frombuffer(ptr, np.uint8).reshape(
            (self.mask_image.height(), bytes_per_line)
        )
        # Odrzucamy padding z wyrównania do 4 bajtów
        return arr[:, :self.mask_image.width()].copy()


class InpaintWorker(QThread):
    finished = pyqtSignal(np.ndarray, str)
    error = pyqtSignal(str)

    def __init__(self, image_source, mask: np.ndarray, method: str):
        super().__init__()
        self.image_source = image_source
        self.mask = mask
        self.method = method

    def run(self):
        try:
            # Bezpieczny odczyt obrazu (działa również ze znakami diakrytycznymi na Windows)
            if isinstance(self.image_source, str):
                if not os.path.exists(self.image_source):
                    raise FileNotFoundError(f"Plik nie istnieje: {self.image_source}")
                with open(self.image_source, "rb") as f:
                    file_bytes = np.frombuffer(f.read(), dtype=np.uint8)
                img = cv2.imdecode(file_bytes, cv2.IMREAD_UNCHANGED)
                if img is None:
                    raise ValueError("Nie udało się odczytać pliku graficznego.")
            elif isinstance(self.image_source, np.ndarray):
                img = self.image_source.copy()
            else:
                raise ValueError("Nieprawidłowe źródło obrazu wejściowego.")

            # Obsługa kanałów obrazu (OpenCV inpaint wymaga 1-kanałowego lub 3-kanałowego BGR uint8)
            has_alpha = False
            alpha_channel = None
            if len(img.shape) == 2:
                # Skala szarości -> konwertuj na 3 kanały BGR
                bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            elif len(img.shape) == 3:
                if img.shape[2] == 4:
                    has_alpha = True
                    bgr = img[:, :, :3]
                    alpha_channel = img[:, :, 3]
                elif img.shape[2] == 3:
                    bgr = img
                else:
                    raise ValueError(f"Nieobsługiwana liczba kanałów obrazu: {img.shape[2]}")
            else:
                raise ValueError("Nieprawidłowy wymiar tablicy obrazu.")

            # Dopasowanie rozmiaru maski jeśli różni się od obrazu
            mask = self.mask.copy()
            if mask.shape[:2] != bgr.shape[:2]:
                mask = cv2.resize(mask, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_NEAREST)

            # Upewniamy się, że maska jest 1-kanałowa, uint8 i ma binarne wartości 0 lub 255
            if len(mask.shape) == 3:
                mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
            _, mask_bin = cv2.threshold(mask, 10, 255, cv2.THRESH_BINARY)

            if np.sum(mask_bin) == 0:
                raise ValueError("Maska zaznaczenia jest pusta. Zamaluj znak wodny przed uruchomieniem.")

            notice = ""
            if self.method == "AI (LaMa)":
                try:
                    from iopaint.model_manager import ModelManager
                    from iopaint.schema import InpaintRequest
                    import torch

                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    model = ModelManager(name="lama", device=device)
                    img_rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                    res_rgb = model(img_rgb, mask_bin, InpaintRequest())
                    res_bgr = cv2.cvtColor(res_rgb, cv2.COLOR_RGB2BGR)
                except ImportError:
                    notice = (
                        "Brak biblioteki IOPaint lub PyTorch. Zastosowano algorytm zastępczy OpenCV (Telea).\n\n"
                        "Aby korzystać z modelu AI LaMa, zainstaluj w środowisku: pip install iopaint torch torchvision"
                    )
                    res_bgr = cv2.inpaint(bgr, mask_bin, 3, cv2.INPAINT_TELEA)
            elif self.method == "OpenCV (Navier-Stokes)":
                res_bgr = cv2.inpaint(bgr, mask_bin, 3, cv2.INPAINT_NS)
            else:  # OpenCV (Telea)
                res_bgr = cv2.inpaint(bgr, mask_bin, 3, cv2.INPAINT_TELEA)

            # Przywrócenie kanału alfa jeśli istniał w oryginale
            if has_alpha and alpha_channel is not None:
                final_res = cv2.merge([res_bgr, alpha_channel])
            else:
                final_res = res_bgr

            self.finished.emit(final_res, notice)

        except Exception as e:
            self.error.emit(str(e))


class WatermarkRemoverTab(QWidget):
    def __init__(self):
        super().__init__()
        self.current_file = None
        self.processed_img = None
        self.worker = None

        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        # --- GÓRNY PASEK NARZĘDZIOWY ---
        toolbar = QFrame()
        toolbar.setStyleSheet("background-color: #11141c; border-radius: 8px; padding: 6px;")
        tool_layout = QHBoxLayout(toolbar)
        tool_layout.setContentsMargins(10, 6, 10, 6)
        tool_layout.setSpacing(12)

        self.btn_open = QPushButton("📁 Wczytaj obraz")
        self.btn_open.clicked.connect(self.select_file)
        tool_layout.addWidget(self.btn_open)

        self.btn_reset = QPushButton("↺ Oryginał")
        self.btn_reset.setEnabled(False)
        self.btn_reset.clicked.connect(self.reset_to_original)
        tool_layout.addWidget(self.btn_reset)

        self.btn_clear = QPushButton("🧹 Wyczyść zaznaczenie")
        self.btn_clear.clicked.connect(self.clear_selection)
        tool_layout.addWidget(self.btn_clear)

        # Rozmiar pędzla
        brush_label = QLabel("Rozmiar pędzla:")
        brush_label.setStyleSheet("color: #9ca3af; font-size: 11px;")
        tool_layout.addWidget(brush_label)

        self.brush_slider = QSlider(Qt.Orientation.Horizontal)
        self.brush_slider.setRange(5, 120)
        self.brush_slider.setValue(24)
        self.brush_slider.setFixedWidth(120)
        self.brush_slider.valueChanged.connect(self.change_brush_size)
        tool_layout.addWidget(self.brush_slider)

        self.brush_val_label = QLabel("24 px")
        self.brush_val_label.setStyleSheet("color: #818cf8; font-weight: bold; font-size: 11px; min-width: 40px;")
        tool_layout.addWidget(self.brush_val_label)

        # Wybór algorytmu
        algo_label = QLabel("Silnik:")
        algo_label.setStyleSheet("color: #9ca3af; font-size: 11px;")
        tool_layout.addWidget(algo_label)

        self.algo_combo = QComboBox()
        self.algo_combo.addItems(["OpenCV (Telea)", "OpenCV (Navier-Stokes)", "AI (LaMa)"])
        tool_layout.addWidget(self.algo_combo)

        tool_layout.addStretch()

        # Przycisk uruchomienia
        self.btn_process = QPushButton("✨ Usuń znak")
        self.btn_process.setStyleSheet("background-color: #4f46e5; border-color: #6366f1; font-weight: bold;")
        self.btn_process.clicked.connect(self.process_watermark)
        tool_layout.addWidget(self.btn_process)

        self.btn_save = QPushButton("💾 Zapisz wynik")
        self.btn_save.setEnabled(False)
        self.btn_save.clicked.connect(self.save_image)
        tool_layout.addWidget(self.btn_save)

        layout.addWidget(toolbar)

        # --- OBSZAR ROBOCZY / PŁÓTNO ---
        self.canvas = PaintCanvas()
        self.canvas.setStyleSheet(
            "background-color: #171b26; border: 2px dashed #273142; border-radius: 8px;"
        )
        layout.addWidget(self.canvas, stretch=1)

        # Pasek postępu
        self.progress = QProgressBar()
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(4)
        self.progress.setStyleSheet("QProgressBar { background: #11141c; border: none; } QProgressBar::chunk { background: #6366f1; }")
        self.progress.hide()
        layout.addWidget(self.progress)

    def select_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Wybierz obraz", "", "Pliki graficzne (*.png *.jpg *.jpeg *.webp *.bmp)"
        )
        if file_path:
            self.current_file = file_path
            self.processed_img = None
            self.btn_save.setEnabled(False)
            self.btn_reset.setEnabled(False)
            if self.canvas.load_image(file_path):
                self.canvas.setStyleSheet("background-color: #0d1117; border: 1px solid #273142; border-radius: 8px;")
            else:
                QMessageBox.critical(self, "Błąd", "Nie udało się wczytać wybranego pliku graficznego.")

    def reset_to_original(self):
        """Przywraca oryginalny obraz wczytany z dysku."""
        if self.current_file:
            self.processed_img = None
            self.btn_save.setEnabled(False)
            self.btn_reset.setEnabled(False)
            self.canvas.load_image(self.current_file)

    def change_brush_size(self, val):
        self.brush_val_label.setText(f"{val} px")
        self.canvas.set_brush_size(val)

    def clear_selection(self):
        self.canvas.clear_mask()

    def process_watermark(self):
        try:
            if not self.current_file and self.processed_img is None:
                QMessageBox.warning(self, "Uwaga", "Wczytaj najpierw plik graficzny.")
                return

            mask = self.canvas.get_opencv_mask()
            if mask is None or np.sum(mask) == 0:
                QMessageBox.information(self, "Info", "Zamaluj pędzlem znak wodny przed uruchomieniem.")
                return

            self.btn_process.setEnabled(False)
            self.progress.setRange(0, 0)  # Tryb nieokreślony (animacja)
            self.progress.show()

            method = self.algo_combo.currentText()
            # Używamy ostatnio przetworzonego obrazu jeśli istnieje (edycja kaskadowa), w przeciwnym razie pliku źródłowego
            source_data = self.processed_img if self.processed_img is not None else self.current_file

            self.worker = InpaintWorker(source_data, mask, method)
            self.worker.finished.connect(self.on_processing_finished)
            self.worker.error.connect(self.on_processing_error)
            self.worker.start()
        except Exception as e:
            self.progress.hide()
            self.btn_process.setEnabled(True)
            QMessageBox.critical(self, "Błąd", f"Wystąpił nieoczekiwany problem przed uruchomieniem:\n{e}")

    def on_processing_finished(self, result_img: np.ndarray, notice: str):
        try:
            self.processed_img = result_img
            self.progress.hide()
            self.btn_process.setEnabled(True)
            self.btn_save.setEnabled(True)
            self.btn_reset.setEnabled(True)

            # Konwersja tablicy NumPy do QPixmap
            if len(result_img.shape) == 2:
                rgb = cv2.cvtColor(result_img, cv2.COLOR_GRAY2RGB)
                format_q = QImage.Format.Format_RGB888
            elif result_img.shape[2] == 4:
                rgb = cv2.cvtColor(result_img, cv2.COLOR_BGRA2RGBA)
                format_q = QImage.Format.Format_RGBA8888
            else:
                rgb = cv2.cvtColor(result_img, cv2.COLOR_BGR2RGB)
                format_q = QImage.Format.Format_RGB888

            h, w, ch = rgb.shape
            bytes_per_line = ch * w
            # Tworzymy głęboką kopię QImage, by uniknąć problemów z odśmiecaniem bufora w Pythonie
            qimg = QImage(rgb.data, w, h, bytes_per_line, format_q).copy()
            self.canvas.original_pixmap = QPixmap.fromImage(qimg)
            self.canvas.clear_mask()

            if notice:
                QMessageBox.information(self, "Informacja o silniku", notice)
        except Exception as e:
            self.progress.hide()
            self.btn_process.setEnabled(True)
            QMessageBox.critical(self, "Błąd wyświetlania", f"Wystąpił problem przy renderowaniu wyniku:\n{e}")

    def on_processing_error(self, err_msg: str):
        self.progress.hide()
        self.btn_process.setEnabled(True)
        QMessageBox.critical(self, "Błąd przetwarzania", f"Wystąpił błąd podczas usuwania znaku:\n\n{err_msg}")

    def save_image(self):
        if self.processed_img is None:
            return

        save_path, _ = QFileDialog.getSaveFileName(
            self, "Zapisz obraz bez znaku", "output.png", "Pliki PNG (*.png);;Pliki JPG (*.jpg);;Wszystkie pliki (*.*)"
        )
        if save_path:
            try:
                ext = os.path.splitext(save_path)[1].lower()
                if not ext:
                    ext = ".png"
                    save_path += ".png"
                success, enc_buf = cv2.imencode(ext, self.processed_img)
                if success:
                    with open(save_path, "wb") as f:
                        f.write(enc_buf.tobytes())
                    QMessageBox.information(self, "Sukces", "Obraz został pomyślnie zapisany!")
                else:
                    QMessageBox.critical(self, "Błąd", "Nie udało się zakodować obrazu do wybranego formatu.")
            except Exception as e:
                QMessageBox.critical(self, "Błąd zapisu", f"Nie udało się zapisać pliku:\n{e}")