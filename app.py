import sys
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout,
    QHBoxLayout, QPushButton, QLabel, QStackedWidget, QButtonGroup
)
from PyQt6.QtGui import QIcon, QPalette, QColor, QFont
from PyQt6.QtCore import Qt, QSize

# Ensure these match your local filenames
try:
    from yt_tab import YouTubeTab
    from converter_tab import ImageConverterTab
    from pdf_merger import PDFMergerTab
    from duplicate_tab import DuplicateFinderTab
    from image_duplicate_tab import ImageDuplicateFinderTab
except ImportError:
    # Fallback dummies if you test this file individually
    YouTubeTab = QWidget
    ImageConverterTab = QWidget
    PDFMergerTab = QWidget
    DuplicateFinderTab = QWidget
    ImageDuplicateFinderTab = QWidget


class MainApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Media Utility App")
        self.setGeometry(100, 100, 1100, 750)
        self.setWindowIcon(QIcon.fromTheme("multimedia-player"))

        # Main Layout Container (Horizontal split: Sidebar vs Content)
        central_widget = QWidget()
        central_widget.setObjectName("CentralWidget")
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # --- SIDEBAR LAUNCH INTERFACE ---
        self.sidebar = QWidget()
        self.sidebar.setObjectName("SidebarPanel")
        self.sidebar.setFixedWidth(240)
        sidebar_layout = QVBoxLayout(self.sidebar)
        sidebar_layout.setContentsMargins(12, 28, 12, 28)
        sidebar_layout.setSpacing(4)

        # Launcher App Brand Title
        brand_label = QLabel("LAUNCH INTERFACE")
        brand_label.setObjectName("BrandTitle")
        sidebar_layout.addWidget(brand_label)
        sidebar_layout.addSpacing(24)

        # Content Controller Stack
        self.content_stack = QStackedWidget()
        self.content_stack.setObjectName("ContentStack")

        # Exclusive Button Group to manage checked states cleanly across all menus
        self.nav_group = QButtonGroup(self)
        self.nav_group.setExclusive(True)

        # HIERARCHICAL NAVIGATION STRUCTURE (Folders & Subfolders)
        self.menu_structure = [
            {
                "category": "Video Tools",
                "icon": "🎥",
                "submodules": [
                    {"name": "Download", "icon": "📥", "widget": YouTubeTab()},
                ]
            },
            {
                "category": "Image Tools",
                "icon": "🖼️",
                "submodules": [
                    {"name": "Converter", "icon": "⛏", "widget": ImageConverterTab()},
                ]
            },
            {
                "category": "PDF Tools",
                "icon": "📄",
                "submodules": [
                    {"name": "Merger", "icon": "📑", "widget": PDFMergerTab()},
                ]
            },
            {
                "category": "System Tools",
                "icon": "⚙️",
                "submodules": [
                    {"name": "Duplicate Finder", "icon": "🎞️", "widget": DuplicateFinderTab()},
                    {"name": "Image Duplicate Finder", "icon": "📷", "widget": ImageDuplicateFinderTab()},
                ]
            }
        ]

        # Populate Folders, Subfolders, and Stack Content
        stack_index = 0
        for cat_idx, cat_data in enumerate(self.menu_structure):
            # 1. Create Main "Folder" Header Button
            cat_btn = QPushButton(f"▼  {cat_data['icon']}  {cat_data['category']}")
            cat_btn.setObjectName("CategoryButton")
            cat_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            sidebar_layout.addWidget(cat_btn)

            # 2. Create Subfolder Container Widget
            sub_container = QWidget()
            sub_container.setObjectName("SubMenuContainer")
            sub_layout = QVBoxLayout(sub_container)
            sub_layout.setContentsMargins(16, 2, 0, 6)  # Indent sub-modules
            sub_layout.setSpacing(4)

            # 3. Populate Submodules inside the Main Folder
            for module in cat_data["submodules"]:
                sub_btn = QPushButton(f"{module['icon']}  {module['name']}")
                sub_btn.setObjectName("SubNavButton")
                sub_btn.setCheckable(True)
                sub_btn.setCursor(Qt.CursorShape.PointingHandCursor)

                # Select the first available module on launch
                if stack_index == 0:
                    sub_btn.setChecked(True)

                self.nav_group.addButton(sub_btn, stack_index)
                sub_layout.addWidget(sub_btn)

                # Wrap and insert workspace content panel
                page_wrapper = QWidget()
                page_layout = QVBoxLayout(page_wrapper)
                page_layout.setContentsMargins(24, 24, 24, 24)
                page_layout.addWidget(module["widget"])
                self.content_stack.addWidget(page_wrapper)

                stack_index += 1

            sidebar_layout.addWidget(sub_container)

            # 4. Connect Click Mechanics to Expand/Collapse Folders Dynamically
            cat_btn.clicked.connect(
                lambda checked, container=sub_container, button=cat_btn, icon=cat_data['icon'],
                       title=cat_data['category']:
                self.toggle_category(container, button, icon, title)
            )

        # Push layouts upwards
        sidebar_layout.addStretch()

        # Connect navigation execution engine
        self.nav_group.idClicked.connect(self.switch_interface)

        # --- RIGHT SIDE CONTENT CONTAINER (Top Bar + Stacked Pages) ---
        right_container = QWidget()
        right_layout = QVBoxLayout(right_container)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)

        # Top Control Bar
        top_bar = QWidget()
        top_bar.setObjectName("TopBar")
        top_bar.setFixedHeight(50)
        top_bar_layout = QHBoxLayout(top_bar)
        top_bar_layout.setContentsMargins(16, 0, 16, 0)

        self.toggle_btn = QPushButton("☰")
        self.toggle_btn.setObjectName("ToggleKey")
        self.toggle_btn.setFixedSize(38, 34)
        self.toggle_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.toggle_btn.clicked.connect(self.toggle_sidebar)

        top_bar_layout.addWidget(self.toggle_btn)
        top_bar_layout.addStretch()

        right_layout.addWidget(top_bar)
        right_layout.addWidget(self.content_stack, stretch=1)

        main_layout.addWidget(self.sidebar)
        main_layout.addWidget(right_container, stretch=1)
        self.setCentralWidget(central_widget)

    def toggle_category(self, container, button, icon, title):
        """Collapses or opens main folder panels on user interaction."""
        is_visible = container.isVisible()
        container.setVisible(not is_visible)

        # Toggle structural indicator arrow
        arrow = "▶" if is_visible else "▼"
        button.setText(f"{arrow}  {icon}  {title}")

    def switch_interface(self, index):
        """Seamlessly transitions between launcher view states."""
        self.content_stack.setCurrentIndex(index)

    def toggle_sidebar(self):
        """Toggles the visibility state of the sidebar workspace panel."""
        self.sidebar.setVisible(not self.sidebar.isVisible())


def apply_premium_style(app: QApplication):
    app.setStyle("Fusion")

    font = QFont("Segoe UI", 10)
    font.setWeight(QFont.Weight.Medium)
    app.setFont(font)

    dark_palette = QPalette()
    dark_palette.setColor(QPalette.ColorRole.Window, QColor(11, 13, 19))
    dark_palette.setColor(QPalette.ColorRole.WindowText, QColor(243, 244, 246))
    dark_palette.setColor(QPalette.ColorRole.Base, QColor(17, 20, 28))
    dark_palette.setColor(QPalette.ColorRole.AlternateBase, QColor(13, 16, 23))
    dark_palette.setColor(QPalette.ColorRole.Text, QColor(243, 244, 246))
    dark_palette.setColor(QPalette.ColorRole.Button, QColor(26, 31, 44))
    dark_palette.setColor(QPalette.ColorRole.ButtonText, QColor(243, 244, 246))
    dark_palette.setColor(QPalette.ColorRole.Highlight, QColor(99, 102, 241))
    dark_palette.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.white)
    app.setPalette(dark_palette)

    app.setStyleSheet("""
        QMainWindow, QWidget#CentralWidget {
            background-color: #0b0d13;
        }

        QWidget#SidebarPanel {
            background-color: #11141c;
            border-right: 1px solid #1c2130;
        }

        QLabel#BrandTitle {
            color: #6366f1;
            font-size: 11px;
            font-weight: 800;
            padding-left: 12px;
        }

        /* --- Hierarchical Folders Styling --- */
        QPushButton#CategoryButton {
            background-color: transparent;
            color: #e5e7eb;
            border: none;
            padding: 8px 12px;
            font-weight: 700;
            font-size: 13px;
            text-align: left;
        }
        QPushButton#CategoryButton:hover {
            color: #6366f1;
        }

        /* Subfolder Modules Layout */
        QWidget#SubMenuContainer {
            background-color: transparent;
        }

        QPushButton#SubNavButton {
            background-color: transparent;
            color: #9ca3af;
            border: none;
            border-left: 2px solid #1c2130;
            border-radius: 0px;
            padding: 8px 16px;
            font-weight: 600;
            font-size: 12px;
            text-align: left;
        }
        QPushButton#SubNavButton:hover {
            background-color: #1a1f2c;
            color: #f3f4f6;
            border-left: 2px solid #4f46e5;
        }
        QPushButton#SubNavButton:checked {
            background-color: #1e2536;
            color: #818cf8;
            border-left: 2px solid #6366f1;
            font-weight: 700;
        }

        /* Top Action Bar Styling */
        QWidget#TopBar {
            background-color: #0b0d13;
            border-bottom: 1px solid #1c2130;
        }

        QPushButton#ToggleKey {
            background-color: #11141c;
            color: #9ca3af;
            border: 1px solid #1c2130;
            border-radius: 6px;
            font-size: 15px;
            font-weight: bold;
            padding: 0px;
        }
        QPushButton#ToggleKey:hover {
            background-color: #1a1f2c;
            border-color: #6366f1;
            color: #f3f4f6;
        }
        QPushButton#ToggleKey:pressed {
            background-color: #0b0d13;
        }

        QStackedWidget#ContentStack {
            background-color: #0b0d13;
        }

        /* Interactive App Components */
        QLineEdit, QTextEdit, QComboBox {
            background-color: #171b26;
            border: 1px solid #273142;
            border-radius: 8px;
            padding: 10px 14px;
            color: #f3f4f6;
        }
        QLineEdit:focus, QTextEdit:focus, QComboBox:focus {
            border: 1px solid #6366f1;
            background-color: #1a1f2c;
        }

        QPushButton {
            background-color: #1e2536;
            color: #f3f4f6;
            border: 1px solid #2d3748;
            border-radius: 8px;
            padding: 11px 20px;
            font-weight: 600;
            font-size: 13px;
        }
        QPushButton:hover {
            background-color: #283149;
            border-color: #6366f1;
        }
        QPushButton:pressed {
            background-color: #171b26;
        }

        QScrollBar:vertical {
            border: none;
            background: #0b0d13;
            width: 6px;
            margin: 0px;
        }
        QScrollBar::handle:vertical {
            background: #232a3d;
            min-height: 40px;
            border-radius: 3px;
        }
        QScrollBar::handle:vertical:hover {
            background: #6366f1;
        }
        QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
            border: none;
            background: none;
        }
    """)


def main():
    app = QApplication(sys.argv)
    apply_premium_style(app)
    window = MainApp()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()