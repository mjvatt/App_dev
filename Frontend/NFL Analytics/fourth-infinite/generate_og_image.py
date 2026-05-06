"""Generate the Open Graph share card for Fourth & Infinite.

Produces a 1200x630 PNG at assets/og-image.png. Pure Pillow, no external assets.
Re-run any time the headline copy or engine palette changes.

Usage:
    python generate_og_image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_PATH = Path(__file__).parent / "assets" / "og-image.png"
WIDTH, HEIGHT = 1200, 630

BG = (0, 0, 0)
FG = (245, 245, 245)
DIM = (160, 160, 160)
ACCENT = (245, 158, 11)

ENGINES = [
    ("SAGE", (16, 185, 129)),
    ("GHOST", (168, 85, 247)),
    ("ATLAS", (56, 189, 248)),
    ("ORACLE", (249, 115, 22)),
    ("PLAYBOOK", (244, 63, 94)),
]

TITLE = "Fourth & Infinite"
SUBTITLE = "NFL Draft Analytics  ·  1994–2025"
FOOTER = "32 seasons  ·  8,116 picks  ·  ML hit prediction  ·  team dynasty analytics"
MARK = "4∞"

BOLD_CANDIDATES = ["seguibl.ttf", "segoeuib.ttf", "arialbd.ttf", "Arial Bold.ttf"]
REG_CANDIDATES = ["segoeui.ttf", "arial.ttf", "Arial.ttf"]


def _load_font(candidates, size):
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _measure(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    font_mark = _load_font(BOLD_CANDIDATES, 220)
    font_title = _load_font(BOLD_CANDIDATES, 84)
    font_subtitle = _load_font(REG_CANDIDATES, 34)
    font_badge = _load_font(BOLD_CANDIDATES, 26)
    font_footer = _load_font(REG_CANDIDATES, 24)

    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    draw.rectangle([(0, 0), (WIDTH, 6)], fill=ACCENT)

    mark_w, _ = _measure(draw, MARK, font_mark)
    draw.text((WIDTH - mark_w - 64, 50), MARK, font=font_mark, fill=ACCENT)

    draw.text((64, 150), TITLE, font=font_title, fill=FG)
    draw.text((64, 256), SUBTITLE, font=font_subtitle, fill=DIM)

    badge_y = 372
    badge_h = 60
    pad_x = 22
    gap = 18
    x = 64
    for name, color in ENGINES:
        tw, th = _measure(draw, name, font_badge)
        bw = tw + pad_x * 2
        draw.rounded_rectangle(
            [(x, badge_y), (x + bw, badge_y + badge_h)],
            radius=10,
            fill=color,
        )
        text_y = badge_y + (badge_h - th) // 2 - 4
        draw.text((x + pad_x, text_y), name, font=font_badge, fill=BG)
        x += bw + gap

    draw.text((64, 548), FOOTER, font=font_footer, fill=DIM)

    img.save(OUT_PATH, "PNG", optimize=True)
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
