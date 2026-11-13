# Tiny Paradox Studio

Make your own animated true-story shorts with Claude: flat 2D cartoon characters in a real 3D world, a natural AI voice, word-by-word captions, a generated soundtrack and a frame-by-frame quality check. All free and open source.

Six Claude agents split the work so nothing breaks:

| Agent | Job |
|---|---|
| story-scout | finds a weird-but-true story and checks every fact against two sources |
| script-writer | writes the 60-second script and records the voice |
| scene-builder | builds the 3D sets, the characters and the camera shots |
| sound-designer | scores the music, whooshes and effects |
| still-reviewer | checks a still of every shot with fresh eyes |
| frame-inspector | renders, checks every single frame and delivers the MP4 |

Made by **Tiny Paradox TV**: watch what it makes on [YouTube](https://www.youtube.com/@TinyParadoxTV) and [TikTok](https://www.tiktok.com/@tinyparadox.tv).

---

## 1. Install (once, about 15 minutes)

You need these free programs. Download and install each one with the default options:

1. **VS Code**: https://code.visualstudio.com/download
2. **Git**: https://git-scm.com/downloads
3. **Node.js (LTS)**: https://nodejs.org/en/download
4. **Python 3.12**: https://www.python.org/downloads/ (on Windows, tick **"Add python.exe to PATH"** on the first screen)
5. **Claude Code for VS Code**: open VS Code, click the Extensions icon on the left (four squares), search **Claude Code**, install the one by Anthropic, then sign in with your Claude account.

Close and reopen VS Code after installing, so it sees the new programs.

## 2. Get the studio

In VS Code: **Terminal > New Terminal**, then:

```
git clone https://github.com/Ballistic99/TinyParadoxTV.git
cd TinyParadoxTV
code .
```

A new VS Code window opens on the folder. Open a terminal there (**Terminal > New Terminal**) and run:

```
cd studio
npm i
cd ..
pip install -r requirements.txt
```

## 3. Download the free voice (about 340 MB)

Download these two files and put them in the `tts` folder:

- https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
- https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

## 4. Test it

```
cd studio
npx remotion studio
```

Your browser opens the studio. Pick **StarterShort** on the left and press play: a 10-second demo with a 3D town square, a room, a cartoon host and the three title styles. Close it with Ctrl+C in the terminal.

To render the demo to an MP4:

```
node scripts/make.mjs starter
```

The video lands in `studio/out/Starter_TikTok_1080x1920.mp4`.

## 5. Make your own short

Click the Claude icon in VS Code's sidebar to open Claude Code, and type:

```
Read SKILL.md and use the agent team to make a short about: <your story idea>
```

Claude runs the six agents in order: it checks the facts, writes the script, records the voice, builds the scenes, shows you stills to approve, scores the sound, renders and checks every frame. You get the MP4, a cover image, subtitles and the posting text (title, caption, hashtags, pinned comment).

Prefer doing it yourself? `SKILL.md` lists every step and command. The main ones:

```
python pipeline/tp.py new mystory MyStoryShort      # a new short, copied from the starter
python pipeline/tp.py voice work/mystory am_puck 1.1 # voice + captions from work/mystory/script.json
python pipeline/tp.py make mystory                   # render, join, add the sound
python pipeline/tp.py check <video.mp4> <frames>     # every-frame check
```

Voices: `am_puck` (male, the default), `am_michael`, `bm_george` (British male), `af_heart` (female), and more in the kokoro-onnx docs.

## Speed

Rendering is the slow part. With a graphics card a 60-second short takes about 10 to 30 minutes. On a laptop without one, set the CPU renderer (`set GL=swangle` on Windows, `export GL=swangle` on Mac/Linux) and expect a few hours. You can stop and restart `make` any time: finished chunks are kept.

## If something goes wrong

- **`python` not found** (Windows): reinstall Python and tick "Add python.exe to PATH", then reopen VS Code.
- **A render fails with a GL or WebGL error**: run it again with the CPU renderer (see Speed).
- **Anything else**: paste the error into Claude Code and ask it to fix it.

## What's in the box

- `SKILL.md`: the full recipe the agents follow, with the rules that keep every frame clean
- `.claude/agents/`: the six agents
- `studio/`: the Remotion + three.js studio (characters, sets, lighting, camera, captions) and the starter short
- `pipeline/`: voice, timing, subtitles, sound, chunked rendering, frame checks and assembly
- `work/`: one folder per short for its script, voice and sound

## Licence

MIT, see `LICENSE`. Free to use for your own channel. A shout-out to Tiny Paradox TV is always appreciated.
