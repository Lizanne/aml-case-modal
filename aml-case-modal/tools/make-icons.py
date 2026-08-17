#!/usr/bin/env python3
"""
Regenerate the favicon set from the brand mark.

    python3 tools/make-icons.py [source.png]

Why this exists rather than a one-off command: the corner radius is a judgement
call that needs re-tuning if the mark changes, and it is one number here.

The mark ships with a ~5% corner radius. That is fine at 134px and invisible at
16px - a sub-pixel radius just gets smeared away by the downsample, so the tab
shows a hard square. The radius is therefore applied as a PROPORTION of each
output size, and the mask is built at 4x and downsampled so the curve is
smoothly antialiased instead of stair-stepped.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else
           Path.home() / 'Downloads/Favicons-SquareRoundedCorners_32x32.png')
OUT = Path(__file__).resolve().parent.parent / 'src'

# Corner radius as a fraction of icon size. iOS uses ~22%; 20% reads clearly
# even at 16px (≈3px) while still looking like a rounded square, not a circle.
RADIUS = 0.20
SS = 4  # supersample factor for the mask

LIME = (225, 248, 11, 255)


def rounded(im: Image.Image, size: int, radius_frac: float = RADIUS) -> Image.Image:
    """Scale `im` to `size` and mask it with a proportionally rounded square."""
    big = size * SS
    scaled = im.resize((big, big), Image.LANCZOS)

    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=int(big * radius_frac), fill=255
    )

    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    out.paste(scaled, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def main() -> None:
    src = Image.open(SRC).convert('RGBA')

    # Flatten onto the lime first: the mark's own transparent corners sit
    # inside the new, larger radius, so leaving them would cut a pale notch
    # out of each corner where the two curves disagree.
    flat = Image.new('RGBA', src.size, LIME)
    flat.alpha_composite(src)

    ico_sizes = [16, 32, 48]
    frames = [rounded(flat, s) for s in ico_sizes]
    frames[-1].save(OUT / 'favicon.ico', format='ICO',
                    sizes=[(s, s) for s in ico_sizes],
                    append_images=frames[:-1])

    rounded(flat, 32).save(OUT / 'favicon-32.png', optimize=True)

    # apple-touch-icon is deliberately NOT rounded and NOT transparent: iOS
    # applies its own superellipse mask and composites onto white. Rounding it
    # here would either double-round or show white notches in the corners.
    flat.convert('RGB').resize((180, 180), Image.LANCZOS).save(
        OUT / 'apple-touch-icon.png', optimize=True)

    for f in ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']:
        im = Image.open(OUT / f)
        print(f'{f:22} {im.size}  {im.mode}')
    print(f'corner radius: {RADIUS:.0%} of each size')


if __name__ == '__main__':
    main()
