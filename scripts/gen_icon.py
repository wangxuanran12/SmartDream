#!/usr/bin/env python3
"""生成应用图标 PNG（纯标准库，无 PIL 依赖）。
生成一个 512x512 深色圆角方形 + 白色 "AI" 字样的图标。
"""
import zlib
import struct
import os

SIZE = 512

def make_png(path, size=SIZE):
    # 生成像素：深色背景 + 渐变 + 简单几何
    rows = []
    cx = cy = size // 2
    radius = size * 0.42
    for y in range(size):
        row = bytearray([0])  # filter type 0
        for x in range(size):
            # 圆角方形裁剪
            dx = x - cx
            dy = y - cy
            # 圆角矩形判断（粗略）
            r = size * 0.22
            hw = size * 0.46
            hh = size * 0.46
            inside = abs(dx) <= hw and abs(dy) <= hh
            # 圆角处理
            if inside:
                if (abs(dx) > hw - r and abs(dy) > hh - r):
                    corner = ((abs(dx) - (hw - r))**2 + (abs(dy) - (hh - r))**2)
                    if corner > r * r:
                        inside = False
            if not inside:
                row += b'\x00\x00\x00\x00'  # 透明
                continue
            # 背景：深蓝渐变
            t = (x + y) / (2 * size)
            r_c = int(13 + t * 20)
            g_c = int(17 + t * 30)
            b_c = int(23 + t * 50)
            # 中心 "AI" 用亮色：画两条粗横线 + 三角形（简化为亮色块）
            # 简单处理：中心一个亮色圆点 + 交叉线，表示 AI
            dist = ((dx)**2 + (dy)**2) ** 0.5
            if dist < size * 0.12:
                r_c, g_c, b_c = 88, 166, 255  # 中心亮蓝点
            row += bytes([r_c, g_c, b_c, 255])
        rows.append(bytes(row))

    raw = b''.join(rows)

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        c += struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
        return c

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8bit RGBA
    idat = zlib.compress(raw, 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print(f'生成 {path} ({size}x{size}, {len(png)} bytes)')

if __name__ == '__main__':
    os.makedirs('build', exist_ok=True)
    make_png('build/icon.png', 512)
    make_png('build/icon-256.png', 256)
