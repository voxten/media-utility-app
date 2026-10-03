"""
Modern Tactical Vertical Scrollbar Generator (High-Res 4K Ready)
Generates:
- scrollbar_v_track.png (Recessed vertical track, 9-sliceable)
- scrollbar_v_handle_normal.png (Sleek slider handle, 9-sliceable)
- scrollbar_v_handle_hover.png (Tactical emerald glow on hover)
- scrollbar_v_handle_pressed.png (Active drag state)
- scrollbar_v_grip_lines.png (Centered micro-grooves, fixed size)
"""

import os
from PIL import Image, ImageDraw

# -------------------------------------------------------------------------
# PALETTE TOKENS (Modern Tactical Zombie Survival)
# -------------------------------------------------------------------------
COLOR_BG_WELL        = (8, 9, 8, 255)          # Deep recessed groove
COLOR_BG_WELL_LIGHT  = (16, 19, 17, 255)

COLOR_HANDLE_TOP     = (42, 50, 46, 255)       # Sleek tactical slate top
COLOR_HANDLE_BOT     = (20, 24, 22, 255)       # Dark carbon bottom

COLOR_HOVER_TOP      = (30, 68, 48, 255)       # Emerald tinted slate
COLOR_HOVER_BOT      = (14, 34, 24, 255)

COLOR_PRESSED_TOP    = (16, 42, 30, 255)
COLOR_PRESSED_BOT    = (8, 20, 14, 255)

COLOR_BORDER_SUBTLE  = (48, 56, 51, 230)       # Hairline border
COLOR_BORDER_LIGHT   = (85, 98, 90, 255)       # Specular highlight
COLOR_EMERALD_GLOW   = (16, 185, 129, 255)     # Survival Green accent
COLOR_SLATE_ACCENT   = (148, 163, 184, 255)


# -------------------------------------------------------------------------
# GRAPHIC ENGINE HELPERS
# -------------------------------------------------------------------------
def create_vertical_gradient(w: int, h: int, top_col: tuple, bot_col: tuple) -> Image.Image:
    base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y in range(h):
        factor = y / max(1, h - 1)
        r = int(top_col[0] + (bot_col[0] - top_col[0]) * factor)
        g = int(top_col[1] + (bot_col[1] - top_col[1]) * factor)
        b = int(top_col[2] + (bot_col[2] - top_col[2]) * factor)
        a = int(top_col[3] + (bot_col[3] - top_col[3]) * factor)
        line = Image.new("RGBA", (w, 1), (r, g, b, a))
        base.paste(line, (0, y))
    return base


def render_modern_box(w: int, h: int, radius: int, top_col: tuple, bot_col: tuple, border_col: tuple, border_w: int = 2) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    half_b = border_w / 2.0
    x0, y0 = half_b, half_b
    x1, y1 = w - half_b - 1, h - half_b - 1

    mask = Image.new("L", (w, h), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([int(x0), int(y0), int(x1), int(y1)], radius=radius, fill=255)

    grad = create_vertical_gradient(w, h, top_col, bot_col)
    grad.putalpha(mask)
    canvas.paste(grad, (0, 0), grad)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=border_col, width=border_w)
    return canvas


# -------------------------------------------------------------------------
# VERTICAL SCROLLBAR GENERATOR
# -------------------------------------------------------------------------
def generate_scrollbar_suite(output_dir="./HighRes_Survival_UI", ssaa=2):
    os.makedirs(output_dir, exist_ok=True)

    def export(img: Image.Image, name: str, w: int, h: int):
        final = img.resize((w, h), Image.Resampling.LANCZOS)
        path = os.path.join(output_dir, f"{name}.png")
        final.save(path, "PNG")
        print(f"[OK] {name}.png -> {w}x{h} px")

    # 1. TŁO SCROLLA / PROWADNICA (Track: 48x400 px, 9-sliceable)
    w, h = 48, 400
    hw, hh = w * ssaa, h * ssaa
    radius = (w // 2) * ssaa  # Perfekcyjne kapsułkowe zakończenie toru
    track_img = render_modern_box(hw, hh, radius, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_BORDER_SUBTLE, 3 * ssaa)
    export(track_img, "scrollbar_v_track", w, h)

    # 2. SUWAK NORMAL (Handle Normal: 36x240 px, 9-sliceable)
    w, h = 36, 240
    hw, hh = w * ssaa, h * ssaa
    radius = (w // 2) * ssaa
    handle_normal = render_modern_box(hw, hh, radius, COLOR_HANDLE_TOP, COLOR_HANDLE_BOT, COLOR_BORDER_LIGHT, 3 * ssaa)
    export(handle_normal, "scrollbar_v_handle_normal", w, h)

    # 3. SUWAK HOVER (Handle Hover: z neonową zieloną poświatą)
    handle_hover = render_modern_box(hw, hh, radius, COLOR_HOVER_TOP, COLOR_HOVER_BOT, COLOR_EMERALD_GLOW, 3 * ssaa)
    export(handle_hover, "scrollbar_v_handle_hover", w, h)

    # 4. SUWAK PRESSED / DRAGGING (Handle Pressed: głębszy stan po kliknięciu)
    handle_pressed = render_modern_box(hw, hh, radius, COLOR_PRESSED_TOP, COLOR_PRESSED_BOT, COLOR_EMERALD_GLOW, 4 * ssaa)
    export(handle_pressed, "scrollbar_v_handle_pressed", w, h)

    # 5. DETAL: NACIĘCIA TAKTYCZNE (Grip Lines: 20x36 px, Fixed)
    # 3 poziome żłobienia wycentrowane na uchwycie
    gw, gh = 20, 36
    hgw, hgh = gw * ssaa, gh * ssaa
    grip_img = Image.new("RGBA", (hgw, hgh), (0, 0, 0, 0))
    d = ImageDraw.Draw(grip_img)
    line_w = 3 * ssaa
    for y_offset in [-10 * ssaa, 0, 10 * ssaa]:
        cy = (hgh // 2) + y_offset
        # Rowek cienia + jasna krawędź odbicia światła
        d.line([(2 * ssaa, cy), (hgw - 2 * ssaa, cy)], fill=(10, 12, 11, 255), width=line_w)
        d.line([(2 * ssaa, cy + line_w), (hgw - 2 * ssaa, cy + line_w)], fill=COLOR_BORDER_LIGHT, width=max(1, ssaa))
    export(grip_img, "scrollbar_v_grip_lines", gw, gh)

    print(f"\n✓ Wszystkie elementy scrollbara zapisano w: '{os.path.abspath(output_dir)}'")


if __name__ == "__main__":
    generate_scrollbar_suite()