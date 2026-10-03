import sys
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QTextEdit, QComboBox, QFileDialog, QMessageBox, QSlider,
)
from PyQt6.QtCore import Qt, QUrl, QBuffer
from PyQt6.QtMultimedia import QMediaPlayer, QAudioOutput
from pathlib import Path
import asyncio
import pyttsx3
import edge_tts
from pydub import AudioSegment
import io, tempfile


def format_time(milliseconds):
    """Convert milliseconds to MM:SS format"""
    seconds = milliseconds // 1000
    minutes = seconds // 60
    seconds = seconds % 60
    return f"{minutes}:{seconds:02d}"


class TTSTab(QWidget):
    def __init__(self):
        super().__init__()
        self.media_player = None
        self.audio_output = None
        self.is_playing = False
        self.is_slider_dragging = False
        self.pyttsx3_voice_map = {}  # Tracks local system voice mappings

        self.init_ui()
        self.update_voice_list()  # Populate default engine choices initial setup

    def init_ui(self):
        layout = QVBoxLayout()

        # Engine selection
        self.engine_combo = QComboBox()
        self.engine_combo.addItems(["edge", "pyttsx3"])
        self.engine_combo.currentTextChanged.connect(self.update_voice_list)

        # Voice selection
        self.voice_combo = QComboBox()

        # Speech Rate
        self.rate_input = QLineEdit("0")

        # Text input
        self.text_input = QTextEdit()
        self.text_input.setPlaceholderText("Enter text to convert to speech...")

        # Output file path
        self.output_path = QLineEdit("output.mp3")
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse_file)

        # Convert button
        convert_btn = QPushButton("Convert")
        convert_btn.clicked.connect(self.convert)

        # Modern Player UI layout
        player_container = QHBoxLayout()
        player_container.setSpacing(10)

        # Circular play/stop control
        self.play_stop_btn = QPushButton("▶")
        self.play_stop_btn.setFixedSize(32, 32)
        self.play_stop_btn.setStyleSheet("""
            QPushButton {
                background-color: #ff0000;
                border: none;
                border-radius: 16px;
                color: white;
                font-size: 12px;
                font-weight: bold;
            }
            QPushButton:hover { background-color: #cc0000; }
            QPushButton:pressed { background-color: #990000; }
            QPushButton:disabled { background-color: #cccccc; }
        """)

        # Progress timeline slider
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(0, 1000)
        self.slider.setValue(0)
        self.slider.setEnabled(False)
        self.slider.setStyleSheet("""
            QSlider::groove:horizontal {
                border: 1px solid #999999; height: 4px; background: #ddd; margin: 2px 0; border-radius: 2px;
            }
            QSlider::handle:horizontal {
                background: #ff0000; border: 1px solid #cc0000; width: 12px; margin: -6px 0; border-radius: 6px;
            }
            QSlider::handle:horizontal:hover { background: #ff3333; border: 1px solid #ff0000; }
            QSlider::sub-page:horizontal { background: #ff0000; border-radius: 2px; }
        """)

        # Media timer text
        self.time_label = QLabel("0:00 / 0:00")
        self.time_label.setStyleSheet("color: #666; font-size: 11px;")
        self.time_label.setFixedWidth(80)

        player_container.addWidget(self.play_stop_btn)
        player_container.addWidget(self.slider, 1)
        player_container.addWidget(self.time_label)

        layout.addWidget(QLabel("Engine"))
        layout.addWidget(self.engine_combo)
        layout.addWidget(QLabel("Voice"))
        layout.addWidget(self.voice_combo)
        layout.addWidget(QLabel("Rate (Edge: % offset e.g. 0 or +10 | Pyttsx3: WPM e.g. 200)"))
        layout.addWidget(self.rate_input)
        layout.addWidget(QLabel("Text"))
        layout.addWidget(self.text_input)

        out_layout = QHBoxLayout()
        out_layout.addWidget(QLabel("Output file"))
        out_layout.addWidget(self.output_path)
        out_layout.addWidget(browse_btn)
        layout.addLayout(out_layout)

        layout.addWidget(convert_btn)
        layout.addWidget(QLabel("Preview:"))
        layout.addLayout(player_container)

        self.setLayout(layout)

        # Connect audio infrastructure
        self.media_player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.media_player.setAudioOutput(self.audio_output)

        # Reactive structural audio event connections (replaces tracking timer)
        self.media_player.positionChanged.connect(self.on_position_changed)
        self.media_player.durationChanged.connect(self.on_duration_changed)
        self.media_player.playbackStateChanged.connect(self.on_playback_state_changed)

        self.play_stop_btn.clicked.connect(self.toggle_play_stop)
        self.slider.sliderPressed.connect(self.on_slider_pressed)
        self.slider.sliderReleased.connect(self.on_slider_released)
        self.slider.sliderMoved.connect(self.on_slider_moved)

    def update_voice_list(self):
        """Swaps UI voice options and speed defaults depending on active engine"""
        self.voice_combo.clear()
        engine = self.engine_combo.currentText()

        if engine == "edge":
            self.voice_combo.addItems([
                "en-US-GuyNeural", "en-GB-RyanNeural", "en-AU-WilliamNeural"
            ])
            self.rate_input.setText("0")
        elif engine == "pyttsx3":
            try:
                temp_engine = pyttsx3.init()
                voices = temp_engine.getProperty('voices')
                # Map friendly display name to native platform string GUIDs
                self.pyttsx3_voice_map = {v.name: v.id for v in voices}
                self.voice_combo.addItems(list(self.pyttsx3_voice_map.keys()))
            except Exception:
                self.voice_combo.addItem("Default Native Voice")
            self.rate_input.setText("200")

    def browse_file(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Audio File", "output.mp3",
            "Audio Files (*.mp3 *.wav *.ogg *.flac)"
        )
        if path:
            self.output_path.setText(path)

    def convert(self):
        text = self.text_input.toPlainText().strip()
        if not text:
            QMessageBox.warning(self, "Error", "Please enter some text.")
            return

        out_path = Path(self.output_path.text())
        engine = self.engine_combo.currentText()
        voice_selection = self.voice_combo.currentText()
        rate_str = self.rate_input.text().strip()

        try:
            if engine == "edge":
                rate = f"+{rate_str}%" if not rate_str.startswith(("+", "-")) else f"{rate_str}%"
                asyncio.run(self.synth_edge_tts(text, voice_selection, out_path, rate))
            else:
                voice_id = self.pyttsx3_voice_map.get(voice_selection, None)
                # Ensure speech rates below 1 reset to a safe native speed (200 words per minute)
                try:
                    rate_val = int(rate_str)
                    if rate_val <= 0:
                        rate_val = 200
                except ValueError:
                    rate_val = 200
                self.synth_pyttsx3(text, voice_id, out_path, rate_val)

            QMessageBox.information(self, "Success", f"Saved: {out_path}")
            self.load_audio(str(out_path))
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Generation failed: {str(e)}")

    async def synth_edge_tts(self, text, voice_name, out_path, rate="+0%"):
        communicate = edge_tts.Communicate(text, voice_name, rate=rate)
        audio_bytes = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes.extend(chunk["data"])
        if out_path.suffix.lower() == ".mp3":
            out_path.write_bytes(bytes(audio_bytes))
        else:
            seg = AudioSegment.from_file(io.BytesIO(bytes(audio_bytes)), format="mp3")
            seg.export(out_path, format=out_path.suffix.lstrip("."))

    def synth_pyttsx3(self, text, voice_id, out_path, rate):
        engine = pyttsx3.init()
        if voice_id:
            engine.setProperty("voice", voice_id)
        engine.setProperty("rate", rate)
        suffix = out_path.suffix.lower()

        if suffix == ".wav":
            engine.save_to_file(text, str(out_path))
            engine.runAndWait()
        else:
            with tempfile.TemporaryDirectory() as td:
                tmp_wav = Path(td) / "tmp.wav"
                engine.save_to_file(text, str(tmp_wav))
                engine.runAndWait()

                if tmp_wav.exists() and tmp_wav.stat().st_size > 0:
                    seg = AudioSegment.from_wav(tmp_wav)
                    seg.export(out_path, format=suffix.lstrip("."))
                else:
                    raise RuntimeError("Pyttsx3 local rendering loop failed.")

    # ------------------------------
    # Reactive Player Infrastructure
    # ------------------------------

    def on_position_changed(self, position):
        """Fires natively whenever audio frames progress"""
        if not self.is_slider_dragging and self.media_player.duration() > 0:
            duration = self.media_player.duration()
            self.time_label.setText(f"{format_time(position)} / {format_time(duration)}")
            progress = int((position / duration) * 1000)
            self.slider.setValue(progress)

    def on_duration_changed(self, duration):
        """Fires natively when new track metadata resolves"""
        if duration > 0:
            position = self.media_player.position()
            self.time_label.setText(f"{format_time(position)} / {format_time(duration)}")

    def toggle_play_stop(self):
        if self.is_playing:
            self.stop_audio()
        else:
            self.play_audio()

    def play_audio(self):
        self.media_player.play()
        self.is_playing = True
        self.play_stop_btn.setText("⏹")

    def stop_audio(self):
        self.media_player.stop()
        self.slider.setValue(0)
        self.is_playing = False
        self.play_stop_btn.setText("▶")
        duration = self.media_player.duration()
        self.time_label.setText(f"0:00 / {format_time(duration if duration > 0 else 0)}")

    def on_playback_state_changed(self, state):
        if state == QMediaPlayer.PlaybackState.StoppedState:
            # Safely check if track ended naturally rather than via user override
            if self.media_player.position() >= self.media_player.duration() - 100:
                self.stop_audio()

    def on_slider_pressed(self):
        self.is_slider_dragging = True

    def on_slider_released(self):
        self.is_slider_dragging = False
        self.seek_audio(self.slider.value())

    def on_slider_moved(self, value):
        if self.media_player.duration() > 0:
            current_time = int((value / 1000) * self.media_player.duration())
            duration = self.media_player.duration()
            self.time_label.setText(f"{format_time(current_time)} / {format_time(duration)}")

    def seek_audio(self, value):
        if self.media_player.duration() > 0:
            new_pos = int((value / 1000) * self.media_player.duration())
            self.media_player.setPosition(new_pos)

    def load_audio(self, path):
        self.media_player.setSource(QUrl.fromLocalFile(path))
        self.slider.setEnabled(True)
        self.slider.setValue(0)
        self.is_playing = False
        self.play_stop_btn.setText("▶")