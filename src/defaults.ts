import type { MaterialDef, ObjType, SceneObj, SceneSettings, LightDef } from './types';

let counter = 0;
export const uid = (p = 'o') => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const PALETTE = ['#7b61ff', '#ff6b8b', '#36c5f0', '#ffd166', '#06d6a0', '#f78c40', '#e0e0e0'];

export function defaultMaterial(color = '#7b61ff'): MaterialDef {
  return {
    model: 'physical',
    color,
    opacity: 1,
    roughness: 0.35,
    metalness: 0,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1.5,
    thickness: 0.5,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    sheen: 0,
    iridescence: 0,
    wireframe: false,
    flatShading: false,
    doubleSide: false,
    gradient: { enabled: false, colorA: '#7b61ff', colorB: '#ff6b8b', angle: 90, type: 'linear' },
    noise: { enabled: false, scale: 8, amount: 0.3, color: '#000000' },
    fresnel: { enabled: false, color: '#ffffff', power: 2.5, intensity: 1 },
    texture: { url: null, repeat: 1 },
    matcap: { url: null },
  };
}

export const SHAPE_PARAMS: Record<string, Record<string, any>> = {
  cube: { width: 1, height: 1, depth: 1, cornerRadius: 0.08, segments: 4 },
  sphere: { radius: 0.6, widthSegments: 64, heightSegments: 32, phiLength: 360 },
  cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1.2, radialSegments: 64 },
  cone: { radius: 0.6, height: 1.2, radialSegments: 64 },
  torus: { radius: 0.55, tube: 0.2, radialSegments: 32, tubularSegments: 96, arc: 360 },
  torusKnot: { radius: 0.5, tube: 0.16, tubularSegments: 160, radialSegments: 24, p: 2, q: 3 },
  plane: { width: 2, height: 2 },
  capsule: { radius: 0.35, length: 0.8, capSegments: 12, radialSegments: 32 },
  icosahedron: { radius: 0.65, detail: 0 },
  pyramid: { radius: 0.7, height: 1, sides: 4 },
  ring: { innerRadius: 0.35, outerRadius: 0.7, segments: 64 },
  star: { points: 5, outerRadius: 0.7, innerRadius: 0.32, depth: 0.25, bevel: 0.05 },
  polygon: { sides: 6, radius: 0.7, depth: 0.25, bevel: 0.05 },
  heart: { size: 1, depth: 0.25, bevel: 0.05 },
  roundedRect: { width: 1.4, height: 0.9, radius: 0.2, depth: 0.2, bevel: 0.04 },
  text: { text: 'Hello', font: 'helvetiker_bold', size: 0.5, depth: 0.15, bevel: 0.02, curveSegments: 8, align: 'center' },
  image: { width: 1.6, height: 1, url: null },
  group: {},
  model: {},
};

export const NAMES: Record<ObjType, string> = {
  cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone', torus: 'Torus', torusKnot: 'Torus Knot',
  plane: 'Plane', capsule: 'Capsule', icosahedron: 'Icosahedron', pyramid: 'Pyramid', ring: 'Ring', star: 'Star',
  polygon: 'Polygon', heart: 'Heart', roundedRect: 'Rectangle', text: 'Text', group: 'Group', model: 'Model',
  image: 'Image', pointLight: 'Point Light', spotLight: 'Spot Light', directionalLight: 'Directional Light',
};

export function defaultLight(type: string): LightDef {
  return {
    color: '#ffffff',
    intensity: type === 'directionalLight' ? 2 : type === 'spotLight' ? 30 : 15,
    distance: 0,
    angle: 30,
    penumbra: 0.4,
    castShadow: type !== 'pointLight',
  };
}

export function makeObject(type: ObjType, extra: Partial<SceneObj> = {}): SceneObj {
  const isLight = type.endsWith('Light');
  const color = PALETTE[Math.floor(Math.random() * 5)];
  const base: SceneObj = {
    id: uid(),
    name: NAMES[type] ?? type,
    type,
    parentId: null,
    visible: true,
    locked: false,
    position: isLight ? (type === 'directionalLight' ? [3, 5, 3] : [0, 2.5, 1.5]) : [0, type === 'plane' ? 0 : 0.6, 0],
    rotation: type === 'plane' ? [-90, 0, 0] : [0, 0, 0],
    scale: [1, 1, 1],
    params: structuredClone(SHAPE_PARAMS[type] ?? {}),
    material: defaultMaterial(type === 'plane' ? '#d9d9e3' : type === 'image' ? '#ffffff' : color),
    castShadow: true,
    receiveShadow: true,
    states: [],
    events: [],
  };
  if (type === 'image') base.material.model = 'basic';
  if (isLight) base.light = defaultLight(type);
  return { ...base, ...extra };
}

export const defaultScene = (): SceneSettings => ({
  background: '#f2f2f5',
  transparentBg: false,
  environment: 'studio',
  envIntensity: 0.6,
  ambientColor: '#ffffff',
  ambientIntensity: 0.6,
  fog: { enabled: false, color: '#f2f2f5', near: 8, far: 30 },
  shadows: true,
  shadowSoftness: 2,
  grid: true,
  camera: 'perspective',
  fov: 45,
  post: {
    bloom: { enabled: false, intensity: 1, threshold: 1 },
    vignette: { enabled: false, darkness: 0.5 },
    dof: { enabled: false, focus: 0.02, blur: 3 },
    noise: { enabled: false, opacity: 0.08 },
    chromatic: { enabled: false, offset: 0.002 },
    toneMapping: true,
  },
  play: { orbit: true, zoom: true, pan: false, autoRotate: false },
});

export function starterObjects(): SceneObj[] {
  const floor = makeObject('plane', { name: 'Floor', params: { width: 12, height: 12 }, position: [0, 0, 0] });
  floor.material.color = '#e9e9f0';
  floor.castShadow = false;
  const cube = makeObject('cube', { name: 'Cube', position: [-1.4, 0.5, 0] });
  cube.material.color = '#7b61ff';
  const sphere = makeObject('sphere', { name: 'Sphere', position: [0, 0.6, 0] });
  sphere.material.color = '#ff6b8b';
  const torus = makeObject('torus', { name: 'Torus', position: [1.4, 0.6, 0], rotation: [90, 0, 0] });
  torus.material.color = '#36c5f0';
  const sun = makeObject('directionalLight', { name: 'Directional Light' });
  // A hover state so the demo scene shows interactions in Play mode.
  sphere.states = [{ id: 'st_hover', name: 'Hover', position: [0, 1.1, 0], rotation: [0, 0, 0], scale: [1.2, 1.2, 1.2], color: '#ffd166' }];
  sphere.events = [{ id: uid('ev'), trigger: 'mouseHover', stateId: 'st_hover', duration: 400, delay: 0, easing: 'spring', mode: 'toggle' }];
  cube.states = [{ id: 'st_spin', name: 'Spin', position: [-1.4, 0.5, 0], rotation: [0, 180, 0], scale: [1, 1, 1] }];
  cube.events = [{ id: uid('ev'), trigger: 'start', stateId: 'st_spin', duration: 2400, delay: 0, easing: 'easeInOut', mode: 'pingpong' }];
  return [floor, cube, sphere, torus, sun];
}
