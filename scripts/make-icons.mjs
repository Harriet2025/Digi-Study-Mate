// Generates the app icons in public/icons and app/ from one SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const NAVY = "#1e3a5f";
const glyph = `
  <path d="M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5 16v-2.5H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5Z" />
  <path d="M18 9h1.5A1.5 1.5 0 0 1 21 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v2.5L15.5 17H11" />`;

/** rounded: transparent corners (normal icon). Otherwise full-bleed (maskable / Apple). scale: glyph size. */
function svg({ rounded, scale }) {
  const size = 24 * scale;
  const offset = (512 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${NAVY}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#fff" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  </svg>`;
}

mkdirSync("public/icons", { recursive: true });
const out = [
  ["public/icons/icon-192.png", 192, { rounded: true, scale: 13 }],
  ["public/icons/icon-512.png", 512, { rounded: true, scale: 13 }],
  ["public/icons/maskable-512.png", 512, { rounded: false, scale: 10 }],
  ["app/apple-icon.png", 180, { rounded: false, scale: 12 }],
  ["app/icon.png", 64, { rounded: true, scale: 14 }],
];
for (const [file, px, opts] of out) {
  await sharp(Buffer.from(svg(opts))).resize(px, px).png().toFile(file);
  console.log("wrote", file);
}
