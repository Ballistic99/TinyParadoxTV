// Timeline of the starter short: one SHOT per script line (frames a..b from the voice timing), the light, the set
// anchors and the cameras. Replace everything in this file with your own story: TOTAL, SHOTS, anchors, framings.
import { getInputProps } from "remotion";
export const FPS = 30;
export const TOTAL = 300;
export const D0 = 6.0; // ground height (m)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type BridgeState = { bounce: number; drop: number; snap: number; collapsed: boolean };

// ---------------- shots ----------------
export type Light = "day" | "golden" | "storm";
/** one id per shot: cast.ts has one `case` for each */
export type Crowd = "none" | "s1" | "s2" | "s3";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: Crowd; tau: (t: number) => number; towns?: boolean; dirty?: boolean;
  fog?: [string, number, number]; sunAz?: number; sunEl?: number };
const tt = (t: number) => t;
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 100, light: "day", crowd: "s1", tau: tt },
  { id: 2, a: 100, b: 200, light: "day", crowd: "s2", tau: tt },
  { id: 3, a: 200, b: TOTAL, light: "day", crowd: "s3", tau: tt },
];
export const XFADE: Record<number, number> = {};
export const FLASH_AT = -100;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};
export const bridgeState = (_id: number, _t: number): BridgeState => ({ bounce: 0, drop: 0, snap: 0, collapsed: false });

// ---------------- sets: anchors 100 m apart on x, every set looks +z ----------------
export const PLAZA: V3 = [0, D0, 0];   // a town square: sand walk along z, lawns, trees, houses, lamps, a fountain at z 9
export const ROOM: V3 = [100, D0, 0];
/** a vehicle on the set (none in the starter) */
export type CarState = { on: boolean; x: number; z: number; v: number; shake: number };
export const carAt = (_id: number, _t: number): CarState => ({ on: false, x: 0, z: 0, v: 0, shake: 0 });
/** the host's walk across the plaza in shot 2 (x at time t, right to left on screen) */
export const walkX = (t: number) => PLAZA[0] + 2.6 - 1.1 * Math.max(0, t - 100 / FPS);

// ---------------- camera ----------------
// Grammar (motion.md): every move is a symmetric smootherstep glide of 18-40 f (peak speed = 1.875 x distance / dur,
// so dur >= 0.075 x the move in 720p px keeps the peak near the reference 14-25 px/f); a reframe bigger than about
// half a frame width or 40 % zoom is a hard cut on its key frame. Glides are centred on the old key frame (the
// whoosh in the sound mix peaks there), so a glide key starts dur/2 earlier. Holds push in (dolly toward the look
// point or a fov zoom near walls/towers): 0.15-0.35 %/f, ~0.6 %/f for ~35 f on the punch words. Rolls of 4-8 deg
// over >= 18 f on emphasis beats, held tilt <= 0.07 rad.
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
/** reference camera ease: symmetric smootherstep (attack = release, ~10 f each on a 23 f move) */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0: the subject grows ~rate per frame; `punch` raises it (with 8 f soft edges) for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
/** dolly push: camera slides toward the look point by factor k */
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });

// ---- framings ----
// Every set looks +z (screen-right = -x). Only slow push-ins and hard cuts: no impact kicks or hand-held shake.
const A = (c: V3, dx: number, y: number, z: number): V3 => [c[0] + dx, D0 + y, c[2] + z];
const S1a = (f: number) => dolly(A(PLAZA, 0, 1.5, -2.6), A(PLAZA, 0, 1.55, 3), pushK(f, 0, 0.0024), { fov: 48 });
const S2a = (f: number) => dolly(A(PLAZA, 0, 1.7, -4.2), A(PLAZA, 0, 1.6, 3), pushK(f, 100, 0.0014), { fov: 54 });
const S3a = (f: number) => dolly(A(ROOM, 0.3, 1.55, -2.4), A(ROOM, 0.3, 1.35, 3.2), pushK(f, 200, 0.0026), { fov: 48 });
const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }],
  2: [{ f: 100, s: S2a }],
  3: [{ f: 200, s: S3a }],
};
/** impacts used to kick the camera for 7 frames, flipping sign each frame; that read as the ground shaking, so none */
export const kickAt = (_t: number) => 0;
export const camAt = (id: number, f: number): Cam => {
  const ob = (getInputProps() as { orbit?: { c: V3; r: number; h: number; a0: number; a1: number; f0: number; f1: number; fov: number } }).orbit;
  if (ob) { // behind-the-scenes orbit (props only, never in the shorts): circles a point at radius r, eased
    const u = Math.min(1, Math.max(0, (f - ob.f0) / (ob.f1 - ob.f0))), k = u * u * (3 - 2 * u), a = ((ob.a0 + (ob.a1 - ob.a0) * k) * Math.PI) / 180;
    return { pos: [ob.c[0] - ob.r * Math.sin(a), ob.c[1] + ob.h, ob.c[2] - ob.r * Math.cos(a)], look: ob.c, fov: ob.fov, roll: 0 };
  }
  const c0 = run(CAMS[id], f), a = kickAt(T(f));
  const c = c0;
  if (!a) return c; // always: kickAt is 0
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
/** background blur per shot start (cInf = blur of infinity in px at 1080p): higher = softer background */
export const DOF: Dof[] = [{ f: 0, cInf: 8 }, { f: 100, cInf: 6 }, { f: 200, cInf: 10 }];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [];
