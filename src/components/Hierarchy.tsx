import { useState } from 'react';
import { useStore } from '../store';
import type { SceneObj } from '../types';

const ICONS: Record<string, string> = {
  group: '▣', model: '⬢', image: '▨', pointLight: '✹', spotLight: '◭', directionalLight: '☀', text: 'T',
  cube: '◼', sphere: '●', cylinder: '▮', cone: '▲', torus: '◯', torusKnot: '∞', plane: '▬', capsule: '⬭',
  icosahedron: '⬟', pyramid: '△', ring: '◎', star: '★', polygon: '⬡', heart: '♥', roundedRect: '▢',
};

function Item({ o, depth, all }: { o: SceneObj; depth: number; all: SceneObj[] }) {
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);
  const move = useStore((s) => s.move);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drop, setDrop] = useState<null | 'before' | 'after' | 'inside'>(null);
  const kids = all.filter((x) => x.parentId === o.id);
  const isSel = selected.includes(o.id);
  return (
    <>
      <div
        className={'layer' + (isSel ? ' sel' : '') + (o.visible ? '' : ' hidden') + (drop ? ' drop-' + drop : '')}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!editing}
        onDragStart={(e) => { e.dataTransfer.setData('text/obj', o.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => {
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          setDrop(o.type === 'group' && y > 0.3 && y < 0.7 ? 'inside' : y < 0.5 ? 'before' : 'after');
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData('text/obj');
          if (id && drop) move(id, o.id, drop);
          setDrop(null);
        }}
        onClick={(e) => select(o.id, e.shiftKey || e.metaKey || e.ctrlKey)}
        onDoubleClick={() => setEditing(true)}
      >
        <span className="layer-chev" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{kids.length ? (open ? '▾' : '▸') : ''}</span>
        <span className="layer-icon">{ICONS[o.type] ?? '◆'}</span>
        {editing ? (
          <input
            autoFocus
            className="layer-input"
            defaultValue={o.name}
            onBlur={(e) => { update(o.id, { name: e.target.value || o.name }); setEditing(false); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
          />
        ) : <span className="layer-name">{o.name}</span>}
        {o.events.length > 0 && <span className="layer-badge" title="Has interactions">⚡</span>}
        <span className="layer-actions">
          <button title={o.locked ? 'Unlock' : 'Lock'} className={o.locked ? 'on' : ''} onClick={(e) => { e.stopPropagation(); update(o.id, { locked: !o.locked }); }}>{o.locked ? '🔒' : '🔓'}</button>
          <button title={o.visible ? 'Hide' : 'Show'} className={!o.visible ? 'on' : ''} onClick={(e) => { e.stopPropagation(); update(o.id, { visible: !o.visible }); }}>{o.visible ? '👁' : '—'}</button>
        </span>
      </div>
      {open && kids.map((k) => <Item key={k.id} o={k} depth={depth + 1} all={all} />)}
    </>
  );
}

export function Hierarchy() {
  const objects = useStore((s) => s.objects);
  const move = useStore((s) => s.move);
  const roots = objects.filter((o) => !o.parentId || !objects.some((p) => p.id === o.parentId));
  return (
    <aside className="panel left">
      <div className="panel-head">Scene</div>
      <div
        className="panel-scroll layers"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const id = e.dataTransfer.getData('text/obj'); if (id && e.target === e.currentTarget) move(id, null, 'after'); }}
      >
        {roots.map((o) => <Item key={o.id} o={o} depth={0} all={objects} />)}
        {!objects.length && <div className="hint pad">Empty scene. Add a shape from the toolbar, drop a file here, or use AI Generate.</div>}
      </div>
    </aside>
  );
}
