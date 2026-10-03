"""
High-Resolution Modern Tactical Survival UI Generator (Clean & Fixed Geometry)
Fixes:
- Removed uneven top/bottom edge lines on buttons and panels.
- Fixed clipped/flat bottom vertex on checkbox checkmarks and dropdown arrows.
- Proper border insets so outlines are never clipped by texture boundaries.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

# -------------------------------------------------------------------------
# PALETTE TOKENS (Modern Tactical Zombie Survival)
# -------------------------------------------------------------------------
COLOR_BG_CARD_TOP    = (24, 27, 25, 245)      # Top surface subtle green-zinc
COLOR_BG_CARD_BOT    = (12, 14, 13, 252)      # Deep obsidian bottom
COLOR_BG_WELL        = (8, 9, 8, 255)         # Recessed dark slot
COLOR_BG_WELL_LIGHT  = (16, 19, 17, 255)

COLOR_BORDER_SUBTLE  = (48, 56, 51, 230)      # Clean hairline border
COLOR_BORDER_LIGHT   = (85, 98, 90, 255)      # Refined edge highlight

# Tactical Neon Accents
COLOR_EMERALD_GLOW   = (16, 185, 129, 255)    # Survival Green
COLOR_EMERALD_DARK   = (6, 78, 59, 255)
COLOR_SLATE_ACCENT   = (148, 163, 184, 255)   # Slate Steel Gray
COLOR_SLATE_DARK     = (30, 41, 59, 255)
COLOR_CRIMSON_GLOW   = (239, 68, 68, 255)     # Biohazard Danger Red
COLOR_CRIMSON_DARK   = (127, 29, 29, 255)
COLOR_AMBER_GLOW     = (245, 158, 11, 255)    # Hazard / Burden Amber


# -------------------------------------------------------------------------
# GRAPHIC ENGINE HELPERS
# -------------------------------------------------------------------------
def create_vertical_gradient(w: int, h: int, top_col: tuple, bot_col: tuple) -> Image.Image:
    """Generates a smooth vertical 2-color linear gradient."""
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
    """
    Renders a pristine container with an evenly inset border to prevent
    texture boundary clipping and eliminate line imperfections.
    """
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    # Inset box by half of border_w so stroke never clips at image boundaries
    half_b = border_w / 2.0
    x0, y0 = half_b, half_b
    x1, y1 = w - half_b - 1, h - half_b - 1

    # 1. Gradient Fill Mask
    mask = Image.new("L", (w, h), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([int(x0), int(y0), int(x1), int(y1)], radius=radius, fill=255)

    grad = create_vertical_gradient(w, h, top_col, bot_col)
    grad.putalpha(mask)
    canvas.paste(grad, (0, 0), grad)

    # 2. Perfect Uniform Border (no manual overlapping lines)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=border_col, width=border_w)

    return canvas


def draw_smooth_polyline(draw: ImageDraw.ImageDraw, points: list, color: tuple, width: int):
    """
    Draws a polyline with fully rounded vertices and caps to prevent
    clipped, flat, or truncated bottom corners (used for checkmarks and chevrons).
    """
    draw.line(points, fill=color, width=width, joint="curve")
    r = width / 2.0
    for x, y in points:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


# -------------------------------------------------------------------------
# HIGH-RES SUITE GENERATOR
# -------------------------------------------------------------------------
def generate_highres_suite(output_dir="./HighRes_Survival_UI", ssaa=2):
    os.makedirs(output_dir, exist_ok=True)

    def export(img: Image.Image, name: str, w: int, h: int):
        final = img.resize((w, h), Image.Resampling.LANCZOS)
        path = os.path.join(output_dir, f"{name}.png")
        final.save(path, "PNG")
        print(f"[OK] {name}.png -> {w}x{h} px")

    # =========================================================================
    # 1. RADIAL DIALS (512x512 px)
    # =========================================================================
    w, h = 512, 512
    hw, hh = w * ssaa, h * ssaa
    thickness = 40 * ssaa
    margin = 12 * ssaa

    # Radial Background
    img_bg = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img_bg)
    outer_bbox = [margin, margin, hw - margin, hh - margin]
    inner_offset = margin + thickness
    inner_bbox = [inner_offset, inner_offset, hw - inner_offset, hh - inner_offset]

    d.ellipse(inner_bbox, fill=(11, 14, 12, 230))
    d.ellipse(outer_bbox, outline=(24, 30, 26, 255), width=thickness)
    export(img_bg, "radial_bg", w, h)

    # Radial Fill Mask
    img_fill = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img_fill)
    d.ellipse(outer_bbox, outline=(255, 255, 255, 255), width=thickness)
    export(img_fill, "radial_fill", w, h)

    # =========================================================================
    # 2. TOGGLE (256x128 px Track, 112x112 px Handle)
    # =========================================================================
    w, h = 256, 128
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, hh // 2, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(img, "toggle_track_off", w, h)

    img = render_modern_box(hw, hh, hh // 2, COLOR_EMERALD_DARK, (10, 45, 30, 255), COLOR_EMERALD_GLOW, 4 * ssaa)
    d = ImageDraw.Draw(img)
    d.ellipse([hw - hh + 24 * ssaa, 24 * ssaa, hw - 24 * ssaa, hh - 24 * ssaa], fill=COLOR_EMERALD_GLOW)
    export(img, "toggle_track_on", w, h)

    w, h = 112, 112
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, hh // 2, (230, 240, 235, 255), (150, 165, 158, 255), (255, 255, 255, 220), 4 * ssaa)
    d = ImageDraw.Draw(img)
    d.line([(hw // 2, hh * 0.3), (hw // 2, hh * 0.7)], fill=(80, 95, 88, 255), width=6 * ssaa)
    export(img, "toggle_handle", w, h)

    # =========================================================================
    # 3. CHECKBOXES (128x128 px) - FIXED CHECKMARK
    # =========================================================================
    w, h = 128, 128
    hw, hh = w * ssaa, h * ssaa
    r = 28 * ssaa

    # Normal
    img = render_modern_box(hw, hh, r, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(img, "checkbox_normal", w, h)

    # Checked: Centered with smooth continuous joint (no cut-off bottom)
    img = render_modern_box(hw, hh, r, (12, 35, 22, 255), COLOR_BG_WELL, COLOR_EMERALD_GLOW, 4 * ssaa)
    d = ImageDraw.Draw(img)
    pts = [
        (hw * 0.28, hh * 0.50),
        (hw * 0.45, hh * 0.68),
        (hw * 0.74, hh * 0.32)
    ]
    draw_smooth_polyline(d, pts, COLOR_EMERALD_GLOW, width=12 * ssaa)
    export(img, "checkbox_checked", w, h)

    # Hover
    img = render_modern_box(hw, hh, r, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_EMERALD_GLOW, 5 * ssaa)
    export(img, "checkbox_hover", w, h)

    # =========================================================================
    # 4. DROPDOWNS - FIXED CHEVRON ARROW
    # =========================================================================
    # Dropdown Field Box (Clean, without awkward clipping divider)
    w, h = 880, 168
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 28 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(img, "dropdown_field", w, h)

    # Dropdown Arrow: Perfectly centered chevron with smooth rounded apex
    w, h = 96, 96
    hw, hh = w * ssaa, h * ssaa
    img = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pts = [
        (hw * 0.28, hh * 0.40),
        (hw * 0.50, hh * 0.62),
        (hw * 0.72, hh * 0.40)
    ]
    draw_smooth_polyline(d, pts, COLOR_SLATE_ACCENT, width=10 * ssaa)
    export(img, "dropdown_arrow", w, h)

    # Dropdown Popup Panel (Clean 9-slice frame)
    w, h = 880, 600
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 32 * ssaa, (16, 18, 17, 255), (8, 10, 9, 255), COLOR_BORDER_LIGHT, 4 * ssaa)
    export(img, "dropdown_popup_panel", w, h)

    # =========================================================================
    # 5. SLIDERS (Track: 800x48 px, Handle: 80x120 px)
    # =========================================================================
    w, h = 800, 48
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, hh // 2, COLOR_BG_WELL, COLOR_BG_WELL, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(img, "slider_track_bg", w, h)

    img = render_modern_box(hw, hh, hh // 2, COLOR_EMERALD_GLOW, (12, 120, 75, 255), COLOR_EMERALD_GLOW, 2 * ssaa)
    export(img, "slider_fill", w, h)

    w, h = 80, 120
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 24 * ssaa, (230, 240, 235, 255), (140, 155, 148, 255), (255, 255, 255, 220), 4 * ssaa)
    d = ImageDraw.Draw(img)
    d.line([(hw // 2, hh * 0.35), (hw // 2, hh * 0.65)], fill=(70, 85, 78, 255), width=6 * ssaa)
    export(img, "slider_handle", w, h)

    # =========================================================================
    # 6. PANELS (Pristine 9-Slice Geometry, No floating divider lines)
    # =========================================================================
    w, h = 256, 256
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 28 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(img, "panel_small", w, h)

    w, h = 512, 512
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 40 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(img, "panel_standard", w, h)

    # Large Panel without floating lines so it stretches cleanly in 9-slice
    w, h = 1024, 1024
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 52 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 5 * ssaa)
    export(img, "panel_large", w, h)

    # =========================================================================
    # 7. BUTTONS (720x176 px) - CLEAN SURFACE (No flawed top/bottom lines)
    # =========================================================================
    w, h = 720, 176
    hw, hh = w * ssaa, h * ssaa
    r = 30 * ssaa

    # Button 1: Modern Tactical Emerald (Uniform, pristine outline)
    img = render_modern_box(hw, hh, r, (22, 64, 42, 255), (10, 32, 22, 255), COLOR_EMERALD_GLOW, 4 * ssaa)
    export(img, "button_1_tactical_green", w, h)

    # Button 2: Modern Slate Steel
    img = render_modern_box(hw, hh, r, (36, 44, 40, 255), (18, 22, 20, 255), COLOR_BORDER_LIGHT, 4 * ssaa)
    export(img, "button_2_slate_steel", w, h)

    # Button 3: Modern Biohazard Crimson
    img = render_modern_box(hw, hh, r, (65, 20, 20, 255), (32, 10, 10, 255), COLOR_CRIMSON_GLOW, 4 * ssaa)
    export(img, "button_3_danger_crimson", w, h)

    # =========================================================================
    # 8. ITEM SLOTS (Card: 1440x336 px, Grid: 360x360 px)
    # =========================================================================
    w, h = 1440, 336
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 36 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    d = ImageDraw.Draw(img)

    # 1. Left Icon Bay (Recessed square well)
    ib_pad = 32 * ssaa
    ib_size = hh - (ib_pad * 2)
    ib_box = [ib_pad, ib_pad, ib_pad + ib_size, ib_pad + ib_size]
    d.rounded_rectangle(ib_box, radius=24 * ssaa, fill=COLOR_BG_WELL, outline=COLOR_BORDER_SUBTLE, width=4 * ssaa)
    ic_cx, ic_cy = (ib_box[0] + ib_box[2]) // 2, (ib_box[1] + ib_box[3]) // 2
    d.line([(ic_cx - 16 * ssaa, ic_cy), (ic_cx + 16 * ssaa, ic_cy)], fill=(45, 54, 48, 255), width=4 * ssaa)
    d.line([(ic_cx, ic_cy - 16 * ssaa), (ic_cx, ic_cy + 16 * ssaa)], fill=(45, 54, 48, 255), width=4 * ssaa)

    # 2. Category Pill Slot
    cat_x0 = ib_box[2] + 44 * ssaa
    cat_y0 = 36 * ssaa
    cat_x1 = cat_x0 + 380 * ssaa
    cat_y1 = cat_y0 + 64 * ssaa
    d.rounded_rectangle([cat_x0, cat_y0, cat_x1, cat_y1], radius=32 * ssaa, fill=(18, 28, 22, 255), outline=COLOR_EMERALD_GLOW, width=3 * ssaa)
    d.ellipse([cat_x0 + 20 * ssaa, cat_y0 + 20 * ssaa, cat_x0 + 44 * ssaa, cat_y1 - 20 * ssaa], fill=COLOR_EMERALD_GLOW)

    # 3. Horizontal Separator
    d.line([(cat_x0, 188 * ssaa), (hw - 44 * ssaa, 188 * ssaa)], fill=COLOR_BORDER_SUBTLE, width=3 * ssaa)

    # 4. Weight Compartment
    wt_x0 = cat_x0
    wt_y0 = 216 * ssaa
    wt_x1 = wt_x0 + 420 * ssaa
    wt_y1 = hh - 36 * ssaa
    d.rounded_rectangle([wt_x0, wt_y0, wt_x1, wt_y1], radius=16 * ssaa, fill=COLOR_BG_WELL, outline=COLOR_BORDER_SUBTLE, width=3 * ssaa)
    k_x, k_y = wt_x0 + 36 * ssaa, (wt_y0 + wt_y1) // 2
    d.ellipse([k_x - 12 * ssaa, k_y - 16 * ssaa, k_x + 12 * ssaa, k_y], outline=COLOR_SLATE_ACCENT, width=3 * ssaa)
    d.rounded_rectangle([k_x - 18 * ssaa, k_y - 4 * ssaa, k_x + 18 * ssaa, k_y + 18 * ssaa], radius=4 * ssaa, fill=COLOR_SLATE_ACCENT)

    # 5. Burden/Encumbrance Compartment
    bu_x0 = wt_x1 + 32 * ssaa
    bu_y0 = wt_y0
    bu_x1 = hw - 44 * ssaa
    bu_y1 = wt_y1
    d.rounded_rectangle([bu_x0, bu_y0, bu_x1, bu_y1], radius=16 * ssaa, fill=COLOR_BG_WELL, outline=COLOR_BORDER_SUBTLE, width=3 * ssaa)
    b_x, b_y = bu_x0 + 36 * ssaa, (bu_y0 + bu_y1) // 2
    d.polygon([(b_x, b_y - 16 * ssaa), (b_x + 16 * ssaa, b_y), (b_x, b_y + 16 * ssaa), (b_x - 16 * ssaa, b_y)], fill=COLOR_AMBER_GLOW)
    d.line([(bu_x0 + 72 * ssaa, b_y), (bu_x1 - 28 * ssaa, b_y)], fill=(32, 38, 35, 255), width=6 * ssaa)
    export(img, "item_slot_card", w, h)

    # Square Grid Backpack Slot (360x360 px)
    w, h = 360, 360
    hw, hh = w * ssaa, h * ssaa
    img = render_modern_box(hw, hh, 32 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    d = ImageDraw.Draw(img)

    c_pad = 24 * ssaa
    c_bot = hh - 84 * ssaa
    d.rounded_rectangle([c_pad, c_pad, hw - c_pad, c_bot], radius=20 * ssaa, fill=COLOR_BG_WELL, outline=COLOR_BORDER_SUBTLE, width=3 * ssaa)
    d.polygon([(c_pad, c_pad), (c_pad + 44 * ssaa, c_pad), (c_pad, c_pad + 44 * ssaa)], fill=COLOR_EMERALD_GLOW)

    w_box = [c_pad, c_bot + 16 * ssaa, hw - c_pad, hh - c_pad]
    d.rounded_rectangle(w_box, radius=12 * ssaa, fill=COLOR_BG_WELL, outline=COLOR_BORDER_SUBTLE, width=3 * ssaa)
    export(img, "item_slot_grid", w, h)

    print(f"\n✓ Wszystkie poprawione grafiki wygenerowano w: '{os.path.abspath(output_dir)}'")


if __name__ == "__main__":
    generate_highres_suite()