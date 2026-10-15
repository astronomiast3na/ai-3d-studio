import { useEffect } from 'react';
import { useStore } from '../store';

export function ContextMenu() {
  const menu = useStore((s) => s.menu);
  const selected = useStore((s) => s.selected);
  const objects = useStore((s) => s.objects);
  const st = useStore.getState;
  useEffect(() => {
    if (!menu) return;
    const close = () => st().set({ menu: null });
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); };
  }, [menu]);
  if (!menu || !selected.length) return null;
  const sel = objects.filter((o) => selected.includes(o.id));
  const isGroup = sel.length === 1 && sel[0].type === 'group';
  const allHidden = sel.every((o) => !o.visible);
  const allLocked = sel.every((o) => o.locked);
  const items: [string, string, () => void][] = [
    ['Duplicate', 'Ctrl D', () => st().duplicate(selected)],
    ['Group selection', 'Ctrl G', () => st().group(selected)],
    ...(isGroup ? [['Ungroup', 'Ctrl ⇧ G', () => st().ungroup(sel[0].id)] as [string, string, () => void]] : []),
    [allHidden ? 'Show' : 'Hide', 'H', () => sel.forEach((o) => st().update(o.id, { visible: allHidden }))],
    [allLocked ? 'Unlock' : 'Lock', '', () => sel.forEach((o) => st().update(o.id, { locked: !allLocked }))],
    ['Add interaction', '', () => st().set({ rightTab: 'interact', selected: [selected[0]] })],
    ['Delete', 'Del', () => st().remove(selected)],
  ];
  const x = Math.min(menu.x, window.innerWidth - 200), y = Math.min(menu.y, window.innerHeight - items.length * 32 - 16);
  return (
    <div className="menu-pop ctx" style={{ position: 'fixed', left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map(([label, key, fn]) => (
        <button key={label} className={label === 'Delete' ? 'danger-item' : ''} onClick={() => { fn(); st().set({ menu: null }); }}>
          <span style={{ flex: 1 }}>{label}</span><span className="kbd-hint">{key}</span>
        </button>
      ))}
    </div>
  );
}
