/**
 * 生成扩展图标 PNG（16/32/48/128）。
 * 纯 Node 实现，不依赖任何第三方库（自带最小 PNG 编码器 + 4x4 超采样抗锯齿）。
 *
 * 用法：node tools/make-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "icons");
const SIZES = [16, 32, 48, 128];
const SS = 4; // 每个像素 4x4 子采样

// ------------------------------------------------------------ 最小 PNG 编码

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ 图形

/** 圆角矩形的有符号距离场：<= 0 表示在内部 */
function rrectSDF(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2;
  const hh = (y1 - y0) / 2;
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const over = (dst, rgb, a) => [
  rgb[0] * a + dst[0] * (1 - a),
  rgb[1] * a + dst[1] * (1 - a),
  rgb[2] * a + dst[2] * (1 - a),
  a + dst[3] * (1 - a),
];

function shade(x, y, S) {
  const u = x / S;
  const v = y / S;
  const t = Math.min(1, Math.max(0, u * 0.35 + v * 0.65));

  // #3B82F6 -> #1D4ED8
  const bg = [
    Math.round(59 + (29 - 59) * t),
    Math.round(130 + (78 - 130) * t),
    Math.round(246 + (216 - 246) * t),
  ];

  if (rrectSDF(x, y, 0.04 * S, 0.04 * S, 0.96 * S, 0.96 * S, 0.22 * S) > 0) {
    return [0, 0, 0, 0];
  }

  let col = [bg[0], bg[1], bg[2], 1];

  // 窗口外框（白色）
  if (rrectSDF(x, y, 0.2 * S, 0.235 * S, 0.8 * S, 0.765 * S, 0.075 * S) <= 0) {
    col = over(col, [255, 255, 255], 1);
  }
  // 挖空窗口内部：露出背景色，形成「标题栏 + 边框」的观感
  if (rrectSDF(x, y, 0.255 * S, 0.36 * S, 0.745 * S, 0.71 * S, 0.035 * S) <= 0) {
    col = over(col, bg, 1);
  }
  // 标题栏上的「本地」指示点
  if (Math.hypot(x - 0.278 * S, y - 0.3 * S) <= 0.03 * S) {
    col = over(col, [74, 222, 128], 1);
  }
  return col;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0.0001) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
      }
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return buf;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log(`生成 ${file}`);
}
console.log("图标生成完成。");
