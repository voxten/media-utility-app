# Third-party notices

Media Studio is built on the open-source components below. The installer bundles the Python runtime and the
"bundled" libraries; the "downloaded" ones are fetched on demand from Settings → Dependencies or from a tool's banner
and are not part of the installer.

## Bundled

| Component | License | Project |
|---|---|---|
| Python | PSF-2.0 | https://www.python.org |
| pywebview | BSD-3-Clause | https://github.com/r0x0r/pywebview |
| pythonnet | MIT | https://github.com/pythonnet/pythonnet |
| bottle, proxy_tools | MIT | https://bottlepy.org |
| yt-dlp, yt-dlp-ejs | Unlicense (yt-dlp-ejs: Unlicense, MIT, ISC) | https://github.com/yt-dlp/yt-dlp |
| curl_cffi | MIT | https://github.com/lexiforest/curl_cffi |
| gallery-dl | GPL-2.0-only | https://github.com/mikf/gallery-dl |
| mutagen | GPL-2.0-or-later | https://github.com/quodlibet/mutagen |
| PyMuPDF (MuPDF) | AGPL-3.0 or commercial | https://github.com/pymupdf/PyMuPDF |
| Pillow | MIT-CMU | https://python-pillow.org |
| OpenCV (opencv-python) | Apache-2.0 | https://github.com/opencv/opencv-python |
| NumPy | BSD-3-Clause and others | https://numpy.org |
| SciPy | BSD-3-Clause | https://scipy.org |
| ImageHash | BSD-2-Clause | https://github.com/JohannesBuchner/imagehash |
| pymediainfo (MediaInfo) | MIT (MediaInfo: BSD-2-Clause) | https://github.com/sbraz/pymediainfo |
| requests | Apache-2.0 | https://requests.readthedocs.io |
| edge-tts | LGPL-3.0 | https://github.com/rany2/edge-tts |
| pyttsx3 | MPL-2.0 | https://github.com/nateshmbhat/pyttsx3 |
| pystray | LGPL-3.0 | https://github.com/moses-palmer/pystray |
| Send2Trash | BSD-3-Clause | https://github.com/arsenetar/send2trash |
| pywin32 | PSF-2.0 | https://github.com/mhammond/pywin32 |
| audioop-lts | PSF-2.0 | https://github.com/AbstractUmbra/audioop |
| React, Fluent UI, zustand, i18next | MIT | https://react.dev, https://react.fluentui.dev |
| PyInstaller bootloader | GPL-2.0-or-later with the bootloader exception | https://pyinstaller.org |

## Downloaded on demand

| Component | License | Project |
|---|---|---|
| FFmpeg (GyanD essentials build) | GPL-3.0 | https://www.gyan.dev/ffmpeg/builds |
| gifsicle | GPL-2.0 | https://www.lcdf.org/gifsicle |
| PyTorch | BSD-3-Clause | https://pytorch.org |
| rembg | MIT | https://github.com/danielgatis/rembg |
| ONNX Runtime | MIT | https://onnxruntime.ai |
| PyMatting | MIT | https://github.com/pymatting/pymatting |
| faster-whisper, CTranslate2 | MIT | https://github.com/SYSTRAN/faster-whisper |
| Whisper model weights | MIT | https://github.com/openai/whisper |
| BiRefNet weights | MIT | https://github.com/ZhengPeng7/BiRefNet |
| IS-Net (DIS) weights | Apache-2.0 | https://github.com/xuebinqin/DIS |
| U²-Net weights | Apache-2.0 | https://github.com/xuebinqin/U-2-Net |
| Real-ESRGAN weights | BSD-3-Clause | https://github.com/xinntao/Real-ESRGAN |
| LaMa weights | Apache-2.0 | https://github.com/advimman/lama |

Each component keeps its own copyright and license; the full license texts are in the projects linked above and,
for the bundled Python packages, in their `*.dist-info` folders inside the installation.
