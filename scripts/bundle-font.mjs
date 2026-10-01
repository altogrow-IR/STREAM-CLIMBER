/* global URL, fetch, Buffer, console */
import { mkdir, writeFile } from "node:fs/promises";
const dir = new URL("../public/assets/fonts/", import.meta.url);
await mkdir(dir, { recursive: true });
const response = await fetch(
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&display=swap",
);
if (!response.ok) throw new Error("Font download failed");
let css = await response.text();
let i = 0;
for (const url of new Set(
  css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g),
)) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Font asset download failed");
  const filename = `barlow-${i++}.woff2`;
  await writeFile(new URL(filename, dir), Buffer.from(await r.arrayBuffer()));
  css = css.replaceAll(url, `./${filename}`);
}
await writeFile(new URL("fonts.css", dir), css);
const license = await fetch(
  "https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt",
);
if (license.ok) await writeFile(new URL("OFL.txt", dir), await license.text());
console.log(`Bundled ${i} font files`);
