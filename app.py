import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QTabWidget, QWidget, QVBoxLayout
from PyQt6.QtGui import QIcon, QPalette, QColor
from PyQt6.QtCore import Qt
from tts_tab import TTSTab
from yt_tab import YouTubeTab
from converter_tab import ImageConverterTab


class MainApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Media Utility App")
        self.setGeometry(200, 100, 950, 600)
        self.setWindowIcon(QIcon.fromTheme("multimedia-player"))

        # Tabs
        tabs = QTabWidget()
        tabs.addTab(TTSTab(), "🗣️ Text-to-Speech")
        tabs.addTab(YouTubeTab(), "📺 YouTube Downloader")
        tabs.addTab(ImageConverterTab(), "⛏ Converter")

        tabs.setStyleSheet("""
            QTabWidget::pane {
                border: 1px solid #444;
                border-radius: 8px;
                background-color: #202124;
            }
            QTabBar::tab {
                background: #2d2f31;
                color: #ccc;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
                padding: 8px 18px;
                margin-right: 2px;
                font-weight: 500;
            }
            QTabBar::tab:selected {
                background: #3b3d3f;
                color: #fff;
            }
            QTabBar::tab:hover {
                background: #45484a;
            }
        """)

        layout = QVBoxLayout()
        layout.addWidget(tabs)
        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)


def apply_modern_style(app: QApplication):
    """Apply a beautiful dark modern theme."""
    app.setStyle("Fusion")

    dark_palette = QPalette()
    dark_palette.setColor(QPalette.ColorRole.Window, QColor(32, 33, 36))
    dark_palette.setColor(QPalette.ColorRole.WindowText, Qt.GlobalColor.white)
    dark_palette.setColor(QPalette.ColorRole.Base, QColor(24, 25, 26))
    dark_palette.setColor(QPalette.ColorRole.AlternateBase, QColor(32, 33, 36))
    dark_palette.setColor(QPalette.ColorRole.ToolTipBase, Qt.GlobalColor.white)
    dark_palette.setColor(QPalette.ColorRole.ToolTipText, Qt.GlobalColor.white)
    dark_palette.setColor(QPalette.ColorRole.Text, Qt.GlobalColor.white)
    dark_palette.setColor(QPalette.ColorRole.Button, QColor(45, 47, 49))
    dark_palette.setColor(QPalette.ColorRole.ButtonText, Qt.GlobalColor.white)
    dark_palette.setColor(QPalette.ColorRole.Highlight, QColor(83, 149, 255))
    dark_palette.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.black)
    app.setPalette(dark_palette)

    # Global stylesheet for consistent widgets
    app.setStyleSheet("""
        QWidget {
            font-family: 'Segoe UI', 'Roboto', sans-serif;
            font-size: 14px;
            color: #f1f1f1;
            background-color: #202124;
        }
        QLineEdit, QComboBox, QTextEdit {
            background-color: #2d2f31;
            border: 1px solid #555;
            border-radius: 6px;
            padding: 6px;
        }
        QPushButton {
            background-color: #3b3d3f;
            color: #f1f1f1;
            border: 1px solid #555;
            border-radius: 6px;
            padding: 6px 14px;
            font-weight: 500;
        }
        QPushButton:hover {
            background-color: #4a4c4f;
        }
        QPushButton:pressed {
            background-color: #5a5c5f;
        }
        QProgressBar {
            border: 1px solid #555;
            border-radius: 6px;
            background-color: #2d2f31;
            text-align: center;
            color: white;
        }
        QProgressBar::chunk {
            background-color: #5294e2;
            border-radius: 6px;
        }
        QLabel {
            color: #f1f1f1;
        }
    """)


def main():
    app = QApplication(sys.argv)
    apply_modern_style(app)
    window = MainApp()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
