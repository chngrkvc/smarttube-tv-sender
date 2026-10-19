#!/usr/bin/env node
'use strict';

/**
 * Extension ikonlarını (16/32/48/128 px) bağımlılık olmadan üretir.
 * Tasarım: yuvarlatılmış kare (YouTube kırmızısı) + beyaz oynat üçgeni.
 *
 *   node scripts/make-icons.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (function () {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtre: yok
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function insideRoundedRect(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function insideTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

const RED = [255, 0, 51];
const WHITE = [255, 255, 255];
const TRIANGLE = [[0.40, 0.30], [0.71, 0.50], [0.40, 0.70]];

function sample(x, y) {
  if (!insideRoundedRect(x, y, 0.22)) return null;
  if (insideTriangle(x, y, TRIANGLE[0], TRIANGLE[1], TRIANGLE[2])) return WHITE;
  return RED;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 süper örnekleme (kenarlar yumuşak)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = sample((x + (sx + 0.5) / samples) / size, (y + (sy + 0.5) / samples) / size);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 255;
        }
      }
      const total = samples * samples;
      const offset = (y * size + x) * 4;
      if (a === 0) continue;
      const covered = a / 255;
      pixels[offset] = Math.round(r / covered);
      pixels[offset + 1] = Math.round(g / covered);
      pixels[offset + 2] = Math.round(b / covered);
      pixels[offset + 3] = Math.round(a / total);
    }
  }
  return encodePng(size, pixels);
}

const outputDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(outputDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const file = path.join(outputDir, 'icon' + size + '.png');
  fs.writeFileSync(file, render(size));
  console.log('yazıldı: ' + path.relative(path.join(__dirname, '..'), file));
}
