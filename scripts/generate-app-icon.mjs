import sharp from "sharp";

// Colors from the brand palette in src/App.jsx (const C)
const aureus = "#C8A96E";
const ivory = "#E8D5A3";
const carbon = "#1C1C1C";

// Tick marks at N/E/S/W, from r=39 to r=44 (matches the Compass component)
const ticks = [0, 90, 180, 270]
  .map((a) => {
    const r = (a * Math.PI) / 180;
    const x1 = 50 + 39 * Math.sin(r), y1 = 50 - 39 * Math.cos(r);
    const x2 = 50 + 44 * Math.sin(r), y2 = 50 - 44 * Math.cos(r);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${aureus}" stroke-width="1.5" opacity=".5"/>`;
  })
  .join("\n      ");

// Full-bleed opaque background: iOS applies its own corner mask, so the
// rounded-square look must NOT be baked in (baked corners leave artifacts).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${ivory}"/>
      <stop offset="100%" stop-color="${aureus}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="${carbon}"/>
  <g transform="translate(162,162) scale(7)">
    <circle cx="50" cy="50" r="44" fill="none" stroke="${aureus}" stroke-width="2" opacity=".4"/>
      ${ticks}
    <polygon points="50,10 46,50 50,40 54,50" fill="url(#cg)"/>
    <polygon points="50,90 54,50 50,60 46,50" fill="${aureus}" opacity=".35"/>
    <polygon points="10,50 50,54 40,50 50,46" fill="${aureus}" opacity=".35"/>
    <polygon points="90,50 50,46 60,50 50,54" fill="url(#cg)"/>
    <circle cx="50" cy="50" r="6" fill="${carbon}"/>
    <circle cx="50" cy="50" r="3.5" fill="url(#cg)"/>
  </g>
</svg>`;

const out = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png";

await sharp(Buffer.from(svg))
  .flatten({ background: carbon })
  .removeAlpha()
  .png()
  .toFile(out);

const meta = await sharp(out).metadata();
console.log(`${out}: ${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha}`);
