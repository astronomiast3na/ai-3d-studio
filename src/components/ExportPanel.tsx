import { useState } from 'react';
import { useStore } from '../store';
import { export3D, exportImage, exportViewer, recordVideo, saveProject, codeSnippets, saveFile } from '../io';

type Tab = 'web' | 'code' | '3d' | 'media' | 'project';

export function ExportPanel() {
  const set = useStore((s) => s.set);
  const [tab, setTab] = useState<Tab>('web');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [secs, setSecs] = useState(5);
  const [codeTab, setCodeTab] = useState<'react' | 'vanilla' | 'iframe'>('react');
  const [copied, setCopied] = useState(false);
  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setErr(null);
    try { await fn(); } catch (e: any) { console.error(e); setErr(`${label} failed: ${e?.message ?? e}`); } finally { setBusy(null); }
  };
  const code = codeSnippets()[codeTab];
  return (
    <div className="modal-bg" onMouseDown={() => set({ panel: null })}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export</h2>
          <button className="icon-btn" onClick={() => set({ panel: null })}>✕</button>
        </div>
        <div className="modal-tabs">
          {([['web', 'Web viewer'], ['code', 'Code'], ['3d', '3D files'], ['media', 'Image & video'], ['project', 'Project']] as [Tab, string][]).map(([t, l]) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'web' && (
            <>
              <p>A single self-contained web page that plays your scene with all its states and events (hover, click, keys, scroll, cursor follow), orbit settings, background, fog and lighting. Host it anywhere or embed it with an iframe.</p>
              <button className="btn primary" disabled={!!busy} onClick={() => run('Web export', exportViewer)}>Download web page (.html)</button>
            </>
          )}
          {tab === 'code' && (
            <>
              <div className="seg">
                {(['react', 'vanilla', 'iframe'] as const).map((c) => <button key={c} className={codeTab === c ? 'active' : ''} onClick={() => setCodeTab(c)}>{c === 'react' ? 'React' : c === 'vanilla' ? 'Vanilla JS' : 'Embed'}</button>)}
              </div>
              <pre className="code">{code}</pre>
              <div className="inline">
                <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}>{copied ? 'Copied' : 'Copy code'}</button>
                <button className="btn ghost" onClick={() => saveFile(codeTab === 'react' ? 'Scene.jsx.txt' : 'scene-snippet.html', code)}>Download</button>
              </div>
            </>
          )}
          {tab === '3d' && (
            <>
              <p>Export the scene geometry and materials. GLB/GLTF keep materials, lights, hierarchy and textures. USDZ opens in Apple AR Quick Look. STL/OBJ/PLY are for 3D printing and other tools.</p>
              <div className="grid-btns">
                {(['glb', 'gltf', 'usdz', 'obj', 'stl', 'ply'] as const).map((f) => (
                  <button key={f} className="btn" disabled={!!busy} onClick={() => run(f.toUpperCase(), () => export3D(f))}>.{f}</button>
                ))}
              </div>
              <p className="hint">Inside the Claude viewer, 3D files are delivered as .zip because the viewer only saves common file types.</p>
            </>
          )}
          {tab === 'media' && (
            <>
              <div className="row"><label className="row-label">Resolution</label><div className="row-body">
                <select className="select" value={scale} onChange={(e) => setScale(+e.target.value)}><option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option><option value={4}>4x</option></select>
              </div></div>
              <div className="grid-btns">
                <button className="btn" disabled={!!busy} onClick={() => run('PNG', () => exportImage('png', scale))}>PNG</button>
                <button className="btn" disabled={!!busy} onClick={() => run('JPG', () => exportImage('jpg', scale))}>JPG</button>
                <button className="btn" disabled={!!busy} onClick={() => run('WEBP', () => exportImage('webp', scale))}>WEBP</button>
              </div>
              <p className="hint">Tip: turn on Background → Transparent for a PNG with no background.</p>
              <hr />
              <div className="row"><label className="row-label">Video length</label><div className="row-body">
                <select className="select" value={secs} onChange={(e) => setSecs(+e.target.value)}>{[3, 5, 10, 15, 30].map((s) => <option key={s} value={s}>{s} s</option>)}</select>
              </div></div>
              <p className="hint">Recording runs the scene in Play mode so animations and events play. Move the camera while it records for a fly-through.</p>
              <button className="btn" disabled={!!busy} onClick={() => run('Video', async () => {
                set({ mode: 'play', selected: [] });
                await new Promise((r) => setTimeout(r, 200));
                try { await recordVideo(secs, (s) => setBusy(`Recording… ${secs - s}s`)); } finally { set({ mode: 'edit' }); }
              })}>Record video</button>
            </>
          )}
          {tab === 'project' && (
            <>
              <p>The project file keeps everything: objects, materials, states, events and scene settings. Open it later with File → Open.</p>
              <button className="btn primary" onClick={() => saveProject()}>Download project (.json)</button>
            </>
          )}
          {busy && <div className="busy">{busy}…</div>}
          {err && <div className="error">{err}</div>}
        </div>
      </div>
    </div>
  );
}
