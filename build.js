/* Build step for Vercel: copies the app into ./public and draws the app icons (PNG) */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = 'public';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
for (const f of ['index.html', 'admin.html', 'manifest.webmanifest', 'sw.js']) fs.copyFileSync(f, path.join(OUT, f));

// ---------- tiny PNG encoder ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- icon artwork (drawn with simple shapes) ----------
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const C = { red: hex('#E53935'), green: hex('#2FA84F'), yellow: hex('#FBC02D'), blue: hex('#1E88E5'),
  white: hex('#FFFFFF'), navy: hex('#14205A'), gold: hex('#FFC93C'), top: hex('#2E42B5'), bottom: hex('#0B1238') };
function inRR(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function pawn(x, y, g) {
  if ((x - 0.5) ** 2 + (y - 0.36) ** 2 <= (0.1 + g) ** 2) return true;
  if (y >= 0.42 - g && y <= 0.68 && Math.abs(x - 0.5) <= 0.05 + (y - 0.42) * 0.45 + g) return true;
  return inRR(x, y, 0.33 - g, 0.64 - g, 0.67 + g, 0.73 + g, 0.04);
}
function sample(u, v, maskable) {
  let bg;
  if (!maskable && !inRR(u, v, 0, 0, 1, 1, 0.2)) return [0, 0, 0, 0];
  bg = C.top.map((t, i) => Math.round(t + (C.bottom[i] - t) * v));
  const s = maskable ? 0.62 : 0.8;
  const x = (u - 0.5) / s + 0.5, y = (v - 0.5) / s + 0.5;
  if (!inRR(x, y, 0, 0, 1, 1, 0.1)) return bg;
  if (pawn(x, y, 0.035)) {
    if (!pawn(x, y, 0)) return C.navy;
    if ((x - 0.465) ** 2 + (y - 0.33) ** 2 <= 0.03 ** 2) return C.white;
    return C.gold;
  }
  if (inRR(x, y, 0.06, 0.06, 0.42, 0.42, 0.07)) return C.red;
  if (inRR(x, y, 0.58, 0.06, 0.94, 0.42, 0.07)) return C.green;
  if (inRR(x, y, 0.58, 0.58, 0.94, 0.94, 0.07)) return C.yellow;
  if (inRR(x, y, 0.06, 0.58, 0.42, 0.94, 0.07)) return C.blue;
  return C.white;
}
function drawIcon(size, maskable) {
  const SS = 4, buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable);
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const o = (py * size + px) * 4;
    if (a) { buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a); }
    buf[o + 3] = Math.round(a / (SS * SS));
  }
  return encodePNG(size, size, buf);
}

fs.writeFileSync(path.join(OUT, 'icons/icon-192.png'), drawIcon(192, false));
fs.writeFileSync(path.join(OUT, 'icons/icon-512.png'), drawIcon(512, false));
fs.writeFileSync(path.join(OUT, 'icons/maskable-512.png'), drawIcon(512, true));
fs.writeFileSync(path.join(OUT, 'icons/apple-touch-icon.png'), drawIcon(180, true));
fs.writeFileSync(path.join(OUT, 'favicon.png'), drawIcon(64, false));
console.log('Built ./public with icons');
