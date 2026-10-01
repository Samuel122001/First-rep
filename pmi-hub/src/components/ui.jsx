import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { t } from '../i18n.js';
import { initials, personHue } from '../util.js';
import { S, IDX, activePeople, createPerson, canEdit, emit } from '../store.js';

// ---------- icons ----------
const P = {
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  gantt: 'M4 5h9M7 10h11M5 15h7M10 20h10',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  people: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  user: 'M18 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 6 18.5V20M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  portfolio: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 8v5M12 16.5h.01M10.3 3.9L2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  comment: 'M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  diamond: 'M12 3l9 9-9 9-9-9z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  chain: 'M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  report: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  archive: 'M4 4h16v4H4zM5 8v12h14V8M10 12h4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};

export function Icon({ name, size = 16, class: cls }) {
  return (
    <svg class={'ic ' + (cls || '')} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[name] || ''} />
    </svg>
  );
}

// ---------- status ----------
export const STATUSES = ['open', 'doing', 'blocked', 'done', 'na'];
export const statusLabel = (s) => ({ open: t('Open'), doing: t('In progress'), blocked: t('Blocked'), done: t('Done'), na: t('Cancelled') })[s] || s;
export const priorityLabel = (p) => ({ high: t('High'), normal: t('Normal'), low: t('Low') })[p] || p;
export const ragLabel = (r) => ({ green: t('Green'), amber: t('Amber'), red: t('Red') })[r] || t('No assessment');
export const typeLabel = (x) => ({ employee: t('Employee'), external: t('External party'), group: t('Group / team') })[x] || x;

export function StatusSelect({ value, onChange, disabled, id, compact }) {
  return (
    <span class={`status-sel st-${value} ${compact ? 'compact' : ''}`}>
      <select id={id} value={value} disabled={disabled} aria-label={t('Status')} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(e.currentTarget.value)}>
        {STATUSES.map((s) => (
          <option value={s}>{statusLabel(s)}</option>
        ))}
      </select>
      <Icon name="down" size={12} />
    </span>
  );
}

export function StatusPill({ value }) {
  return <span class={`pill st-${value}`}>{statusLabel(value)}</span>;
}

export function RagDot({ rag, title, size }) {
  return <span class={`rag rag-${rag || 'none'} ${size || ''}`} title={title || ragLabel(rag)} role="img" aria-label={title || ragLabel(rag)} />;
}

export function Progress({ s, thin }) {
  const total = s.counted || 0;
  if (!total) return <div class={`progress ${thin ? 'thin' : ''}`} />;
  const w = (n) => `${(n / total) * 100}%`;
  const openNotLate = Math.max(0, s.open + s.doing + s.blocked - s.overdue);
  return (
    <div class={`progress ${thin ? 'thin' : ''}`} role="img" aria-label={t('{p}% complete', { p: s.pct })}>
      <span class="seg done" style={{ width: w(s.done) }} />
      <span class="seg late" style={{ width: w(s.overdue) }} />
      <span class="seg rest" style={{ width: w(openNotLate) }} />
    </div>
  );
}

// ---------- people ----------
export function Avatar({ person, size = 24 }) {
  const name = person ? person.name : '?';
  const hue = personHue(person ? person.id : '');
  const ext = person && person.type !== 'employee';
  return (
    <span class={`avatar ${ext ? 'ext' : ''}`} style={{ '--h': hue, width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px' }} title={name}>
      {initials(name)}
    </span>
  );
}

export function Owners({ ids, max = 3, size = 22, names }) {
  const people = (ids || []).map((id) => IDX.people.get(id)).filter(Boolean);
  if (!people.length) return <span class="muted small">{t('No owner')}</span>;
  if (names) {
    return (
      <span class="owners-names">
        {people.map((p) => (
          <span class="owner-chip">
            <Avatar person={p} size={18} />
            <span>{p.name}</span>
          </span>
        ))}
      </span>
    );
  }
  const shown = people.slice(0, max);
  return (
    <span class="owners" title={people.map((p) => p.name).join(', ')}>
      {shown.map((p) => (
        <Avatar person={p} size={size} />
      ))}
      {people.length > max && <span class="avatar more" style={{ width: size + 'px', height: size + 'px' }}>+{people.length - max}</span>}
    </span>
  );
}

export function personName(id) {
  const p = IDX.people.get(id);
  return p ? p.name : '';
}

// Picker for one or more people, with the option to add a new person.
export function PersonPicker({ value, onChange, multi = true, placeholder, id, disabled }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const wrap = useRef(null);
  const selected = multi ? value || [] : value ? [value] : [];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const options = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return activePeople()
      .filter((p) => !selected.includes(p.id))
      .filter((p) => !ql || p.name.toLowerCase().includes(ql) || (p.role || '').toLowerCase().includes(ql) || (p.team || '').toLowerCase().includes(ql))
      .slice(0, 40);
  }, [q, selected.join(','), S.people]);

  const exact = activePeople().some((p) => p.name.toLowerCase() === q.trim().toLowerCase());
  const canAdd = q.trim().length > 1 && !exact && canEdit();
  const total = options.length + (canAdd ? 1 : 0);

  const pick = (pid) => {
    if (multi) onChange([...selected, pid]);
    else onChange(pid);
    setQ('');
    setHi(0);
    if (!multi) setOpen(false);
  };
  const remove = (pid) => (multi ? onChange(selected.filter((x) => x !== pid)) : onChange(null));
  const addNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const p = await createPerson({ name: q.trim() });
      pick(p.id);
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(total - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hi < options.length && options[hi]) pick(options[hi].id);
      else if (canAdd) addNew();
    } else if (e.key === 'Escape') {
      // Close only the menu; a dialog around the picker stays open.
      if (open) e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Backspace' && !q && selected.length && multi) {
      remove(selected[selected.length - 1]);
    }
  };

  return (
    <div
      class={`picker ${disabled ? 'disabled' : ''}`}
      ref={wrap}
      onFocusOut={(e) => {
        if (!e.relatedTarget || !wrap.current.contains(e.relatedTarget)) setTimeout(() => wrap.current && !wrap.current.contains(document.activeElement) && setOpen(false), 120);
      }}
    >
      <div class="picker-box" onClick={() => !disabled && (setOpen(true), wrap.current.querySelector('input').focus())}>
        {selected.map((pid) => {
          const p = IDX.people.get(pid);
          return (
            <span class={`chip ${p && p.active === false ? 'inactive' : ''}`}>
              <Avatar person={p} size={18} />
              <span>{p ? p.name : t('Unknown')}</span>
              {!disabled && (
                <button type="button" class="chip-x" aria-label={t('Remove {n}', { n: p ? p.name : '' })} onClick={(e) => (e.stopPropagation(), remove(pid))}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </span>
          );
        })}
        {!disabled && (multi || !selected.length) && (
          <input
            id={id}
            value={q}
            placeholder={selected.length ? '' : placeholder || t('Search person…')}
            onInput={(e) => (setQ(e.currentTarget.value), setOpen(true), setHi(0))}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            autocomplete="off"
          />
        )}
      </div>
      {open && !disabled && (
        <div class="picker-menu" role="listbox">
          {options.map((p, i) => (
            <button type="button" role="option" class={`picker-opt ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(p.id)}>
              <Avatar person={p} size={20} />
              <span class="po-name">{p.name}</span>
              <span class="po-meta">{[p.role, p.team].filter(Boolean).join(' · ') || (p.type !== 'employee' ? typeLabel(p.type) : '')}</span>
            </button>
          ))}
          {!options.length && !canAdd && <div class="picker-empty">{q ? t('No match') : t('Everyone is already selected')}</div>}
          {canAdd && (
            <button type="button" class={`picker-opt add ${hi === options.length ? 'hi' : ''}`} onClick={addNew} disabled={busy}>
              <Icon name="plus" size={14} />
              <span>{t('Add "{n}" as a new person', { n: q.trim() })}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- editable fields (saved when the field loses focus) ----------
export function EditText({ value, onSave, multiline, placeholder, class: cls, disabled, id, rows = 3, ariaLabel }) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const shown = editing ? draft : value || '';
  const commit = () => {
    if (draft !== null && draft !== (value || '')) onSave(multiline ? draft : draft.trim());
    setDraft(null);
  };
  const props = {
    id,
    class: cls,
    value: shown,
    placeholder,
    disabled,
    'aria-label': ariaLabel || placeholder,
    onFocus: () => setDraft(value || ''),
    onInput: (e) => setDraft(e.currentTarget.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Escape') {
        setDraft(null);
        e.currentTarget.blur();
      } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };
  if (multiline) return <textarea rows={rows} {...props} />;
  return <input type="text" {...props} />;
}

export function DateInput({ value, onSave, disabled, id, min, max, ariaLabel }) {
  return (
    <input
      type="date"
      id={id}
      class="date-in"
      value={value || ''}
      min={min || undefined}
      max={max || undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onSave(e.currentTarget.value || null)}
    />
  );
}

// ---------- modal + confirmation ----------
export function Modal({ title, onClose, children, wide, footer, class: cls, top }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('input, select, textarea, button:not(.modal-x)');
    if (first) setTimeout(() => first.focus(), 30);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class={`overlay ${top ? 'top' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div class={`modal ${wide ? 'wide' : ''} ${cls || ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header class="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button class="icon-btn modal-x" onClick={onClose} aria-label={t('Close')}>
              <Icon name="x" />
            </button>
          )}
        </header>
        <div class="modal-body">{children}</div>
        {footer && <footer class="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

let confirmState = null;
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    confirmState = { ...opts, resolve };
    emit();
  });
}
export function ConfirmHost() {
  if (!confirmState) return null;
  const c = confirmState;
  const close = (v) => {
    confirmState = null;
    c.resolve(v);
    emit();
  };
  return (
    <Modal
      top
      title={c.title}
      onClose={() => close(false)}
      footer={
        <>
          <button class="btn ghost" onClick={() => close(false)}>
            {t('Cancel')}
          </button>
          <button class={`btn ${c.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
            {c.ok || t('OK')}
          </button>
        </>
      }
    >
      <p class="confirm-body">{c.body}</p>
    </Modal>
  );
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {S.toasts.map((x) => (
        <div class={`toast ${x.kind}`}>
          <Icon name={x.kind === 'error' ? 'alert' : 'check'} />
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div class="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, children, hint, htmlFor, class: cls }) {
  return (
    <div class={`field ${cls || ''}`}>
      <label for={htmlFor}>{label}</label>
      {children}
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}

// Copy text; select it instead if clipboard access is refused.
export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      const r = document.createRange();
      r.selectNodeContents(fallbackEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return false;
  }
}
