"""Generates the app icon (assets/app.ico + assets/app.png + frontend/public/app.png).

Rounded square with the brand gradient (same as the navigation logo) and a white
play symbol with a small sparkle. Run: python scripts/make_icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024  # drawn large, downsampled for crisp small sizes
START, END = (15, 108, 189), (138, 92, 246)  # #0f6cbd → #8a5cf6


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(START, END))
    return img


def draw_icon() -> Image.Image:
    s = SIZE
    base = gradient(s // 4).resize((s, s), Image.Resampling.BICUBIC).convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([s * 0.04, s * 0.04, s * 0.96, s * 0.96], radius=s * 0.22, fill=255)

    icon = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    icon.paste(base, (0, 0), mask)

    # Soft inner highlight at the top for depth.
    glow = Image.new("RGBA", (s, s), (255, 255, 255, 0))
    ImageDraw.Draw(glow).ellipse([-s * 0.2, -s * 0.75, s * 1.2, s * 0.45], fill=(255, 255, 255, 22))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.04))
    icon = Image.alpha_composite(icon, Image.composite(glow, Image.new("RGBA", (s, s)), mask))

    d = ImageDraw.Draw(icon)
    # Play triangle, slightly right of centre (optical centring).
    cx, cy, r = s * 0.53, s * 0.52, s * 0.25
    d.polygon([(cx - r * 0.8, cy - r), (cx - r * 0.8, cy + r), (cx + r * 0.95, cy)], fill="white")
    # Four-point sparkle top-right.
    sx, sy, a, b = s * 0.74, s * 0.26, s * 0.09, s * 0.025
    d.polygon([(sx, sy - a), (sx + b, sy - b), (sx + a, sy), (sx + b, sy + b), (sx, sy + a), (sx - b, sy + b), (sx - a, sy), (sx - b, sy - b)], fill="white")
    return icon


def main() -> None:
    icon = draw_icon()
    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    big = icon.resize((256, 256), Image.Resampling.LANCZOS)
    big.save(assets / "app.png")
    big.save(assets / "app.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    public = ROOT / "frontend" / "public"
    public.mkdir(parents=True, exist_ok=True)
    icon.resize((128, 128), Image.Resampling.LANCZOS).save(public / "app.png")
    print(f"written: {assets / 'app.ico'}, {assets / 'app.png'}, {public / 'app.png'}")


if __name__ == "__main__":
    main()
