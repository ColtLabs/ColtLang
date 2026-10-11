import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height, getPixel) {
  // width and height as 4-byte big-endian integers
  const wBuf = Buffer.alloc(4);
  wBuf.writeUInt32BE(width, 0);
  const hBuf = Buffer.alloc(4);
  hBuf.writeUInt32BE(height, 0);

  // Raw uncompressed bitmap data: each row starts with 1 filter byte (0) followed by RGBA pixels
  const rowStride = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // Deflate compressed IDAT payload
  const compressed = zlib.deflateSync(rawData);

  // Helper for CRC32
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const toCrc = Buffer.concat([typeBuf, data]);
    const crcVal = crc32(toCrc);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([lenBuf, toCrc, crcBuf]);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR: width (4), height (4), bit depth (1), color type (1 = 6: RGBA), compression (1 = 0), filter (1 = 0), interlace (1 = 0)
  const ihdrData = Buffer.concat([wBuf, hBuf, Buffer.from([8, 6, 0, 0, 0])]);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate favicon-32x32.png with glowing emerald cube
const fav32 = createPng(32, 32, (x, y, w, h) => {
  const cx = 16, cy = 16;
  const dist = Math.hypot(x - cx, y - cy);
  if (x >= 4 && x < 28 && y >= 4 && y < 28) {
    // Inner emblem
    if (dist < 10) {
      const t = (x + y) / 56;
      const r = Math.round(56 * (1 - t) + 62 * t);
      const g = Math.round(189 * (1 - t) + 207 * t);
      const b = Math.round(248 * (1 - t) + 142 * t);
      return [r, g, b, 255];
    }
    return [15, 23, 42, 240];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.resolve('favicon-32x32.png'), fav32);

// Generate apple-touch-icon.png (180x180)
const appleIcon = createPng(180, 180, (x, y, w, h) => {
  const cx = 90, cy = 90;
  const dist = Math.hypot(x - cx, y - cy);
  // Rounded squircle background
  const rx = Math.abs(x - 90);
  const ry = Math.abs(y - 90);
  if (rx < 80 && ry < 80) {
    if (dist < 55) {
      const t = (x + y) / 360;
      const r = Math.round(56 * (1 - t) + 62 * t);
      const g = Math.round(189 * (1 - t) + 207 * t);
      const b = Math.round(248 * (1 - t) + 142 * t);
      return [r, g, b, 255];
    }
    return [13, 17, 23, 255];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.resolve('apple-touch-icon.png'), appleIcon);

// Simple favicon.ico wrapping 32x32 png
// An ICO file format with PNG payload header
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type 1 = icon
icoHeader.writeUInt16LE(1, 4); // count 1 image

const icoDir = Buffer.alloc(16);
icoDir.writeUInt8(32, 0); // width
icoDir.writeUInt8(32, 1); // height
icoDir.writeUInt8(0, 2);  // color palette
icoDir.writeUInt8(0, 3);  // reserved
icoDir.writeUInt16LE(1, 4); // color planes
icoDir.writeUInt16LE(32, 6); // bpp
icoDir.writeUInt32LE(fav32.length, 8); // size
icoDir.writeUInt32LE(22, 12); // offset = 6 + 16

const faviconIco = Buffer.concat([icoHeader, icoDir, fav32]);
fs.writeFileSync(path.resolve('favicon.ico'), faviconIco);

// Open Graph image 1200x630
const ogImage = createPng(1200, 630, (x, y, w, h) => {
  // Dark obsidian gradient background with glowing emerald & cyan gradient mesh
  const distCenter = Math.hypot(x - 600, y - 315);
  const glow = Math.max(0, 1 - distCenter / 650);
  const r = Math.round(9 + glow * 30);
  const g = Math.round(10 + glow * 70);
  const b = Math.round(15 + glow * 50);
  return [r, g, b, 255];
});
fs.writeFileSync(path.resolve('og-image.png'), ogImage);

console.log('Static icon and OG assets successfully generated.');
