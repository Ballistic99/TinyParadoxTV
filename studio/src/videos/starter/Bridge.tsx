// The short as one Remotion composition: flat 2D characters in a 3D toon world.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts). Post chain (look-match pass):
//   InkPass (world ink lines, own pass) -> lens blur pre + main (thin-lens DOF per shot from dofAt) ->
//   [bloom (emissive only) + NEUTRAL tone mapping + colour grade] (one merged EffectPass), MSAA 4.
// Ink runs before the DOF so lines blur with what they belong to; bloom after the DOF so glows defocus with their
// source; the grade is display-referred, so it comes after tone mapping. Every pixel-sized parameter is specified at
// 1080x1920 and scaled with the output size, so stills at --scale 0.5 and the 1440x2560 final match.
// Place changes crossfade by stacking a second canvas for the fade frames; an optional white flash at FLASH_AT (story.ts).
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, getInputProps, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
/** film frame at 30 fps, also when the composition runs on twos (15 fps) */
const useFilmFrame = () => { const f = useCurrentFrame(), { fps } = useVideoConfig(); return Math.round(f * (30 / fps)); };
import WORDS from "./words.json";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { Kit } from "./build";
import { TOTAL, FLASH_AT, SHOTS, layersAt, dofAt } from "./story";

export const STARTER_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

/** Bloom for emissive sources only (depth.md 6.4). Its MIP chain always starts at 540x960 (half of 1080x1920),
 *  whatever the output size, so the glow keeps the same size relative to the frame (e-fold ~30 px at 1080p,
 *  ~1.5 % of the frame height) at 540, 1080 and 1440 widths. ADD blend: HDR-safe (SCREEN darkens values > 1). */
const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("bridge kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit; at?: number }> = ({ id, kit, at }) => {
  const cf = useFilmFrame(), f = at ?? cf;
  const { camera, scene, gl } = useThree();
  // a lost WebGL context draws nothing (white frames): fail the frame instead so the maker re-renders it
  useEffect(() => {
    const c = gl.domElement, lost = () => cancelRender(new Error("WebGL context lost"));
    c.addEventListener("webglcontextlost", lost);
    return () => c.removeEventListener("webglcontextlost", lost);
  }, [gl]);
  if (gl.getContext().isContextLost()) cancelRender(new Error("WebGL context lost"));
  const world = useMemo(() => new World(kit), [kit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
    grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }), // film grain, OFF by default (inputProps post.grain): the reference measures no grain and it quadruples the file size
  }), [camera, scene]);
  useEffect(() => () => { (fx.ink as unknown as { dispose?: () => void }).dispose?.(); }, [fx]);
  const post = useMemo(() => (
    <EffectComposer multisampling={(getInputProps() as { fast?: boolean }).fast ? 2 : 4}>
      {on.ink ? <primitive object={fx.ink} dispose={null} /> : null}
      {on.lens && on.pre ? <primitive object={fx.lens.pre} dispose={null} /> : null}
      {on.lens ? <primitive object={fx.lens.main} dispose={null} /> : null}
      {on.bloom ? <primitive object={fx.bloom} dispose={null} /> : null}
      <primitive object={fx.tone} dispose={null} />
      {on.grade ? <primitive object={fx.grade} dispose={null} /> : null}
      {on.grain ? <primitive object={fx.grain} dispose={null} /> : null}
    </EffectComposer>
  ), [fx, on]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  // 16:9 version: same shots, a tighter vertical lens so subjects keep their size across the wider frame
  if (cam.aspect > 1) { cam.fov = (360 / Math.PI) * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * 0.7); cam.updateProjectionMatrix(); }
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, SHOTS[id - 1].light === "golden" ? "golden" : "day");
  fx.grain.seed = f; // deterministic per frame
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {post}
    </>
  );
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number; at?: number }> = ({ id, kit, alpha, at }) => {
  const { width, height } = useVideoConfig();
  return (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={width} height={height} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} kit={kit} at={at} />
    </ThreeCanvas>
  </AbsoluteFill>
  );
};

/** one-word captions: white bold sans, dark outline, lower-middle, hard swap on each word (key words in gold) */
/** key words shown in gold: put your story's names, numbers and punch words here */
const HOT = /^(true|story|twist|checked|first|always)/i;
const Captions: React.FC = () => {
  const f = useFilmFrame(), { width, height } = useVideoConfig(), t = f / 30;
  const W = WORDS as { w: string; s: number; e: number }[];
  let i = -1;
  for (let k = 0; k < W.length; k++) { if (W[k].s - 0.02 <= t) i = k; else break; }
  if (i < 0) return null;
  const w = W[i], next = W[i + 1];
  if (t > w.e + 0.35 && (!next || t < next.s - 0.02)) return null;
  const txt = w.w.replace(/[.,?!]/g, ""), age = f - Math.round(w.s * 30), k = age < 3 ? 1.12 - 0.04 * age : 1;
  const tall = height > width, size = Math.round((tall ? 0.072 : 0.085) * height * (tall ? 1 : 0.9));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div style={{ position: "absolute", top: tall ? "61%" : "74%", width: "100%", textAlign: "center", transform: `scale(${k})`,
        fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: size, letterSpacing: 1, color: HOT.test(txt) ? "#ffd24d" : "#ffffff",
        WebkitTextStroke: `${Math.round(size * 0.075)}px #1a1a1a`, paintOrder: "stroke fill", textShadow: `0 ${Math.round(size * 0.05)}px 0 rgba(0,0,0,0.35)` }}>
        {txt}
      </div>
    </AbsoluteFill>
  );
};

export const StarterShort: React.FC = () => {
  const f = useFilmFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
      {(getInputProps() as { captions?: boolean }).captions === false ? null : <Captions />}
      {(getInputProps() as { audio?: boolean }).audio === false ? null : <Audio src={staticFile("starter/mix.wav")} />}
    </AbsoluteFill>
  );
};

