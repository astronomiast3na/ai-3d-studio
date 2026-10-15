import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Viewport, sceneRefs } from './components/Viewport';
import { Toolbar } from './components/Toolbar';
import { Hierarchy } from './components/Hierarchy';
import { Inspector } from './components/Inspector';
import { ExportPanel } from './components/ExportPanel';
import { AIPanel } from './components/AIPanel';
import { runtime, registry } from './runtime';
import { importFiles } from './io';
import * as THREE from 'three';

const SHORTCUTS: [string, string][] = [
  ['W / E / R', 'Move / rotate / scale gizmo'], ['L', 'Toggle local / world axes'], ['S', 'Toggle snapping'],
  ['F', 'Focus camera on selection'], ['Ctrl/⌘ D', 'Duplicate'], ['Ctrl/⌘ G', 'Group selection'], ['Ctrl/⌘ Shift G', 'Ungroup'],
  ['Delete / Backspace', 'Delete'], ['Ctrl/⌘ Z', 'Undo'], ['Ctrl/⌘ Shift Z / Ctrl Y', 'Redo'], ['H', 'Hide / show selection'],
  ['P', 'Play / stop'], ['Esc', 'Deselect / close'], ['Shift + click', 'Multi-select'], ['Double-click layer', 'Rename'],
  ['Drag layer', 'Reorder / move into group'], ['Drop files', 'Import .glb .gltf .obj .stl .ply images .json'],
];

function focusSelection() {
  const s = useStore.getState();
  const o = registry.get(s.selected[0]);
  const ctl = sceneRefs.controls, cam = sceneRefs.camera as THREE.PerspectiveCamera;
  if (!o || !ctl || !cam) return;
  const box = new THREE.Box3().setFromObject(o);
  const c = box.getCenter(new THREE.Vector3());
  const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.5);
  const dir = cam.position.clone().sub(ctl.target).normalize();
  ctl.target.copy(c);
  cam.position.copy(c).add(dir.multiplyScalar(size * 2.5));
  ctl.update();
}

export default function App() {
  const panel = useStore((s) => s.panel);
  const mode = useStore((s) => s.mode);
  const [dragging, setDragging] = useState(false);

  // Start / stop the interaction runtime with Play mode.
  useEffect(() => {
    if (mode === 'play') {
      // Let React apply the designed transforms first.
      const t = setTimeout(() => runtime.start(useStore.getState().objects), 30);
      return () => { clearTimeout(t); runtime.stop(); };
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (s.mode === 'play') {
        if (e.key === 'Escape' || (e.key.toLowerCase() === 'p' && !mod)) s.set({ mode: 'edit' });
        else runtime.handle('keyDown', null, true, e.key);
        return;
      }
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); s.redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); s.duplicate(s.selected); return; }
      if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? s.selected.forEach((id) => s.ungroup(id)) : s.group(s.selected); return; }
      if (mod && k === 'a') { e.preventDefault(); s.set({ selected: s.objects.map((o) => o.id) }); return; }
      if (mod) return;
      if (k === 'delete' || k === 'backspace') s.remove(s.selected);
      else if (k === 'w') s.set({ gizmo: 'translate' });
      else if (k === 'e') s.set({ gizmo: 'rotate' });
      else if (k === 'r') s.set({ gizmo: 'scale' });
      else if (k === 'l') s.set({ space: s.space === 'local' ? 'world' : 'local' });
      else if (k === 's') s.set({ snap: !s.snap });
      else if (k === 'f') focusSelection();
      else if (k === 'h') s.selected.forEach((id) => s.update(id, (o) => ({ visible: !o.visible })));
      else if (k === 'p') s.set({ mode: 'play', selected: [] });
      else if (k === 't') s.add('text');
      else if (k === 'escape') s.panel ? s.set({ panel: null }) : s.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={'app' + (mode === 'play' ? ' playing' : '')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); importFiles(e.dataTransfer.files); } setDragging(false); }}
    >
      <Toolbar />
      <div className="main">
        {mode === 'edit' && <Hierarchy />}
        <div className="viewport">
          <Viewport />
          {mode === 'play' && <div className="play-badge">Play mode · interact with the scene · Esc to stop</div>}
          {dragging && <div className="drop-overlay">Drop .glb, .gltf, .obj, .stl, .ply, images or a project file</div>}
        </div>
        {mode === 'edit' && <Inspector />}
      </div>
      {panel === 'export' && <ExportPanel />}
      {panel === 'ai' && <AIPanel />}
      {panel === 'shortcuts' && (
        <div className="modal-bg" onMouseDown={() => useStore.getState().set({ panel: null })}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Keyboard shortcuts</h2><button className="icon-btn" onClick={() => useStore.getState().set({ panel: null })}>✕</button></div>
            <div className="modal-body">
              <table className="keys"><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
