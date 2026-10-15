import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { ObjType } from '../types';
import { importFiles, saveProject } from '../io';

type MenuItem = [ObjType, string, string];
const SHAPES: MenuItem[] = [
  ['cube', 'Cube', '◼'], ['sphere', 'Sphere', '●'], ['cylinder', 'Cylinder', '▮'], ['cone', 'Cone', '▲'], ['torus', 'Torus', '◯'],
  ['torusKnot', 'Torus Knot', '∞'], ['capsule', 'Capsule', '⬭'], ['icosahedron', 'Icosahedron', '⬟'], ['pyramid', 'Pyramid', '△'], ['plane', 'Plane', '▬'],
];
const SHAPES_2D: MenuItem[] = [['roundedRect', 'Rectangle', '▢'], ['star', 'Star', '★'], ['polygon', 'Polygon', '⬡'], ['heart', 'Heart', '♥'], ['ring', 'Ring', '◎']];
const LIGHTS: MenuItem[] = [['directionalLight', 'Directional', '☀'], ['pointLight', 'Point', '✹'], ['spotLight', 'Spot', '◭']];

function Menu({ label, icon, items, onPick }: { label: string; icon: string; items: MenuItem[]; onPick: (t: ObjType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="menu" ref={ref}>
      <button className={'tool' + (open ? ' active' : '')} title={label} onClick={() => setOpen(!open)}><span className="ti">{icon}</span><span className="tl">{label}</span><span className="caret">▾</span></button>
      {open && (
        <div className="menu-pop">
          {items.map(([t, l, i]) => (
            <button key={t} onClick={() => { onPick(t); setOpen(false); }}><span className="mi">{i}</span>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const add = useStore((s) => s.add);
  const gizmo = useStore((s) => s.gizmo);
  const space = useStore((s) => s.space);
  const snap = useStore((s) => s.snap);
  const mode = useStore((s) => s.mode);
  const set = useStore((s) => s.set);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const name = useStore((s) => s.name);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const newProject = useStore((s) => s.newProject);

  return (
    <header className="toolbar">
      <div className="tb-left">
        <div className="menu">
          <button className="logo" onClick={() => setFileOpen(!fileOpen)}>◆ <span>{name}</span> ▾</button>
          {fileOpen && (
            <div className="menu-pop" onMouseLeave={() => setFileOpen(false)}>
              <button onClick={() => { newProject(); setFileOpen(false); }}>New scene</button>
              <button onClick={() => { fileRef.current?.click(); setFileOpen(false); }}>Open / import file…</button>
              <button onClick={() => { saveProject(); setFileOpen(false); }}>Save project (.json)</button>
              <button onClick={() => { set({ panel: 'shortcuts' }); setFileOpen(false); }}>Keyboard shortcuts</button>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" hidden multiple accept=".glb,.gltf,.obj,.stl,.ply,.json,image/*" onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = ''; }} />
        <div className="sep" />
        <button className={'tool' + (gizmo === 'translate' ? ' active' : '')} title="Move (W)" onClick={() => set({ gizmo: 'translate' })}><span className="ti">✥</span></button>
        <button className={'tool' + (gizmo === 'rotate' ? ' active' : '')} title="Rotate (E)" onClick={() => set({ gizmo: 'rotate' })}><span className="ti">⟳</span></button>
        <button className={'tool' + (gizmo === 'scale' ? ' active' : '')} title="Scale (R)" onClick={() => set({ gizmo: 'scale' })}><span className="ti">⤢</span></button>
        <button className={'tool' + (space === 'local' ? ' active' : '')} title="Local / world axes (L)" onClick={() => set({ space: space === 'local' ? 'world' : 'local' })}><span className="ti sm">{space === 'local' ? 'LOC' : 'WLD'}</span></button>
        <button className={'tool' + (snap ? ' active' : '')} title="Snap (S)" onClick={() => set({ snap: !snap })}><span className="ti">⌗</span></button>
      </div>
      <div className="tb-center">
        <Menu label="Shapes" icon="◼" items={SHAPES} onPick={(t) => add(t)} />
        <Menu label="2D Extrude" icon="★" items={SHAPES_2D} onPick={(t) => add(t)} />
        <button className="tool" title="3D Text (T)" onClick={() => add('text')}><span className="ti">T</span><span className="tl">Text</span></button>
        <Menu label="Light" icon="☀" items={LIGHTS} onPick={(t) => add(t)} />
        <button className="tool" title="Empty group" onClick={() => add('group')}><span className="ti">▣</span><span className="tl">Group</span></button>
        <button className="tool" title="Import 3D model or image" onClick={() => fileRef.current?.click()}><span className="ti">⬢</span><span className="tl">Import</span></button>
        <button className="tool ai" title="Generate with AI" onClick={() => set({ panel: 'ai' })}><span className="ti">✦</span><span className="tl">AI Generate</span></button>
      </div>
      <div className="tb-right">
        <button className="tool" title="Undo (Ctrl+Z)" disabled={!past} onClick={undo}><span className="ti">↶</span></button>
        <button className="tool" title="Redo (Ctrl+Shift+Z)" disabled={!future} onClick={redo}><span className="ti">↷</span></button>
        <button className={'btn ' + (mode === 'play' ? 'danger' : 'ghost')} onClick={() => set({ mode: mode === 'play' ? 'edit' : 'play', selected: [] })}>{mode === 'play' ? '■ Stop' : '▶ Play'}</button>
        <button className="btn primary" onClick={() => set({ panel: 'export' })}>Export</button>
      </div>
    </header>
  );
}
