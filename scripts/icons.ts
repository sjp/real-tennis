/**
 * Renders the raster icons from public/favicon.svg (120). Run after editing
 * the SVG, and commit the outputs: npm run icons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const BACKGROUND = "#101418";
const dir = new URL("../public/", import.meta.url);
const svg = readFileSync(new URL("favicon.svg", dir), "utf8");
const inner = svg.replace(/^\s*<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/** The mark scaled about the centre, on an opaque full-bleed square. */
const padded = (scale: number) => {
  const offset = String((64 * (1 - scale)) / 2);
  const transform = `translate(${offset} ${offset}) scale(${String(scale)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BACKGROUND}"/><g transform="${transform}">${inner}</g></svg>`;
};

const png = (source: string, size: number) =>
  new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();

/** An ICO holding PNG images (supported everywhere since Windows Vista). */
const ico = (images: { size: number; data: Buffer }[]) => {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
};

const write = (name: string, data: Buffer) => {
  writeFileSync(new URL(name, dir), data);
  console.log(`public/${name}`);
};

write("favicon.ico", ico([16, 32].map((size) => ({ size, data: png(svg, size) }))));
write("icon-192.png", png(svg, 192));
write("icon-512.png", png(svg, 512));
// iOS rounds the corners itself and wants no transparency.
write("apple-touch-icon.png", png(padded(1), 180));
// Maskable icons are cropped to a circle of 80% of the width.
write("icon-maskable-512.png", png(padded(0.75), 512));
