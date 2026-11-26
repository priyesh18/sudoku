// Writes icon-180.png and icon-512.png (a colourful 3x3 tile grid). Run: node tools/icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const tiles = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#ffffff", "#4dabf7", "#9775fa", "#f783ac", "#38d9a9"].map(hex);
const bg = hex("#2b2257");

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const pad = size * 0.16, gap = size * 0.04, tile = (size - 2 * pad - 2 * gap) / 3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = bg;
      const tx = Math.floor((x - pad) / (tile + gap)), ty = Math.floor((y - pad) / (tile + gap));
      if (tx >= 0 && tx < 3 && ty >= 0 && ty < 3 && (x - pad) % (tile + gap) < tile && (y - pad) % (tile + gap) < tile) col = tiles[ty * 3 + tx];
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [180, 512]) writeFileSync(new URL(`../icon-${s}.png`, import.meta.url), png(s));
