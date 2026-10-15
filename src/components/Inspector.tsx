import { useStore } from '../store';
import type { EventDef, MaterialModel, SceneObj, StateDef, Vec3 as V3 } from '../types';
import { Section, Row, Num, Vec3, Slider, Color, Select, Toggle, Text } from './ui';
import { uid } from '../defaults';
import { readAsDataURL } from '../three/models';
import { registry } from '../runtime';
import * as THREE from 'three';

const PARAM_META: Record<string, { step?: number; min?: number; max?: number; int?: boolean; label?: string }> = {
  width: {}, height: {}, depth: { min: 0 }, cornerRadius: { step: 0.01, min: 0, label: 'Corner radius' }, segments: { int: true, min: 1, step: 1 },
  radius: { min: 0.001 }, widthSegments: { int: true, min: 3, step: 1 }, heightSegments: { int: true, min: 2, step: 1 },
  phiLength: { min: 1, max: 360, step: 1, label: 'Sweep°' }, radiusTop: { min: 0, label: 'Top radius' }, radiusBottom: { min: 0, label: 'Bottom radius' },
  radialSegments: { int: true, min: 3, step: 1 }, tube: { min: 0.001 }, tubularSegments: { int: true, min: 3, step: 1 }, arc: { min: 1, max: 360, step: 1, label: 'Arc°' },
  p: { int: true, step: 1, min: 1 }, q: { int: true, step: 1, min: 1 }, length: { min: 0 }, capSegments: { int: true, min: 1, step: 1 },
  detail: { int: true, min: 0, max: 5, step: 1 }, sides: { int: true, min: 3, step: 1 }, innerRadius: { min: 0 }, outerRadius: { min: 0.01 },
  points: { int: true, min: 3, step: 1 }, size: { min: 0.01 }, bevel: { min: 0, step: 0.01 }, curveSegments: { int: true, min: 1, step: 1 },
};

function ShapeParams({ o }: { o: SceneObj }) {
  const update = useStore((s) => s.update);
  const keys = Object.keys(o.params).filter((k) => k !== 'url');
  if (!keys.length) return null;
  const setP = (k: string, v: any) => update(o.id, { params: { ...o.params, [k]: v } }, `p:${o.id}:${k}`);
  return (
    <Section title="Shape">
      {keys.map((k) => {
        const v = o.params[k];
        if (k === 'text') return <Row key={k} label="Text"><Text value={v} onChange={(x) => setP(k, x)} multiline /></Row>;
        if (k === 'font') return <Row key={k} label="Font"><Select value={v} onChange={(x) => setP(k, x)} options={[['helvetiker_bold', 'Helvetiker Bold'], ['helvetiker', 'Helvetiker'], ['optimer', 'Optimer'], ['mono', 'Mono']]} /></Row>;
        if (k === 'align') return <Row key={k} label="Align"><Select value={v} onChange={(x) => setP(k, x)} options={['left', 'center', 'right']} /></Row>;
        const m = PARAM_META[k] ?? {};
        return (
          <Row key={k} label={m.label ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}>
            <Num value={v} step={m.step ?? 0.05} min={m.min} max={m.max} precision={m.int ? 0 : 3} onChange={(x) => setP(k, m.int ? Math.round(x) : x)} />
          </Row>
        );
      })}
    </Section>
  );
}

const MODELS: [MaterialModel, string][] = [
  ['physical', 'Physical'], ['standard', 'Standard'], ['glass', 'Glass'], ['lambert', 'Lambert'], ['phong', 'Phong'],
  ['toon', 'Toon'], ['basic', 'Basic (unlit)'], ['matcap', 'Matcap'], ['normal', 'Normal'],
];

async function pickImage(): Promise<string | null> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.onchange = async () => res(i.files?.[0] ? await readAsDataURL(i.files[0]) : null);
    i.click();
  });
}

function MaterialPanel({ o }: { o: SceneObj }) {
  const updateDeep = useStore((s) => s.updateDeep);
  const m = o.material;
  const set = (k: string, fn: (mm: any) => void) => updateDeep(o.id, (x) => fn(x.material), `m:${o.id}:${k}`);
  const lit = !['basic', 'normal', 'matcap'].includes(m.model);
  const pbr = ['physical', 'standard', 'glass'].includes(m.model);
  return (
    <>
      <Section title="Material">
        {o.type === 'model' && <Row label="Override"><Toggle value={!!m.override} onChange={(v) => set('ov', (x) => (x.override = v))} /></Row>}
        <Row label="Lighting"><Select value={m.model} onChange={(v) => set('model', (x) => (x.model = v))} options={MODELS} /></Row>
        {m.model !== 'normal' && <Row label="Color"><Color value={m.color} onChange={(v) => set('color', (x) => (x.color = v))} /></Row>}
        <Row label="Opacity"><Slider value={m.opacity} onChange={(v) => set('opacity', (x) => (x.opacity = v))} /></Row>
        {pbr && <Row label="Roughness"><Slider value={m.roughness} onChange={(v) => set('rough', (x) => (x.roughness = v))} /></Row>}
        {pbr && m.model !== 'glass' && <Row label="Metalness"><Slider value={m.metalness} onChange={(v) => set('metal', (x) => (x.metalness = v))} /></Row>}
        {m.model === 'matcap' && <Row label="Matcap"><button className="btn sm" onClick={async () => { const u = await pickImage(); if (u) set('matcap', (x) => (x.matcap.url = u)); }}>{m.matcap.url ? 'Replace image' : 'Upload image'}</button></Row>}
        <Row label="Wireframe"><Toggle value={m.wireframe} onChange={(v) => set('wf', (x) => (x.wireframe = v))} /></Row>
        {lit && <Row label="Flat shading"><Toggle value={m.flatShading} onChange={(v) => set('flat', (x) => (x.flatShading = v))} /></Row>}
        <Row label="Double sided"><Toggle value={m.doubleSide} onChange={(v) => set('ds', (x) => (x.doubleSide = v))} /></Row>
      </Section>
      {lit && (
        <Section title="Emission" defaultOpen={m.emissive !== '#000000'}>
          <Row label="Color"><Color value={m.emissive} onChange={(v) => set('em', (x) => (x.emissive = v))} /></Row>
          <Row label="Intensity"><Slider value={m.emissiveIntensity} max={10} step={0.1} onChange={(v) => set('emi', (x) => (x.emissiveIntensity = v))} /></Row>
        </Section>
      )}
      {(m.model === 'physical' || m.model === 'glass') && (
        <Section title="Glass & coating" defaultOpen={m.model === 'glass' || m.transmission > 0 || m.clearcoat > 0}>
          {m.model === 'physical' && <Row label="Transmission"><Slider value={m.transmission} onChange={(v) => set('tr', (x) => (x.transmission = v))} /></Row>}
          <Row label="IOR"><Slider value={m.ior} min={1} max={2.33} onChange={(v) => set('ior', (x) => (x.ior = v))} /></Row>
          <Row label="Thickness"><Slider value={m.thickness} max={5} step={0.05} onChange={(v) => set('th', (x) => (x.thickness = v))} /></Row>
          {m.model === 'physical' && <Row label="Clearcoat"><Slider value={m.clearcoat} onChange={(v) => set('cc', (x) => (x.clearcoat = v))} /></Row>}
          {m.model === 'physical' && <Row label="Sheen"><Slider value={m.sheen} onChange={(v) => set('sh', (x) => (x.sheen = v))} /></Row>}
          <Row label="Iridescence"><Slider value={m.iridescence} onChange={(v) => set('ir', (x) => (x.iridescence = v))} /></Row>
        </Section>
      )}
      <Section title="Layers" defaultOpen={m.gradient.enabled || m.noise.enabled || m.fresnel.enabled || !!m.texture.url}>
        <Row label="Gradient"><Toggle value={m.gradient.enabled} onChange={(v) => set('g', (x) => (x.gradient.enabled = v))} /></Row>
        {m.gradient.enabled && (
          <>
            <Row label="Type"><Select value={m.gradient.type} onChange={(v) => set('gt', (x) => (x.gradient.type = v))} options={['linear', 'radial']} /></Row>
            <Row label="From"><Color value={m.gradient.colorA} onChange={(v) => set('ga', (x) => (x.gradient.colorA = v))} /></Row>
            <Row label="To"><Color value={m.gradient.colorB} onChange={(v) => set('gb', (x) => (x.gradient.colorB = v))} /></Row>
            {m.gradient.type === 'linear' && <Row label="Angle"><Slider value={m.gradient.angle} min={0} max={360} step={1} onChange={(v) => set('gan', (x) => (x.gradient.angle = v))} /></Row>}
          </>
        )}
        <Row label="Noise"><Toggle value={m.noise.enabled} onChange={(v) => set('n', (x) => (x.noise.enabled = v))} /></Row>
        {m.noise.enabled && (
          <>
            <Row label="Scale"><Slider value={m.noise.scale} min={1} max={64} step={1} onChange={(v) => set('ns', (x) => (x.noise.scale = v))} /></Row>
            <Row label="Amount"><Slider value={m.noise.amount} onChange={(v) => set('na', (x) => (x.noise.amount = v))} /></Row>
            <Row label="Color"><Color value={m.noise.color} onChange={(v) => set('nc', (x) => (x.noise.color = v))} /></Row>
          </>
        )}
        {lit && <Row label="Fresnel"><Toggle value={m.fresnel.enabled} onChange={(v) => set('f', (x) => (x.fresnel.enabled = v))} /></Row>}
        {lit && m.fresnel.enabled && (
          <>
            <Row label="Color"><Color value={m.fresnel.color} onChange={(v) => set('fc', (x) => (x.fresnel.color = v))} /></Row>
            <Row label="Power"><Slider value={m.fresnel.power} min={0.5} max={8} step={0.1} onChange={(v) => set('fp', (x) => (x.fresnel.power = v))} /></Row>
            <Row label="Intensity"><Slider value={m.fresnel.intensity} max={5} step={0.05} onChange={(v) => set('fi', (x) => (x.fresnel.intensity = v))} /></Row>
          </>
        )}
        <Row label="Image">
          <div className="inline">
            <button className="btn sm" onClick={async () => { const u = await pickImage(); if (u) set('tex', (x) => (x.texture.url = u)); }}>{m.texture.url ? 'Replace' : 'Upload'}</button>
            {m.texture.url && <button className="btn sm ghost" onClick={() => set('texr', (x) => (x.texture.url = null))}>Remove</button>}
          </div>
        </Row>
        {m.texture.url && <Row label="Repeat"><Num value={m.texture.repeat} min={0.1} step={0.1} onChange={(v) => set('rep', (x) => (x.texture.repeat = v))} /></Row>}
      </Section>
    </>
  );
}

function LightPanel({ o }: { o: SceneObj }) {
  const updateDeep = useStore((s) => s.updateDeep);
  const l = o.light!;
  const set = (k: string, fn: (x: any) => void) => updateDeep(o.id, (x) => fn(x.light), `l:${o.id}:${k}`);
  return (
    <Section title="Light">
      <Row label="Color"><Color value={l.color} onChange={(v) => set('c', (x) => (x.color = v))} /></Row>
      <Row label="Intensity"><Slider value={l.intensity} max={o.type === 'directionalLight' ? 10 : 200} step={0.1} onChange={(v) => set('i', (x) => (x.intensity = v))} /></Row>
      {o.type !== 'directionalLight' && <Row label="Distance"><Num value={l.distance} min={0} step={0.5} onChange={(v) => set('d', (x) => (x.distance = v))} /></Row>}
      {o.type === 'spotLight' && <Row label="Angle"><Slider value={l.angle} min={1} max={90} step={1} onChange={(v) => set('a', (x) => (x.angle = v))} /></Row>}
      {o.type === 'spotLight' && <Row label="Penumbra"><Slider value={l.penumbra} onChange={(v) => set('p', (x) => (x.penumbra = v))} /></Row>}
      <Row label="Shadows"><Toggle value={l.castShadow} onChange={(v) => set('s', (x) => (x.castShadow = v))} /></Row>
    </Section>
  );
}

function DesignTab({ o }: { o: SceneObj }) {
  const update = useStore((s) => s.update);
  const isLight = o.type.endsWith('Light');
  return (
    <>
      <Section title="Transform">
        <Row label="Position"><Vec3 value={o.position} onChange={(v) => update(o.id, { position: v }, `pos:${o.id}`)} /></Row>
        <Row label="Rotation"><Vec3 value={o.rotation} step={1} precision={1} onChange={(v) => update(o.id, { rotation: v }, `rot:${o.id}`)} /></Row>
        {!isLight && <Row label="Scale"><Vec3 value={o.scale} step={0.05} onChange={(v) => update(o.id, { scale: v }, `scl:${o.id}`)} /></Row>}
        {!isLight && (
          <Row label="Uniform">
            <Num value={o.scale[0]} step={0.05} min={0.001} onChange={(v) => update(o.id, { scale: [v, v, v] }, `scl:${o.id}`)} />
          </Row>
        )}
      </Section>
      {isLight ? <LightPanel o={o} /> : o.type === 'group' ? null : (
        <>
          <ShapeParams o={o} />
          <MaterialPanel o={o} />
          <Section title="Shadows" defaultOpen={false}>
            <Row label="Cast"><Toggle value={o.castShadow} onChange={(v) => update(o.id, { castShadow: v })} /></Row>
            <Row label="Receive"><Toggle value={o.receiveShadow} onChange={(v) => update(o.id, { receiveShadow: v })} /></Row>
          </Section>
        </>
      )}
    </>
  );
}

// ---------- Interact tab: states + events ----------

const TRIGGERS: [EventDef['trigger'], string][] = [
  ['start', 'Start'], ['mouseDown', 'Mouse Down'], ['mouseHover', 'Mouse Hover'], ['keyDown', 'Key Down'], ['scroll', 'Scroll'], ['mouseMove', 'Mouse Move'],
];

function previewPose(o: SceneObj, s: StateDef | null) {
  const n = registry.get(o.id);
  if (!n) return;
  const p = s ?? o;
  const R = Math.PI / 180;
  n.position.set(...p.position);
  n.rotation.set(p.rotation[0] * R, p.rotation[1] * R, p.rotation[2] * R);
  n.scale.set(...p.scale);
  n.traverse((c: any) => { if (c.isMesh && c.userData.ownerId === o.id && c.material?.color && !c.material.map) c.material.color = new THREE.Color(s?.color ?? o.material.color); });
}

function InteractTab({ o }: { o: SceneObj }) {
  const updateDeep = useStore((s) => s.updateDeep);
  const objects = useStore((s) => s.objects);
  const addState = () => updateDeep(o.id, (x) => {
    x.states.push({ id: uid('st'), name: `State ${x.states.length + 1}`, position: [...o.position] as V3, rotation: [...o.rotation] as V3, scale: [...o.scale] as V3, color: o.material.color });
  });
  const addEvent = () => updateDeep(o.id, (x) => {
    x.events.push({ id: uid('ev'), trigger: 'mouseDown', stateId: x.states[0]?.id ?? 'base', duration: 600, delay: 0, easing: 'easeInOut', mode: 'toggle' });
  });
  const stateOptions = (target: SceneObj): [string, string][] => [['base', 'Base State'], ...target.states.map((s) => [s.id, s.name] as [string, string])];
  return (
    <>
      <Section title="States" right={<button className="icon-btn" title="Add state" onClick={addState}>＋</button>}>
        <div className="hint">The Base State is the object as designed. Add states, then use events to animate between them.</div>
        {o.states.map((s, i) => (
          <div className="card" key={s.id}>
            <div className="card-head">
              <input className="text flat" value={s.name} onChange={(e) => updateDeep(o.id, (x) => (x.states[i].name = e.target.value), `sn:${s.id}`)} onKeyDown={(e) => e.stopPropagation()} />
              <button className="icon-btn" title="Preview" onMouseDown={() => previewPose(o, s)} onMouseUp={() => previewPose(o, null)} onMouseLeave={() => previewPose(o, null)}>◉</button>
              <button className="icon-btn" title="Capture current transform" onClick={() => updateDeep(o.id, (x) => { x.states[i].position = [...o.position] as V3; x.states[i].rotation = [...o.rotation] as V3; x.states[i].scale = [...o.scale] as V3; })}>⤓</button>
              <button className="icon-btn" title="Delete state" onClick={() => updateDeep(o.id, (x) => { x.states.splice(i, 1); x.events = x.events.filter((e) => e.stateId !== s.id); })}>✕</button>
            </div>
            <Row label="Position"><Vec3 value={s.position} onChange={(v) => updateDeep(o.id, (x) => (x.states[i].position = v), `sp:${s.id}`)} /></Row>
            <Row label="Rotation"><Vec3 value={s.rotation} step={1} precision={1} onChange={(v) => updateDeep(o.id, (x) => (x.states[i].rotation = v), `sr:${s.id}`)} /></Row>
            <Row label="Scale"><Vec3 value={s.scale} step={0.05} onChange={(v) => updateDeep(o.id, (x) => (x.states[i].scale = v), `ss:${s.id}`)} /></Row>
            <Row label="Color"><Color value={s.color ?? o.material.color} onChange={(v) => updateDeep(o.id, (x) => (x.states[i].color = v), `sc:${s.id}`)} /></Row>
            <Row label="Opacity"><Slider value={s.opacity ?? o.material.opacity} onChange={(v) => updateDeep(o.id, (x) => (x.states[i].opacity = v), `so:${s.id}`)} /></Row>
          </div>
        ))}
      </Section>
      <Section title="Events" right={<button className="icon-btn" title="Add event" onClick={addEvent}>＋</button>}>
        {!o.events.length && <div className="hint">No events. Add one to make this object react in Play mode and in exported web pages.</div>}
        {o.events.map((ev, i) => {
          const target = objects.find((x) => x.id === (ev.targetId || o.id)) ?? o;
          const set = (fn: (e: EventDef) => void, k = 'e') => updateDeep(o.id, (x) => fn(x.events[i]), `ev:${ev.id}:${k}`);
          return (
            <div className="card" key={ev.id}>
              <div className="card-head">
                <Select value={ev.trigger} onChange={(v) => set((e) => (e.trigger = v))} options={TRIGGERS} />
                <button className="icon-btn" title="Delete event" onClick={() => updateDeep(o.id, (x) => x.events.splice(i, 1))}>✕</button>
              </div>
              {ev.trigger === 'keyDown' && <Row label="Key"><Text value={ev.key ?? ''} placeholder="any key" onChange={(v) => set((e) => (e.key = v), 'k')} /></Row>}
              <Row label="Target"><Select value={ev.targetId || o.id} onChange={(v) => set((e) => (e.targetId = v === o.id ? undefined : v))} options={objects.filter((x) => !x.type.endsWith('Light')).map((x) => [x.id, x.id === o.id ? `${x.name} (self)` : x.name] as [string, string])} /></Row>
              {ev.trigger === 'mouseMove' ? (
                <Row label="Action"><Select value={ev.follow ?? 'lookAt'} onChange={(v) => set((e) => (e.follow = v))} options={[['lookAt', 'Look at cursor'], ['follow', 'Follow cursor']]} /></Row>
              ) : (
                <>
                  <Row label="To state"><Select value={ev.stateId} onChange={(v) => set((e) => (e.stateId = v))} options={stateOptions(target)} /></Row>
                  {ev.trigger !== 'scroll' && <Row label="Mode"><Select value={ev.mode} onChange={(v) => set((e) => (e.mode = v))} options={[['toggle', 'Toggle'], ['once', 'Once'], ['loop', 'Loop'], ['pingpong', 'Ping-pong']]} /></Row>}
                  <Row label="Easing"><Select value={ev.easing} onChange={(v) => set((e) => (e.easing = v))} options={[['linear', 'Linear'], ['easeIn', 'Ease in'], ['easeOut', 'Ease out'], ['easeInOut', 'Ease in-out'], ['spring', 'Spring'], ['bounce', 'Bounce']]} /></Row>
                  {ev.trigger !== 'scroll' && <Row label="Duration"><Num value={ev.duration} step={50} min={0} precision={0} suffix="ms" onChange={(v) => set((e) => (e.duration = v), 'd')} /></Row>}
                  {ev.trigger !== 'scroll' && <Row label="Delay"><Num value={ev.delay} step={50} min={0} precision={0} suffix="ms" onChange={(v) => set((e) => (e.delay = v), 'dl')} /></Row>}
                </>
              )}
            </div>
          );
        })}
      </Section>
    </>
  );
}

// ---------- Scene settings (nothing selected) ----------

function ScenePanel() {
  const scene = useStore((s) => s.scene);
  const setScene = useStore((s) => s.setScene);
  const name = useStore((s) => s.name);
  const st = useStore((s) => s.set);
  const p = scene.post;
  const S = (k: string, fn: (s: any) => void) => setScene(fn, `sc:${k}`);
  return (
    <>
      <Section title="Project">
        <Row label="Name"><Text value={name} onChange={(v) => st({ name: v })} /></Row>
      </Section>
      <Section title="Background">
        <Row label="Color"><Color value={scene.background} onChange={(v) => S('bg', (s) => (s.background = v))} /></Row>
        <Row label="Transparent"><Toggle value={scene.transparentBg} onChange={(v) => S('tbg', (s) => (s.transparentBg = v))} /></Row>
      </Section>
      <Section title="Lighting">
        <Row label="Environment"><Select value={scene.environment} onChange={(v) => S('env', (s) => (s.environment = v))} options={[['studio', 'Studio'], ['none', 'None']]} /></Row>
        <Row label="Env intensity"><Slider value={scene.envIntensity} max={3} onChange={(v) => S('envi', (s) => (s.envIntensity = v))} /></Row>
        <Row label="Ambient"><Color value={scene.ambientColor} onChange={(v) => S('amc', (s) => (s.ambientColor = v))} /></Row>
        <Row label="Ambient int."><Slider value={scene.ambientIntensity} max={3} onChange={(v) => S('ami', (s) => (s.ambientIntensity = v))} /></Row>
        <Row label="Shadows"><Toggle value={scene.shadows} onChange={(v) => S('sh', (s) => (s.shadows = v))} /></Row>
        <Row label="Softness"><Slider value={scene.shadowSoftness} min={0} max={10} step={0.5} onChange={(v) => S('shs', (s) => (s.shadowSoftness = v))} /></Row>
      </Section>
      <Section title="Fog" defaultOpen={scene.fog.enabled}>
        <Row label="Enabled"><Toggle value={scene.fog.enabled} onChange={(v) => S('fog', (s) => (s.fog.enabled = v))} /></Row>
        <Row label="Color"><Color value={scene.fog.color} onChange={(v) => S('fogc', (s) => (s.fog.color = v))} /></Row>
        <Row label="Near"><Num value={scene.fog.near} min={0} onChange={(v) => S('fogn', (s) => (s.fog.near = v))} /></Row>
        <Row label="Far"><Num value={scene.fog.far} min={0} onChange={(v) => S('fogf', (s) => (s.fog.far = v))} /></Row>
      </Section>
      <Section title="Camera">
        <Row label="Projection"><Select value={scene.camera} onChange={(v) => S('cam', (s) => (s.camera = v))} options={[['perspective', 'Perspective'], ['orthographic', 'Orthographic']]} /></Row>
        {scene.camera === 'perspective' && <Row label="Field of view"><Slider value={scene.fov} min={10} max={100} step={1} onChange={(v) => S('fov', (s) => (s.fov = v))} /></Row>}
        <Row label="Grid"><Toggle value={scene.grid} onChange={(v) => S('grid', (s) => (s.grid = v))} /></Row>
      </Section>
      <Section title="Post-processing" defaultOpen={false}>
        <Row label="Tone mapping"><Toggle value={p.toneMapping} onChange={(v) => S('tm', (s) => (s.post.toneMapping = v))} /></Row>
        <Row label="Bloom"><Toggle value={p.bloom.enabled} onChange={(v) => S('bl', (s) => (s.post.bloom.enabled = v))} /></Row>
        {p.bloom.enabled && <Row label="Intensity"><Slider value={p.bloom.intensity} max={4} onChange={(v) => S('bli', (s) => (s.post.bloom.intensity = v))} /></Row>}
        {p.bloom.enabled && <Row label="Threshold"><Slider value={p.bloom.threshold} onChange={(v) => S('blt', (s) => (s.post.bloom.threshold = v))} /></Row>}
        <Row label="Depth of field"><Toggle value={p.dof.enabled} onChange={(v) => S('dof', (s) => (s.post.dof.enabled = v))} /></Row>
        {p.dof.enabled && <Row label="Focus"><Slider value={p.dof.focus} max={0.2} step={0.001} onChange={(v) => S('doff', (s) => (s.post.dof.focus = v))} /></Row>}
        {p.dof.enabled && <Row label="Blur"><Slider value={p.dof.blur} max={10} step={0.1} onChange={(v) => S('dofb', (s) => (s.post.dof.blur = v))} /></Row>}
        <Row label="Vignette"><Toggle value={p.vignette.enabled} onChange={(v) => S('vg', (s) => (s.post.vignette.enabled = v))} /></Row>
        {p.vignette.enabled && <Row label="Darkness"><Slider value={p.vignette.darkness} onChange={(v) => S('vgd', (s) => (s.post.vignette.darkness = v))} /></Row>}
        <Row label="Noise"><Toggle value={p.noise.enabled} onChange={(v) => S('no', (s) => (s.post.noise.enabled = v))} /></Row>
        {p.noise.enabled && <Row label="Opacity"><Slider value={p.noise.opacity} max={0.5} onChange={(v) => S('noo', (s) => (s.post.noise.opacity = v))} /></Row>}
        <Row label="Chromatic ab."><Toggle value={p.chromatic.enabled} onChange={(v) => S('ca', (s) => (s.post.chromatic.enabled = v))} /></Row>
        {p.chromatic.enabled && <Row label="Offset"><Slider value={p.chromatic.offset} max={0.02} step={0.0005} onChange={(v) => S('cao', (s) => (s.post.chromatic.offset = v))} /></Row>}
      </Section>
      <Section title="Play settings" defaultOpen={false}>
        <Row label="Orbit"><Toggle value={scene.play.orbit} onChange={(v) => S('po', (s) => (s.play.orbit = v))} /></Row>
        <Row label="Zoom"><Toggle value={scene.play.zoom} onChange={(v) => S('pz', (s) => (s.play.zoom = v))} /></Row>
        <Row label="Pan"><Toggle value={scene.play.pan} onChange={(v) => S('pp', (s) => (s.play.pan = v))} /></Row>
        <Row label="Auto-rotate"><Toggle value={scene.play.autoRotate} onChange={(v) => S('par', (s) => (s.play.autoRotate = v))} /></Row>
      </Section>
    </>
  );
}

export function Inspector() {
  const selected = useStore((s) => s.selected);
  const objects = useStore((s) => s.objects);
  const tab = useStore((s) => s.rightTab);
  const set = useStore((s) => s.set);
  const o = objects.find((x) => x.id === selected[0]);
  return (
    <aside className="panel right">
      <div className="tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => set({ rightTab: 'design' })}>Design</button>
        <button className={tab === 'interact' ? 'active' : ''} onClick={() => set({ rightTab: 'interact' })} disabled={!o}>Interact</button>
      </div>
      <div className="panel-scroll">
        {!o ? <ScenePanel /> : (
          <>
            <div className="obj-title">{o.name}<span className="obj-type">{o.type}</span>{selected.length > 1 && <span className="obj-type">+{selected.length - 1} more</span>}</div>
            {tab === 'design' ? <DesignTab o={o} /> : <InteractTab o={o} />}
          </>
        )}
      </div>
    </aside>
  );
}
