import { useStore } from './store';
import { makeObject, SHAPE_PARAMS, uid } from './defaults';
import type { ObjType, SceneObj, Vec3 } from './types';

const SHAPE_TYPES = Object.keys(SHAPE_PARAMS).filter((t) => !['image', 'model'].includes(t));
const LIGHT_TYPES = ['pointLight', 'spotLight', 'directionalLight'];

function sceneSummary() {
  const s = useStore.getState();
  return s.objects.map((o) => ({
    id: o.id, name: o.name, type: o.type, parent: o.parentId, position: o.position, rotation: o.rotation, scale: o.scale,
    params: o.type === 'model' ? undefined : o.params, color: o.material.color, material: o.material.model,
  }));
}

export function buildPrompt(request: string, selectedIds: string[], withImage: boolean) {
  const shapeDocs = SHAPE_TYPES.map((t) => `${t}: ${JSON.stringify(SHAPE_PARAMS[t])}`).join('\n');
  return `You are the AI assistant inside a Spline-style 3D design editor. Turn the user's request into edit operations on the scene.

UNITS: 1 unit ~ 1 meter-ish design unit. Y is up. Floor is y=0. Typical objects are 0.2–3 units. Rotations are in DEGREES (x,y,z Euler).

OBJECT TYPES and their default params (only set params you need to change):
${shapeDocs}
group: {} (container; children's positions are relative to it)
Lights: ${LIGHT_TYPES.join(', ')} with "light": {"color":"#ffffff","intensity":number,"castShadow":bool} (directional ~1-4, point/spot ~10-60).

MATERIAL fields (all optional): {"model":"physical|standard|glass|toon|basic|lambert|phong|matcap|normal","color":"#rrggbb","roughness":0-1,"metalness":0-1,"opacity":0-1,"emissive":"#rrggbb","emissiveIntensity":0-10,"transmission":0-1,"clearcoat":0-1,"iridescence":0-1,
"gradient":{"enabled":true,"colorA":"#..","colorB":"#..","angle":0-360,"type":"linear|radial"},"fresnel":{"enabled":true,"color":"#..","power":1-6,"intensity":0-3}}

Build recognisable objects by composing many primitives (often 5–40), grouped under one "group". Use rounded cubes (cornerRadius), capsules, spheres, extruded shapes and 3D text. Use a cohesive, modern colour palette like Spline scenes (soft pastel or bold gradients). Keep things resting on the floor (y >= 0) unless floating is intended.

You may also update or delete EXISTING objects by id, and add events for interactivity:
"states":[{"id":"st1","name":"Hover","position":[..],"rotation":[..],"scale":[..],"color":"#.."}]
"events":[{"trigger":"start|mouseDown|mouseHover|keyDown|scroll|mouseMove","stateId":"st1","duration":ms,"delay":0,"easing":"linear|easeIn|easeOut|easeInOut|spring|bounce","mode":"toggle|once|loop|pingpong"}]

CURRENT SCENE (JSON):
${JSON.stringify(sceneSummary())}
SELECTED IDS: ${JSON.stringify(selectedIds)}
${withImage ? 'The user attached an image: recreate its subject as a stylised 3D model built from primitives, matching shapes, proportions and colours.\n' : ''}
USER REQUEST: ${request}

Reply with ONLY a JSON object, no prose, in this exact form:
{"summary":"one short sentence of what you did","operations":[
 {"op":"add","ref":"r1","parent":null,"type":"group","name":"Robot","position":[0,0,0]},
 {"op":"add","ref":"r2","parent":"r1","type":"cube","name":"Body","position":[0,0.8,0],"rotation":[0,0,0],"scale":[1,1,1],"params":{"width":1,"height":1.2,"depth":0.8,"cornerRadius":0.15},"material":{"color":"#7b61ff","roughness":0.3}},
 {"op":"update","id":"<existing id>","position":[..],"material":{"color":"#.."}},
 {"op":"delete","id":"<existing id>"}
]}
"parent" may be a ref from this reply, an existing id, or null.`;
}

export interface AIResult { summary: string; operations: any[] }

export function applyOperations(res: AIResult) {
  const st = useStore.getState();
  st.commit();
  let objects = [...st.objects];
  const refs = new Map<string, string>();
  const added: SceneObj[] = [];
  const v3 = (v: any, d: Vec3): Vec3 => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number') ? (v as Vec3) : d);
  const mergeMaterial = (o: SceneObj, m: any) => {
    if (!m || typeof m !== 'object') return;
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && (o.material as any)[k]) Object.assign((o.material as any)[k], v);
      else if (k in o.material) (o.material as any)[k] = v;
    }
  };
  const fixEvents = (o: SceneObj) => {
    o.states = (o.states ?? []).map((s: any) => ({ ...s, id: s.id || uid('st'), name: s.name || 'State', position: v3(s.position, o.position), rotation: v3(s.rotation, o.rotation), scale: v3(s.scale, o.scale) }));
    o.events = (o.events ?? []).map((e: any) => ({ id: uid('ev'), trigger: e.trigger || 'mouseDown', stateId: e.stateId || o.states[0]?.id || 'base', duration: e.duration ?? 600, delay: e.delay ?? 0, easing: e.easing || 'easeInOut', mode: e.mode || 'toggle', key: e.key, follow: e.follow }));
  };
  for (const op of res.operations ?? []) {
    try {
      if (op.op === 'add') {
        const type = op.type as ObjType;
        if (![...SHAPE_TYPES, ...LIGHT_TYPES, 'group'].includes(type)) continue;
        const o = makeObject(type);
        o.name = op.name || o.name;
        o.position = v3(op.position, type.endsWith('Light') ? o.position : [0, 0, 0]);
        o.rotation = v3(op.rotation, o.rotation);
        o.scale = v3(op.scale, [1, 1, 1]);
        if (op.params) Object.assign(o.params, op.params);
        mergeMaterial(o, op.material);
        if (op.light && o.light) Object.assign(o.light, op.light);
        if (op.states) o.states = op.states;
        if (op.events) o.events = op.events;
        fixEvents(o);
        const parent = op.parent ? refs.get(op.parent) ?? (objects.some((x) => x.id === op.parent) ? op.parent : null) : null;
        o.parentId = parent;
        if (op.ref) refs.set(op.ref, o.id);
        objects.push(o);
        added.push(o);
      } else if (op.op === 'update') {
        const id = refs.get(op.id) ?? op.id;
        objects = objects.map((x) => {
          if (x.id !== id) return x;
          const c = structuredClone(x);
          if (op.name) c.name = op.name;
          if (op.position) c.position = v3(op.position, c.position);
          if (op.rotation) c.rotation = v3(op.rotation, c.rotation);
          if (op.scale) c.scale = v3(op.scale, c.scale);
          if (op.params) Object.assign(c.params, op.params);
          if (typeof op.visible === 'boolean') c.visible = op.visible;
          mergeMaterial(c, op.material);
          if (op.light && c.light) Object.assign(c.light, op.light);
          if (op.states) c.states = op.states;
          if (op.events) c.events = op.events;
          if (op.states || op.events) fixEvents(c);
          return c;
        });
      } else if (op.op === 'delete') {
        const id = refs.get(op.id) ?? op.id;
        const kill = new Set([id]);
        let grew = true;
        while (grew) { grew = false; for (const x of objects) if (x.parentId && kill.has(x.parentId) && !kill.has(x.id)) { kill.add(x.id); grew = true; } }
        objects = objects.filter((x) => !kill.has(x.id));
      }
    } catch (e) { console.warn('skipped op', op, e); }
  }
  const top = added.filter((o) => !added.some((p) => p.id === o.parentId) && !o.parentId);
  useStore.setState({ objects, selected: top.length ? [top[0].id] : st.selected, lastKey: null });
  return { added: added.length };
}

// ---------- Claude access ----------

export async function claudeSample() {
  try { return window.claude ? await window.claude.use('sample') : null; } catch { return null; }
}

export async function askClaude(prompt: string, opts: { image?: Blob | null; apiKey?: string; onText?: (t: string) => void; signal?: AbortSignal }): Promise<AIResult> {
  const sample = await claudeSample();
  if (sample) {
    const o: any = { modelTier: 'complex', signal: opts.signal, cache: false, onText: opts.onText ? ({ text }: any) => opts.onText!(text) : undefined };
    if (opts.image) o.images = [opts.image];
    return await sample.json(prompt, o);
  }
  if (!opts.apiKey) throw new Error('Add an Anthropic API key in AI settings, or open this app inside Claude.');
  const content: any[] = [];
  if (opts.image) {
    const b64 = await blobToBase64(opts.image);
    content.push({ type: 'image', source: { type: 'base64', media_type: opts.image.type || 'image/png', data: b64 } });
  }
  content.push({ type: 'text', text: prompt });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: opts.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 16000, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const text = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  return parseJSON(text);
}

function parseJSON(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI reply had no JSON.');
  return JSON.parse(m[0]);
}

const blobToBase64 = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.readAsDataURL(b); });

// ---------- Mesh generation (text/image to 3D) via Meshy ----------

export async function meshyGenerate(opts: { apiKey: string; prompt?: string; image?: Blob | null; onStatus: (s: string) => void; signal?: AbortSignal }): Promise<Blob> {
  const H = { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' };
  const isImage = !!opts.image;
  const base = isImage ? 'https://api.meshy.ai/openapi/v1/image-to-3d' : 'https://api.meshy.ai/openapi/v2/text-to-3d';
  const body = isImage
    ? { image_url: 'data:' + (opts.image!.type || 'image/png') + ';base64,' + (await blobToBase64(opts.image!)), enable_pbr: true, should_texture: true }
    : { mode: 'preview', prompt: opts.prompt, art_style: 'realistic', should_remesh: true };
  opts.onStatus('Submitting job…');
  const r = await fetch(base, { method: 'POST', headers: H, body: JSON.stringify(body), signal: opts.signal });
  if (!r.ok) throw new Error(`Meshy ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const id = (await r.json()).result;
  const poll = async (url: string, label: string) => {
    for (let i = 0; i < 200; i++) {
      await new Promise((res) => setTimeout(res, 4000));
      if (opts.signal?.aborted) throw new Error('Cancelled');
      const t = await (await fetch(url, { headers: H, signal: opts.signal })).json();
      opts.onStatus(`${label}: ${t.status?.toLowerCase() ?? '…'} ${t.progress ?? 0}%`);
      if (t.status === 'SUCCEEDED') return t;
      if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(t.task_error?.message || 'Generation failed');
    }
    throw new Error('Timed out');
  };
  let task = await poll(`${base}/${id}`, 'Generating mesh');
  if (!isImage) {
    // Second pass adds textures, like Meshy's own UI.
    const rr = await fetch(base, { method: 'POST', headers: H, body: JSON.stringify({ mode: 'refine', preview_task_id: id, enable_pbr: true }), signal: opts.signal });
    if (rr.ok) {
      const rid = (await rr.json()).result;
      try { task = await poll(`${base}/${rid}`, 'Texturing'); } catch { /* keep the untextured preview */ }
    }
  }
  const url = task.model_urls?.glb;
  if (!url) throw new Error('No GLB in the result');
  opts.onStatus('Downloading model…');
  return await (await fetch(url, { signal: opts.signal })).blob();
}

// ---------- Mesh generation via fal.ai (one key, several top models) ----------

export interface MeshProvider {
  id: string;
  label: string;
  note: string;
  text: boolean;
  image: boolean;
  endpoint: (mode: 'text' | 'image') => string;
  body: (o: { prompt: string; image?: string; hq: boolean }) => any;
  pick: (r: any) => string | undefined;
}

export const MESH_PROVIDERS: MeshProvider[] = [
  {
    id: 'hunyuan', label: 'Hunyuan3D 3.1 Pro', note: 'Best all-round detail and PBR textures. About $0.38 per model on fal.ai.', text: true, image: true,
    endpoint: (m) => `fal-ai/hunyuan-3d/v3.1/pro/${m === 'image' ? 'image-to-3d' : 'text-to-3d'}`,
    body: ({ prompt, image, hq }) => ({
      ...(image ? { input_image_url: image } : { prompt: prompt.slice(0, 1000) }), generate_type: 'Normal', enable_pbr: true, face_count: hq ? 1_000_000 : 500_000,
    }),
    pick: (r) => r?.model_glb?.url ?? r?.model_urls?.glb?.url,
  },
  {
    id: 'rodin', label: 'Rodin (Hyper3D)', note: 'Sculpt-level geometry, clean topology. About $0.40 per model; High detail (4K, high-poly) costs 3x.', text: true, image: true,
    endpoint: () => 'fal-ai/hyper3d/rodin',
    body: ({ prompt, image, hq }) => ({
      ...(image ? { input_image_urls: [image] } : {}), ...(prompt ? { prompt } : {}), geometry_file_format: 'glb', material: 'PBR',
      quality: hq ? 'high' : 'medium', tier: 'Regular', ...(hq ? { generation_adds_on: ['HighPack'] } : {}),
    }),
    pick: (r) => r?.model_mesh?.url,
  },
  {
    id: 'trellis2', label: 'TRELLIS.2 (Microsoft)', note: 'Open model with 4K PBR textures. Image input only, lowest cost.', text: false, image: true,
    endpoint: () => 'fal-ai/trellis-2',
    body: ({ image }) => ({ image_url: image }),
    pick: (r) => r?.model_glb?.url ?? r?.model_mesh?.url ?? r?.glb?.url,
  },
];

export async function falGenerate(opts: { apiKey: string; provider: MeshProvider; prompt: string; image?: Blob | null; hq: boolean; onStatus: (s: string) => void; signal?: AbortSignal }): Promise<Blob> {
  const { provider: p } = opts;
  const mode = opts.image ? 'image' : 'text';
  if (mode === 'text' && !p.text) throw new Error(`${p.label} needs a reference image.`);
  const image = opts.image ? 'data:' + (opts.image.type || 'image/png') + ';base64,' + (await blobToBase64(opts.image)) : undefined;
  const H = { Authorization: `Key ${opts.apiKey}`, 'Content-Type': 'application/json' };
  opts.onStatus(`Sending to ${p.label}…`);
  const sub = await fetch(`https://queue.fal.run/${p.endpoint(mode)}`, { method: 'POST', headers: H, body: JSON.stringify(p.body({ prompt: opts.prompt, image, hq: opts.hq })), signal: opts.signal });
  if (!sub.ok) throw new Error(`fal.ai ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
  const job = await sub.json();
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    if (opts.signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    const st = await (await fetch(job.status_url, { headers: H, signal: opts.signal })).json();
    const secs = Math.round((Date.now() - t0) / 1000);
    opts.onStatus(st.status === 'IN_QUEUE' ? `Queued (position ${st.queue_position ?? '…'}) · ${secs}s` : `Generating with ${p.label} · ${secs}s`);
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.error) throw new Error(st.error || 'Generation failed');
    if (Date.now() - t0 > 15 * 60_000) throw new Error('Timed out after 15 minutes');
  }
  const res = await (await fetch(job.response_url, { headers: H, signal: opts.signal })).json();
  const url = p.pick(res);
  if (!url) throw new Error('The result had no GLB file: ' + JSON.stringify(res).slice(0, 200));
  opts.onStatus('Downloading model…');
  return await (await fetch(url, { signal: opts.signal })).blob();
}
