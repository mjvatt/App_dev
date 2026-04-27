/**
 * Generates placeholder PNG assets for Expo.
 * Replace the output files with final designed assets before publishing.
 *
 * Outputs:
 *   assets/icon.png          1024x1024  App icon (iOS + Android launcher)
 *   assets/adaptive-icon.png 1024x1024  Android adaptive icon foreground
 *   assets/splash-icon.png    288x288   Centered logo on splash screen
 *   assets/favicon.png         48x48    Web favicon
 */

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// CRC-32 table (standard PNG requirement)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBytes, data]);
  return Buffer.concat([u32be(data.length), payload, u32be(crc32(payload))]);
}

/**
 * Build a solid-color RGBA PNG.
 * @param {number} w
 * @param {number} h
 * @param {[number,number,number,number]} rgba
 */
function solidPNG(w, h, [r, g, b, a]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = chunk(
    "IHDR",
    Buffer.concat([
      u32be(w),
      u32be(h),
      Buffer.from([8, 6, 0, 0, 0]), // 8-bit RGBA, no compression, no filter, no interlace
    ])
  );

  // Build raw scanlines: [filter=0, r, g, b, a, ...]
  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(h * rowBytes, 0);
  for (let y = 0; y < h; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter byte: None
    for (let x = 0; x < w; x++) {
      const off = base + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  const idat = chunk("IDAT", zlib.deflateSync(raw));
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

/**
 * Build a two-tone PNG: outer ring color + inner circle color.
 * Used to make the icon slightly less boring than a flat square.
 */
function ringPNG(w, h, outerRGBA, innerRGBA, innerRadius) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk(
    "IHDR",
    Buffer.concat([u32be(w), u32be(h), Buffer.from([8, 6, 0, 0, 0])])
  );

  const cx = w / 2;
  const cy = h / 2;
  const r2 = innerRadius * innerRadius;

  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(h * rowBytes, 0);

  for (let y = 0; y < h; y++) {
    const base = y * rowBytes;
    raw[base] = 0;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inside = dx * dx + dy * dy <= r2;
      const [r, g, b, a] = inside ? innerRGBA : outerRGBA;
      const off = base + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  const idat = chunk("IDAT", zlib.deflateSync(raw));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const OUT = path.join(__dirname, "..", "assets");

// icon.png — 1024x1024: indigo bg, lighter indigo inner circle
fs.writeFileSync(
  path.join(OUT, "icon.png"),
  ringPNG(1024, 1024, [99, 102, 241, 255], [129, 140, 248, 255], 340)
);
console.log("✓ icon.png");

// adaptive-icon.png — 1024x1024: same design, used as foreground layer on Android
fs.writeFileSync(
  path.join(OUT, "adaptive-icon.png"),
  ringPNG(1024, 1024, [99, 102, 241, 255], [129, 140, 248, 255], 340)
);
console.log("✓ adaptive-icon.png");

// splash-icon.png — 288x288: small centered circle on transparent bg
fs.writeFileSync(
  path.join(OUT, "splash-icon.png"),
  ringPNG(288, 288, [0, 0, 0, 0], [99, 102, 241, 255], 100)
);
console.log("✓ splash-icon.png");

// favicon.png — 48x48: solid indigo
fs.writeFileSync(
  path.join(OUT, "favicon.png"),
  solidPNG(48, 48, [99, 102, 241, 255])
);
console.log("✓ favicon.png");

console.log("\nDone. Replace with final designs before publishing to stores.");
