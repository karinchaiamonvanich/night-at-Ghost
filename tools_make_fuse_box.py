# One-off generator for the fuse box placeholder asset (no PIL dependency).
# Draws a simple dark electrical panel with a red switch, matching the
# monochrome office art. Run:  python tools_make_fuse_box.py
import struct, zlib, os

W, H = 90, 120

# base colours
BG = (18, 18, 20)        # near-black panel
FRAME = (90, 92, 96)     # grey frame
INSET = (34, 34, 38)     # inner recess
SWITCH = (150, 30, 30)   # red switch
SWITCH_HI = (220, 60, 60)
LABEL = (120, 120, 124)

px = [[BG for _ in range(W)] for _ in range(H)]

def rect(x0, y0, x1, y1, col):
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            px[y][x] = col

# outer frame
rect(0, 0, W, H, FRAME)
# inner panel
rect(6, 6, W - 6, H - 6, BG)
# top label strip
rect(12, 12, W - 12, 26, INSET)
rect(14, 14, W - 14, 24, LABEL)
# two recessed breaker slots
rect(14, 36, W - 14, 58, INSET)
rect(14, 64, W - 14, 86, INSET)
# the red switch (right side of the lower recess)
rect(W - 40, 70, W - 22, 82, SWITCH)
rect(W - 40, 70, W - 22, 74, SWITCH_HI)

def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    c += struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return c

raw = b''
for y in range(H):
    raw += b'\x00'  # filter type 0
    for x in range(W):
        r, g, b = px[y][x]
        raw += bytes((r, g, b))

png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')

out = os.path.join('resources', 'img', 'rooms', 'safe_room', 'fuse_box.png')
with open(out, 'wb') as f:
    f.write(png)
print('wrote', out, len(png), 'bytes')
