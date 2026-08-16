const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

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

function createSplashPNG(width, height) {
  const png = new PNG({ width, height });
  
  // Background color #0B0F17 (r=11, g=15, b=23)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 11;     // Red
      png.data[idx + 1] = 15; // Green
      png.data[idx + 2] = 23; // Blue
      png.data[idx + 3] = 255;// Alpha
    }
  }

  return PNG.sync.write(png);
}

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

for (const [folder, dims] of Object.entries(SPLASH_SIZES)) {
  const dir = path.join(resDir, folder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const buf = createSplashPNG(dims.w, dims.h);
  fs.writeFileSync(path.join(dir, 'splash.png'), buf);
  console.log(`Generated valid splash PNG for ${folder}: ${dims.w}x${dims.h}`);
}

console.log('All splash PNGs generated successfully!');
