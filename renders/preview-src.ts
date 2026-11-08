import { createTherapyScene } from "../web/src/components/therapy-scene-core";

const stage = document.getElementById("stage");
if (!stage) throw new Error("missing #stage");

createTherapyScene(stage, { background: "#ffffff", static: true });
