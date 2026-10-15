export type Vec3 = [number, number, number];

export type ShapeType =
  | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'torusKnot' | 'plane'
  | 'capsule' | 'icosahedron' | 'pyramid' | 'ring' | 'star' | 'polygon' | 'heart'
  | 'roundedRect' | 'text';
export type LightType = 'pointLight' | 'spotLight' | 'directionalLight';
export type ObjType = ShapeType | LightType | 'group' | 'model' | 'image';

export type MaterialModel = 'physical' | 'standard' | 'lambert' | 'phong' | 'toon' | 'basic' | 'normal' | 'matcap' | 'glass';

export interface MaterialDef {
  model: MaterialModel;
  color: string;
  opacity: number;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  transmission: number;
  ior: number;
  thickness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  iridescence: number;
  wireframe: boolean;
  flatShading: boolean;
  doubleSide: boolean;
  gradient: { enabled: boolean; colorA: string; colorB: string; angle: number; type: 'linear' | 'radial' };
  noise: { enabled: boolean; scale: number; amount: number; color: string };
  fresnel: { enabled: boolean; color: string; power: number; intensity: number };
  texture: { url: string | null; repeat: number };
  matcap: { url: string | null };
  override?: boolean; // for imported models: replace their materials
}

export interface StateDef {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color?: string;
  opacity?: number;
}

export type Trigger = 'start' | 'mouseDown' | 'mouseHover' | 'keyDown' | 'scroll' | 'mouseMove';
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring' | 'bounce';

export interface EventDef {
  id: string;
  trigger: Trigger;
  key?: string;
  targetId?: string; // defaults to the owner object
  stateId: string; // 'base' or a state id
  duration: number; // ms
  delay: number; // ms
  easing: Easing;
  mode: 'toggle' | 'once' | 'loop' | 'pingpong';
  // mouseMove: follow / look at cursor
  follow?: 'lookAt' | 'follow';
}

export interface LightDef {
  color: string;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
  castShadow: boolean;
}

export interface SceneObj {
  id: string;
  name: string;
  type: ObjType;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  position: Vec3;
  rotation: Vec3; // degrees
  scale: Vec3;
  params: Record<string, any>;
  material: MaterialDef;
  castShadow: boolean;
  receiveShadow: boolean;
  light?: LightDef;
  model?: { url: string; format: 'glb' | 'gltf' | 'obj' | 'stl' | 'ply'; name?: string };
  states: StateDef[];
  events: EventDef[];
}

export interface SceneSettings {
  background: string;
  transparentBg: boolean;
  environment: 'none' | 'studio';
  envIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  fog: { enabled: boolean; color: string; near: number; far: number };
  shadows: boolean;
  shadowSoftness: number;
  grid: boolean;
  camera: 'perspective' | 'orthographic';
  fov: number;
  post: {
    bloom: { enabled: boolean; intensity: number; threshold: number };
    vignette: { enabled: boolean; darkness: number };
    dof: { enabled: boolean; focus: number; blur: number };
    noise: { enabled: boolean; opacity: number };
    chromatic: { enabled: boolean; offset: number };
    toneMapping: boolean;
  };
  play: { orbit: boolean; zoom: boolean; pan: boolean; autoRotate: boolean };
}

export interface ProjectFile {
  app: 'ai-3d-studio';
  version: 1;
  name: string;
  objects: SceneObj[];
  scene: SceneSettings;
  camera?: { position: Vec3; target: Vec3 };
}
