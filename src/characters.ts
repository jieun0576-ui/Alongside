import { AnimationMixer, Box3, Material, Mesh, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS } from './protocol';

export const HEIGHT = 1.5; // metres, every character the same, feet at y = 0
export type Move = 'idle' | 'walk' | 'sprint' | 'sit';

type Source = { scene: Object3D; clips: AnimationClip[]; scale: number; lift: number };
const loader = new GLTFLoader();
const sources = new Map<number, Promise<Source>>();

// Each file is fetched once, the first time someone is that character.
function source(k: number) {
  let s = sources.get(k);
  if (!s) {
    s = loader.loadAsync(`/characters/${CHARACTERS[k]}.glb`).then((g) => {
      const box = new Box3().setFromObject(g.scene);
      const scale = HEIGHT / (box.max.y - box.min.y);
      return { scene: g.scene, clips: g.animations, scale, lift: -box.min.y * scale };
    });
    sources.set(k, s);
  }
  return s;
}

// One person's character: its own copy of the model, materials and animations.
export type Look = {
  model: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  materials: Material[];
  now?: AnimationAction;
};

export async function makeLook(k: number): Promise<Look> {
  const src = await source(k);
  const model = clone(src.scene);
  model.scale.setScalar(src.scale);
  model.position.y = src.lift;
  const materials: Material[] = [];
  model.traverse((o) => {
    if (o instanceof Mesh) {
      o.material = (o.material as Material).clone(); // own copy, so one person can fade alone
      materials.push(o.material);
    }
  });
  const mixer = new AnimationMixer(model);
  const actions = new Map(src.clips.map((c) => [c.name, mixer.clipAction(c)]));
  return { model, mixer, actions, materials };
}

export function play(look: Look, move: Move) {
  const next = look.actions.get(move);
  if (!next || next === look.now) return;
  next.reset().play();
  if (look.now) next.crossFadeFrom(look.now, 0.25, false);
  look.now = next;
}

export function fade(look: Look, away: boolean) {
  for (const m of look.materials) {
    m.transparent = away;
    m.opacity = away ? 0.35 : 1;
  }
}

export function dropLook(look: Look) {
  look.mixer.stopAllAction();
  for (const m of look.materials) m.dispose(); // geometry and textures are shared, so they stay
}
