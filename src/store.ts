import { create } from 'zustand';
import type { ObjType, ProjectFile, SceneObj, SceneSettings, Vec3 } from './types';
import { defaultScene, makeObject, starterObjects, uid } from './defaults';

type Snapshot = { objects: SceneObj[]; scene: SceneSettings };
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type Panel = null | 'export' | 'ai' | 'shortcuts';

interface State {
  name: string;
  objects: SceneObj[];
  scene: SceneSettings;
  selected: string[];
  gizmo: GizmoMode;
  space: 'local' | 'world';
  snap: boolean;
  mode: 'edit' | 'play';
  panel: Panel;
  rightTab: 'design' | 'interact';
  past: Snapshot[];
  future: Snapshot[];
  lastKey: string | null;
  lastTime: number;

  set: (p: Partial<State>) => void;
  commit: (key?: string) => void;
  undo: () => void;
  redo: () => void;
  add: (type: ObjType, extra?: Partial<SceneObj>) => string;
  addMany: (objs: SceneObj[]) => void;
  update: (id: string, patch: Partial<SceneObj> | ((o: SceneObj) => Partial<SceneObj>), key?: string) => void;
  updateDeep: (id: string, fn: (o: SceneObj) => void, key?: string) => void;
  remove: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;
  group: (ids: string[]) => void;
  ungroup: (id: string) => void;
  move: (id: string, targetId: string | null, where: 'before' | 'after' | 'inside') => void;
  select: (id: string | null, additive?: boolean) => void;
  setScene: (fn: (s: SceneSettings) => void, key?: string) => void;
  load: (p: ProjectFile) => void;
  newProject: () => void;
}

const clone = <T,>(v: T): T => structuredClone(v);

function descendants(objects: SceneObj[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => objects.filter((o) => o.parentId === pid).forEach((c) => { out.push(c.id); walk(c.id); });
  walk(id);
  return out;
}

const SAVE_KEY = 'ai3d.autosave.v1';
function loadSaved(): Partial<State> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ProjectFile;
    return { objects: p.objects, scene: { ...defaultScene(), ...p.scene }, name: p.name };
  } catch {
    return null;
  }
}

const saved = loadSaved();

export const useStore = create<State>((set, get) => ({
  name: saved?.name ?? 'Untitled',
  objects: saved?.objects ?? starterObjects(),
  scene: saved?.scene ?? defaultScene(),
  selected: [],
  gizmo: 'translate',
  space: 'world',
  snap: false,
  mode: 'edit',
  panel: null,
  rightTab: 'design',
  past: [],
  future: [],
  lastKey: null,
  lastTime: 0,

  set: (p) => set(p as any),

  // Push the current state onto the undo stack. Rapid edits with the same key
  // (slider drags, typing) collapse into one history entry.
  commit: (key) => {
    const s = get();
    const now = performance.now();
    if (key && key === s.lastKey && now - s.lastTime < 800) {
      set({ lastTime: now });
      return;
    }
    set({ past: [...s.past.slice(-99), { objects: s.objects, scene: s.scene }], future: [], lastKey: key ?? null, lastTime: now });
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ past: s.past.slice(0, -1), future: [{ objects: s.objects, scene: s.scene }, ...s.future], objects: prev.objects, scene: prev.scene, lastKey: null,
      selected: s.selected.filter((id) => prev.objects.some((o) => o.id === id)) });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ future: s.future.slice(1), past: [...s.past, { objects: s.objects, scene: s.scene }], objects: next.objects, scene: next.scene, lastKey: null });
  },

  add: (type, extra = {}) => {
    get().commit();
    const s = get();
    const o = makeObject(type, extra);
    // New objects go into the selected group, like Spline.
    const sel = s.objects.find((x) => x.id === s.selected[0]);
    if (extra.parentId === undefined && sel?.type === 'group') o.parentId = sel.id;
    set({ objects: [...s.objects, o], selected: [o.id] });
    return o.id;
  },
  addMany: (objs) => {
    get().commit();
    set((s) => ({ objects: [...s.objects, ...objs], selected: objs.filter((o) => !objs.some((p) => p.id === o.parentId)).map((o) => o.id).slice(0, 1) }));
  },
  update: (id, patch, key) => {
    get().commit(key ?? `upd:${id}`);
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...(typeof patch === 'function' ? patch(o) : patch) } : o)) }));
  },
  updateDeep: (id, fn, key) => {
    get().commit(key);
    set((s) => ({ objects: s.objects.map((o) => { if (o.id !== id) return o; const c = clone(o); fn(c); return c; }) }));
  },
  remove: (ids) => {
    if (!ids.length) return;
    get().commit();
    const s = get();
    const all = new Set(ids.flatMap((id) => [id, ...descendants(s.objects, id)]));
    set({ objects: s.objects.filter((o) => !all.has(o.id)), selected: [] });
  },
  duplicate: (ids) => {
    if (!ids.length) return;
    get().commit();
    const s = get();
    const copies: SceneObj[] = [];
    const newTop: string[] = [];
    const copyTree = (id: string, parentId: string | null) => {
      const src = s.objects.find((o) => o.id === id)!;
      const c = clone(src);
      c.id = uid();
      c.parentId = parentId;
      if (parentId === src.parentId) {
        c.name = src.name + ' Copy';
        c.position = [src.position[0] + 0.3, src.position[1], src.position[2] + 0.3] as Vec3;
        newTop.push(c.id);
      }
      copies.push(c);
      s.objects.filter((o) => o.parentId === id).forEach((ch) => copyTree(ch.id, c.id));
    };
    ids.forEach((id) => copyTree(id, s.objects.find((o) => o.id === id)!.parentId));
    set({ objects: [...s.objects, ...copies], selected: newTop });
  },
  group: (ids) => {
    if (!ids.length) return;
    get().commit();
    const s = get();
    const first = s.objects.find((o) => o.id === ids[0])!;
    const g = makeObject('group', { parentId: first.parentId, position: [0, 0, 0] });
    const idx = s.objects.findIndex((o) => o.id === ids[0]);
    const objs = s.objects.map((o) => (ids.includes(o.id) ? { ...o, parentId: g.id } : o));
    objs.splice(idx, 0, g);
    set({ objects: objs, selected: [g.id] });
  },
  ungroup: (id) => {
    const s = get();
    const g = s.objects.find((o) => o.id === id);
    if (!g || g.type !== 'group') return;
    get().commit();
    // Children keep their world placement only approximately: we add the group's offset.
    set({
      objects: s.objects
        .filter((o) => o.id !== id)
        .map((o) => (o.parentId === id ? { ...o, parentId: g.parentId, position: o.position.map((v, i) => v + g.position[i]) as Vec3 } : o)),
      selected: s.objects.filter((o) => o.parentId === id).map((o) => o.id),
    });
  },
  move: (id, targetId, where) => {
    const s = get();
    if (id === targetId) return;
    if (targetId && descendants(s.objects, id).includes(targetId)) return;
    get().commit();
    const objs = s.objects.filter((o) => o.id !== id);
    const me = { ...s.objects.find((o) => o.id === id)! };
    if (!targetId) {
      me.parentId = null;
      objs.push(me);
    } else {
      const target = objs.find((o) => o.id === targetId)!;
      const ti = objs.indexOf(target);
      if (where === 'inside') {
        me.parentId = target.id;
        objs.splice(ti + 1, 0, me);
      } else {
        me.parentId = target.parentId;
        objs.splice(where === 'before' ? ti : ti + 1, 0, me);
      }
    }
    set({ objects: objs });
  },
  select: (id, additive) => {
    if (!id) return set({ selected: [] });
    const s = get();
    if (additive) set({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] });
    else set({ selected: [id] });
  },
  setScene: (fn, key) => {
    get().commit(key ?? 'scene');
    set((s) => { const c = clone(s.scene); fn(c); return { scene: c }; });
  },
  load: (p) => {
    get().commit();
    set({ objects: p.objects, scene: { ...defaultScene(), ...p.scene }, name: p.name || 'Untitled', selected: [] });
  },
  newProject: () => {
    get().commit();
    set({ objects: starterObjects(), scene: defaultScene(), name: 'Untitled', selected: [] });
  },
}));

// Autosave to the browser (per viewer); a failure here never blocks editing.
let saveTimer: any;
useStore.subscribe((s, prev) => {
  if (s.objects === prev.objects && s.scene === prev.scene && s.name === prev.name) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const p: ProjectFile = { app: 'ai-3d-studio', version: 1, name: s.name, objects: s.objects, scene: s.scene };
      localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    } catch {}
  }, 600);
});

export const getObj = (id: string | undefined) => useStore.getState().objects.find((o) => o.id === id);
