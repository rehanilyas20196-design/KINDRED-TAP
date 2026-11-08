import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * Realistic Procedural Rebuild of the Therapy Session (reference.png / 3d.png):
 *
 * Detailed anatomical human sculpts:
 * - Left: Male therapist in white lab coat with notched lapels & breast pocket, light blue shirt,
 *   navy necktie, dark navy slacks, polished black leather dress shoes, black spectacles,
 *   wavy hair & groomed beard, holding clipboard & pen in an active figure-4 crossed-leg pose.
 * - Right: Male client in vibrant green hoodie with 3D draped hood, kangaroo pocket & drawstrings,
 *   denim jeans, crisp white sneakers, tousled hair, leaning forward with expressive dual-hand gestures.
 * - Furniture: Two Scandinavian oatmeal-fabric club armchairs with splayed oak legs,
 *   round tripod oak side table, lush potted houseplant in white ceramic, oak tissue box with folded tissues.
 * - Interaction: Full 360° unrestricted orbit rotation, momentum inertia, wheel/pinch zoom,
 *   and idle auto-turntable.
 */

export type CameraPreset = "overview" | "therapist" | "client" | "details";

export interface TherapySceneHandle {
  dispose(): void;
  resetView(): void;
  toggleAutoRotate(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  isAutoRotating(): boolean;
  setPreset(preset: CameraPreset): void;
  getActivePreset(): CameraPreset | "custom";
}

export interface TherapySceneOptions {
  background?: string | null;
  static?: boolean;
  maxDpr?: number;
  autoRotate?: boolean;
}

/* ------------------------------------------------------------------ */
/* Realistic PBR Color Palette                                         */
/* ------------------------------------------------------------------ */

const C = {
  // Furniture
  chairFabric: 0xbdb4a4,
  chairFabricLight: 0xc9c0b0,
  chairFabricDark: 0xafa797,
  oak: 0xc4935d,
  oakDark: 0xab7b47,
  chairGlide: 0x1f2024,

  // Therapist
  coat: 0xf9fbfd,
  coatFold: 0xe5ebf2,
  shirt: 0x629cd6,
  tie: 0x1c3156,
  trouser: 0x24344f,
  sock: 0x141518,
  shoeBlack: 0x121316,
  shoeSole: 0x090a0c,
  skinTherapist: 0xf2c2a2,
  skinWarm: 0xecb794,
  lipTherapist: 0xc37165,
  hairTherapist: 0x341e13,
  beardTherapist: 0x2e1a10,
  glasses: 0x151618,
  clipboard: 0x1a1c20,
  clipMetal: 0xc8d0db,
  paper: 0xffffff,
  paperLine: 0xc4cdd8,
  pen: 0x1a1c20,
  penSilver: 0x98a2b3,

  // Client
  hoodie: 0x268e50,
  hoodieDark: 0x1e7842,
  hoodieLight: 0x2ea45d,
  drawstring: 0xf3f4f6,
  tee: 0xf8fafc,
  jeans: 0x3d6499,
  jeansFold: 0x325380,
  jeansCuff: 0x567dae,
  sneaker: 0xfcfcfc,
  sneakerTrim: 0xe3e6ea,
  sneakerLace: 0xf5f6f8,
  skinClient: 0xf0bfa0,
  lipClient: 0xc87469,
  hairClient: 0x3d2315,

  // Props & Plant
  pot: 0xf8fafc,
  soil: 0x2c2119,
  leafA: 0x2a9648,
  leafB: 0x34a652,
  leafC: 0x217e3a,
  leafRib: 0x3fba61,
  tissueBox: 0xc2925b,
  tissue: 0xffffff,

  // Facial features
  eyeWhite: 0xf4f6f8,
  irisTherapist: 0x4a2c1a,
  irisClient: 0x422818,
  pupil: 0x0c0b0a,
  corneaHighlight: 0xffffff,
} as const;

type V3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* Core Mesh Construction Helpers                                     */
/* ------------------------------------------------------------------ */

function matStd(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  radius = 0.02,
  segments = 3
): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) * 0.48));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function sph(r: number, material: THREE.Material, ws = 28, hs = 20): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  seg = 24
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

function limb(from: V3, to: V3, radius: number, material: THREE.Material): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const dist = dir.length();
  const len = Math.max(dist - radius * 1.3, 0.01);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 8, 16), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function curveTube(
  points: V3[],
  radius: number,
  material: THREE.Material,
  tubularSeg = 20,
  radialSeg = 8
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, tubularSeg, radius, radialSeg, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Realistic Articulated Human Hand                                   */
/* ------------------------------------------------------------------ */

function makeFinger(
  base: V3,
  mid: V3,
  tip: V3,
  radius: number,
  skinM: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  // Proximal phalanx
  g.add(limb(base, mid, radius, skinM));
  // Distal phalanx
  g.add(limb(mid, tip, radius * 0.88, skinM));
  // Knuckle knuckle sphere
  g.add(place(sph(radius * 1.05, skinM, 12, 8), mid[0], mid[1], mid[2]));
  return g;
}

function makeRealisticHand(
  type: "open-gesture-right" | "open-gesture-left" | "hold-pen" | "hold-clipboard",
  skinM: THREE.Material
): THREE.Group {
  const hand = new THREE.Group();

  // Anatomical palm
  const palm = box(0.082, 0.026, 0.082, skinM, 0.012, 3);
  hand.add(palm);

  // Thenar eminence (thumb pad)
  const thenar = sph(0.026, skinM, 14, 10);
  thenar.scale.set(1.2, 0.7, 1.0);
  place(thenar, -0.026, -0.005, 0.012);
  hand.add(thenar);

  if (type === "open-gesture-right") {
    // Client right hand: palm facing in/up, fingers naturally curved explaining
    makeFinger([-0.028, 0.004, 0.038], [-0.034, 0.018, 0.082], [-0.038, 0.034, 0.118], 0.0095, skinM).children.forEach((c) => hand.add(c));
    makeFinger([-0.01, 0.005, 0.041], [-0.012, 0.022, 0.09], [-0.014, 0.04, 0.128], 0.01, skinM).children.forEach((c) => hand.add(c));
    makeFinger([0.01, 0.004, 0.039], [0.012, 0.02, 0.086], [0.014, 0.036, 0.122], 0.0095, skinM).children.forEach((c) => hand.add(c));
    makeFinger([0.028, 0.002, 0.035], [0.034, 0.016, 0.076], [0.038, 0.028, 0.106], 0.0085, skinM).children.forEach((c) => hand.add(c));
    // Opposable thumb
    makeFinger([-0.038, -0.002, 0.008], [-0.062, 0.012, 0.038], [-0.076, 0.024, 0.068], 0.011, skinM).children.forEach((c) => hand.add(c));
  } else if (type === "open-gesture-left") {
    // Client left hand: palm open facing upward, fingers staggered
    makeFinger([-0.028, 0.004, 0.038], [-0.032, 0.016, 0.08], [-0.035, 0.028, 0.115], 0.0095, skinM).children.forEach((c) => hand.add(c));
    makeFinger([-0.01, 0.005, 0.041], [-0.011, 0.02, 0.088], [-0.012, 0.034, 0.126], 0.01, skinM).children.forEach((c) => hand.add(c));
    makeFinger([0.01, 0.004, 0.039], [0.011, 0.018, 0.084], [0.012, 0.03, 0.12], 0.0095, skinM).children.forEach((c) => hand.add(c));
    makeFinger([0.028, 0.002, 0.035], [0.032, 0.014, 0.074], [0.035, 0.024, 0.104], 0.0085, skinM).children.forEach((c) => hand.add(c));
    makeFinger([-0.038, -0.002, 0.008], [-0.06, 0.01, 0.036], [-0.072, 0.02, 0.066], 0.011, skinM).children.forEach((c) => hand.add(c));
  } else if (type === "hold-pen") {
    // Therapist right hand: precision writing pinch grip
    makeFinger([-0.024, 0.004, 0.038], [-0.022, -0.01, 0.072], [-0.018, -0.022, 0.098], 0.0095, skinM).children.forEach((c) => hand.add(c));
    makeFinger([-0.006, 0.004, 0.04], [-0.004, -0.015, 0.076], [-0.002, -0.028, 0.095], 0.0095, skinM).children.forEach((c) => hand.add(c));
    makeFinger([0.012, 0.002, 0.038], [0.016, -0.018, 0.07], [0.02, -0.03, 0.086], 0.009, skinM).children.forEach((c) => hand.add(c));
    makeFinger([0.028, 0, 0.034], [0.032, -0.02, 0.064], [0.036, -0.032, 0.078], 0.0085, skinM).children.forEach((c) => hand.add(c));
    // Thumb pinching pen against index
    makeFinger([-0.036, 0.002, 0.012], [-0.038, -0.01, 0.046], [-0.026, -0.018, 0.075], 0.011, skinM).children.forEach((c) => hand.add(c));
  } else {
    // Therapist left hand: fingers curled around clipboard edge
    for (let i = 0; i < 4; i++) {
      const x = -0.027 + i * 0.018;
      makeFinger([x, 0.004, 0.038], [x * 1.05, -0.012, 0.074], [x * 1.08, -0.026, 0.092], 0.0092, skinM).children.forEach((c) => hand.add(c));
    }
    makeFinger([-0.038, 0, 0.012], [-0.054, -0.008, 0.04], [-0.058, -0.018, 0.068], 0.0105, skinM).children.forEach((c) => hand.add(c));
  }

  return hand;
}

/* ------------------------------------------------------------------ */
/* Realistic Sculpted Human Head & Face                               */
/* ------------------------------------------------------------------ */

function makeRealisticHead(opts: {
  r: number;
  beard: boolean;
  glasses: boolean;
  smileW: number;
  style: "therapist" | "client";
}): THREE.Group {
  const g = new THREE.Group();
  const r = opts.r;
  const isTherapist = opts.style === "therapist";

  const skinColor = isTherapist ? C.skinTherapist : C.skinClient;
  const hairColor = isTherapist ? C.hairTherapist : C.hairClient;
  const lipColor = isTherapist ? C.lipTherapist : C.lipClient;
  const irisColor = isTherapist ? C.irisTherapist : C.irisClient;

  const skinM = matStd(skinColor, 0.58, 0); // Natural skin roughness & soft specular
  const hairM = matStd(hairColor, 0.78, 0);
  const lipM = matStd(lipColor, 0.52, 0);
  const eyeWhiteM = matStd(C.eyeWhite, 0.25, 0);
  const irisM = matStd(irisColor, 0.3, 0);
  const pupilM = matStd(C.pupil, 0.2, 0);
  const glintM = matStd(C.corneaHighlight, 0.1, 0);

  // 1. Cranium with anatomical shape (wider at parietal crown, tapered at temples)
  const cranium = sph(r, skinM, 32, 24);
  cranium.scale.set(0.94, 1.04, 1.02);
  g.add(cranium);

  // 2. Jaw & Chin structure
  const jaw = box(r * 0.95, r * 0.62, r * 0.7, skinM, r * 0.24, 4);
  place(jaw, 0, -r * 0.44, r * 0.18);
  g.add(jaw);

  const chin = sph(r * 0.22, skinM, 16, 12);
  place(chin, 0, -r * 0.65, r * 0.55);
  chin.scale.set(1.1, 0.85, 1.2);
  g.add(chin);

  // 3. Cheekbones
  for (const sx of [-1, 1]) {
    const cheek = sph(r * 0.24, skinM, 14, 10);
    place(cheek, sx * r * 0.45, -r * 0.14, r * 0.58);
    cheek.scale.set(1.0, 0.8, 1.1);
    g.add(cheek);
  }

  // 4. Eyes: recessed sockets with sclera, iris, pupil, glint & eyelids
  const eyeZ = r * 0.82;
  const eyeY = r * 0.08;
  for (const sx of [-1, 1]) {
    const eyeX = sx * r * 0.36;

    // Sclera (eyeball)
    const eyeball = sph(r * 0.14, eyeWhiteM, 18, 14);
    place(eyeball, eyeX, eyeY, eyeZ);
    g.add(eyeball);

    // Colored Iris
    const iris = cyl(r * 0.075, r * 0.075, 0.005, irisM, 16);
    place(iris, eyeX + sx * r * 0.015, eyeY, eyeZ + r * 0.13);
    iris.rotation.x = Math.PI / 2;
    g.add(iris);

    // Pupil
    const pupil = cyl(r * 0.038, r * 0.038, 0.006, pupilM, 12);
    place(pupil, eyeX + sx * r * 0.015, eyeY, eyeZ + r * 0.132);
    pupil.rotation.x = Math.PI / 2;
    g.add(pupil);

    // Moist specular cornea highlight — flat disc resting on the pupil,
    // kept small so it can never poke out onto the cheek
    const glint = sph(r * 0.024, glintM, 8, 6);
    place(glint, eyeX + sx * r * 0.015 + sx * r * 0.018, eyeY + r * 0.028, eyeZ + r * 0.136);
    glint.scale.set(1, 1, 0.3);
    g.add(glint);

    // Upper eyelid
    const upperLid = curveTube(
      [
        [eyeX - sx * r * 0.14, eyeY - r * 0.02, eyeZ + r * 0.07],
        [eyeX, eyeY + r * 0.11, eyeZ + r * 0.11],
        [eyeX + sx * r * 0.13, eyeY - r * 0.01, eyeZ + r * 0.08],
      ],
      r * 0.024,
      skinM,
      10,
      6
    );
    g.add(upperLid);

    // Lower eyelid
    const lowerLid = curveTube(
      [
        [eyeX - sx * r * 0.13, eyeY - r * 0.03, eyeZ + r * 0.07],
        [eyeX, eyeY - r * 0.09, eyeZ + r * 0.09],
        [eyeX + sx * r * 0.12, eyeY - r * 0.02, eyeZ + r * 0.08],
      ],
      r * 0.02,
      skinM,
      10,
      6
    );
    g.add(lowerLid);

    // Sculpted multi-stroke Eyebrows
    const browPoints: V3[] = isTherapist
      ? [
          [eyeX - sx * r * 0.15, eyeY + r * 0.22, eyeZ + r * 0.08],
          [eyeX, eyeY + r * 0.28, eyeZ + r * 0.12],
          [eyeX + sx * r * 0.16, eyeY + r * 0.2, eyeZ + r * 0.09],
        ]
      : [
  // Animated raised brow for client
  [eyeX - sx * r * 0.14, eyeY + r * 0.2, eyeZ + r * 0.08],
  [eyeX, eyeY + r * 0.28, eyeZ + r * 0.13],
  [eyeX + sx * r * 0.16, eyeY + r * 0.19, eyeZ + r * 0.09],
        ];
    const brow = curveTube(browPoints, r * 0.032, hairM, 10, 6);
    g.add(brow);
  }

  // 5. Sculpted Nose (Bridge, tip bulb, alar wings)
  const bridge = limb([0, eyeY + r * 0.12, eyeZ + r * 0.05], [0, -r * 0.1, eyeZ + r * 0.18], r * 0.065, skinM);
  g.add(bridge);

  const noseTip = sph(r * 0.08, skinM, 14, 10);
  place(noseTip, 0, -r * 0.12, eyeZ + r * 0.21);
  noseTip.scale.set(1.0, 0.9, 1.2);
  g.add(noseTip);

  for (const sx of [-1, 1]) {
    const alar = sph(r * 0.052, skinM, 12, 8);
    place(alar, sx * r * 0.078, -r * 0.14, eyeZ + r * 0.16);
    alar.scale.set(0.9, 0.8, 1.0);
    g.add(alar);
  }

  // 6. Sculpted Mouth & Lips
  const mouthY = -r * 0.38;
  const mouthZ = eyeZ + r * 0.12;

  // Upper lip with Cupid's bow dip
  const upperLip = curveTube(
    [
      [-r * 0.16, mouthY - r * 0.02, mouthZ - r * 0.03],
      [-r * 0.05, mouthY + r * 0.015, mouthZ + r * 0.02],
      [0, mouthY + r * 0.005, mouthZ + r * 0.018],
      [r * 0.05, mouthY + r * 0.015, mouthZ + r * 0.02],
      [r * 0.16, mouthY - r * 0.02, mouthZ - r * 0.03],
    ],
    r * 0.032,
    lipM,
    14,
    6
  );
  g.add(upperLip);

  // Full lower lip
  const lowerLip = curveTube(
    [
      [-r * 0.14, mouthY - r * 0.03, mouthZ - r * 0.03],
      [0, mouthY - r * 0.07, mouthZ + r * 0.02],
      [r * 0.14, mouthY - r * 0.03, mouthZ - r * 0.03],
    ],
    r * 0.036,
    lipM,
    12,
    6
  );
  g.add(lowerLip);

  // For client: natural slight open mouth cavity showing upper teeth
  if (!isTherapist) {
    const oralCavity = cyl(r * 0.09, r * 0.09, 0.01, matStd(0x3a1210, 0.9), 12);
    place(oralCavity, 0, mouthY - r * 0.025, mouthZ - r * 0.02);
    oralCavity.rotation.x = Math.PI / 2;
    g.add(oralCavity);

    const teeth = box(r * 0.14, r * 0.025, 0.008, matStd(0xfcfcfc, 0.4), 0.004, 2);
    place(teeth, 0, mouthY - r * 0.012, mouthZ - r * 0.01);
    g.add(teeth);
  }

  // 7. Sculpted Ears (Helix, antihelix & lobe)
  for (const sx of [-1, 1]) {
    const earG = new THREE.Group();
    const earBase = sph(r * 0.22, skinM, 14, 10);
    earBase.scale.set(0.35, 1.15, 0.75);
    earG.add(earBase);

    const earRim = curveTube(
      [
        [0, -r * 0.2, -r * 0.04],
        [0, r * 0.18, -r * 0.05],
        [0, r * 0.22, r * 0.08],
        [0, 0, r * 0.14],
        [0, -r * 0.22, 0],
      ],
      r * 0.042,
      skinM,
      12,
      6
    );
    earG.add(earRim);

    place(earG, sx * r * 0.92, -r * 0.06, -r * 0.08);
    earG.rotation.y = sx * 0.22;
    g.add(earG);
  }

  // 8. Hair & Beard Sculpting
  // Base hair cap — stops above the brow so it never reads as a bowl cut
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.04, 28, 20, 0, Math.PI * 2, 0, 1.22),
    hairM
  );
  hairCap.castShadow = true;
  place(hairCap, 0, r * 0.04, -r * 0.04);
  hairCap.scale.set(1.05, 1.06, 1.08);
  g.add(hairCap);

  if (isTherapist) {
    // Elegant wavy pompadour locks flowing back & to the side
    const hairLocks: V3[][] = [
      // Front sweeping wave
      [[-r * 0.4, r * 0.65, r * 0.6], [-r * 0.2, r * 0.95, r * 0.62], [0, r * 1.05, r * 0.55], [r * 0.25, r * 1.02, r * 0.45], [r * 0.45, r * 0.92, r * 0.3]],
      // Central crown wave
      [[-r * 0.3, r * 0.98, r * 0.4], [0, r * 1.14, r * 0.35], [r * 0.3, r * 1.1, r * 0.2], [r * 0.5, r * 0.95, 0]],
      // Left side parting wave
      [[-r * 0.5, r * 0.75, r * 0.45], [-r * 0.6, r * 0.88, r * 0.2], [-r * 0.55, r * 0.92, -r * 0.15], [-r * 0.4, r * 0.85, -r * 0.4]],
      // Right side flow
      [[r * 0.3, r * 0.9, r * 0.4], [r * 0.62, r * 0.78, r * 0.15], [r * 0.65, r * 0.65, -r * 0.2], [r * 0.5, r * 0.5, -r * 0.45]],
      // Back wave cascades
      [[0, r * 1.06, 0], [0, r * 0.95, -r * 0.5], [0, r * 0.68, -r * 0.78], [0, r * 0.35, -r * 0.88]],
      [[-r * 0.35, r * 0.9, -r * 0.3], [-r * 0.45, r * 0.7, -r * 0.6], [-r * 0.4, r * 0.35, -r * 0.8]],
      [[r * 0.35, r * 0.9, -r * 0.3], [r * 0.45, r * 0.7, -r * 0.6], [r * 0.4, r * 0.35, -r * 0.8]],
    ];
    hairLocks.forEach((lock) => g.add(curveTube(lock, r * 0.088, hairM, 14, 8)));

    // Full groomed beard & mustache
    const beardM = matStd(C.beardTherapist, 0.82, 0);

    // Contoured jawline beard — starts below the cheekbones so the
    // eyes and glasses stay clear (reference has a short groomed beard)
    const beardJaw = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.02, 24, 16, 0, Math.PI, 1.6, 0.78),
      beardM
    );
    beardJaw.castShadow = true;
    place(beardJaw, 0, -r * 0.05, r * 0.02);
    g.add(beardJaw);

    // Chin beard prominence
    const chinBeard = sph(r * 0.42, beardM, 16, 12);
    place(chinBeard, 0, -r * 0.62, r * 0.48);
    chinBeard.scale.set(1.2, 0.8, 1.1);
    g.add(chinBeard);

    // Mustache arching over mouth
    const stacheL = curveTube([[0, mouthY + r * 0.07, mouthZ + r * 0.04], [-r * 0.12, mouthY + r * 0.05, mouthZ + r * 0.03], [-r * 0.24, mouthY - r * 0.04, mouthZ - r * 0.02]], r * 0.042, beardM, 10, 6);
    const stacheR = curveTube([[0, mouthY + r * 0.07, mouthZ + r * 0.04], [r * 0.12, mouthY + r * 0.05, mouthZ + r * 0.03], [r * 0.24, mouthY - r * 0.04, mouthZ - r * 0.02]], r * 0.042, beardM, 10, 6);
    g.add(stacheL);
    g.add(stacheR);

    // Black spectacles (frames, bridge, hinges & clear lenses)
    if (opts.glasses) {
      const frameM = matStd(C.glasses, 0.28, 0.25);
      const lensGlassM = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.9,
        transparent: true,
        opacity: 0.45,
        ior: 1.5,
      });

      for (const sx of [-1, 1]) {
        const eyeX = sx * r * 0.38;
        // Round wire rim (open centre so the eye reads through it)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.185, r * 0.032, 10, 28), frameM);
        rim.castShadow = true;
        place(rim, eyeX, eyeY + r * 0.01, eyeZ + r * 0.15);
        g.add(rim);

        // Thin glass lens
        const lens = box(r * 0.3, r * 0.2, 0.004, lensGlassM, r * 0.04, 2);
        place(lens, eyeX, eyeY + r * 0.01, eyeZ + r * 0.148);
        g.add(lens);

        // Side temple going back to ear
        const temple = curveTube([[sx * r * 0.58, eyeY + r * 0.04, eyeZ + r * 0.14], [sx * r * 0.78, eyeY + r * 0.03, eyeZ - r * 0.1], [sx * r * 0.9, -r * 0.02, -r * 0.14]], r * 0.016, frameM, 10, 6);
        g.add(temple);
      }
      // Center nose bridge
      const bridgeBar = box(r * 0.22, r * 0.035, r * 0.03, frameM, 0.006, 2);
      place(bridgeBar, 0, eyeY + r * 0.05, eyeZ + r * 0.16);
      g.add(bridgeBar);
    }
  } else {
    // Client tousled textured crop
    const clientLocks: V3[][] = [
      // Front textured fringe flicking forward/up
      [[-r * 0.15, r * 0.85, r * 0.5], [-r * 0.08, r * 1.05, r * 0.65], [0, r * 1.12, r * 0.7]],
      [[r * 0.1, r * 0.88, r * 0.52], [r * 0.16, r * 1.08, r * 0.64], [r * 0.22, r * 1.15, r * 0.66]],
      // Crown tousled tufts
      [[-r * 0.35, r * 0.95, r * 0.3], [-r * 0.25, r * 1.18, r * 0.35], [-r * 0.1, r * 1.2, r * 0.25]],
      [[r * 0.2, r * 0.98, r * 0.3], [r * 0.3, r * 1.18, r * 0.32], [r * 0.38, r * 1.15, r * 0.18]],
      [[0, r * 1.1, r * 0.1], [0, r * 1.22, 0], [0, r * 1.15, -r * 0.2]],
      // Side tapers
      [[-r * 0.55, r * 0.7, r * 0.2], [-r * 0.65, r * 0.55, 0], [-r * 0.62, r * 0.3, -r * 0.2]],
      [[r * 0.55, r * 0.7, r * 0.2], [r * 0.65, r * 0.55, 0], [r * 0.62, r * 0.3, -r * 0.2]],
      // Back nape
      [[0, r * 0.9, -r * 0.5], [0, r * 0.6, -r * 0.75], [0, r * 0.25, -r * 0.85]],
    ];
    clientLocks.forEach((lock) => g.add(curveTube(lock, r * 0.105, hairM, 14, 8)));
  }

  return g;
}

/* ------------------------------------------------------------------ */
/* Realistic Therapist Model                                          */
/* ------------------------------------------------------------------ */

function makeTherapist(): THREE.Group {
  const g = new THREE.Group();

  const coatM = matStd(C.coat, 0.72);
  const coatFoldM = matStd(C.coatFold, 0.75);
  const shirtM = matStd(C.shirt, 0.78);
  const tieM = matStd(C.tie, 0.68);
  const trouserM = matStd(C.trouser, 0.84);
  const skinM = matStd(C.skinTherapist, 0.58);
  const shoeM = matStd(C.shoeBlack, 0.28, 0.08); // Polished dress leather with specular sheen
  const sockM = matStd(C.sock, 0.92);

  // Seated pelvis & hips
  const pelvis = box(0.34, 0.18, 0.32, trouserM, 0.06, 3);
  place(pelvis, 0, 0.57, 0.02);
  g.add(pelvis);

  // Torso (Lab coat draped with slight recline)
  const torso = box(0.38, 0.52, 0.28, coatM, 0.085, 4);
  place(torso, 0, 0.89, -0.02);
  torso.rotation.x = -0.12;
  g.add(torso);

  // Shirt front & collar
  const shirt = box(0.16, 0.32, 0.045, shirtM, 0.02, 3);
  place(shirt, 0, 0.93, 0.118);
  shirt.rotation.x = -0.12;
  g.add(shirt);

  // Shirt collar wings
  for (const sx of [-1, 1]) {
    const collarWing = box(0.065, 0.06, 0.02, shirtM, 0.008, 2);
    place(collarWing, sx * 0.058, 1.07, 0.13);
    collarWing.rotation.z = sx * 0.35;
    collarWing.rotation.x = -0.12;
    g.add(collarWing);
  }

  // Navy Necktie with knot & blade
  const tieKnot = box(0.058, 0.048, 0.034, tieM, 0.01, 2);
  place(tieKnot, 0, 1.055, 0.138);
  tieKnot.rotation.x = -0.12;
  g.add(tieKnot);

  const tieBlade = box(0.052, 0.28, 0.022, tieM, 0.008, 2);
  place(tieBlade, 0, 0.9, 0.144);
  tieBlade.rotation.x = -0.12;
  g.add(tieBlade);

  // Lab coat notched lapels
  for (const sx of [-1, 1]) {
    const lapel = curveTube(
      [
        [sx * 0.07, 1.1, 0.11],
        [sx * 0.11, 0.96, 0.135],
        [sx * 0.06, 0.8, 0.13],
      ],
      0.026,
      coatM,
      10,
      6
    );
    g.add(lapel);
  }

  // Breast pocket with silver pen clip
  const pocket = box(0.078, 0.062, 0.012, coatFoldM, 0.004, 2);
  place(pocket, 0.115, 0.96, 0.124);
  pocket.rotation.x = -0.12;
  g.add(pocket);

  const penClip = cyl(0.0035, 0.0035, 0.035, matStd(C.penSilver, 0.25, 0.8), 8);
  place(penClip, 0.115, 0.985, 0.134);
  g.add(penClip);

  // Lower coat skirts spreading over chair seat
  for (const sx of [-1, 1]) {
    const skirt = box(0.18, 0.22, 0.32, coatM, 0.065, 3);
    place(skirt, sx * 0.14, 0.56, -0.04);
    skirt.rotation.x = 0.08;
    g.add(skirt);
  }

  // Shoulders & Arms
  const rShoulder: V3 = [-0.2, 1.04, -0.01];
  const rElbow: V3 = [-0.27, 0.82, 0.15];
  const rWrist: V3 = [-0.07, 0.72, 0.34];

  const lShoulder: V3 = [0.2, 1.04, -0.01];
  const lElbow: V3 = [0.27, 0.8, 0.14];
  const lWrist: V3 = [0.08, 0.71, 0.33];

  g.add(limb(rShoulder, rElbow, 0.065, coatM));
  g.add(limb(rElbow, rWrist, 0.058, coatM));
  g.add(limb(lShoulder, lElbow, 0.065, coatM));
  g.add(limb(lElbow, lWrist, 0.058, coatM));

  // Sleeve creases at elbows
  g.add(curveTube([[-0.26, 0.84, 0.12], [-0.29, 0.82, 0.16], [-0.25, 0.8, 0.18]], 0.018, coatFoldM, 8, 6));
  g.add(curveTube([[0.26, 0.82, 0.11], [0.29, 0.8, 0.15], [0.25, 0.78, 0.17]], 0.018, coatFoldM, 8, 6));

  // Blue shirt cuffs at wrists
  for (const w of [rWrist, lWrist]) {
    const cuff = cyl(0.054, 0.054, 0.03, shirtM, 16);
    place(cuff, w[0], w[1] + 0.01, w[2]);
    cuff.rotation.x = Math.PI / 2 - 0.5;
    g.add(cuff);
  }

  // Realistic articulated hands: Right writing hand, Left steadying hand
  const rHand = makeRealisticHand("hold-pen", skinM);
  place(rHand, rWrist[0], rWrist[1] - 0.015, rWrist[2] + 0.03);
  rHand.rotation.set(-0.25, 0.2, 0.1);
  g.add(rHand);

  const lHand = makeRealisticHand("hold-clipboard", skinM);
  place(lHand, lWrist[0], lWrist[1] - 0.015, lWrist[2] + 0.03);
  lHand.rotation.set(-0.45, -0.3, -0.4);
  g.add(lHand);

  // Professional Clipboard resting on lap
  const clipG = new THREE.Group();
  const board = box(0.26, 0.35, 0.018, matStd(C.clipboard, 0.52), 0.012, 3);
  clipG.add(board);

  const metalClamp = box(0.095, 0.035, 0.024, matStd(C.clipMetal, 0.25, 0.8), 0.006, 2);
  place(metalClamp, 0, 0.15, 0.012);
  clipG.add(metalClamp);

  // Notepaper held under the clamp — black board stays dominant, like
  // the reference where the clipboard reads as a dark slab
  const paperSheet = box(0.155, 0.205, 0.005, matStd(C.paper, 0.88), 0.004, 2);
  place(paperSheet, 0, -0.03, 0.011);
  clipG.add(paperSheet);

  // Printed evaluation note lines
  for (let i = 0; i < 5; i++) {
    const line = box(0.11, 0.005, 0.002, matStd(C.paperLine, 0.9), 0.001, 1);
    place(line, 0, 0.045 - i * 0.03, 0.014);
    clipG.add(line);
  }

  place(clipG, 0.01, 0.68, 0.26);
  clipG.rotation.x = -0.62;
  clipG.rotation.z = 0.06;
  g.add(clipG);

  // Sleek black writing pen
  const pen = cyl(0.0055, 0.0055, 0.14, matStd(C.pen, 0.35), 12);
  place(pen, -0.05, 0.74, 0.34);
  pen.rotation.x = 0.88;
  pen.rotation.z = 0.38;
  g.add(pen);

  const penTip = cyl(0.002, 0.0055, 0.022, matStd(C.penSilver, 0.2, 0.85), 10);
  place(penTip, -0.04, 0.685, 0.37);
  penTip.rotation.x = 0.88;
  penTip.rotation.z = 0.38;
  g.add(penTip);

  // ----------------------------------------------------------------
  // Real anatomical seated legs: Left planted on floor, Right crossed figure-4
  // ----------------------------------------------------------------

  // Left Leg (Floor leg)
  const leftHip: V3 = [0.12, 0.57, 0.06];
  const leftKnee: V3 = [0.12, 0.47, 0.42];
  const leftAnkle: V3 = [0.12, 0.1, 0.46];

  g.add(limb(leftHip, leftKnee, 0.088, trouserM));
  g.add(limb(leftKnee, leftAnkle, 0.072, trouserM));
  g.add(place(sph(0.078, trouserM, 14, 10), leftKnee[0], leftKnee[1], leftKnee[2]));

  // Black sock
  const leftSock = cyl(0.046, 0.048, 0.09, sockM, 14);
  place(leftSock, 0.12, 0.11, 0.47);
  g.add(leftSock);

  // Polished Oxford shoe: tapered toe box, vamp, heel stack & welt
  const leftShoe = new THREE.Group();
  const leftShoeUpper = box(0.098, 0.074, 0.25, shoeM, 0.032, 4);
  leftShoeUpper.scale.set(0.95, 1.0, 1.05);
  place(leftShoeUpper, 0, 0.045, 0);
  leftShoe.add(leftShoeUpper);

  const leftShoeHeel = box(0.096, 0.028, 0.075, matStd(C.shoeSole, 0.8), 0.008, 2);
  place(leftShoeHeel, 0, 0.014, -0.07);
  leftShoe.add(leftShoeHeel);

  const leftShoeSole = box(0.102, 0.016, 0.255, matStd(C.shoeSole, 0.8), 0.008, 2);
  place(leftShoeSole, 0, 0.008, 0.01);
  leftShoe.add(leftShoeSole);

  place(leftShoe, 0.12, 0, 0.55);
  leftShoe.rotation.y = 0.1;
  g.add(leftShoe);

  // Right Leg (Crossed leg figure-4 over left knee)
  const rightHip: V3 = [-0.12, 0.59, 0.06];
  const rightKnee: V3 = [-0.18, 0.58, 0.42];
  const rightAnkle: V3 = [0.08, 0.55, 0.47];

  g.add(limb(rightHip, rightKnee, 0.088, trouserM));
  g.add(limb(rightKnee, rightAnkle, 0.07, trouserM));
  g.add(place(sph(0.078, trouserM, 14, 10), rightKnee[0], rightKnee[1], rightKnee[2]));

  // Right dangling sock
  const rightSock = cyl(0.046, 0.048, 0.085, sockM, 14);
  place(rightSock, 0.13, 0.52, 0.52);
  rightSock.rotation.x = Math.PI / 2 - 0.3;
  g.add(rightSock);

  // Right suspended Oxford shoe
  const rightShoe = new THREE.Group();
  const rightShoeUpper = box(0.098, 0.074, 0.24, shoeM, 0.032, 4);
  place(rightShoeUpper, 0, 0.045, 0);
  rightShoe.add(rightShoeUpper);

  const rightShoeHeel = box(0.096, 0.028, 0.072, matStd(C.shoeSole, 0.8), 0.008, 2);
  place(rightShoeHeel, 0, 0.014, -0.068);
  rightShoe.add(rightShoeHeel);

  const rightShoeSole = box(0.102, 0.016, 0.245, matStd(C.shoeSole, 0.8), 0.008, 2);
  place(rightShoeSole, 0, 0.008, 0.01);
  rightShoe.add(rightShoeSole);

  place(rightShoe, 0.18, 0.46, 0.59);
  rightShoe.rotation.x = 0.68;
  rightShoe.rotation.z = 0.22;
  rightShoe.rotation.y = -0.35;
  g.add(rightShoe);

  // Neck & Head
  const neck = cyl(0.05, 0.054, 0.11, skinM, 16);
  place(neck, 0, 1.14, 0.0);
  g.add(neck);

  const headG = makeRealisticHead({
    r: 0.145,
    beard: true,
    glasses: true,
    smileW: 0.034,
    style: "therapist",
  });
  place(headG, 0, 1.27, 0.03);
  headG.rotation.y = 0.22;
  g.add(headG);

  return g;
}

/* ------------------------------------------------------------------ */
/* Realistic Client Model                                             */
/* ------------------------------------------------------------------ */

function makeClient(): THREE.Group {
  const g = new THREE.Group();

  const hoodM = matStd(C.hoodie, 0.82);
  const hoodDarkM = matStd(C.hoodieDark, 0.88);
  const drawstringM = matStd(C.drawstring, 0.78);
  const jeansM = matStd(C.jeans, 0.85);
  const jeansFoldM = matStd(C.jeansFold, 0.88);
  const skinM = matStd(C.skinClient, 0.58);
  const sneakerM = matStd(C.sneaker, 0.65);
  const soleM = matStd(C.sneakerTrim, 0.78);
  const laceM = matStd(C.sneakerLace, 0.85);

  // Seated hips
  const hips = box(0.34, 0.18, 0.32, jeansM, 0.065, 3);
  place(hips, 0, 0.56, 0.03);
  g.add(hips);

  // Torso (Green hoodie leaning forward in active speech)
  const torso = box(0.4, 0.5, 0.3, hoodM, 0.1, 4);
  place(torso, 0, 0.86, 0.09);
  torso.rotation.x = 0.24;
  g.add(torso);

  // 3D Sculpted Kangaroo pouch pocket — same knit as the body so it
  // blends into the sweatshirt instead of reading as a slab
  const pouch = box(0.31, 0.19, 0.048, hoodM, 0.024, 3);
  place(pouch, 0, 0.72, 0.265);
  pouch.rotation.x = 0.24;
  g.add(pouch);

  // Pocket side openings
  for (const sx of [-1, 1]) {
    const welt = box(0.015, 0.14, 0.02, hoodM, 0.005, 2);
    place(welt, sx * 0.145, 0.72, 0.27);
    welt.rotation.x = 0.24;
    g.add(welt);
  }

  // Deep 3D Draped Hood behind the neck with realistic hollow interior
  const hoodBack = sph(0.165, hoodDarkM, 24, 16);
  hoodBack.scale.set(1.22, 0.75, 0.88);
  place(hoodBack, 0, 1.04, -0.05);
  g.add(hoodBack);

  const hoodRim = curveTube(
    [
      [-0.12, 1.04, 0.08],
      [-0.15, 1.08, -0.04],
      [0, 1.12, -0.1],
      [0.15, 1.08, -0.04],
      [0.12, 1.04, 0.08],
    ],
    0.038,
    hoodM,
    14,
    8
  );
  g.add(hoodRim);

  // White tee crew collar peaking through
  const teeCollar = curveTube([[-0.06, 1.08, 0.12], [0, 1.05, 0.14], [0.06, 1.08, 0.12]], 0.014, matStd(C.tee, 0.85), 8, 6);
  g.add(teeCollar);

  // Hanging white drawstrings with metallic aglets
  for (const sx of [-1, 1]) {
    const stringPoints: V3[] = [
      [sx * 0.052, 0.98, 0.17],
      [sx * 0.054, 0.9, 0.182],
      [sx * 0.052, 0.82, 0.188],
    ];
    g.add(curveTube(stringPoints, 0.005, drawstringM, 10, 6));

    const aglet = cyl(0.004, 0.004, 0.02, matStd(C.penSilver, 0.25, 0.7), 8);
    place(aglet, sx * 0.052, 0.81, 0.189);
    g.add(aglet);
  }

  // Shoulders & Arms
  const rShoulder: V3 = [-0.21, 1.0, 0.07];
  const rElbow: V3 = [-0.31, 0.82, 0.26];
  const rWrist: V3 = [-0.27, 0.98, 0.45];

  const lShoulder: V3 = [0.21, 1.0, 0.07];
  const lElbow: V3 = [0.31, 0.8, 0.24];
  const lWrist: V3 = [0.2, 0.94, 0.45];

  g.add(limb(rShoulder, rElbow, 0.07, hoodM));
  g.add(limb(rElbow, rWrist, 0.062, hoodM));
  g.add(limb(lShoulder, lElbow, 0.07, hoodM));
  g.add(limb(lElbow, lWrist, 0.062, hoodM));

  // Natural hoodie folds at the elbows
  g.add(curveTube([[-0.3, 0.84, 0.24], [-0.34, 0.82, 0.28], [-0.29, 0.8, 0.3]], 0.02, hoodDarkM, 8, 6));
  g.add(curveTube([[0.3, 0.82, 0.22], [0.34, 0.8, 0.26], [0.29, 0.78, 0.28]], 0.02, hoodDarkM, 8, 6));

  // Ribbed hoodie cuffs
  for (const w of [rWrist, lWrist]) {
    const cuff = cyl(0.058, 0.06, 0.04, hoodDarkM, 16);
    place(cuff, w[0], w[1] - 0.01, w[2]);
    cuff.rotation.x = Math.PI / 2 - 0.7;
    g.add(cuff);
  }

  // Realistic articulated hands: Right explaining, Left upturned
  const rHand = makeRealisticHand("open-gesture-right", skinM);
  place(rHand, rWrist[0], rWrist[1] + 0.03, rWrist[2] + 0.04);
  rHand.rotation.set(-0.48, -0.48, 0.38);
  g.add(rHand);

  const lHand = makeRealisticHand("open-gesture-left", skinM);
  place(lHand, lWrist[0], lWrist[1] + 0.03, lWrist[2] + 0.04);
  lHand.rotation.set(-0.48, 0.48, -0.38);
  g.add(lHand);

  // Both Legs: planted firmly on the floor in relaxed 90° angle
  for (const sx of [-1, 1]) {
    const hip: V3 = [sx * 0.12, 0.56, 0.06];
    const knee: V3 = [sx * 0.14, 0.46, 0.43];
    const ankle: V3 = [sx * 0.15, 0.1, 0.47];

    g.add(limb(hip, knee, 0.092, jeansM));
    g.add(limb(knee, ankle, 0.076, jeansM));
    g.add(place(sph(0.082, jeansM, 14, 10), knee[0], knee[1], knee[2]));

    // Denim knee tension fold
    g.add(curveTube([[sx * 0.08, 0.46, 0.44], [sx * 0.14, 0.48, 0.46], [sx * 0.2, 0.46, 0.44]], 0.016, jeansFoldM, 8, 6));

    // Denim folded cuff above sneaker
    const cuff = cyl(0.068, 0.072, 0.07, matStd(C.jeansCuff, 0.85), 16);
    place(cuff, sx * 0.15, 0.12, 0.475);
    g.add(cuff);

    // Modern White Sneaker: molded rubber cupsole, padded collar & laces
    const shoeG = new THREE.Group();

    // Contoured upper
    const upper = box(0.108, 0.076, 0.255, sneakerM, 0.034, 4);
    place(upper, 0, 0.062, 0);
    shoeG.add(upper);

    // Rubber midsole with textured bumper
    const sole = box(0.116, 0.032, 0.268, soleM, 0.012, 2);
    place(sole, 0, 0.02, 0);
    shoeG.add(sole);

    // Sneaker tongue
    const tongue = box(0.07, 0.08, 0.015, sneakerM, 0.008, 2);
    place(tongue, 0, 0.08, 0.02);
    tongue.rotation.x = -0.3;
    shoeG.add(tongue);

    // Realistic criss-cross laces
    for (let i = 0; i < 4; i++) {
      const lace = box(0.072, 0.007, 0.012, laceM, 0.003, 1);
      place(lace, 0, 0.098 - i * 0.005, -0.04 + i * 0.035);
      shoeG.add(lace);
    }

    place(shoeG, sx * 0.15, 0, 0.56);
    shoeG.rotation.y = sx * 0.16;
    g.add(shoeG);
  }

  // Neck & Head
  const neck = cyl(0.048, 0.052, 0.1, skinM, 16);
  place(neck, 0, 1.1, 0.14);
  neck.rotation.x = 0.18;
  g.add(neck);

  const headG = makeRealisticHead({
    r: 0.142,
    beard: false,
    glasses: false,
    smileW: 0.036,
    style: "client",
  });
  place(headG, 0, 1.23, 0.17);
  headG.rotation.y = -0.22;
  g.add(headG);

  return g;
}

/* ------------------------------------------------------------------ */
/* Realistic Mid-Century Scandinavian Club Armchair                   */
/* ------------------------------------------------------------------ */

function makeArmchair(): THREE.Group {
  const g = new THREE.Group();
  const fabric = matStd(C.chairFabric, 0.92);
  const fabricLight = matStd(C.chairFabricLight, 0.92);
  const wood = matStd(C.oak, 0.62);
  const glideM = matStd(C.chairGlide, 0.7);

  // Upholstered seat tub base
  const base = box(0.96, 0.22, 0.88, fabric, 0.08, 4);
  place(base, 0, 0.32, 0);
  g.add(base);

  // Plush contoured seat cushion
  const cushion = box(0.76, 0.15, 0.72, fabricLight, 0.065, 4);
  place(cushion, 0, 0.47, 0.04);
  g.add(cushion);

  // Continuous curved bucket backrest
  const back = box(0.88, 0.66, 0.16, fabric, 0.09, 4);
  place(back, 0, 0.78, -0.34);
  back.rotation.x = -0.11;
  g.add(back);

  // Ergonomic rolled crest atop the backrest
  const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.7, 8, 16), fabricLight);
  crest.castShadow = crest.receiveShadow = true;
  place(crest, 0, 1.08, -0.41);
  crest.rotation.z = Math.PI / 2;
  crest.rotation.y = Math.PI / 2;
  g.add(crest);

  // Sculpted armrests with smooth front rolls
  for (const sx of [-1, 1]) {
    const arm = box(0.15, 0.32, 0.78, fabric, 0.075, 4);
    place(arm, sx * 0.41, 0.58, 0.02);
    arm.rotation.x = -0.04;
    g.add(arm);

    const armCap = box(0.16, 0.08, 0.38, fabricLight, 0.045, 3);
    place(armCap, sx * 0.41, 0.73, -0.16);
    armCap.rotation.x = -0.12;
    g.add(armCap);

    const armRoll = cyl(0.06, 0.06, 0.28, fabricLight, 16);
    place(armRoll, sx * 0.41, 0.56, 0.39);
    g.add(armRoll);
  }

  // Splayed round tapered solid oak legs with floor glides
  const legGeo = new THREE.CylinderGeometry(0.038, 0.024, 0.25, 16);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.castShadow = leg.receiveShadow = true;
      place(leg, sx * 0.38, 0.125, sz * 0.32);
      leg.rotation.z = 0.17 * sx;
      leg.rotation.x = -0.17 * sz;
      g.add(leg);

      const glide = cyl(0.024, 0.026, 0.015, glideM, 12);
      place(glide, sx * 0.41, 0.008, sz * 0.35);
      g.add(glide);
    }
  }

  return g;
}

/* ------------------------------------------------------------------ */
/* Round Oak Side Table (Tripod Base)                                 */
/* ------------------------------------------------------------------ */

function makeTable(): THREE.Group {
  const g = new THREE.Group();
  const wood = matStd(C.oak, 0.65);
  const woodDark = matStd(C.oakDark, 0.7);

  // Tabletop with beveled edge
  const top = cyl(0.31, 0.295, 0.045, wood, 40);
  place(top, 0, 0.51, 0);
  g.add(top);

  const edgeBevel = new THREE.Mesh(new THREE.TorusGeometry(0.302, 0.012, 10, 48), woodDark);
  edgeBevel.castShadow = edgeBevel.receiveShadow = true;
  place(edgeBevel, 0, 0.505, 0);
  edgeBevel.rotation.x = Math.PI / 2;
  g.add(edgeBevel);

  const apron = cyl(0.18, 0.18, 0.02, woodDark, 24);
  place(apron, 0, 0.48, 0);
  g.add(apron);

  // Three splayed round legs in tripod formation
  const legGeo = new THREE.CylinderGeometry(0.032, 0.02, 0.51, 16);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = new THREE.Mesh(legGeo, wood);
    leg.castShadow = leg.receiveShadow = true;
    place(leg, Math.cos(angle) * 0.11, 0.255, Math.sin(angle) * 0.11);
    leg.rotation.z = -Math.cos(angle) * 0.22;
    leg.rotation.x = Math.sin(angle) * 0.22;
    g.add(leg);
  }

  return g;
}

/* ------------------------------------------------------------------ */
/* Lush Potted Houseplant & Tissue Box                                */
/* ------------------------------------------------------------------ */

function leafGeometry(len: number, wid: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid * 1.15, len * 0.4, wid * 0.2, len);
  s.quadraticCurveTo(0, len * 0.96, -wid * 0.2, len);
  s.quadraticCurveTo(-wid * 1.15, len * 0.4, 0, 0);
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 10,
  });
}

function makePlant(): THREE.Group {
  const g = new THREE.Group();
  const potMat = matStd(C.pot, 0.3); // Glazed porcelain
  const soilMat = matStd(C.soil, 0.95);

  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.075, 0),
    new THREE.Vector2(0.086, 0.008),
    new THREE.Vector2(0.09, 0.09),
    new THREE.Vector2(0.12, 0.155),
    new THREE.Vector2(0.125, 0.17),
    new THREE.Vector2(0.116, 0.17),
    new THREE.Vector2(0.106, 0.155),
  ];
  const pot = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), potMat);
  pot.castShadow = pot.receiveShadow = true;
  g.add(pot);

  const soil = cyl(0.104, 0.104, 0.015, soilMat, 24);
  place(soil, 0, 0.158, 0);
  g.add(soil);

  const leafMats = [
    matStd(C.leafA, 0.42),
    matStd(C.leafB, 0.38),
    matStd(C.leafC, 0.45),
  ];
  leafMats.forEach((m) => (m.side = THREE.DoubleSide));

  const leafSpecs = [
    { az: 0.1, pitch: 0.62, len: 0.27, wid: 0.078, roll: 0.18, matIdx: 0 },
    { az: 0.7, pitch: 0.88, len: 0.23, wid: 0.07, roll: -0.15, matIdx: 1 },
    { az: 1.3, pitch: 0.54, len: 0.28, wid: 0.082, roll: 0.12, matIdx: 2 },
    { az: 1.9, pitch: 0.78, len: 0.24, wid: 0.072, roll: -0.22, matIdx: 0 },
    { az: 2.5, pitch: 0.58, len: 0.26, wid: 0.076, roll: 0.15, matIdx: 1 },
    { az: 3.2, pitch: 0.84, len: 0.22, wid: 0.068, roll: -0.18, matIdx: 2 },
    { az: 3.8, pitch: 0.52, len: 0.28, wid: 0.08, roll: 0.2, matIdx: 0 },
    { az: 4.5, pitch: 0.82, len: 0.23, wid: 0.07, roll: -0.14, matIdx: 1 },
    { az: 5.1, pitch: 0.6, len: 0.27, wid: 0.078, roll: 0.16, matIdx: 2 },
    { az: 5.8, pitch: 0.86, len: 0.21, wid: 0.065, roll: -0.16, matIdx: 0 },
    // Center young leaves
    { az: 0.4, pitch: 1.1, len: 0.18, wid: 0.055, roll: 0.25, matIdx: 1 },
    { az: 2.2, pitch: 1.15, len: 0.17, wid: 0.052, roll: -0.28, matIdx: 0 },
    { az: 4.1, pitch: 1.12, len: 0.19, wid: 0.056, roll: 0.22, matIdx: 2 },
  ];

  for (const l of leafSpecs) {
    const holder = new THREE.Group();
    place(holder, Math.cos(l.az) * 0.035, 0.16, Math.sin(l.az) * 0.035);
    holder.rotation.y = -l.az + Math.PI / 2;
    holder.rotation.z = -l.pitch;

    const stem = cyl(0.007, 0.009, l.len * 0.52, leafMats[l.matIdx], 8);
    place(stem, 0, l.len * 0.26, 0);
    holder.add(stem);

    const leaf = new THREE.Mesh(leafGeometry(l.len, l.wid), leafMats[l.matIdx]);
    leaf.castShadow = true;
    place(leaf, 0, l.len * 0.48, 0);
    leaf.rotation.y = l.roll;
    holder.add(leaf);

    g.add(holder);
  }

  return g;
}

function makeTissueBox(): THREE.Group {
  const g = new THREE.Group();
  const wood = matStd(C.tissueBox, 0.68);
  const tissueMat = matStd(C.tissue, 0.95);

  g.add(place(box(0.18, 0.12, 0.15, wood, 0.015, 3), 0, 0.06, 0));

  const slot = box(0.1, 0.012, 0.024, matStd(0x221a14, 0.9), 0.005, 2);
  place(slot, 0, 0.122, 0);
  g.add(slot);

  const t1 = box(0.065, 0.095, 0.007, tissueMat, 0.003, 2);
  place(t1, -0.012, 0.165, 0);
  t1.rotation.z = 0.2;
  t1.rotation.y = 0.22;
  g.add(t1);

  const t2 = box(0.055, 0.08, 0.007, tissueMat, 0.003, 2);
  place(t2, 0.022, 0.155, 0.012);
  t2.rotation.z = -0.24;
  t2.rotation.y = -0.32;
  g.add(t2);

  return g;
}

/* ------------------------------------------------------------------ */
/* Floor AO Contact Shadow Disc Helper                                */
/* ------------------------------------------------------------------ */

function makeContactShadowDisc(rx: number, rz: number, opacity: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(18, 22, 28, ${opacity})`);
  grad.addColorStop(0.5, `rgba(18, 22, 28, ${opacity * 0.5})`);
  grad.addColorStop(1, "rgba(18, 22, 28, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(rx * 2, rz * 2);
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Scene Initializer with Full 360° Orbit & Camera Controls            */
/* ------------------------------------------------------------------ */

export function createTherapyScene(
  container: HTMLElement,
  options: TherapySceneOptions = {}
): TherapySceneHandle {
  const {
    background = null,
    static: isStatic = false,
    maxDpr = 2,
    autoRotate: initialAutoRotate = true,
  } = options;

  const reducedMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frozen = isStatic || reducedMotion;

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);

  const baseCameraDist = 5.0;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 1.42, baseCameraDist);
  camera.lookAt(0, 0.8, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: background === null || background === undefined,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, maxDpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.setAttribute("aria-hidden", "true");

  // Realistic room environment for natural specular reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;

  /* Cinematic 3-Point Lighting Setup -------------------------------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0xeae6dc, 0.85);
  scene.add(hemi);

  // Key light: Warm directional sunlight from top-left
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-1.5, 7.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  // Fill light: Soft ambient fill from right
  const fill = new THREE.DirectionalLight(0xfff3e6, 0.65);
  fill.position.set(3.2, 2.4, 2.6);
  scene.add(fill);

  // Rim light: Crisp contour light from behind
  const rim = new THREE.DirectionalLight(0xedf4ff, 0.45);
  rim.position.set(0, 3.2, -3.8);
  scene.add(rim);

  /* Ground Plane & Contact AO Shadows ------------------------------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Realistic contact shadow discs anchoring furniture & shoes to floor
  scene.add(place(makeContactShadowDisc(0.7, 0.65, 0.35), -1.06, 0, 0));
  scene.add(place(makeContactShadowDisc(0.7, 0.65, 0.35), 1.06, 0, 0));
  scene.add(place(makeContactShadowDisc(0.35, 0.35, 0.3), 0.02, 0, 0.1));
  scene.add(place(makeContactShadowDisc(0.12, 0.18, 0.3), -0.78, 0, 0.5));
  scene.add(place(makeContactShadowDisc(0.12, 0.18, 0.28), 0.9, 0, 0.5));
  scene.add(place(makeContactShadowDisc(0.12, 0.18, 0.28), 1.2, 0, 0.5));

  /* World Assembly -------------------------------------------------- */
  const world = new THREE.Group();
  scene.add(world);

  // Therapist Chair
  const therapistChair = makeArmchair();
  place(therapistChair, -1.06, 0, 0);
  therapistChair.rotation.y = 0.76;
  world.add(therapistChair);

  // Client Chair
  const clientChair = makeArmchair();
  place(clientChair, 1.06, 0, 0);
  clientChair.rotation.y = -0.76;
  world.add(clientChair);

  // Therapist (Left)
  const therapist = makeTherapist();
  therapist.position.set(-1.06, 0, 0);
  therapist.rotation.y = 0.76;
  world.add(therapist);

  // Client (Right)
  const client = makeClient();
  client.position.set(1.06, 0, 0);
  client.rotation.y = -0.76;
  world.add(client);

  // Table
  const table = makeTable();
  place(table, 0.02, 0, 0.1);
  world.add(table);

  // Plant
  const plant = makePlant();
  place(plant, -0.07, 0.53, 0.03);
  world.add(plant);

  // Tissue Box
  const tissues = makeTissueBox();
  place(tissues, 0.12, 0.53, 0.05);
  tissues.rotation.y = 0.45;
  world.add(tissues);

  /* Camera Presets & Interpolation ---------------------------------- */
  const PRESETS: Record<CameraPreset, { yaw: number; pitch: number; dist: number; lookAt: V3; cameraY: number }> = {
    overview: { yaw: 0, pitch: 0, dist: baseCameraDist, lookAt: [0, 0.8, 0], cameraY: 1.42 },
    therapist: { yaw: 0.62, pitch: -0.04, dist: 3.4, lookAt: [-0.95, 0.88, 0.05], cameraY: 1.34 },
    client: { yaw: -0.62, pitch: -0.04, dist: 3.4, lookAt: [0.95, 0.86, 0.05], cameraY: 1.34 },
    details: { yaw: 0.08, pitch: 0.22, dist: 3.2, lookAt: [0.02, 0.62, 0.1], cameraY: 1.25 },
  };

  let activePreset: CameraPreset | "custom" = "overview";
  const targetLookAt = new THREE.Vector3(0, 0.8, 0);
  const currentLookAt = new THREE.Vector3(0, 0.8, 0);
  let targetCameraY = 1.42;
  let currentCameraY = 1.42;

  /* Full 360° Orbit Interaction + Momentum Inertia + Zoom ---------- */
  let raf = 0;
  let running = true;
  let autoRotateActive = initialAutoRotate && !frozen;
  let userInteracting = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  let targetYaw = 0;
  let currentYaw = 0;
  let yawVelocity = 0;

  let targetPitch = 0;
  let currentPitch = 0;
  let pitchVelocity = 0;

  let currentDist = baseCameraDist;
  let targetDist = baseCameraDist;
  const minDist = 3.0;
  const maxDist = 6.8;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let touchStartDist = 0;

  const markInteraction = () => {
    userInteracting = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      userInteracting = false;
    }, 2400);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (frozen) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    yawVelocity = 0;
    pitchVelocity = 0;
    activePreset = "custom";
    markInteraction();
    container.setPointerCapture?.(e.pointerId);
    container.style.cursor = "grabbing";
  };

  const onPointerMove = (e: PointerEvent) => {
    if (frozen) return;
    markInteraction();

    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const sensitivity = 0.0075;
      targetYaw += dx * sensitivity;
      targetPitch = THREE.MathUtils.clamp(targetPitch + dy * (sensitivity * 0.6), -0.42, 0.55);

      yawVelocity = dx * sensitivity * 0.4;
      pitchVelocity = dy * sensitivity * 0.2;
    }
  };

  const onPointerUp = () => {
    dragging = false;
    container.style.cursor = "grab";
  };

  const onWheel = (e: WheelEvent) => {
    if (frozen) return;
    markInteraction();
    e.preventDefault();
    targetDist = THREE.MathUtils.clamp(targetDist + e.deltaY * 0.0035, minDist, maxDist);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      markInteraction();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (touchStartDist > 0) {
        const delta = (touchStartDist - dist) * 0.01;
        targetDist = THREE.MathUtils.clamp(targetDist + delta, minDist, maxDist);
      }
      touchStartDist = dist;
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) touchStartDist = 0;
  };

  if (!frozen) {
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.style.cursor = "grab";
    container.style.touchAction = "none";
  }

  /* Resize ---------------------------------------------------------- */
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* Animation & Render Loop ----------------------------------------- */
  const clock = new THREE.Clock();
  const render = () => {
    if (!running) return;
    raf = requestAnimationFrame(render);
    const t = clock.getElapsedTime();

    if (!frozen) {
      if (autoRotateActive && !userInteracting && !dragging) {
        targetYaw += 0.004;
      }

      if (!dragging) {
        targetYaw += yawVelocity;
        targetPitch = THREE.MathUtils.clamp(targetPitch + pitchVelocity, -0.42, 0.55);
        yawVelocity *= 0.92;
        pitchVelocity *= 0.92;
      }

      currentYaw += (targetYaw - currentYaw) * 0.08;
      currentPitch += (targetPitch - currentPitch) * 0.08;
      currentDist += (targetDist - currentDist) * 0.08;
      currentCameraY += (targetCameraY - currentCameraY) * 0.08;
      currentLookAt.lerp(targetLookAt, 0.08);

      world.rotation.y = currentYaw;
      world.rotation.x = currentPitch;

      camera.position.z = currentDist;
      camera.position.y = currentCameraY + (currentDist - baseCameraDist) * 0.18;
      camera.lookAt(currentLookAt);

      plant.rotation.z = Math.sin(t * 1.1) * 0.02;
      plant.rotation.x = Math.cos(t * 0.8) * 0.015;
    }

    renderer.render(scene, camera);
  };
  render();

  /* Public Controls ------------------------------------------------- */
  const setPreset = (preset: CameraPreset) => {
    activePreset = preset;
    const p = PRESETS[preset];
    targetYaw = p.yaw;
    targetPitch = p.pitch;
    targetDist = p.dist;
    targetCameraY = p.cameraY;
    targetLookAt.set(...p.lookAt);
    yawVelocity = 0;
    pitchVelocity = 0;
    markInteraction();
  };

  const resetView = () => {
    setPreset("overview");
  };

  const getActivePreset = (): CameraPreset | "custom" => activePreset;

  const toggleAutoRotate = (): boolean => {
    autoRotateActive = !autoRotateActive;
    markInteraction();
    return autoRotateActive;
  };

  const zoomIn = () => {
    targetDist = THREE.MathUtils.clamp(targetDist - 0.6, minDist, maxDist);
    activePreset = "custom";
    markInteraction();
  };

  const zoomOut = () => {
    targetDist = THREE.MathUtils.clamp(targetDist + 0.6, minDist, maxDist);
    activePreset = "custom";
    markInteraction();
  };

  const isAutoRotating = () => autoRotateActive;

  const onDoubleClick = () => {
    resetView();
  };

  if (!frozen) {
    container.addEventListener("dblclick", onDoubleClick);
  }

  /* Dispose --------------------------------------------------------- */
  const dispose = () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    if (idleTimer) clearTimeout(idleTimer);

    if (!frozen) {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("dblclick", onDoubleClick);
      container.style.cursor = "";
    }

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });

    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    dispose,
    resetView,
    toggleAutoRotate,
    zoomIn,
    zoomOut,
    isAutoRotating,
    setPreset,
    getActivePreset,
  };
}
