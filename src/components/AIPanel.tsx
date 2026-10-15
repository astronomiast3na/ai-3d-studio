import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { applyOperations, askClaude, buildPrompt, claudeSample, meshyGenerate, falGenerate, MESH_PROVIDERS } from '../ai';
import { readAsDataURL } from '../three/models';
import { snapshot } from '../io';

const EXAMPLES = [
  'A cute robot with a glossy body and glowing eyes',
  'A cozy isometric room with a sofa, plant and lamp',
  'A floating island with trees and a waterfall',
  'Make the selected object glass and add a hover bounce',
  'A 3D "HELLO" title in bold gradient letters',
  'A coffee cup on a saucer with steam',
];

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export function AIPanel() {
  const set = useStore((s) => s.set);
  const selected = useStore((s) => s.selected);
  const add = useStore((s) => s.add);
  const [mode, setMode] = useState<'scene' | 'mesh'>('scene');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inClaude, setInClaude] = useState<boolean | null>(null);
  const [anthropicKey, setAnthropicKey] = useState(store.get('ai3d.anthropicKey'));
  const [meshyKey, setMeshyKey] = useState(store.get('ai3d.meshyKey'));
  const [falKey, setFalKey] = useState(store.get('ai3d.falKey'));
  const [provider, setProvider] = useState(store.get('ai3d.provider') || 'hunyuan');
  const [hq, setHq] = useState(false);
  const [refine, setRefine] = useState(true);
  const [showKeys, setShowKeys] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => { claudeSample().then((s) => setInClaude(!!s)); }, []);

  const pickImage = (f?: File | null) => {
    if (!f) return;
    setImage(f);
    readAsDataURL(f).then(setPreview);
  };

  const run = async () => {
    setError(null);
    setRunning(true);
    ctl.current = new AbortController();
    try {
      if (mode === 'scene') {
        if (!prompt.trim() && !image) return;
        setStatus('Thinking…');
        const res = await askClaude(buildPrompt(prompt || 'Recreate the attached image in 3D', selected, !!image), {
          image, apiKey: anthropicKey || undefined, signal: ctl.current.signal,
          onText: (t) => setStatus(`Designing… (${Math.round(t.length / 100) / 10}k chars)`),
        });
        const { added } = applyOperations(res);
        let summary = res.summary || 'Done';
        if (refine && added > 0) {
          // Second pass: Claude looks at a render of its own result and fixes what looks off.
          setStatus('Reviewing the render…');
          await new Promise((r) => setTimeout(r, 400));
          const shot = await snapshot('png', 1);
          const fix = await askClaude(buildPrompt(
            `You just built this for the request "${prompt || 'recreate the attached image'}" (${summary}). The attached image is a render of the current scene. ` +
            'Critically compare it with the request: fix proportions, intersections, floating parts, missing details and colour harmony, and add detail that makes it look premium. ' +
            'Use "update" on existing ids and "add" for new parts (parent them to the existing group id). Do not rebuild from scratch.', selected, true), {
            image: shot, apiKey: anthropicKey || undefined, signal: ctl.current.signal,
            onText: (t) => setStatus(`Refining… (${Math.round(t.length / 100) / 10}k chars)`),
          });
          const r2 = applyOperations(fix);
          summary += r2.added || fix.operations?.length ? ` Refined with ${fix.operations?.length ?? 0} changes.` : '';
        }
        setStatus(`${summary}${added ? ` (${added} objects)` : ''}`);
      } else {
        if (!prompt.trim() && !image) return;
        let blob: Blob;
        if (provider === 'meshy') {
          if (!meshyKey) { setShowKeys(true); throw new Error('Add your Meshy API key to use Meshy.'); }
          blob = await meshyGenerate({ apiKey: meshyKey, prompt, image, signal: ctl.current.signal, onStatus: setStatus });
        } else {
          if (!falKey) { setShowKeys(true); throw new Error('Add your fal.ai API key to generate meshes.'); }
          const p = MESH_PROVIDERS.find((x) => x.id === provider)!;
          blob = await falGenerate({ apiKey: falKey, provider: p, prompt, image, hq, signal: ctl.current.signal, onStatus: setStatus });
        }
        const url = await readAsDataURL(new Blob([blob], { type: 'model/gltf-binary' }));
        add('model', { name: (prompt || 'AI model').slice(0, 32), position: [0, 0, 0], model: { url, format: 'glb' } });
        setStatus('Model added to the scene.');
      }
    } catch (e: any) {
      if (e?.code === 'cancelled' || e?.name === 'AbortError') setStatus(null);
      else { setStatus(null); setError(e?.code === 'not_granted' ? 'Claude access was not allowed for this page.' : e?.message ?? String(e)); }
    } finally { setRunning(false); }
  };

  return (
    <div className="modal-bg" onMouseDown={() => set({ panel: null })}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✦ AI Generate</h2>
          <button className="icon-btn" onClick={() => set({ panel: null })}>✕</button>
        </div>
        <div className="modal-tabs">
          <button className={mode === 'scene' ? 'active' : ''} onClick={() => setMode('scene')}>Design with Claude</button>
          <button className={mode === 'mesh' ? 'active' : ''} onClick={() => setMode('mesh')}>Text / Image → Mesh</button>
        </div>
        <div className="modal-body">
          {mode === 'scene' ? (
            <p className="hint">Builds editable objects from shapes, materials and interactions. Ask for new objects or changes to the selection. {inClaude === false && !anthropicKey && <b>Open this inside Claude, or add an Anthropic API key below.</b>}</p>
          ) : (
            <>
              <p className="hint">Generates one production-quality textured mesh (GLB with PBR materials) from a prompt or a reference image. Takes 1–5 minutes.</p>
              <div className="providers">
                {[...MESH_PROVIDERS, { id: 'meshy', label: 'Meshy 6', note: 'Good for stylised assets. Uses your own Meshy key.', text: true, image: true }].map((p) => (
                  <button key={p.id} className={'provider' + (provider === p.id ? ' active' : '')} onClick={() => { setProvider(p.id); store.set('ai3d.provider', p.id); }}>
                    <span className="provider-name">{p.label}{p.id === 'hunyuan' && <span className="tag">Recommended</span>}</span>
                    <span className="provider-note">{p.note}{!p.text && ' '}</span>
                  </button>
                ))}
              </div>
              {provider !== 'meshy' && provider !== 'trellis2' && (
                <div className="row"><label className="row-label">High detail</label><div className="row-body"><button className={'toggle' + (hq ? ' on' : '')} onClick={() => setHq(!hq)}><span /></button><span className="hint" style={{ marginLeft: 8 }}>{provider === 'rodin' ? '4K textures, high-poly (3x cost)' : '1M faces'}</span></div></div>
              )}
              {inClaude && <p className="hint"><b>Note:</b> Claude's viewer blocks calls to outside services, so mesh generation runs in the hosted app (see the GitHub repo), not inside this Claude preview.</p>}
            </>
          )}
          <textarea className="text big" placeholder={mode === 'scene' ? 'Describe what to create or change…' : 'e.g. a stylized treasure chest with gold trim'} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }} />
          <div className="chips">
            {EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setPrompt(x)}>{x}</button>)}
          </div>
          <div className="inline" style={{ marginTop: 8 }}>
            <label className="btn sm">
              {image ? 'Replace image' : 'Add reference image'}
              <input type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
            </label>
            {preview && <img src={preview} className="thumb" />}
            {image && <button className="btn sm ghost" onClick={() => { setImage(null); setPreview(null); }}>Remove</button>}
            <span style={{ flex: 1 }} />
            {mode === 'scene' && <label className="inline hint" title="Claude checks a render of its result and fixes it"><button className={'toggle' + (refine ? ' on' : '')} onClick={() => setRefine(!refine)}><span /></button>Refine pass</label>}
            <button className="btn sm ghost" onClick={() => setShowKeys(!showKeys)}>API keys</button>
          </div>
          {showKeys && (
            <div className="card">
              <div className="row"><label className="row-label">Anthropic</label><div className="row-body"><input className="text" type="password" placeholder="sk-ant-… (only needed outside Claude)" value={anthropicKey} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { setAnthropicKey(e.target.value); store.set('ai3d.anthropicKey', e.target.value); }} /></div></div>
              <div className="row"><label className="row-label">fal.ai</label><div className="row-body"><input className="text" type="password" placeholder="fal key (Hunyuan3D, Rodin, TRELLIS.2)" value={falKey} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { setFalKey(e.target.value); store.set('ai3d.falKey', e.target.value); }} /></div></div>
              <div className="row"><label className="row-label">Meshy</label><div className="row-body"><input className="text" type="password" placeholder="msy_…" value={meshyKey} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { setMeshyKey(e.target.value); store.set('ai3d.meshyKey', e.target.value); }} /></div></div>
              <p className="hint">Keys stay in this browser only.</p>
            </div>
          )}
          <div className="inline" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={running} onClick={run}>{mode === 'scene' ? 'Generate' : 'Generate mesh'}</button>
            {running ? <button className="btn ghost" onClick={() => ctl.current?.abort()}>Stop</button> : null}
            {status && <span className="status">{status}</span>}
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
