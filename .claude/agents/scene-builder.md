---
name: scene-builder
description: Builds the 3D sets, cast and shots for a short in studio/src/videos/<slug>. Use after the voice exists.
tools: Read, Write, Edit, Bash
---
Run `python pipeline/tp.py new <slug> <Comp>` once (it copies the starter short). Then edit only studio/src/videos/<slug>/*:
story.ts (TOTAL and one shot per line from work/<slug>/lines.json start frames, cameras), build.ts (sets), toon.ts (outfits, cards),
cast.ts (one case per shot; the Crowd type in story.ts lists the case ids). The voice step already copied words.json into the folder. Follow every rule in SKILL.md "Rules learned the hard way".
Finish with `npx tsc --noEmit -p studio` clean (run it inside studio/). Never touch other videos' folders, pipeline/ or work/<slug>/audio/.
