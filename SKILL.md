---
name: tiny-paradox-short
description: Make an animated true-story short (flat 2D cartoon characters in a 3D world, 9:16, 30 fps) from one story idea, with a fact-checked script, AI voice, word-timed captions, generated sound, frame-checked render and posting copy.
---

# Tiny Paradox short

You turn one weird-but-true story into a finished 55 to 65 second vertical short:
flat cartoon characters drawn by code, standing in a real three.js world, rendered frame by frame with Remotion.
Work through the steps in order. Do not skip the still check or the frame check: they are what keep every frame clean.

## The agent team (how a short gets made)
Six agents in `.claude/agents/`, each owning its own files, so they never break each other's work:
1. **story-scout** -> `work/<slug>/story.json` (verified facts + sources)
2. **script-writer** -> `script.json`, `say.json`, voice, timings, subtitles
3. **scene-builder** -> `studio/src/videos/<slug>/*`, and in parallel once shots are locked, **sound-designer** -> `work/<slug>/audio/`, `mix.wav`
4. **still-reviewer** (fresh eyes, never edits code) -> `review.json`; scene-builder fixes; repeat until the review is empty
5. **frame-inspector** -> chunked render, every-frame check, patches, final MP4
You (the orchestrator) run them in that order, pass each one the slug, read their outputs, and only move on when the step's check passes.
The steps below are what each agent does; follow them directly if you are working alone.

## 0. Setup (once)
- `cd studio && npm i` (Remotion 4, three.js). `pip install -r requirements.txt` (includes ffmpeg through imageio-ffmpeg).
- Put `kokoro-v1.0.onnx` and `voices-v1.0.bin` in `tts/` (free, from the kokoro-onnx GitHub releases) or set `TP_TTS`.
- Rendering uses the graphics card (`GL=angle`, the default on Windows and macOS). If a render fails with a GL error, set `GL=swangle` (CPU: slow but always works).
- Test: `node scripts/make.mjs starter` inside `studio/` renders the starter short to `studio/out/Starter_TikTok_1080x1920.mp4`.

## 1. Story (2 minutes)
- It must sound fake, be true, and fit in one sentence. Check `work/DONE.txt` so it has not been done already.
- Verify every date, number and name against at least two sources (Wikipedia plus one other). Note anything disputed and leave it out of the script.

## 2. Script (3 minutes): the formula
- 14 to 17 lines, about 3.6 words a second, under 65 seconds. Write `work/<slug>/script.json` as a JSON list of lines.
- Line 1 is the paradox, the whole hook, no intro ("In 1518, a whole town started dancing. And nobody could stop.").
- Lines 2 to ~12 escalate: every line adds something stranger. Then the turn (the real reason, often opening "You see," / "So"). The last line is the twist or punchline.
- Every line must become a shot, so write things that can be shown.
- Spell tricky names for the voice in `say.json` (e.g. `{"Strasbourg": "Strass-burg", "1518": "fifteen eighteen"}`).

## 3. New short + voice (1 minute)
- `python pipeline/tp.py new <slug> <CompName>` copies the starter into `studio/src/videos/<slug>` and registers it (CompName like `CatMayorShort`). Add a third argument to copy one of your finished shorts instead (`... new <slug> <CompName> <oldslug>`): it starts with that short's characters, cards and sets.
- `python pipeline/tp.py voice work/<slug> am_puck 1.1` writes voice.wav, voice48.wav, lines.json, words.json, subtitles.srt, copies words.json and the voice into the studio, and prints each line's start frame. Use those frames for every cut and pop.

## 4. Scenes (the main work)
In `studio/src/videos/<slug>`:
- `story.ts`: TOTAL (frames), one SHOT per line (`a`, `b` from the voice frames), the `Crowd` ids, light `day` (use `golden` sparingly: long shadows streak the ground), set anchors 100 m apart on x, one camera framing per shot (`dolly` push-ins).
- `build.ts`: the sets in `buildStarter` (rename it if you like; `world.ts` calls it). Use the plaza and room blocks as templates: `flat` for floors, `boxGeo` for walls and furniture, `prop(b, kit, "tree_oak", ...)` for trees, `house` for buildings, `lampPost`, `bench`, `chair`.
- `cast.ts`: outfits (`{ jacket, pants, boots, hat, hair, cap, skin, moustache }`) and one `case` per shot: `stander`, `walker`, `popFx`, and the screen-anchored titles `fxS` (big text), `tickS` (pill with a tick), `stampS` (rubber stamp).
- `toon.ts`: the drawing code for characters, faces, hats, props and story cards (`fxText`, `fxTick`, `fxStampFit`): add new cards here.
- `Bridge.tsx`: `HOT` lists the caption words shown in gold (names, numbers, punch words).
- Preview any time with `npx remotion studio` (inside `studio/`).

## 5. Still check before any render (5 minutes)
Render one still per shot and per cut: `node stills.mjs <Comp> out/check_ <f1,f2,...> 0.5` (inside `studio/`), put them on one contact sheet and look at every tile. Fix, re-still, repeat. Fixing a still takes seconds; fixing after a render costs hours.

## 6. Sound (2 minutes)
Copy `pipeline/score_template.py` to `work/<slug>/audio/score.py`, set TOTAL, the cut frames, pop frames, stamps and story effects, run it with the work folder as its argument (`python work/<slug>/audio/score.py work/<slug>`: reads `voice48.wav`, writes `mix.wav` there), copy `mix.wav` to `studio/public/<slug>/mix.wav`. Target about -14.5 LUFS; voice -15.5, music -25, effects -23.5.

## 7. Render, check, assemble
- `python pipeline/tp.py make <slug>`: renders in chunks (`studio/out/chunks/<Comp>/`), retries a failed chunk, joins them and adds the mix. Stop and restart any time: finished chunks are kept.
- `python pipeline/tp.py check <chunk.mp4> <frames> <offset>` on every chunk. Any `odd` frame: look at it, fix the cause, re-render that single frame as a PNG named `f<frame>.png` into a patch folder.
- If you patched frames: `python pipeline/tp.py assemble <final.mp4> <mix.wav> <patchDir> <chunks in order...>`, then check the final file again (expected = TOTAL).

## 8. Deliver
MP4 (1080x1920, 30 fps), TikTok cover 1080x1920 (a clean still with `{"audio":false,"captions":false}` plus a 2-to-4 word headline), SRT, and posting copy: TikTok caption + hashtags, pinned comment that asks a question, Shorts title (under 60 characters, the paradox), description with sources. Add the story to `work/DONE.txt`.

## Rules learned the hard way (never break these)
1. Cameras: slow push-ins and hard cuts only. No impact kicks or shake: they read as the ground shaking.
2. Every camera looking +z has screen-right = -x. Place characters inside the frame: at distance d and fov f the half-width is about d * tan(f/2) * 0.5625.
3. Floor decals must wind so z decreases across the quad, or the floor is invisible. Use `flat()`: it tessellates floors into 1 m triangles, so a camera standing on them never mis-clips a triangle.
4. `boxGeo` has no bottom face unless `bottom = true`: ceilings need it.
5. Titles and badges are screen-anchored (`fxS`, `tickS`, `stampS`) so they never leave the frame. Long titles: width fraction 0.78 or less.
6. Keep faces above the caption line (captions sit at about 62 % of the frame height): tilt the camera up rather than shrinking the character.
7. Don't put set dressing between the camera and the characters (move the prop, not the camera).
8. Seated characters behind tables need a raised `y` or they vanish behind the table.
9. Text fit: 0.62 * size * length + 0.3 * size must stay under 560.
10. Golden light makes long tree shadows that stripe the ground: use day light for open plazas.
11. Never trust one look: measure. Contact sheets every 46 frames, the frame checker on every chunk, and the final file checked again.
