import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';

export function BottomNav() {
  const cls = ({ isActive }) => (isActive ? 'active' : '');
  useLocation(); // re-render on navigation so the remembered Insights view stays current
  let insightsSearch = '';
  try { insightsSearch = sessionStorage.getItem('insights-search') || ''; } catch {}
  return (
    <nav className="nav" aria-label="Main">
      <NavLink to="/" end className={cls} aria-label="Home"><Icon name="house" size={22} /></NavLink>
      <NavLink to="/activity" className={cls} aria-label="Activity"><Icon name="list" size={22} /></NavLink>
      <NavLink to="/add" className="add" aria-label="Add entry"><Icon name="plus" size={24} strokeWidth={2} /></NavLink>
      <NavLink to={insightsSearch ? `/insights?${insightsSearch}` : '/insights'} className={cls} aria-label="Insights"><Icon name="chart-no-axes-column" size={22} /></NavLink>
      <NavLink to="/investments" className={cls} aria-label="Investments"><Icon name="trending-up" size={22} /></NavLink>
    </nav>
  );
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function ChipPicker({ options, value, onChange, label, allowNone = false, onAdd }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          className={'chip' + (o.id === value ? ' on' : '')}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id === value && allowNone ? null : o.id)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.name}
        </button>
      ))}
      {onAdd && (
        <button type="button" className="chip dashed" onClick={onAdd}>
          <Icon name="plus" size={16} /> New
        </button>
      )}
    </div>
  );
}

/** Text input with "starts with" autocomplete from previously used names. */
export function Autocomplete({ id, label, value, onChange, options, onPick, placeholder, renderMeta }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const matches = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return [];
    const starts = options.filter((o) => o.name.toLowerCase().startsWith(q));
    const contains = options.filter((o) => !o.name.toLowerCase().startsWith(q) && o.name.toLowerCase().includes(q));
    return [...starts, ...contains].filter((o) => o.name.toLowerCase() !== q).slice(0, 6);
  }, [value, options]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const pick = (o) => {
    onChange(o.name);
    onPick?.(o);
    setOpen(false);
  };

  return (
    <div className="field" ref={ref}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]); }
        }}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={id + '-list'}
      />
      {open && matches.length > 0 && (
        <div className="suggest" id={id + '-list'} role="listbox">
          {matches.map((o, i) => (
            <button type="button" role="option" aria-selected={i === active} key={o.id} className={i === active ? 'active' : ''} onClick={() => pick(o)}>
              <span style={{ fontSize: 16 }}>{o.name}</span>
              {renderMeta && <span className="small muted">{renderMeta(o)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="center-screen muted">{text}</div>;
}
