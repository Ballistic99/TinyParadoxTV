import { Config } from "@remotion/cli/config";
// The 3D world takes a while to build on the first frame: give it 10 minutes instead of 30 seconds.
Config.setDelayRenderTimeoutInMilliseconds(600000);
// Use the graphics card (ANGLE). If renders fail with a GL error, change "angle" to "swangle" (slow but always works).
Config.setChromiumOpenGlRenderer("angle");
// Each render tab builds the whole world; a few tabs at once is faster than 8 fighting for the GPU.
Config.setConcurrency(3);
