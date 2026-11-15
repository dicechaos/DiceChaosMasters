/* eslint-disable no-console */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const RESOURCES_DIR = path.join(ROOT, 'resources');
const PUBLIC_DIR = path.join(ROOT, 'public');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generates the Dice Chaos Masters sibling icon SVG:
 * - Midnight-Sapphire squircle + blueprint CAD grid + 4 cyan caliper ticks
 * - MSLA resin raft base + micro support struts
 * - 2/3 solid printed faceted multi-neon D20 with resin layer striations + nested Insert Blank core
 * - Active glowing cure scanline at the 2/3 print horizon (y = 188)
 * - Top 1/3 unprinted dashed CAD blueprint wireframe (without numeral text)
 */
function buildMasterSvg(forFavicon = false) {
  const cx = 256;
  const cy = 242;
  const outerR = 164;
  const innerR = 88;
  const printY = 188;

  // Regular hexagon vertices (top point at -90 deg)
  const outerPts = Array.from({ length: 6 }, (_, i) => {
    const a = (-Math.PI / 2) + (i * Math.PI) / 3;
    return [+(cx + outerR * Math.cos(a)).toFixed(2), +(cy + outerR * Math.sin(a)).toFixed(2)];
  });

  // Inner upward equilateral triangle vertices (centered at cy + 6 for optical balance)
  const innerCy = cy + 6;
  const innerPts = Array.from({ length: 3 }, (_, i) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 3;
    return [+(cx + innerR * Math.cos(a)).toFixed(2), +(innerCy + innerR * Math.sin(a)).toFixed(2)];
  });

  // Smaller nested Insert Blank hexagon inside
  const blankR = 118;
  const blankPts = Array.from({ length: 6 }, (_, i) => {
    const a = (-Math.PI / 2) + (i * Math.PI) / 3;
    return [+(cx + blankR * Math.cos(a)).toFixed(2), +(cy + blankR * Math.sin(a)).toFixed(2)];
  });

  const pStr = (pt) => `${pt[0]},${pt[1]}`;
  const layerLines = forFavicon
    ? ''
    : [204, 220, 236, 252, 268, 284, 300, 316, 332, 348, 364, 380, 396]
        .map(
          (y) =>
            `        <line x1="110" y1="${y}" x2="402" y2="${y}" stroke="#7dd3fc" stroke-opacity="0.13" stroke-width="1.5" />`
        )
        .join('\n');
  const vertexNodes = forFavicon
    ? ''
    : [outerPts[0], outerPts[1], outerPts[5], innerPts[0]]
        .map(
          ([vx, vy]) =>
            `      <circle cx="${vx}" cy="${vy}" r="5.5" fill="#091226" stroke="#38bdf8" stroke-width="2.6" />`
        )
        .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Dice Chaos Masters Icon">
  <defs>
    <linearGradient id="dcm-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#131f42" />
      <stop offset="55%" stop-color="#090e1f" />
      <stop offset="100%" stop-color="#040711" />
    </linearGradient>
    <radialGradient id="dcm-glow" cx="50%" cy="46%" r="48%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.34" />
      <stop offset="52%" stop-color="#6366f1" stop-opacity="0.16" />
      <stop offset="100%" stop-color="#090e1f" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="dcm-border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.85" />
      <stop offset="50%" stop-color="#818cf8" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.75" />
    </linearGradient>
    <linearGradient id="dcm-center-face" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#234887" />
      <stop offset="100%" stop-color="#122754" />
    </linearGradient>
    <linearGradient id="dcm-neon-rim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="28%" stop-color="#a78bfa" />
      <stop offset="52%" stop-color="#f472b6" />
      <stop offset="76%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <linearGradient id="dcm-raft" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0891b2" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#818cf8" />
    </linearGradient>
    <linearGradient id="dcm-cure-beam" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22d3ee" />
      <stop offset="35%" stop-color="#e0f2fe" />
      <stop offset="50%" stop-color="#f8fafc" />
      <stop offset="70%" stop-color="#e879f9" />
      <stop offset="100%" stop-color="#22d3ee" />
    </linearGradient>
    <linearGradient id="dcm-cure-glow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0" />
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.38" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
    </linearGradient>
    <clipPath id="dcm-squircle">
      <rect x="24" y="24" width="464" height="464" rx="108" ry="108" />
    </clipPath>
    <clipPath id="dcm-printed-zone">
      <rect x="0" y="${printY}" width="512" height="${512 - printY}" />
    </clipPath>
    <clipPath id="dcm-wireframe-zone">
      <rect x="0" y="0" width="512" height="${printY}" />
    </clipPath>
    <clipPath id="dcm-d20-clip">
      <polygon points="${outerPts.map(pStr).join(' ')}" />
    </clipPath>
  </defs>

  <g clip-path="url(#dcm-squircle)">
    <!-- Midnight Sapphire Squircle -->
    <rect x="24" y="24" width="464" height="464" rx="108" ry="108" fill="url(#dcm-bg)" />
    <rect x="24" y="24" width="464" height="464" rx="108" ry="108" fill="url(#dcm-glow)" />

    <!-- Subtle CAD Grid -->
    <g stroke="#38bdf8" stroke-opacity="${forFavicon ? '0.07' : '0.11'}" stroke-width="1.5">
      <line x1="96" y1="24" x2="96" y2="488" />
      <line x1="176" y1="24" x2="176" y2="488" />
      <line x1="256" y1="24" x2="256" y2="488" />
      <line x1="336" y1="24" x2="336" y2="488" />
      <line x1="416" y1="24" x2="416" y2="488" />
      <line x1="24" y1="96" x2="488" y2="96" />
      <line x1="24" y1="176" x2="488" y2="176" />
      <line x1="24" y1="256" x2="488" y2="256" />
      <line x1="24" y1="336" x2="488" y2="336" />
      <line x1="24" y1="416" x2="488" y2="416" />
    </g>

    <!-- 4 Cyan Caliper Ticks -->
    <g stroke="#22d3ee" stroke-width="5" stroke-linecap="round" opacity="0.85">
      <path d="M 62 92 L 62 62 L 92 62" fill="none" />
      <path d="M 420 62 L 450 62 L 450 92" fill="none" />
      <path d="M 62 420 L 62 450 L 92 450" fill="none" />
      <path d="M 420 450 L 450 450 L 450 420" fill="none" />
    </g>

    <!-- MSLA Support Raft & Struts -->
    <g>
      <line x1="256" y1="406" x2="256" y2="430" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
      <line x1="210" y1="382" x2="196" y2="430" stroke="#38bdf8" stroke-width="3.5" stroke-opacity="0.7" stroke-linecap="round" />
      <line x1="302" y1="382" x2="316" y2="430" stroke="#38bdf8" stroke-width="3.5" stroke-opacity="0.7" stroke-linecap="round" />
      <polygon points="154,430 358,430 374,446 138,446" fill="url(#dcm-raft)" opacity="0.95" />
    </g>

    <!-- Top 1/3: Unprinted Dashed CAD Blueprint Wireframe -->
    <g clip-path="url(#dcm-wireframe-zone)">
      <polygon points="${outerPts.map(pStr).join(' ')}" fill="#38bdf8" fill-opacity="0.045" />
      <polygon
        points="${blankPts.map(pStr).join(' ')}"
        fill="none"
        stroke="#22d3ee"
        stroke-width="2.2"
        stroke-dasharray="7 6"
        stroke-opacity="0.35"
      />
      <g stroke-width="3" stroke-dasharray="8 7" stroke-opacity="0.55" stroke-linecap="round">
        <line x1="${outerPts[0][0]}" y1="${outerPts[0][1]}" x2="${innerPts[0][0]}" y2="${innerPts[0][1]}" stroke="#38bdf8" />
        <line x1="${outerPts[1][0]}" y1="${outerPts[1][1]}" x2="${innerPts[0][0]}" y2="${innerPts[0][1]}" stroke="#a78bfa" />
        <line x1="${outerPts[1][0]}" y1="${outerPts[1][1]}" x2="${innerPts[1][0]}" y2="${innerPts[1][1]}" stroke="#a78bfa" />
        <line x1="${outerPts[5][0]}" y1="${outerPts[5][1]}" x2="${innerPts[2][0]}" y2="${innerPts[2][1]}" stroke="#38bdf8" />
        <line x1="${outerPts[5][0]}" y1="${outerPts[5][1]}" x2="${innerPts[0][0]}" y2="${innerPts[0][1]}" stroke="#38bdf8" />
      </g>
      <polygon
        points="${innerPts.map(pStr).join(' ')}"
        fill="none"
        stroke="#38bdf8"
        stroke-width="3"
        stroke-dasharray="8 7"
        stroke-opacity="0.55"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <polygon
        points="${outerPts.map(pStr).join(' ')}"
        fill="none"
        stroke="#38bdf8"
        stroke-width="4.5"
        stroke-dasharray="11 8"
        stroke-linejoin="round"
        stroke-opacity="0.72"
      />
${vertexNodes}
    </g>

    <!-- Bottom 2/3: Solid Printed Master with Multi-Neon Edges -->
    <g clip-path="url(#dcm-printed-zone)">
      <!-- D20 Outer Facets (Faceted Low-Poly Shading) -->
      <polygon points="${pStr(outerPts[0])} ${pStr(outerPts[1])} ${pStr(innerPts[0])}" fill="#172b59" />
      <polygon points="${pStr(outerPts[1])} ${pStr(innerPts[1])} ${pStr(innerPts[0])}" fill="#12234a" />
      <polygon points="${pStr(outerPts[1])} ${pStr(outerPts[2])} ${pStr(innerPts[1])}" fill="#0d1b3c" />
      <polygon points="${pStr(outerPts[2])} ${pStr(outerPts[3])} ${pStr(innerPts[1])}" fill="#0b1633" />
      <polygon points="${pStr(outerPts[3])} ${pStr(innerPts[2])} ${pStr(innerPts[1])}" fill="#101f44" />
      <polygon points="${pStr(outerPts[3])} ${pStr(outerPts[4])} ${pStr(innerPts[2])}" fill="#0d1838" />
      <polygon points="${pStr(outerPts[4])} ${pStr(outerPts[5])} ${pStr(innerPts[2])}" fill="#13254f" />
      <polygon points="${pStr(outerPts[5])} ${pStr(innerPts[0])} ${pStr(innerPts[2])}" fill="#183063" />
      <polygon points="${pStr(outerPts[5])} ${pStr(outerPts[0])} ${pStr(innerPts[0])}" fill="#1c3870" />

      <!-- Center Main Triangle Face -->
      <polygon points="${innerPts.map(pStr).join(' ')}" fill="url(#dcm-center-face)" />

      <!-- Horizontal Printed Resin Layer Striations -->
      <g clip-path="url(#dcm-d20-clip)">
${layerLines}
      </g>

      <!-- Nested Insert Blank Wireframe (Matched Inner Core above Facets) -->
      <polygon
        points="${blankPts.map(pStr).join(' ')}"
        fill="none"
        stroke="#22d3ee"
        stroke-width="2.6"
        stroke-dasharray="9 6"
        stroke-opacity="0.62"
      />

      <!-- Interior Polyhedral Edges (5-Color Neon Accents) -->
      <g stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round">
        <line x1="${outerPts[0][0]}" y1="${outerPts[0][1]}" x2="${innerPts[0][0]}" y2="${innerPts[0][1]}" stroke="#38bdf8" />
        <line x1="${outerPts[1][0]}" y1="${outerPts[1][1]}" x2="${innerPts[0][0]}" y2="${innerPts[0][1]}" stroke="#a78bfa" />
        <line x1="${outerPts[1][0]}" y1="${outerPts[1][1]}" x2="${innerPts[1][0]}" y2="${innerPts[1][1]}" stroke="#a78bfa" />
        <line x1="${outerPts[2][0]}" y1="${outerPts[2][1]}" x2="${innerPts[1][0]}" y2="${innerPts[1][1]}" stroke="#f472b6" />
        <line x1="${outerPts[3][0]}" y1="${outerPts[3][1]}" x2="${innerPts[1][0]}" y2="${innerPts[1][1]}" stroke="#f472b6" />
        <line x1="${outerPts[3][0]}" y1="${outerPts[3][1]}" x2="${innerPts[2][0]}" y2="${innerPts[2][1]}" stroke="#fbbf24" />
        <line x1="${outerPts[4][0]}" y1="${outerPts[4][1]}" x2="${innerPts[2][0]}" y2="${innerPts[2][1]}" stroke="#34d399" />
        <line x1="${outerPts[5][0]}" y1="${outerPts[5][1]}" x2="${innerPts[2][0]}" y2="${innerPts[2][1]}" stroke="#34d399" />
        <line x1="${outerPts[5][0]}" y1="${outerPts[5][1]}" x2="${innerPts[0][0]}" y2="${innerPts[0][1]}" stroke="#38bdf8" />
      </g>

      <!-- Center Crown Facet Frame -->
      <polygon
        points="${innerPts.map(pStr).join(' ')}"
        fill="none"
        stroke="#fbbf24"
        stroke-width="3.8"
        stroke-linejoin="round"
        stroke-opacity="0.92"
      />

      <!-- Outer Multi-Neon D20 Silhouette -->
      <polygon
        points="${outerPts.map(pStr).join(' ')}"
        fill="none"
        stroke="url(#dcm-neon-rim)"
        stroke-width="7.5"
        stroke-linejoin="round"
      />
    </g>

    <!-- Active 2/3 Cure Horizon Scanline -->
    <g>
      <rect x="102" y="176" width="308" height="24" rx="12" fill="url(#dcm-cure-glow)" />
      <line x1="102" y1="${printY}" x2="410" y2="${printY}" stroke="url(#dcm-cure-beam)" stroke-width="5.5" stroke-linecap="round" />
      <line x1="114" y1="${printY}" x2="398" y2="${printY}" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" opacity="0.95" />
      <circle cx="113.97" cy="${printY}" r="6" fill="#38bdf8" fill-opacity="0.45" />
      <circle cx="113.97" cy="${printY}" r="3.2" fill="#f8fafc" />
      <circle cx="398.03" cy="${printY}" r="6" fill="#38bdf8" fill-opacity="0.45" />
      <circle cx="398.03" cy="${printY}" r="3.2" fill="#f8fafc" />
    </g>
  </g>

  <!-- Outer Badge Border -->
  <rect
    x="26"
    y="26"
    width="460"
    height="460"
    rx="106"
    ry="106"
    fill="none"
    stroke="url(#dcm-border)"
    stroke-width="5"
  />
</svg>`;
}

/**
 * Builds a valid multi-resolution Windows .ico file wrapping PNG frames.
 * Modern Windows (Vista+), Electron, Explorer, and NSIS natively support PNG-in-ICO.
 */
function buildIcoBuffer(frames) {
  const count = frames.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const headerTotal = headerSize + count * dirEntrySize;

  const chunks = [];
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Icon type
  header.writeUInt16LE(count, 4);
  chunks.push(header);

  let offset = headerTotal;
  for (const frame of frames) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0); // width (0 = 256)
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    chunks.push(entry);
    offset += frame.png.length;
  }

  for (const frame of frames) {
    chunks.push(frame.png);
  }
  return Buffer.concat(chunks);
}

/**
 * Builds an Apple .icns icon bundle using standard PNG icon types (ic07..ic14).
 */
function buildIcnsBuffer(pngBySize) {
  const typeMap = [
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 64],
    ['ic12', 128],
    ['ic13', 512],
    ['ic14', 1024],
  ];

  const blocks = [];
  let totalLen = 8;
  for (const [tag, size] of typeMap) {
    const png = pngBySize.get(size);
    if (!png) continue;
    const blockLen = 8 + png.length;
    const hdr = Buffer.alloc(8);
    hdr.write(tag, 0, 4, 'ascii');
    hdr.writeUInt32BE(blockLen, 4);
    blocks.push(hdr, png);
    totalLen += blockLen;
  }

  const rootHdr = Buffer.alloc(8);
  rootHdr.write('icns', 0, 4, 'ascii');
  rootHdr.writeUInt32BE(totalLen, 4);
  return Buffer.concat([rootHdr, ...blocks]);
}

async function rasterizeSvgToPng(win, svgContent, size) {
  const svgB64 = Buffer.from(svgContent, 'utf8').toString('base64');
  const dataUrl = await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = ${size};
        canvas.height = ${size};
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, ${size}, ${size});
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (err) => reject(new Error('SVG rasterize failed: ' + err));
      img.src = 'data:image/svg+xml;base64,${svgB64}';
    })
  `);
  const native = nativeImage.createFromDataURL(dataUrl);
  return native.toPNG();
}

async function main() {
  ensureDir(BUILD_DIR);
  ensureDir(RESOURCES_DIR);
  ensureDir(PUBLIC_DIR);

  const svgMain = buildMasterSvg(false);
  const svgFavicon = buildMasterSvg(true);

  fs.writeFileSync(path.join(BUILD_DIR, 'icon.svg'), svgMain, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), svgFavicon, 'utf8');

  const win = new BrowserWindow({
    width: 64,
    height: 64,
    show: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><html><body></body></html>');

  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  const pngBySize = new Map();
  for (const size of sizes) {
    const png = await rasterizeSvgToPng(win, svgMain, size);
    pngBySize.set(size, png);
    console.log(`Rasterized ${size}x${size} PNG (${png.length} bytes)`);
  }

  const icon512 = pngBySize.get(512);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), icon512);
  fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.png'), icon512);

  const icoFrames = [16, 32, 48, 64, 128, 256].map((size) => ({
    size,
    png: pngBySize.get(size),
  }));
  const icoBuf = buildIcoBuffer(icoFrames);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuf);
  fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.ico'), icoBuf);

  const icnsBuf = buildIcnsBuffer(pngBySize);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icnsBuf);

  // Verify Electron loads build/icon.ico cleanly
  const checkIco = nativeImage.createFromPath(path.join(BUILD_DIR, 'icon.ico'));
  if (checkIco.isEmpty()) {
    throw new Error('Generated build/icon.ico failed nativeImage verification.');
  }

  console.log('Successfully generated icons in build/, resources/, and public/.');
  win.destroy();
}

app.whenReady().then(async () => {
  try {
    await main();
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
