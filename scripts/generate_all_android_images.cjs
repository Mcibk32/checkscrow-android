const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPNG(width, height, getPixelRGBA) {
  // Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter method
  ihdrData[12] = 0; // No interlace

  const ihdrType = Buffer.from('IHDR');
  const ihdrCRC = Buffer.alloc(4);
  ihdrCRC.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])), 0);

  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13, 0);
  const ihdrChunk = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCRC]);

  // Raw scanlines
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixelRGBA(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  // Deflate IDAT
  const compressedData = zlib.deflateSync(rawData);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressedData.length, 0);
  const idatType = Buffer.from('IDAT');
  const idatCRC = Buffer.alloc(4);
  idatCRC.writeUInt32BE(crc32(Buffer.concat([idatType, compressedData])), 0);
  const idatChunk = Buffer.concat([idatLen, idatType, compressedData, idatCRC]);

  // IEND
  const iendChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00, // length 0
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82  // CRC
  ]);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function distToSegment(px, py, ax, ay, bx, by) {
  const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

function evaluateCheckscrow(nx, ny, type) {
  const isForeground = type === 'foreground';

  let bgAlpha = 1.0;
  if (type === 'round') {
    const r = Math.hypot(nx, ny);
    bgAlpha = clamp((0.96 - r) * 20, 0, 1);
  } else if (type === 'launcher') {
    const cornerR = 0.28;
    const qx = Math.abs(nx) - (0.92 - cornerR);
    const qy = Math.abs(ny) - (0.92 - cornerR);
    const outsideDist = Math.hypot(Math.max(0, qx), Math.max(0, qy)) - cornerR;
    const insideDist = Math.min(Math.max(qx, qy), 0);
    const d = outsideDist + insideDist;
    bgAlpha = clamp(-d * 25, 0, 1);
  }

  let r = 11, g = 15, b = 25, a = bgAlpha;
  if (isForeground) {
    r = 0; g = 0; b = 0; a = 0;
  } else {
    const grad = (ny + 1) * 0.5;
    r = Math.round(15 + grad * 10);
    g = Math.round(23 + grad * 15);
    b = Math.round(42 + grad * 20); // Dark sleek background #0F172A to #1E293B
  }

  // Shield scaling
  const scale = isForeground ? 0.52 : 0.62;
  const sx = nx / scale;
  const sy = (ny + 0.02) / scale;

  let inShield = false;
  if (sy >= -0.78 && sy <= 0.95 && Math.abs(sx) <= 0.8) {
    const topDrop = (sx * sx) * 0.15;
    if (sy >= -0.75 + topDrop) {
      const maxW = 0.75 * (1 - Math.pow(Math.max(0, (sy + 0.1) / 1.05), 1.6));
      if (Math.abs(sx) <= Math.max(0.02, maxW)) {
        inShield = true;
      }
    }
  }

  const dSeg1 = distToSegment(sx, sy, -0.32, 0.05, -0.08, 0.32);
  const dSeg2 = distToSegment(sx, sy, -0.08, 0.32, 0.35, -0.20);
  const checkDist = Math.min(dSeg1, dSeg2);
  const checkThickness = 0.09;
  const checkAlpha = clamp((checkThickness - checkDist) * 30 * scale, 0, 1);

  if (inShield) {
    const shieldGrad = (sy + 0.75) / 1.7;
    const sR = Math.round(16 * (1 - shieldGrad) + 5 * shieldGrad);
    const sG = Math.round(185 * (1 - shieldGrad) + 150 * shieldGrad);
    const sB = Math.round(129 * (1 - shieldGrad) + 105 * shieldGrad);

    if (isForeground) {
      r = sR; g = sG; b = sB; a = 1.0;
    } else {
      r = Math.round(r * (1 - bgAlpha) + sR * bgAlpha);
      g = Math.round(g * (1 - bgAlpha) + sG * bgAlpha);
      b = Math.round(b * (1 - bgAlpha) + sB * bgAlpha);
      a = bgAlpha;
    }
  }

  if (checkAlpha > 0) {
    const cR = 255, cG = 255, cB = 255;
    r = Math.round(r * (1 - checkAlpha) + cR * checkAlpha);
    g = Math.round(g * (1 - checkAlpha) + cG * checkAlpha);
    b = Math.round(b * (1 - checkAlpha) + cB * checkAlpha);
    a = Math.max(a, checkAlpha);
  }

  return [r, g, b, Math.round(clamp(a, 0, 1) * 255)];
}

function evaluateSplash(x, y, width, height) {
  const minDim = Math.min(width, height);
  const emblemPixelRadius = minDim * 0.16;
  const centerX = width / 2;
  const centerY = height / 2;

  const dx = x - centerX;
  const dy = y - centerY;
  const rDist = Math.hypot(dx, dy) / (minDim / 1.5);
  const bgFactor = clamp(1 - rDist * 0.5, 0, 1);

  let r = Math.round(11 * bgFactor + 7 * (1 - bgFactor));
  let g = Math.round(15 * bgFactor + 9 * (1 - bgFactor));
  let b = Math.round(27 * bgFactor + 14 * (1 - bgFactor));
  let a = 255;

  if (Math.abs(dx) <= emblemPixelRadius * 1.5 && Math.abs(dy) <= emblemPixelRadius * 1.5) {
    const sx = dx / emblemPixelRadius;
    const sy = dy / emblemPixelRadius;

    let inShield = false;
    if (sy >= -0.78 && sy <= 0.95 && Math.abs(sx) <= 0.8) {
      const topDrop = (sx * sx) * 0.15;
      if (sy >= -0.75 + topDrop) {
        const maxW = 0.75 * (1 - Math.pow(Math.max(0, (sy + 0.1) / 1.05), 1.6));
        if (Math.abs(sx) <= Math.max(0.02, maxW)) {
          inShield = true;
        }
      }
    }

    const dSeg1 = distToSegment(sx, sy, -0.32, 0.05, -0.08, 0.32);
    const dSeg2 = distToSegment(sx, sy, -0.08, 0.32, 0.35, -0.20);
    const checkDist = Math.min(dSeg1, dSeg2);
    const checkThickness = 0.09;
    const checkAlpha = clamp((checkThickness - checkDist) * 30, 0, 1);

    if (inShield) {
      const shieldGrad = (sy + 0.75) / 1.7;
      r = Math.round(16 * (1 - shieldGrad) + 5 * shieldGrad);
      g = Math.round(185 * (1 - shieldGrad) + 150 * shieldGrad);
      b = Math.round(129 * (1 - shieldGrad) + 105 * shieldGrad);
    }

    if (checkAlpha > 0) {
      r = Math.round(r * (1 - checkAlpha) + 255 * checkAlpha);
      g = Math.round(g * (1 - checkAlpha) + 255 * checkAlpha);
      b = Math.round(b * (1 - checkAlpha) + 255 * checkAlpha);
    }
  }

  return [r, g, b, a];
}

const LAUNCHER_SIZES = {
  'mipmap-mdpi': { launcher: 48, round: 48, foreground: 108 },
  'mipmap-hdpi': { launcher: 72, round: 72, foreground: 162 },
  'mipmap-xhdpi': { launcher: 96, round: 96, foreground: 216 },
  'mipmap-xxhdpi': { launcher: 144, round: 144, foreground: 324 },
  'mipmap-xxxhdpi': { launcher: 192, round: 192, foreground: 432 },
};

const SPLASH_SIZES = {
  'drawable-port-mdpi': { w: 320, h: 480 },
  'drawable-port-hdpi': { w: 480, h: 800 },
  'drawable-port-xhdpi': { w: 720, h: 1280 },
  'drawable-port-xxhdpi': { w: 960, h: 1600 },
  'drawable-port-xxxhdpi': { w: 1280, h: 1920 },
  'drawable-land-mdpi': { w: 480, h: 320 },
  'drawable-land-hdpi': { w: 800, h: 480 },
  'drawable-land-xhdpi': { w: 1280, h: 720 },
  'drawable-land-xxhdpi': { w: 1600, h: 960 },
  'drawable-land-xxxhdpi': { w: 1920, h: 1280 },
};

const baseResDir = path.resolve(__dirname, '../android/app/src/main/res');

// 1. Generate launcher icons
for (const [dir, sizes] of Object.entries(LAUNCHER_SIZES)) {
  const targetDir = path.join(baseResDir, dir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const launcherBuf = createPNG(sizes.launcher, sizes.launcher, (x, y, w, h) => evaluateCheckscrow((x / w) * 2 - 1, (y / h) * 2 - 1, 'launcher'));
  fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), launcherBuf);

  const roundBuf = createPNG(sizes.round, sizes.round, (x, y, w, h) => evaluateCheckscrow((x / w) * 2 - 1, (y / h) * 2 - 1, 'round'));
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundBuf);

  const fgBuf = createPNG(sizes.foreground, sizes.foreground, (x, y, w, h) => evaluateCheckscrow((x / w) * 2 - 1, (y / h) * 2 - 1, 'foreground'));
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), fgBuf);
}

// 2. Generate splash images
for (const [dir, dims] of Object.entries(SPLASH_SIZES)) {
  const targetDir = path.join(baseResDir, dir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const splashBuf = createPNG(dims.w, dims.h, (x, y, w, h) => evaluateSplash(x, y, w, h));
  fs.writeFileSync(path.join(targetDir, 'splash.png'), splashBuf);
}

console.log('Successfully generated all 25 Android image resources with valid PNG binary signatures.');
