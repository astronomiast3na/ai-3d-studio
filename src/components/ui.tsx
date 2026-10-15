import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-head" onClick={() => setOpen(!open)}>
        <span className={'chev' + (open ? ' open' : '')}>▸</span>
        <span className="section-title">{title}</span>
        <span className="section-right" onClick={(e) => e.stopPropagation()}>{right}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <label className="row-label">{label}</label>
      <div className="row-body">{children}</div>
    </div>
  );
}

/** Number input whose label can be dragged left/right to scrub, like Spline. */
export function Num({ value, onChange, step = 0.1, min, max, label, precision = 2, suffix }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label?: string; precision?: number; suffix?: string;
}) {
  const [text, setText] = useState(fmt(value, precision));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmt(value, precision)); }, [value, precision]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const startDrag = (e: React.PointerEvent) => {
    const x0 = e.clientX, v0 = value;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onChange(clamp(round(v0 + (ev.clientX - x0) * step * (ev.shiftKey ? 10 : 1) * 0.5, precision)));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="num">
      {label && <span className="num-label" onPointerDown={startDrag}>{label}</span>}
      <input
        value={text}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; setText(fmt(value, precision)); }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = clamp(round(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), precision));
            onChange(v);
            setText(fmt(v, precision));
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </div>
  );
}

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;
const fmt = (v: number, p: number) => String(round(v ?? 0, p));

export function Vec3({ value, onChange, step = 0.1, precision = 2 }: { value: [number, number, number]; onChange: (v: [number, number, number]) => void; step?: number; precision?: number }) {
  return (
    <div className="vec3">
      {(['X', 'Y', 'Z'] as const).map((l, i) => (
        <Num key={l} label={l} value={value[i]} step={step} precision={precision} onChange={(v) => { const n = [...value] as [number, number, number]; n[i] = v; onChange(n); }} />
      ))}
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <Num value={value} onChange={onChange} min={min} max={max} step={step} precision={step < 0.01 ? 3 : 2} />
    </div>
  );
}

export function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <input className="hex" value={value} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: (T | [T, string])[] }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
    </select>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <button className={'toggle' + (value ? ' on' : '')} onClick={() => onChange(!value)}><span /></button>;
}

export function Text({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return multiline
    ? <textarea className="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
    : <input className="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
}
