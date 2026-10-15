import * as THREE from 'three';
import type { MaterialDef } from '../types';

const texCache = new Map<string, THREE.Texture>();
export function loadTexture(url: string) {
  let t = texCache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
  }
  return t;
}

function layerCanvas(m: MaterialDef) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  if (m.gradient.enabled) {
    let grad: CanvasGradient;
    if (m.gradient.type === 'radial') {
      grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 1.4);
    } else {
      const a = THREE.MathUtils.degToRad(m.gradient.angle);
      const dx = Math.cos(a) * size / 2, dy = Math.sin(a) * size / 2;
      grad = g.createLinearGradient(size / 2 - dx, size / 2 - dy, size / 2 + dx, size / 2 + dy);
    }
    grad.addColorStop(0, m.gradient.colorA);
    grad.addColorStop(1, m.gradient.colorB);
    g.fillStyle = grad;
  } else {
    g.fillStyle = '#ffffff';
  }
  g.fillRect(0, 0, size, size);
  if (m.noise.enabled) {
    const img = g.getImageData(0, 0, size, size);
    const cell = Math.max(1, Math.round(64 / Math.max(1, m.noise.scale)));
    const nc = new THREE.Color(m.noise.color);
    // Seeded value noise so the texture is stable between rebuilds.
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cols = Math.ceil(size / cell) + 1;
    const grid = Array.from({ length: cols * cols }, rnd);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = grid[Math.floor(y / cell) * cols + Math.floor(x / cell)];
      const fine = rnd();
      const n = (v * 0.6 + fine * 0.4) * m.noise.amount;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i] * (1 - n) + nc.r * 255 * n;
      img.data[i + 1] = img.data[i + 1] * (1 - n) + nc.g * 255 * n;
      img.data[i + 2] = img.data[i + 2] * (1 - n) + nc.b * 255 * n;
    }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function applyFresnel(mat: THREE.Material, m: MaterialDef) {
  if (!m.fresnel.enabled) return;
  const col = new THREE.Color(m.fresnel.color);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fresnelColor = { value: col };
    shader.uniforms.fresnelPower = { value: m.fresnel.power };
    shader.uniforms.fresnelIntensity = { value: m.fresnel.intensity };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 fresnelColor; uniform float fresnelPower; uniform float fresnelIntensity;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), fresnelPower);
        totalEmissiveRadiance += fresnelColor * fres * fresnelIntensity;`,
      );
  };
  mat.customProgramCacheKey = () => `fresnel-${m.fresnel.power}-${m.fresnel.intensity}-${m.fresnel.color}`;
}

export function buildMaterial(m: MaterialDef): THREE.Material {
  const side = m.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
  const transparent = m.opacity < 1;
  let map: THREE.Texture | null = null;
  if (m.texture.url) {
    map = loadTexture(m.texture.url).clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(m.texture.repeat, m.texture.repeat);
    map.needsUpdate = true;
  } else if (m.gradient.enabled || m.noise.enabled) {
    map = layerCanvas(m);
  }
  const color = map && m.gradient.enabled && !m.texture.url ? '#ffffff' : m.color;
  const common: any = { color, opacity: m.opacity, transparent, side, wireframe: m.wireframe, map };
  let mat: THREE.Material;
  switch (m.model) {
    case 'basic':
      mat = new THREE.MeshBasicMaterial(common);
      break;
    case 'normal':
      mat = new THREE.MeshNormalMaterial({ side, wireframe: m.wireframe, flatShading: m.flatShading, opacity: m.opacity, transparent });
      break;
    case 'matcap':
      mat = new THREE.MeshMatcapMaterial({ ...common, matcap: m.matcap.url ? loadTexture(m.matcap.url) : null, flatShading: m.flatShading });
      break;
    case 'lambert':
      mat = new THREE.MeshLambertMaterial({ ...common, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, flatShading: m.flatShading });
      break;
    case 'phong':
      mat = new THREE.MeshPhongMaterial({ ...common, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, shininess: (1 - m.roughness) * 120, flatShading: m.flatShading });
      break;
    case 'toon':
      mat = new THREE.MeshToonMaterial({ ...common, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity });
      break;
    case 'standard':
      mat = new THREE.MeshStandardMaterial({ ...common, roughness: m.roughness, metalness: m.metalness, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, flatShading: m.flatShading });
      break;
    case 'glass':
      mat = new THREE.MeshPhysicalMaterial({
        ...common, roughness: Math.min(m.roughness, 0.3), metalness: 0, transmission: 1, ior: m.ior, thickness: m.thickness,
        clearcoat: 1, clearcoatRoughness: 0.05, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, iridescence: m.iridescence,
      });
      break;
    default:
      mat = new THREE.MeshPhysicalMaterial({
        ...common, roughness: m.roughness, metalness: m.metalness, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity,
        transmission: m.transmission, ior: m.ior, thickness: m.thickness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness,
        sheen: m.sheen, sheenColor: new THREE.Color('#ffffff'), iridescence: m.iridescence, flatShading: m.flatShading,
      });
  }
  if (m.model !== 'basic' && m.model !== 'normal' && m.model !== 'matcap') applyFresnel(mat, m);
  return mat;
}
