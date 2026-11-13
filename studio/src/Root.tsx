// Every short is one Composition here. `python pipeline/tp.py new <slug> <CompName>` adds yours automatically.
import React from "react";
import { Composition } from "remotion";
import { StarterShort, STARTER_FRAMES } from "./videos/starter/Bridge";
export const RemotionRoot: React.FC = () => (<>
  <Composition id="StarterShort" component={StarterShort} durationInFrames={STARTER_FRAMES} fps={30} width={1080} height={1920} />
</>);
