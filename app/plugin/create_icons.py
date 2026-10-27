"""Generate the tiny local PNG icons required by the Stream Deck manifest."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


OUT = Path(__file__).resolve().parent / "com.evere.tapodeck.sdPlugin" / "imgs"
PURPLE = (101, 93, 228, 255)
WHITE = (255, 255, 255, 255)
SUPERSAMPLE = 4


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def make_png(size: int, *, background: bool) -> bytes:
    scale = SUPERSAMPLE
    work = size * scale
    pixels = bytearray(work * work * 4)
    center = work / 2

    def inside_round_rect(x: float, y: float) -> bool:
        radius = work * 0.23
        px = min(max(x, radius), work - radius)
        py = min(max(y, radius), work - radius)
        return (x - px) ** 2 + (y - py) ** 2 <= radius**2

    def inside_bulb(x: float, y: float) -> bool:
        head = ((x - center) / (work * .235)) ** 2 + ((y - work * .375) / (work * .245)) ** 2 <= 1
        neck = work * .53 <= y <= work * .665 and abs(x - center) <= work * (.105 - .035 * (y - work * .53) / (work * .135))
        base_a = work * .665 <= y <= work * .715 and abs(x - center) <= work * .115
        base_b = work * .73 <= y <= work * .775 and abs(x - center) <= work * .095
        base_c = work * .79 <= y <= work * .825 and abs(x - center) <= work * .075
        return head or neck or base_a or base_b or base_c

    for y in range(work):
        for x in range(work):
            cx, cy = x + .5, y + .5
            color = None
            if background and inside_round_rect(cx, cy):
                color = PURPLE
            if inside_bulb(cx, cy):
                color = WHITE
            if color:
                i = (y * work + x) * 4
                pixels[i:i+4] = bytes(color)

    if scale > 1:
        reduced = bytearray(size * size * 4)
        samples = scale * scale
        for y in range(size):
            for x in range(size):
                sums = [0, 0, 0, 0]
                for sy in range(scale):
                    for sx in range(scale):
                        pos = (((y * scale + sy) * work) + (x * scale + sx)) * 4
                        for channel in range(4):
                            sums[channel] += pixels[pos + channel]
                dst = (y * size + x) * 4
                reduced[dst:dst+4] = bytes(round(value / samples) for value in sums)
        pixels = reduced
    rows = b"".join(b"\0" + pixels[y * size * 4:(y + 1) * size * 4] for y in range(size))
    header = struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(rows, 9)) + png_chunk(b"IEND", b"")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, sizes, background in [
        ("plugin", (256, 512), True),
        ("category", (28, 56), False),
        ("action", (20, 40), False),
        ("key", (72, 144), True),
    ]:
        base, retina = sizes
        (OUT / f"{name}.png").write_bytes(make_png(base, background=background))
        (OUT / f"{name}@2x.png").write_bytes(make_png(retina, background=background))


if __name__ == "__main__":
    main()
