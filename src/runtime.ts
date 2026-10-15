import * as THREE from 'three';
import type { EventDef, SceneObj, StateDef, Easing, Vec3 } from './types';

// The Play-mode engine: states + events, like Spline's interaction system.
// It drives Object3Ds directly and never writes to the editor store, so
// leaving Play mode restores the designed scene.

export const registry = new Map<string, THREE.Object3D>();

type Pose = { position: Vec3; rotation: Vec3; scale: Vec3; color?: string; opacity?: number };

interface Anim {
  from: Pose;
  to: Pose;
  t0: number;
  dur: number;
  easing: Easing;
  done?: () => void;
}

export const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  spring: (t) => (t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 3.2)),
  bounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

const D2R = Math.PI / 180;

function meshesOf(o: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  o.traverse((c: any) => { if (c.isMesh && !c.userData.helper && c.userData.ownerId === o.userData.objId) out.push(c); });
  return out;
}

export class Runtime {
  objects: SceneObj[] = [];
  anims = new Map<string, Anim>();
  toggles = new Map<string, boolean>();
  current = new Map<string, Pose>();
  timers: any[] = [];
  pointer = new THREE.Vector2();
  scroll = 0;
  running = false;

  basePose(o: SceneObj): Pose {
    return { position: o.position, rotation: o.rotation, scale: o.scale, color: o.material.color, opacity: o.material.opacity };
  }

  statePose(o: SceneObj, stateId: string): Pose {
    if (stateId === 'base') return this.basePose(o);
    const s = o.states.find((x) => x.id === stateId) as StateDef | undefined;
    if (!s) return this.basePose(o);
    return { position: s.position, rotation: s.rotation, scale: s.scale, color: s.color ?? o.material.color, opacity: s.opacity ?? o.material.opacity };
  }

  start(objects: SceneObj[]) {
    this.stop();
    this.objects = objects;
    this.running = true;
    this.scroll = 0;
    for (const o of objects) this.current.set(o.id, this.basePose(o));
    for (const o of objects) for (const ev of o.events) if (ev.trigger === 'start') this.fire(o, ev, true);
  }

  stop() {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.anims.clear();
    this.toggles.clear();
    // Restore designed poses.
    for (const o of this.objects) this.apply(o.id, this.basePose(o));
    this.current.clear();
  }

  private target(owner: SceneObj, ev: EventDef) {
    return this.objects.find((x) => x.id === (ev.targetId || owner.id)) ?? owner;
  }

  transition(t: SceneObj, to: Pose, ev: EventDef, done?: () => void) {
    const go = () => {
      if (!this.running) return;
      const from = this.current.get(t.id) ?? this.basePose(t);
      this.anims.set(t.id, { from, to, t0: performance.now(), dur: Math.max(1, ev.duration), easing: ev.easing, done });
    };
    if (ev.delay > 0) this.timers.push(setTimeout(go, ev.delay));
    else go();
  }

  fire(owner: SceneObj, ev: EventDef, on = true) {
    const t = this.target(owner, ev);
    const statePose = this.statePose(t, ev.stateId);
    const base = this.basePose(t);
    switch (ev.mode) {
      case 'once':
        if (on) this.transition(t, statePose, ev);
        break;
      case 'toggle': {
        if (ev.trigger === 'mouseHover') {
          this.transition(t, on ? statePose : base, ev);
        } else {
          const st = !this.toggles.get(ev.id);
          this.toggles.set(ev.id, st);
          this.transition(t, st ? statePose : base, ev);
        }
        break;
      }
      case 'loop': {
        const loop = () => { this.apply(t.id, base); this.current.set(t.id, base); this.transition(t, statePose, { ...ev, delay: 0 }, loop); };
        if (on) this.transition(t, statePose, ev, loop);
        break;
      }
      case 'pingpong': {
        let forward = true;
        const step = () => { forward = !forward; this.transition(t, forward ? statePose : base, { ...ev, delay: 0 }, step); };
        if (on) this.transition(t, statePose, ev, step);
        break;
      }
    }
  }

  handle(trigger: string, objId: string | null, on = true, key?: string) {
    if (!this.running) return;
    for (const o of this.objects) {
      for (const ev of o.events) {
        if (ev.trigger !== trigger) continue;
        if ((trigger === 'mouseDown' || trigger === 'mouseHover') && o.id !== objId) continue;
        if (trigger === 'keyDown' && ev.key && ev.key.toLowerCase() !== (key || '').toLowerCase()) continue;
        if (trigger === 'mouseHover' && ev.mode !== 'toggle' && !on) continue;
        this.fire(o, ev, on);
      }
    }
  }

  onScroll(delta: number) {
    this.scroll = Math.min(1, Math.max(0, this.scroll + delta / 1500));
  }

  apply(id: string, p: Pose) {
    const obj = registry.get(id);
    if (!obj) return;
    obj.position.set(...p.position);
    obj.rotation.set(p.rotation[0] * D2R, p.rotation[1] * D2R, p.rotation[2] * D2R);
    obj.scale.set(...p.scale);
    if (p.color || p.opacity !== undefined) {
      for (const m of meshesOf(obj)) {
        const mat: any = m.material;
        if (p.color && mat.color && !mat.map) mat.color.set(p.color);
        if (p.opacity !== undefined && 'opacity' in mat) {
          mat.opacity = p.opacity;
          mat.transparent = p.opacity < 1 || mat.transparent;
        }
      }
    }
  }

  tick(now: number) {
    if (!this.running) return;
    for (const [id, a] of this.anims) {
      const raw = Math.min(1, (now - a.t0) / a.dur);
      const k = EASINGS[a.easing](raw);
      const lerp3 = (x: Vec3, y: Vec3) => x.map((v, i) => v + (y[i] - v) * k) as Vec3;
      const c1 = new THREE.Color(a.from.color ?? '#fff'), c2 = new THREE.Color(a.to.color ?? a.from.color ?? '#fff');
      const pose: Pose = {
        position: lerp3(a.from.position, a.to.position),
        rotation: lerp3(a.from.rotation, a.to.rotation),
        scale: lerp3(a.from.scale, a.to.scale),
        color: a.to.color && a.to.color !== a.from.color ? '#' + c1.lerp(c2, Math.min(1, Math.max(0, k))).getHexString() : a.from.color,
        opacity: (a.from.opacity ?? 1) + ((a.to.opacity ?? 1) - (a.from.opacity ?? 1)) * k,
      };
      this.current.set(id, pose);
      this.apply(id, pose);
      if (raw >= 1) {
        this.anims.delete(id);
        this.current.set(id, a.to);
        a.done?.();
      }
    }
    // Continuous events: scroll-driven and cursor-driven.
    for (const o of this.objects) {
      for (const ev of o.events) {
        const t = this.target(o, ev);
        if (ev.trigger === 'scroll') {
          const base = this.basePose(t), st = this.statePose(t, ev.stateId);
          const k = EASINGS[ev.easing](this.scroll);
          const l = (x: Vec3, y: Vec3) => x.map((v, i) => v + (y[i] - v) * k) as Vec3;
          this.apply(t.id, { position: l(base.position, st.position), rotation: l(base.rotation, st.rotation), scale: l(base.scale, st.scale) });
        } else if (ev.trigger === 'mouseMove') {
          const obj = registry.get(t.id);
          if (!obj) continue;
          const cur = this.current.get(t.id) ?? this.basePose(t);
          if (ev.follow === 'follow') {
            const tx = cur.position[0] + this.pointer.x * 2, ty = cur.position[1] + this.pointer.y * 1.2;
            obj.position.x += (tx - obj.position.x) * 0.12;
            obj.position.y += (ty - obj.position.y) * 0.12;
          } else {
            const ry = cur.rotation[1] * D2R + this.pointer.x * 0.6, rx = cur.rotation[0] * D2R - this.pointer.y * 0.4;
            obj.rotation.y += (ry - obj.rotation.y) * 0.12;
            obj.rotation.x += (rx - obj.rotation.x) * 0.12;
          }
        }
      }
    }
  }
}

export const runtime = new Runtime();
