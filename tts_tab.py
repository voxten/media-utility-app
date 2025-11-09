from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QTextEdit, QComboBox, QFileDialog, QMessageBox, QSlider,
)
from PyQt6.QtCore import Qt, QUrl, QTimer, QBuffer
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
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        # Engine
        self.engine_combo = QComboBox()
        self.engine_combo.addItems(["edge", "pyttsx3"])

        # Voice
        self.voice_combo = QComboBox()
        self.voice_combo.addItems([
            "en-US-GuyNeural", "en-GB-RyanNeural", "en-AU-WilliamNeural"
        ])

        # Rate
        self.rate_input = QLineEdit("0")

        # Text input
        self.text_input = QTextEdit()
        self.text_input.setPlaceholderText("Enter text to convert to speech...")

        # Output
        self.output_path = QLineEdit("output.mp3")
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse_file)

        # Convert button
        convert_btn = QPushButton("Convert")
        convert_btn.clicked.connect(self.convert)

        # Modern YouTube-style Player UI
        player_container = QHBoxLayout()
        player_container.setSpacing(10)  # Space between button and slider

        # Circular play/stop button
        self.play_stop_btn = QPushButton("▶")
        self.play_stop_btn.setFixedSize(32, 32)  # Circular size
        self.play_stop_btn.setStyleSheet("""
            QPushButton {
                background-color: #ff0000;
                border: none;
                border-radius: 16px;
                color: white;
                font-size: 12px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #cc0000;
            }
            QPushButton:pressed {
                background-color: #990000;
            }
            QPushButton:disabled {
                background-color: #cccccc;
            }
        """)

        # Progress slider
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(0, 1000)  # Higher precision for smoother movement
        self.slider.setValue(0)
        self.slider.setEnabled(False)
        self.slider.setStyleSheet("""
            QSlider::groove:horizontal {
                border: 1px solid #999999;
                height: 4px;
                background: #ddd;
                margin: 2px 0;
                border-radius: 2px;
            }
            QSlider::handle:horizontal {
                background: #ff0000;
                border: 1px solid #cc0000;
                width: 12px;
                margin: -6px 0;
                border-radius: 6px;
            }
            QSlider::handle:horizontal:hover {
                background: #ff3333;
                border: 1px solid #ff0000;
            }
            QSlider::sub-page:horizontal {
                background: #ff0000;
                border-radius: 2px;
            }
        """)

        # Time label
        self.time_label = QLabel("0:00 / 0:00")
        self.time_label.setStyleSheet("color: #666; font-size: 11px;")
        self.time_label.setFixedWidth(80)

        player_container.addWidget(self.play_stop_btn)
        player_container.addWidget(self.slider, 1)  # 1 = stretch factor
        player_container.addWidget(self.time_label)

        layout.addWidget(QLabel("Engine"))
        layout.addWidget(self.engine_combo)
        layout.addWidget(QLabel("Voice"))
        layout.addWidget(self.voice_combo)
        layout.addWidget(QLabel("Rate (%)"))
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

        # Setup media player
        self.media_player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.media_player.setAudioOutput(self.audio_output)

        self.timer = QTimer()
        self.timer.timeout.connect(self.update_player_ui)
        self.play_stop_btn.clicked.connect(self.toggle_play_stop)
        self.slider.sliderPressed.connect(self.on_slider_pressed)
        self.slider.sliderReleased.connect(self.on_slider_released)
        self.slider.sliderMoved.connect(self.on_slider_moved)

        # Connect media player signals
        self.media_player.playbackStateChanged.connect(self.on_playback_state_changed)

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
        voice = self.voice_combo.currentText()
        rate_str = self.rate_input.text().strip()

        try:
            if engine == "edge":
                rate = f"+{rate_str}%" if not rate_str.startswith(("+", "-")) else f"{rate_str}%"
                asyncio.run(self.synth_edge_tts(text, voice, out_path, rate))
            else:
                self.synth_pyttsx3(text, voice, out_path, int(rate_str))
            QMessageBox.information(self, "Success", f"Saved: {out_path}")
            self.load_audio(str(out_path))
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

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

    async def stream_edge_tts(self, text, voice_name, rate="+0%"):
        self.audio_buffer = QBuffer()
        self.audio_buffer.open(QBuffer.OpenModeFlag.ReadWrite)
        communicate = edge_tts.Communicate(text, voice_name, rate=rate)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                self.audio_buffer.write(chunk["data"])
                self.audio_buffer.flush()
        self.audio_buffer.seek(0)
        self.media_player.setSourceDevice(self.audio_buffer)
        self.slider.setEnabled(True)
        self.media_player.play()

    def synth_pyttsx3(self, text, voice_id, out_path, rate):
        engine = pyttsx3.init()
        engine.setProperty("voice", voice_id)
        engine.setProperty("rate", int(rate))
        suffix = out_path.suffix.lower()
        if suffix == ".wav":
            engine.save_to_file(text, str(out_path))
            engine.runAndWait()
        else:
            with tempfile.TemporaryDirectory() as td:
                tmp_wav = Path(td) / "tmp.wav"
                engine.save_to_file(text, str(tmp_wav))
                engine.runAndWait()
                seg = AudioSegment.from_wav(tmp_wav)
                seg.export(out_path, format=suffix.lstrip("."))

    # ------------------------------
    # Modern YouTube-style Audio player logic
    # ------------------------------

    def update_player_ui(self):
        """Update slider position and time label"""
        if self.media_player.duration() > 0:
            current_pos = self.media_player.position()
            duration = self.media_player.duration()

            # Update time label
            self.time_label.setText(f"{format_time(current_pos)} / {format_time(duration)}")

            # Update slider (only if user is not dragging it)
            if not self.slider.isSliderDown():
                progress = int((current_pos / duration) * 1000)
                self.slider.setValue(progress)

    def toggle_play_stop(self):
        """Toggle between play and stop states"""
        if self.is_playing:
            self.stop_audio()
        else:
            self.play_audio()

    def play_audio(self):
        """Start or resume playback"""
        self.media_player.play()
        self.timer.start(50)  # Update more frequently for smoother progress
        self.is_playing = True
        self.play_stop_btn.setText("⏹")  # Stop icon

    def stop_audio(self):
        """Stop playback and reset to beginning"""
        self.media_player.stop()
        self.timer.stop()
        self.slider.setValue(0)
        self.time_label.setText("0:00 / 0:00")
        self.is_playing = False
        self.play_stop_btn.setText("▶")  # Play icon

    def on_playback_state_changed(self, state):
        """Handle changes in playback state"""
        if state == QMediaPlayer.PlaybackState.StoppedState:
            self.is_playing = False
            self.play_stop_btn.setText("▶")
            self.timer.stop()

    def on_slider_pressed(self):
        """Pause updates while user is dragging the slider"""
        self.timer.stop()

    def on_slider_released(self):
        """Seek to new position when user releases slider"""
        self.seek_audio(self.slider.value())
        self.timer.start(50)

    def on_slider_moved(self, value):
        """Update time label while user is dragging slider"""
        if self.media_player.duration() > 0:
            current_time = int((value / 1000) * self.media_player.duration())
            duration = self.media_player.duration()
            self.time_label.setText(f"{format_time(current_time)} / {format_time(duration)}")

    def seek_audio(self, value):
        """Seek to specific position in audio"""
        if self.media_player.duration() > 0:
            new_pos = int((value / 1000) * self.media_player.duration())
            self.media_player.setPosition(new_pos)

    def load_audio(self, path):
        """Load audio file for playback"""
        self.media_player.setSource(QUrl.fromLocalFile(path))
        self.slider.setEnabled(True)
        # Reset UI
        self.slider.setValue(0)
        self.time_label.setText("0:00 / 0:00")
        self.is_playing = False
        self.play_stop_btn.setText("▶")