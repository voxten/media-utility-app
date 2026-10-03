"""
Modular High-Res Item Slot Generator for Modern Tactical Survival UI
Generates independent, reusable building blocks for Inventory Cards & Grid Slots:
- Card & Grid Backgrounds (9-sliceable)
- Recessed Icon Bays / Wells
- Category Badge Pills
- Stat Capsules (for Weight, Burden, Stack Count)
- Standalone Micro-Icons (Weight glyph, Burden glyph, Corner tag)
- Hairline Dividers
"""

import os
from PIL import Image, ImageDraw

# -------------------------------------------------------------------------
# PALETTE TOKENS (Modern Tactical Zinc & Obsidian)
# -------------------------------------------------------------------------
COLOR_BG_CARD_TOP    = (24, 27, 25, 245)
COLOR_BG_CARD_BOT    = (12, 14, 13, 252)
COLOR_BG_WELL        = (8, 9, 8, 255)
COLOR_BG_WELL_LIGHT  = (16, 19, 17, 255)

COLOR_BORDER_SUBTLE  = (48, 56, 51, 230)
COLOR_BORDER_LIGHT   = (85, 98, 90, 255)

# Tactical Accents
COLOR_EMERALD_GLOW   = (16, 185, 129, 255)    # Survival Green
COLOR_SLATE_ACCENT   = (203, 213, 225, 255)   # Clean Slate White (Tintable)
COLOR_AMBER_GLOW     = (245, 158, 11, 255)    # Burden Amber


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
# MODULAR ITEM SLOTS GENERATOR
# -------------------------------------------------------------------------
def generate_modular_slots(output_dir="./Modular_Item_Slots", ssaa=2):
    os.makedirs(output_dir, exist_ok=True)

    def export(img: Image.Image, name: str, w: int, h: int):
        final = img.resize((w, h), Image.Resampling.LANCZOS)
        path = os.path.join(output_dir, f"{name}.png")
        final.save(path, "PNG")
        print(f"[OK] {name}.png -> {w}x{h} px")

    # =========================================================================
    # A. MODULAR ITEM SLOT CARD (ROW INVENTORY)
    # =========================================================================

    # 1. Główny panel rzędu (9-Sliceable Card Background)
    # Możesz go rozciągać na dowolną długość i wysokość
    w, h = 512, 160
    hw, hh = w * ssaa, h * ssaa
    card_bg = render_modern_box(hw, hh, 28 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(card_bg, "slot_card_bg", w, h)

    # 2. Samodzielna komora / okno na ikonę przedmiotu (256x256 px)
    # Z delikatnym celownikiem pośrodku
    w, h = 256, 256
    hw, hh = w * ssaa, h * ssaa
    well = render_modern_box(hw, hh, 24 * ssaa, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    d = ImageDraw.Draw(well)
    cx, cy = hw // 2, hh // 2
    reticle_len = 16 * ssaa
    reticle_col = (45, 54, 48, 255)
    d.line([(cx - reticle_len, cy), (cx + reticle_len, cy)], fill=reticle_col, width=4 * ssaa)
    d.line([(cx, cy - reticle_len), (cx, cy + reticle_len)], fill=reticle_col, width=4 * ssaa)
    export(well, "slot_icon_well", w, h)

    # 3. Kapsułka kategorii przedmiotu (Pill Badge) (280x64 px, 9-Sliceable)
    # Tło pod napis kategorii (np. [WEAPON], [MEDICAL], [AMMO])
    w, h = 280, 64
    hw, hh = w * ssaa, h * ssaa
    badge = render_modern_box(hw, hh, hh // 2, (18, 28, 22, 255), (10, 18, 14, 255), COLOR_EMERALD_GLOW, 3 * ssaa)
    d = ImageDraw.Draw(badge)
    # Punkt statusu po lewej stronie pigułki
    dot_r = 10 * ssaa
    dot_cx = 24 * ssaa
    dot_cy = hh // 2
    d.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=COLOR_EMERALD_GLOW)
    export(badge, "slot_badge_category", w, h)

    # 4. Kapsułka statystyk (Stat Capsule) (320x80 px, 9-Sliceable)
    # Wklęsła komora, której używasz OSOBNO pod wagę, a OSOBNO pod obciążenie/stan
    w, h = 320, 80
    hw, hh = w * ssaa, h * ssaa
    capsule = render_modern_box(hw, hh, 18 * ssaa, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_BORDER_SUBTLE, 3 * ssaa)
    export(capsule, "slot_stat_capsule", w, h)

    # 5. Cienka linia podziału / separator (256x8 px, 9-Sliceable h-stretch)
    w, h = 256, 8
    hw, hh = w * ssaa, h * ssaa
    divider = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(divider)
    d.rounded_rectangle([0, 1 * ssaa, hw - 1, hh - 2 * ssaa], radius=2 * ssaa, fill=COLOR_BORDER_SUBTLE)
    export(divider, "slot_divider_h", w, h)

    # =========================================================================
    # B. MODULAR ITEM SLOT GRID (BACKPACK / SIATKA EKWIPUNKU)
    # =========================================================================

    # 6. Tło slotu siatki ekwipunku (256x256 px, 9-Sliceable)
    w, h = 256, 256
    hw, hh = w * ssaa, h * ssaa
    grid_bg = render_modern_box(hw, hh, 28 * ssaa, COLOR_BG_CARD_TOP, COLOR_BG_CARD_BOT, COLOR_BORDER_SUBTLE, 4 * ssaa)
    export(grid_bg, "slot_grid_bg", w, h)

    # 7. Wewnętrzne wgłębienie siatki (Inner Grid Well) (200x200 px)
    w, h = 200, 200
    hw, hh = w * ssaa, h * ssaa
    grid_well = render_modern_box(hw, hh, 20 * ssaa, COLOR_BG_WELL, COLOR_BG_WELL_LIGHT, COLOR_BORDER_SUBTLE, 3 * ssaa)
    export(grid_well, "slot_grid_well", w, h)

    # 8. Trójkątny znacznik kategorii w rogu (Corner Tag Pip) (64x64 px)
    w, h = 64, 64
    hw, hh = w * ssaa, h * ssaa
    tag = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(tag)
    d.polygon([(0, 0), (hw - 1, 0), (0, hh - 1)], fill=COLOR_EMERALD_GLOW)
    export(tag, "slot_grid_tag_corner", w, h)

    # 9. Dolna mikrokapsułka na ilość lub wagę w siatce (Counter Capsule) (160x52 px)
    # Umieszczana w dolnym rogu kwadratowego slotu (np. na tekst "x30" lub "1.2kg")
    w, h = 160, 52
    hw, hh = w * ssaa, h * ssaa
    grid_counter = render_modern_box(hw, hh, hh // 2, (10, 12, 11, 255), COLOR_BG_WELL, COLOR_BORDER_SUBTLE, 2 * ssaa)
    export(grid_counter, "slot_grid_counter_capsule", w, h)

    # =========================================================================
    # C. SAMODZIELNE MIKROIKONY (DO WSTAWIANIA W IMAGE COMPONENT)
    # =========================================================================

    # 10. Ikona odważnika / wagi (Weight Kettlebell Glyph) (96x96 px)
    # Czysty biały/slate kolor - w Unity możesz zmienić tint na dowolny!
    w, h = 96, 96
    hw, hh = w * ssaa, h * ssaa
    img_wt = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img_wt)
    cx, cy = hw // 2, hh // 2 + 6 * ssaa
    # Uchwyt
    handle_r = 16 * ssaa
    d.ellipse([cx - handle_r, cy - 32 * ssaa, cx + handle_r, cy - 6 * ssaa], outline=COLOR_SLATE_ACCENT, width=6 * ssaa)
    # Korpus odważnika
    d.rounded_rectangle([cx - 24 * ssaa, cy - 10 * ssaa, cx + 24 * ssaa, cy + 26 * ssaa], radius=8 * ssaa, fill=COLOR_SLATE_ACCENT)
    export(img_wt, "icon_glyph_weight", w, h)

    # 11. Ikona obciążenia / gabarytu (Burden Caution Diamond) (96x96 px)
    w, h = 96, 96
    hw, hh = w * ssaa, h * ssaa
    img_bu = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img_bu)
    cx, cy = hw // 2, hh // 2
    d_size = 28 * ssaa
    d.polygon([(cx, cy - d_size), (cx + d_size, cy), (cx, cy + d_size), (cx - d_size, cy)], fill=COLOR_AMBER_GLOW)
    export(img_bu, "icon_glyph_burden", w, h)

    print(f"\n✓ Wszystkie modularne części wygenerowano w: '{os.path.abspath(output_dir)}'")


if __name__ == "__main__":
    generate_modular_slots()