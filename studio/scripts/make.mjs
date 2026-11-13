// One command, finished videos: renders a short in small chunks (fresh Chrome per chunk, so memory never builds up),
// retries a failed chunk with fewer tabs, skips chunks that are already done (stop and restart any time), then joins
// the chunks and adds the soundtrack. Usage:
//   node scripts/make.mjs starter             -> out/Starter_TikTok_1080x1920.mp4
// Options (environment variables): CHUNK=240 (frames per chunk), TABS=2 (parallel tabs), GL=angle (or swangle)
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")); // run from any folder: paths below are relative to studio/

const VIDEOS = JSON.parse(fs.readFileSync("videos.json", "utf8")); // slug -> { comp, audio, name }, added by tp.py new
const [video, only] = process.argv.slice(2);
const V = VIDEOS[video];
if (!V) { console.log(`Which video? One of: ${Object.keys(VIDEOS).join(", ")}`); process.exit(1); }
const formats = ["tiktok"]; void only;
const CHUNK = Number(process.env.CHUNK ?? 240), TABS = Number(process.env.TABS ?? 2), GL = process.env.GL ?? "angle";
const props = { pc: true, audio: false };

const killChrome = () => {
  try {
    if (process.platform === "win32") execSync("taskkill /F /IM chrome-headless-shell.exe /T", { stdio: "ignore" });
    else execSync("pkill -f chrome-headless-shell", { stdio: "ignore" });
  } catch { /* nothing left running */ }
};
const mins = (ms) => `${Math.round(ms / 60000)} min`;
const q = (s) => `"${s}"`; // quote paths: the project folder has a space in its name
/** count blank (white) frames in a chunk: the 3D view failed to draw but the captions still did */
const whiteFrames = (file) => {
  const r = spawnSync(`npx remotion ffmpeg -loglevel error -i ${q(file)} -vf scale=8:8 -pix_fmt gray -c:v rawvideo -f image2pipe -`, { shell: true, maxBuffer: 1 << 26 });
  const b = r.stdout ?? Buffer.alloc(0); let white = 0;
  for (let i = 0; i + 64 <= b.length; i += 64) { let top = 0; for (let k = 0; k < 24; k++) top += b[i + k]; if (top / 24 > 248) white++; }
  return { white, frames: Math.floor(b.length / 64) };
};

console.log("Bundling the project...");
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const chromiumOptions = { gl: GL };
const browserExecutable = process.env.BROWSER || undefined;

for (const fmt of formats) {
  const id = V.comp;
  const comp = await selectComposition({ serveUrl, id, inputProps: props, chromiumOptions, browserExecutable, timeoutInMilliseconds: 600000 });
  const dir = path.resolve("out", "chunks", id);
  fs.mkdirSync(dir, { recursive: true });
  const total = Number(process.env.FRAMES ?? comp.durationInFrames), parts = [];
  console.log(`\n${id}: ${total} frames in ${Math.ceil(total / CHUNK)} chunks`);
  const t0 = Date.now();
  for (let a = 0; a < total; a += CHUNK) {
    const b = Math.min(total, a + CHUNK) - 1, file = path.join(dir, `${String(a).padStart(5, "0")}-${b}.mp4`);
    parts.push(file);
    if (fs.existsSync(file)) { console.log(`  frames ${a}-${b}: already done`); continue; }
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      // attempts: graphics card with TABS tabs, then 1 tab, then 1 tab again, then the CPU (slow but always draws)
      const tabs = attempt === 0 ? TABS : 1, gl = attempt === 3 ? "swangle" : GL;
      killChrome();
      try {
        const tmp = file.replace(/\.mp4$/, ".tmp.mp4");
        await renderMedia({
          composition: comp, serveUrl, codec: "h264", crf: 16, x264Preset: "medium", pixelFormat: "yuv420p", outputLocation: tmp, inputProps: props,
          frameRange: [a, b], concurrency: tabs, chromiumOptions: { gl }, browserExecutable, timeoutInMilliseconds: 600000, muted: true,
          onProgress: ({ progress }) => process.stdout.write(`\r  frames ${a}-${b}: ${Math.round(progress * 100)}%   `),
        });
        const chk = whiteFrames(tmp);
        if (chk.white > 4) { fs.unlinkSync(tmp); throw new Error(`${chk.white} of ${chk.frames} frames came out white`); }
        fs.renameSync(tmp, file);
        ok = true;
        const done = b + 1, el = Date.now() - t0;
        console.log(`\r  frames ${a}-${b}: done (${mins(el)} so far, about ${mins((el / done) * (total - done))} left)`);
      } catch (e) {
        console.log(`\n  frames ${a}-${b} failed (${String(e.message).split("\n")[0]})${attempt < 3 ? ", trying again" + (attempt === 2 ? " on the CPU (slower)" : " with 1 tab") + "..." : ""}`);
      }
    }
    if (!ok) { console.log(`\nStopped: frames ${a}-${b} keep failing. Restart your PC and run the same command again (finished chunks are kept).`); process.exit(1); }
  }
  killChrome();
  // join the chunks + add the soundtrack (Remotion's own ffmpeg, no extra install)
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  const out = path.resolve("out", `${V.name}_TikTok_1080x1920.mp4`);
  const r = spawnSync("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", q(list), "-i", q(path.resolve(V.audio)),
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", q(out)], { stdio: "inherit", shell: true });
  if (r.status !== 0) { console.log("Joining failed: paste the lines above into Claude Code."); process.exit(1); }
  console.log(`\nFinished: ${out}`);
}
console.log("\nAll done. The chunk files in out/chunks can be deleted once you've checked the videos.");
