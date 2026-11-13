// Test stills: node stills.mjs <CompName> <outPrefix> <f1,f2,...> [scale] [propsJSON]
// e.g. node stills.mjs StarterShort out/check_ 40,150,265 0.5 '{"fast":true,"audio":false}'
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "fs";
import path from "path";
const [comp, outPrefix, frames, scale = "0.5", props] = process.argv.slice(2);
if (!comp || !outPrefix || !frames) { console.log("usage: node stills.mjs <CompName> <outPrefix> <f1,f2,...> [scale] [propsJSON]"); process.exit(1); }
const inputProps = props ? JSON.parse(props) : { fast: true, audio: false };
const gl = process.env.GL ?? (process.platform === "linux" ? "swangle" : "angle"); // angle = graphics card, swangle = CPU
fs.mkdirSync(path.dirname(path.resolve(outPrefix + "x")), { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const opts = { serveUrl, inputProps, browserExecutable: process.env.BROWSER || undefined, chromiumOptions: { gl }, timeoutInMilliseconds: 600000 };
const composition = await selectComposition({ ...opts, id: comp });
for (const f of frames.split(",").map(Number)) {
  const t = Date.now();
  await renderStill({ ...opts, composition, frame: f, output: `${outPrefix}${f}.jpg`, imageFormat: "jpeg", jpegQuality: 88, scale: Number(scale) });
  console.log(f, ((Date.now() - t) / 1000).toFixed(1) + "s");
}
