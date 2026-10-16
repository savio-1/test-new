import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function Section({
  title,
  children,
  defaultOpen = true,
  actions,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header className="section-head">
        <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{title}</span>
        </button>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  def = 0,
  onChange,
  format,
  options,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  def?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  options?: string[];
}) {
  if (options) {
    return (
      <label className="row">
        <span className="row-label">{label}</span>
        <select className="select" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {options.map((o, i) => (
            <option key={o} value={i}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const pct = ((value - min) / (max - min)) * 100;
  const zero = ((Math.min(Math.max(0, min), max) - min) / (max - min)) * 100;
  const shown = format ? format(value) : value.toFixed(step >= 1 ? 0 : 2);
  const changed = Math.abs(value - def) > 1e-9;
  return (
    <div className={`row slider ${changed ? 'changed' : ''}`}>
      <span className="row-label" title="Double-click to reset" onDoubleClick={() => onChange(def)}>
        {label}
      </span>
      <div className="slider-track">
        <div
          className="slider-fill"
          style={{ left: `${Math.min(pct, zero)}%`, width: `${Math.abs(pct - zero)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(def)}
        />
      </div>
      <span className="row-value" onDoubleClick={() => onChange(def)}>
        {shown}
      </span>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row toggle-row">
      <span className="row-label">{label}</span>
      <button className={`switch ${value ? 'on' : ''}`} role="switch" aria-checked={value} onClick={() => onChange(!value)}>
        <span />
      </button>
    </label>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <select
        className="select"
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <span className="color-field">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code>{value}</code>
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Colour wheel: drag the puck to push a colour into a tonal range. */
export function ColorWheel({
  label,
  value,
  master,
  onChange,
  onMaster,
}: {
  label: string;
  value: { x: number; y: number };
  master: number;
  onChange: (v: { x: number; y: number }) => void;
  onMaster: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1;
    let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    onChange({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };
  return (
    <div className="wheel">
      <div
        ref={ref}
        className="wheel-disc"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          update(e);
        }}
        onPointerMove={(e) => e.buttons & 1 && update(e)}
        onDoubleClick={() => onChange({ x: 0, y: 0 })}
        title="Drag to tint · double-click to reset"
      >
        <div className="wheel-puck" style={{ left: `${50 + value.x * 50}%`, top: `${50 - value.y * 50}%` }} />
      </div>
      <span className="wheel-label">{label}</span>
      <input
        className="wheel-master"
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={master}
        aria-label={`${label} master`}
        onChange={(e) => onMaster(Number(e.target.value))}
        onDoubleClick={() => onMaster(0)}
      />
    </div>
  );
}
