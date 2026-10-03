"""Batch image format conversion (Pillow)."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from backend.core.jobs import JobContext

SUPPORTED_FORMATS = ["PNG", "WEBP", "JPEG", "GIF", "TIFF", "BMP", "PDF"]
ALPHA_FORMATS = {"png", "webp", "gif", "tiff"}
EXTENSION_ALIASES = {"jpeg": {".jpeg", ".jpg"}, "tiff": {".tiff", ".tif"}}
OUTPUT_EXTENSION = {"jpeg": "jpg"}


@dataclass
class ConvertOptions:
    output_dir: str
    out_fmt: str
    in_fmt: Optional[str] = None
    input_dir: Optional[str] = None
    files: List[str] = field(default_factory=list)
    quality: int = 80
    method: int = 6

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ConvertOptions":
        return cls(
            output_dir=data["outputDir"],
            out_fmt=data["outFormat"],
            in_fmt=data.get("inFormat"),
            input_dir=data.get("inputDir"),
            files=list(data.get("files") or []),
            quality=int(data.get("quality", 80)),
            method=int(data.get("method", 6)),
        )


def extensions_for(fmt: str) -> set:
    fmt = fmt.lower()
    return EXTENSION_ALIASES.get(fmt, {f".{fmt}"})


def find_source_files(input_dir: str, in_fmt: str) -> List[Path]:
    exts = extensions_for(in_fmt)
    return sorted(
        p for p in Path(input_dir).iterdir() if p.is_file() and p.suffix.lower() in exts
    )


def _has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def convert_image(src: Path, output_dir: Path, out_fmt: str, quality: int = 80, method: int = 6) -> Path:
    out_fmt = out_fmt.lower()
    target = output_dir / f"{src.stem}.{OUTPUT_EXTENSION.get(out_fmt, out_fmt)}"

    with Image.open(src) as img:
        if out_fmt in ALPHA_FORMATS and _has_alpha(img):
            img = img.convert("RGBA")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        save_kwargs: Dict[str, Any] = {}
        if out_fmt in ("webp", "jpeg"):
            save_kwargs["quality"] = quality
        if out_fmt == "webp":
            save_kwargs["method"] = method
        img.save(target, out_fmt.upper(), **save_kwargs)
    return target


def convert(ctx: JobContext, opts: ConvertOptions) -> Dict[str, Any]:
    """Convert either an explicit file list or every ``in_fmt`` file in ``input_dir``."""
    ctx.progress(None, "converter.status.scanning")
    if opts.files:
        sources = [Path(f) for f in opts.files if Path(f).is_file()]
    elif opts.input_dir and opts.in_fmt:
        sources = find_source_files(opts.input_dir, opts.in_fmt)
    else:
        raise ValueError("Either files or inputDir + inFormat must be provided")

    output_dir = Path(opts.output_dir)
    result: Dict[str, Any] = {
        "total": len(sources),
        "converted": 0,
        "failed": 0,
        "inputBytes": 0,
        "outputBytes": 0,
        "outputDir": str(output_dir),
    }
    if not sources:
        ctx.progress(100, "converter.status.noFiles")
        return result

    output_dir.mkdir(parents=True, exist_ok=True)
    for idx, src in enumerate(sources):
        ctx.check_cancelled()
        ctx.progress(idx / len(sources) * 100, "converter.status.converting", {"file": src.name})
        try:
            target = convert_image(src, output_dir, opts.out_fmt, opts.quality, opts.method)
            in_size, out_size = src.stat().st_size, target.stat().st_size
            result["converted"] += 1
            result["inputBytes"] += in_size
            result["outputBytes"] += out_size
            ctx.log("converter.log.converted", "info", src=src.name, dst=target.name, kb=out_size // 1024)
        except Exception as exc:  # noqa: BLE001 - one broken file must not stop the batch
            result["failed"] += 1
            ctx.log("converter.log.failed", "error", src=src.name, error=str(exc))

    ctx.progress(100, "converter.status.done")
    return result
