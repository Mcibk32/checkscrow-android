const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZES = {
  'mipmap-mdpi': { launcher: 48, round: 48, foreground: 108 },
  'mipmap-hdpi': { launcher: 72, round: 72, foreground: 162 },
  'mipmap-xhdpi': { launcher: 96, round: 96, foreground: 216 },
  'mipmap-xxhdpi': { launcher: 144, round: 144, foreground: 324 },
  'mipmap-xxxhdpi': { launcher: 192, round: 192, foreground: 432 },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Distance from point (px, py) to line segment (ax, ay) -> (bx, by)
function distToSegment(px, py, ax, ay, bx, by) {
  const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

// Checkscrow Shield & Checkmark SDF
// Coordinates in normalized space [-1, 1]
function evaluateScene(nx, ny, type) {
  const isForeground = type === 'foreground';

  // Background shape for launcher / round
  let bgAlpha = 1.0;
  if (type === 'round') {
    const r = Math.hypot(nx, ny);
    bgAlpha = clamp((0.96 - r) * 20, 0, 1);
  } else if (type === 'launcher') {
    // Rounded rectangle
    const cornerR = 0.28;
    const qx = Math.abs(nx) - (0.92 - cornerR);
    const qy = Math.abs(ny) - (0.92 - cornerR);
    const outsideDist = Math.hypot(Math.max(0, qx), Math.max(0, qy)) - cornerR;
    const insideDist = Math.min(Math.max(qx, qy), 0);
    const d = outsideDist + insideDist;
    bgAlpha = clamp(-d * 25, 0, 1);
  }

  // Base background colors
  let r = 11, g = 15, b = 25, a = bgAlpha; // #0B0F19 dark navy
  if (isForeground) {
    r = 0; g = 0; b = 0; a = 0; // Transparent for foreground
  } else {
    const grad = (ny + 1) * 0.5;
    r = Math.round(15 + grad * 10);
    g = Math.round(23 + grad * 15);
    b = Math.round(42 + grad * 20); // #0F172A to #1E293B
  }

  // Shield scale
  const scale = isForeground ? 0.52 : 0.62;
  const sx = nx / scale;
  const sy = (ny + 0.02) / scale;

  // Shield shape definition
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

  // Checkmark definition (two segments)
  const dSeg1 = distToSegment(sx, sy, -0.32, 0.05, -0.08, 0.32);
  const dSeg2 = distToSegment(sx, sy, -0.08, 0.32, 0.35, -0.20);
  const checkDist = Math.min(dSeg1, dSeg2);
  const checkThickness = 0.09;
  const checkAlpha = clamp((checkThickness - checkDist) * 30 * scale, 0, 1);

  if (inShield) {
    // Shield fill: Emerald gradient (#10B981 to #059669)
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

  // Checkmark overlay (pure white with subtle glow)
  if (checkAlpha > 0) {
    const cR = 255, cG = 255, cB = 255;
    r = Math.round(r * (1 - checkAlpha) + cR * checkAlpha);
    g = Math.round(g * (1 - checkAlpha) + cG * checkAlpha);
    b = Math.round(b * (1 - checkAlpha) + cB * checkAlpha);
    a = Math.max(a, checkAlpha);
  }

  return { r, g, b, a: clamp(a, 0, 1) };
}

function renderIcon(width, height, type) {
  const png = new PNG({ width, height });
  const SAMPLES = 2; // 2x2 supersampling for smooth antialiasing

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          const nx = (px / width) * 2 - 1;
          const ny = (py / height) * 2 - 1;

          const col = evaluateScene(nx, ny, type);
          sumR += col.r * col.a;
          sumG += col.g * col.a;
          sumB += col.b * col.a;
          sumA += col.a;
        }
      }

      const totalSamples = SAMPLES * SAMPLES;
      const avgA = sumA / totalSamples;
      const idx = (width * y + x) << 2;

      if (avgA > 0.001) {
        png.data[idx] = Math.round(sumR / sumA);
        png.data[idx + 1] = Math.round(sumG / sumA);
        png.data[idx + 2] = Math.round(sumB / sumA);
        png.data[idx + 3] = Math.round(avgA * 255);
      } else {
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }

  return PNG.sync.write(png);
}

const baseResDir = path.resolve(__dirname, '../android/app/src/main/res');

const changedFiles = [];

for (const [dir, sizes] of Object.entries(SIZES)) {
  const targetDir = path.join(baseResDir, dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. ic_launcher.png
  const launcherBuf = renderIcon(sizes.launcher, sizes.launcher, 'launcher');
  const launcherPath = path.join(targetDir, 'ic_launcher.png');
  fs.writeFileSync(launcherPath, launcherBuf);
  changedFiles.push(launcherPath);

  // 2. ic_launcher_round.png
  const roundBuf = renderIcon(sizes.round, sizes.round, 'round');
  const roundPath = path.join(targetDir, 'ic_launcher_round.png');
  fs.writeFileSync(roundPath, roundBuf);
  changedFiles.push(roundPath);

  // 3. ic_launcher_foreground.png
  const fgBuf = renderIcon(sizes.foreground, sizes.foreground, 'foreground');
  const fgPath = path.join(targetDir, 'ic_launcher_foreground.png');
  fs.writeFileSync(fgPath, fgBuf);
  changedFiles.push(fgPath);
}

console.log(`Successfully generated ${changedFiles.length} launcher PNG files.`);
