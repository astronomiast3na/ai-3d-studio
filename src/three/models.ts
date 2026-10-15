import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

const cache = new Map<string, Promise<THREE.Object3D>>();

export function loadModel(url: string, format: string): Promise<THREE.Object3D> {
  const key = format + '|' + url;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<THREE.Object3D>((resolve, reject) => {
      if (format === 'glb' || format === 'gltf') {
        new GLTFLoader().load(url, (g) => resolve(g.scene), undefined, reject);
      } else if (format === 'obj') {
        new OBJLoader().load(url, (o) => {
          o.traverse((c: any) => { if (c.isMesh) c.material = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.5 }); });
          resolve(o);
        }, undefined, reject);
      } else if (format === 'stl' || format === 'ply') {
        const L: any = format === 'stl' ? STLLoader : PLYLoader;
        new L().load(url, (geo: THREE.BufferGeometry) => {
          geo.computeVertexNormals();
          const hasColor = !!geo.getAttribute('color');
          resolve(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hasColor ? '#ffffff' : '#cccccc', vertexColors: hasColor, roughness: 0.5 })));
        }, undefined, reject);
      } else reject(new Error('Unsupported format ' + format));
    }).then((obj) => {
      // Normalise: centre on the floor and scale to roughly 1.5 units.
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const s = 1.5 / Math.max(size.x, size.y, size.z, 1e-6);
      const wrap = new THREE.Group();
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      obj.position.y += size.y / 2;
      wrap.add(obj);
      wrap.scale.setScalar(s);
      return wrap;
    });
    cache.set(key, p);
  }
  return p.then((o) => o.clone(true));
}

export const readAsDataURL = (f: Blob) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
