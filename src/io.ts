import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { zipSync, strToU8 } from 'fflate';
import { sceneRefs } from './components/Viewport';
import { useStore } from './store';
import { makeObject, uid } from './defaults';
import { readAsDataURL } from './three/models';
import type { ProjectFile, SceneObj } from './types';

declare global { interface Window { claude?: { use: (n: string) => Promise<any> } } }

// ---------- downloading ----------

const VIEWER_SAFE = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|csv|html|svg|pdf|zip)$/i;

async function claudeDownloads() {
  try { return window.claude ? await window.claude.use('downloads') : null; } catch { return null; }
}

/** Save a file. Inside a Claude artifact viewer it goes through the viewer's
 *  download prompt (3D formats are zipped, since the viewer only accepts
 *  common types); elsewhere it is a normal browser download. */
export async function saveFile(filename: string, data: Blob | string | ArrayBuffer) {
  const dl = await claudeDownloads();
  if (dl) {
    let name = filename, payload: any = data;
    if (!VIEWER_SAFE.test(filename)) {
      const bytes = typeof data === 'string' ? strToU8(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
      payload = zipSync({ [filename]: bytes });
      name = filename.replace(/\.[^.]+$/, '') + '.zip';
    }
    try { await dl.save({ filename: name, data: payload }); return; } catch (e: any) {
      if (e?.code === 'declined') return;
      // fall through to a plain download
    }
  }
  const blob = data instanceof Blob ? data : new Blob([data as any]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const slug = () => (useStore.getState().name || 'scene').replace(/[^\w-]+/g, '-').toLowerCase();

// ---------- 3D export ----------

/** Run fn with editor-only helpers hidden so exports contain only content. */
function withoutHelpers<T>(fn: (root: THREE.Object3D) => T): T {
  const root = sceneRefs.content!;
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.userData.helper && o.visible) { o.visible = false; hidden.push(o); } });
  try { return fn(root); } finally { hidden.forEach((o) => (o.visible = true)); }
}

export async function exportGLTF(binary: boolean): Promise<ArrayBuffer | string> {
  return withoutHelpers((root) => new Promise((res, rej) => {
    new GLTFExporter().parse(root, (r) => res(binary ? (r as ArrayBuffer) : JSON.stringify(r, null, 2)), rej, { binary, onlyVisible: true, embedImages: true });
  }));
}

function bakedMeshesRoot(root: THREE.Object3D) {
  // OBJ/STL/PLY exporters do not understand non-mesh content; they still read world transforms.
  root.updateMatrixWorld(true);
  return root;
}

export async function export3D(format: 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'usdz') {
  const base = slug();
  if (format === 'glb') return saveFile(`${base}.glb`, new Blob([(await exportGLTF(true)) as ArrayBuffer], { type: 'model/gltf-binary' }));
  if (format === 'gltf') return saveFile(`${base}.gltf`, (await exportGLTF(false)) as string);
  if (format === 'obj') return saveFile(`${base}.obj`, withoutHelpers((r) => new OBJExporter().parse(bakedMeshesRoot(r))));
  if (format === 'stl') return saveFile(`${base}.stl`, withoutHelpers((r) => new STLExporter().parse(bakedMeshesRoot(r), { binary: true }) as any) as DataView as any);
  if (format === 'ply') {
    const data = await withoutHelpers((r) => new Promise<any>((res) => new PLYExporter().parse(bakedMeshesRoot(r), res, { binary: true })));
    return saveFile(`${base}.ply`, data);
  }
  if (format === 'usdz') {
    const data = await withoutHelpers((r) => new USDZExporter().parseAsync(r as any));
    return saveFile(`${base}.usdz`, new Blob([data as any], { type: 'model/vnd.usdz+zip' }));
  }
}

// ---------- image & video ----------

export function snapshot(type: 'png' | 'jpg' | 'webp', scale = 2): Promise<Blob> {
  const gl = sceneRefs.gl!;
  const { scene, camera } = sceneRefs;
  const size = gl.getSize(new THREE.Vector2());
  const prevRatio = gl.getPixelRatio();
  gl.setPixelRatio(scale);
  gl.setSize(size.x, size.y, false);
  withoutHelpersAll(() => gl.render(scene!, camera!));
  return new Promise((res) => {
    gl.domElement.toBlob((b) => {
      gl.setPixelRatio(prevRatio);
      gl.setSize(size.x, size.y, false);
      res(b!);
    }, type === 'jpg' ? 'image/jpeg' : `image/${type}`, 0.95);
  });
}

function withoutHelpersAll(fn: () => void) {
  const hidden: THREE.Object3D[] = [];
  sceneRefs.scene!.traverse((o: any) => {
    if ((o.userData.helper || o.isBox3Helper || o.type === 'TransformControlsRoot' || o.isGridHelper || o.name === 'grid') && o.visible) { o.visible = false; hidden.push(o); }
  });
  try { fn(); } finally { hidden.forEach((o) => (o.visible = true)); }
}

export async function exportImage(type: 'png' | 'jpg' | 'webp', scale = 2) {
  const prev = useStore.getState().mode;
  // Render without editor chrome: switch to Play for one frame.
  useStore.getState().set({ mode: 'play' });
  await new Promise((r) => setTimeout(r, 120));
  const blob = await snapshot(type, scale);
  useStore.getState().set({ mode: prev });
  return saveFile(`${slug()}.${type}`, blob);
}

export async function recordVideo(seconds: number, onProgress?: (s: number) => void) {
  const canvas = sceneRefs.gl!.domElement;
  const stream = canvas.captureStream(60);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(100);
  for (let i = 0; i < seconds; i++) { onProgress?.(i); await new Promise((r) => setTimeout(r, 1000)); }
  rec.stop();
  await done;
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  return saveFile(`${slug()}.${ext}`, new Blob(chunks, { type: mime || 'video/webm' }));
}

// ---------- project files ----------

export function projectData(): ProjectFile {
  const s = useStore.getState();
  const cam = sceneRefs.camera, ctl = sceneRefs.controls;
  return {
    app: 'ai-3d-studio', version: 1, name: s.name, objects: s.objects, scene: s.scene,
    camera: cam ? { position: cam.position.toArray() as any, target: ctl?.target?.toArray?.() ?? [0, 0, 0] } : undefined,
  };
}

export const saveProject = () => saveFile(`${slug()}.studio.json`, JSON.stringify(projectData()));

// ---------- web export (Spline "Viewer / Public URL / Code") ----------

const THREE_VER = '0.186.1';

function interactionsData() {
  const s = useStore.getState();
  return s.objects.filter((o) => o.events.length).map((o) => ({ id: o.id, states: o.states, events: o.events,
    base: { position: o.position, rotation: o.rotation, scale: o.scale, color: o.material.color, opacity: o.material.opacity } }));
}

/** A self-contained web page that plays the scene with its interactions. */
export async function buildViewerHTML(): Promise<string> {
  const glb = (await exportGLTF(true)) as ArrayBuffer;
  const b64 = arrayBufferToBase64(glb);
  const s = useStore.getState();
  const cam = projectData().camera ?? { position: [4.5, 3.5, 6], target: [0, 0, 0] };
  const cfg = { scene: s.scene, camera: cam, interactions: interactionsData(), allObjects: s.objects.map((o) => ({ id: o.id, base: { position: o.position, rotation: o.rotation, scale: o.scale, color: o.material.color, opacity: o.material.opacity }, states: o.states })) };
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(s.name)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:${s.scene.transparentBg ? 'transparent' : s.scene.background}}canvas{display:block;width:100%;height:100%}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>
</head><body>
<script type="module">
${VIEWER_RUNTIME}
const CONFIG = ${JSON.stringify(cfg)};
const GLB = "${b64}";
start(document.body, CONFIG, GLB);
</script></body></html>`;
}

export async function exportViewer() {
  return saveFile(`${slug()}.html`, await buildViewerHTML());
}

export function codeSnippets(name = slug()) {
  return {
    react: `// npm i three @react-three/fiber @react-three/drei
// Put ${name}.glb (Export > 3D files > GLB) in your public/ folder.
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';

function Scene() {
  const { scene } = useGLTF('/${name}.glb');
  return <primitive object={scene} />;
}

export default function ${name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase()).replace(/\W/g, '') || 'Scene'}() {
  return (
    <Canvas shadows camera={{ position: [4.5, 3.5, 6], fov: 45 }}>
      <Environment preset="studio" />
      <Scene />
      <OrbitControls enableDamping />
    </Canvas>
  );
}`,
    vanilla: `<!-- Vanilla JS: Export > Web viewer gives a ready page with interactions.
     This is the minimal loader for ${name}.glb -->
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 500);
camera.position.set(4.5, 3.5, 6);
const controls = new OrbitControls(camera, renderer.domElement);
new GLTFLoader().load('./${name}.glb', (g) => scene.add(g.scene));
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>`,
    iframe: `<iframe src="./${name}.html" width="100%" height="600" frameborder="0" style="border:0"></iframe>`,
  };
}

function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]); }

function arrayBufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as any);
  return btoa(bin);
}

// The runtime embedded in exported web pages (mirrors src/runtime.ts).
const VIEWER_RUNTIME = String.raw`
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const E = {
  linear: t => t, easeIn: t => t*t*t, easeOut: t => 1-Math.pow(1-t,3),
  easeInOut: t => t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,
  spring: t => t>=1?1:1-Math.exp(-6*t)*Math.cos(t*Math.PI*3.2),
  bounce: t => { const n=7.5625,d=2.75; if(t<1/d)return n*t*t; if(t<2/d)return n*(t-=1.5/d)*t+.75; if(t<2.5/d)return n*(t-=2.25/d)*t+.9375; return n*(t-=2.625/d)*t+.984375; },
};
const R = Math.PI/180;
function start(el, C, b64) {
  const S = C.scene;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = S.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = S.post.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  if (!S.transparentBg) scene.background = new THREE.Color(S.background);
  if (S.fog.enabled) scene.fog = new THREE.Fog(S.fog.color, S.fog.near, S.fog.far);
  if (S.environment !== 'none') { scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = S.envIntensity; }
  scene.add(new THREE.AmbientLight(S.ambientColor, S.ambientIntensity));
  const camera = S.camera === 'orthographic' ? new THREE.OrthographicCamera(-1,1,1,-1,-100,200) : new THREE.PerspectiveCamera(S.fov, 1, 0.05, 500);
  camera.position.fromArray(C.camera.position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(C.camera.target); controls.enableDamping = true;
  controls.enabled = S.play.orbit; controls.enableZoom = S.play.zoom; controls.enablePan = S.play.pan; controls.autoRotate = S.play.autoRotate;
  const resize = () => { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; renderer.setSize(w, h);
    if (camera.isPerspectiveCamera) camera.aspect = w/h; else { const z = 110; camera.left=-w/2/z; camera.right=w/2/z; camera.top=h/2/z; camera.bottom=-h/2/z; }
    camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const nodes = new Map(), anims = new Map(), cur = new Map(), toggles = new Map();
  const pointer = new THREE.Vector2(); let scroll = 0;
  const byId = new Map(C.allObjects.map(o => [o.id, o]));
  const pose = (o, sid) => { if (sid === 'base') return o.base; const s = o.states.find(x => x.id === sid); return s ? { position: s.position, rotation: s.rotation, scale: s.scale, color: s.color ?? o.base.color, opacity: s.opacity ?? o.base.opacity } : o.base; };
  const meshes = (n) => { const out = []; n.traverse(c => { if (c.isMesh) out.push(c); }); return out; };
  const apply = (id, p) => { const n = nodes.get(id); if (!n) return; n.position.fromArray(p.position); n.rotation.set(p.rotation[0]*R, p.rotation[1]*R, p.rotation[2]*R); n.scale.fromArray(p.scale);
    if (p.color) meshes(n).forEach(m => { if (m.material.color && !m.material.map) m.material.color.set(p.color); if (p.opacity !== undefined) { m.material.opacity = p.opacity; m.material.transparent = m.material.transparent || p.opacity < 1; } }); };
  const go = (t, to, ev, done) => { const f = () => anims.set(t.id, { from: cur.get(t.id) ?? t.base, to, t0: performance.now(), dur: Math.max(1, ev.duration), easing: ev.easing, done }); ev.delay > 0 ? setTimeout(f, ev.delay) : f(); };
  const fire = (owner, ev, on) => { const t = byId.get(ev.targetId || owner.id) || owner; const sp = pose(t, ev.stateId);
    if (ev.mode === 'once') { if (on) go(t, sp, ev); }
    else if (ev.mode === 'toggle') { if (ev.trigger === 'mouseHover') go(t, on ? sp : t.base, ev); else { const s = !toggles.get(ev.id); toggles.set(ev.id, s); go(t, s ? sp : t.base, ev); } }
    else if (ev.mode === 'loop') { const l = () => { apply(t.id, t.base); cur.set(t.id, t.base); go(t, sp, { ...ev, delay: 0 }, l); }; if (on) go(t, sp, ev, l); }
    else if (ev.mode === 'pingpong') { let fw = true; const st = () => { fw = !fw; go(t, fw ? sp : t.base, { ...ev, delay: 0 }, st); }; if (on) go(t, sp, ev, st); } };
  const handle = (trig, id, on = true, key) => { for (const o of C.interactions) for (const ev of o.events) { if (ev.trigger !== trig) continue;
    if ((trig === 'mouseDown' || trig === 'mouseHover') && o.id !== id) continue; if (trig === 'keyDown' && ev.key && ev.key.toLowerCase() !== (key||'').toLowerCase()) continue;
    if (trig === 'mouseHover' && ev.mode !== 'toggle' && !on) continue; fire(byId.get(o.id) || o, ev, on); } };
  new GLTFLoader().parse(bin, '', (g) => {
    g.scene.traverse(o => { if (o.userData && o.userData.objId) nodes.set(o.userData.objId, o); if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (o.isLight && S.shadows) { o.castShadow = true; o.shadow.mapSize.set(2048, 2048); o.shadow.bias = -0.0005; if (o.isDirectionalLight) { const c = o.shadow.camera; c.left=-8;c.right=8;c.top=8;c.bottom=-8; c.far = 40; } } });
    scene.add(g.scene);
    scene.updateMatrixWorld(true);
    // Point directional and spot lights at the world origin, as in the editor.
    g.scene.traverse(o => { if (o.isDirectionalLight || o.isSpotLight) { o.add(o.target); o.target.position.copy(o.worldToLocal(new THREE.Vector3(0, 0, 0))); } });
    for (const o of C.interactions) for (const ev of o.events) if (ev.trigger === 'start') fire(byId.get(o.id) || o, ev, true);
  });
  const ray = new THREE.Raycaster(); let hovered = new Set();
  const idOf = (obj) => { const ids = []; while (obj) { if (obj.userData && obj.userData.objId) ids.push(obj.userData.objId); obj = obj.parent; } return ids; };
  const pick = (e) => { const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1); ray.setFromCamera(pointer, camera); const h = ray.intersectObjects(scene.children, true)[0]; return h ? idOf(h.object) : []; };
  renderer.domElement.addEventListener('pointermove', (e) => { const ids = new Set(pick(e)); for (const id of ids) if (!hovered.has(id)) handle('mouseHover', id, true); for (const id of hovered) if (!ids.has(id)) handle('mouseHover', id, false); hovered = ids;
    renderer.domElement.style.cursor = [...ids].some(id => C.interactions.some(o => o.id === id)) ? 'pointer' : ''; });
  renderer.domElement.addEventListener('pointerdown', (e) => pick(e).forEach(id => handle('mouseDown', id)));
  addEventListener('keydown', (e) => handle('keyDown', null, true, e.key));
  addEventListener('wheel', (e) => { scroll = Math.min(1, Math.max(0, scroll + e.deltaY / 1500)); }, { passive: true });
  renderer.setAnimationLoop((now) => {
    now = performance.now();
    for (const [id, a] of anims) { const raw = Math.min(1, (now - a.t0) / a.dur), k = E[a.easing](raw);
      const l = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
      const col = a.to.color && a.to.color !== a.from.color ? '#' + new THREE.Color(a.from.color).lerp(new THREE.Color(a.to.color), Math.min(1, Math.max(0, k))).getHexString() : a.from.color;
      const p = { position: l(a.from.position, a.to.position), rotation: l(a.from.rotation, a.to.rotation), scale: l(a.from.scale, a.to.scale), color: col, opacity: (a.from.opacity ?? 1) + ((a.to.opacity ?? 1) - (a.from.opacity ?? 1)) * k };
      cur.set(id, p); apply(id, p); if (raw >= 1) { anims.delete(id); cur.set(id, a.to); a.done && a.done(); } }
    for (const o of C.interactions) for (const ev of o.events) { const t = byId.get(ev.targetId || o.id) || o; const n = nodes.get(t.id); if (!n) continue;
      if (ev.trigger === 'scroll') { const sp = pose(t, ev.stateId), k = E[ev.easing](scroll), l = (x, y) => x.map((v, i) => v + (y[i] - v) * k); apply(t.id, { position: l(t.base.position, sp.position), rotation: l(t.base.rotation, sp.rotation), scale: l(t.base.scale, sp.scale) }); }
      else if (ev.trigger === 'mouseMove') { const c = cur.get(t.id) ?? t.base;
        if (ev.follow === 'follow') { n.position.x += (c.position[0] + pointer.x*2 - n.position.x)*.12; n.position.y += (c.position[1] + pointer.y*1.2 - n.position.y)*.12; }
        else { n.rotation.y += (c.rotation[1]*R + pointer.x*.6 - n.rotation.y)*.12; n.rotation.x += (c.rotation[0]*R - pointer.y*.4 - n.rotation.x)*.12; } } }
    controls.update(); renderer.render(scene, camera);
  });
}
`;

// ---------- import ----------

export async function importFiles(files: FileList | File[]) {
  const st = useStore.getState();
  for (const f of Array.from(files)) {
    const ext = f.name.split('.').pop()!.toLowerCase();
    if (ext === 'json') {
      const p = JSON.parse(await f.text());
      if (p.app === 'ai-3d-studio') st.load(p);
      continue;
    }
    const url = await readAsDataURL(f);
    if (['glb', 'gltf', 'obj', 'stl', 'ply'].includes(ext)) {
      st.add('model', { name: f.name.replace(/\.[^.]+$/, ''), position: [0, 0, 0], model: { url, format: ext as any, name: f.name } });
    } else if (/^image\//.test(f.type)) {
      const img = await new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = url; });
      const h = 1.2, w = (img.width / img.height) * h;
      const o = makeObject('image', { name: f.name.replace(/\.[^.]+$/, ''), position: [0, h / 2 + 0.1, 0], params: { width: w, height: h } });
      o.material.texture.url = url;
      o.material.doubleSide = true;
      o.castShadow = false;
      st.addMany([o]);
    }
  }
}

export function newId() { return uid(); }
export type { SceneObj };
