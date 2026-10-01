import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n.js';
import { taskHealth, isOpen } from '../util.js';
import { activePeople, projectWorkstreams, myPerson, IDX } from '../store.js';
import { getFilter, setFilter, clearFilter } from '../nav.js';
import { Icon, STATUSES, statusLabel } from './ui.jsx';

export function applyFilter(tasks, f, today) {
  const q = (f.q || '').trim().toLowerCase();
  const me = myPerson();
  return tasks.filter((x) => {
    if (f.ws.length && !f.ws.includes(x.workstreamId)) return false;
    if (f.owner === '_none' && (x.ownerIds || []).length) return false;
    if (f.owner && f.owner !== '_none' && !(x.ownerIds || []).includes(f.owner)) return false;
    if (f.mine && (!me || !(x.ownerIds || []).includes(me.id))) return false;
    if (f.status.length && !f.status.includes(x.status)) return false;
    if (f.phase && x.phaseId !== f.phase) return false;
    if (f.late && taskHealth(x, today) !== 'overdue') return false;
    if (f.hideDone && !isOpen(x)) return false;
    if (q) {
      const owners = (x.ownerIds || []).map((id) => (IDX.people.get(id) || {}).name || '').join(' ');
      const hay = `${x.title} ${x.description || ''} ${x.dod || ''} ${owners}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function activeFilterCount(f) {
  return (f.q ? 1 : 0) + (f.ws.length ? 1 : 0) + (f.owner ? 1 : 0) + (f.status.length ? 1 : 0) + (f.phase ? 1 : 0) + (f.late ? 1 : 0) + (f.hideDone ? 1 : 0) + (f.mine ? 1 : 0);
}

function MultiSelect({ label, options, value, onChange, id }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', fn);
    return () => document.removeEventListener('pointerdown', fn);
  }, [open]);
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div class="ms" ref={ref}>
      <button id={id} type="button" class={`fbtn ${value.length ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}
        {value.length ? <span class="fcount">{value.length}</span> : null}
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div class="ms-menu">
          {options.map((o) => (
            <label class="ms-opt">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button type="button" class="link-btn" onClick={() => onChange([])}>
              {t('Clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ project, showDoneToggle = true }) {
  const f = getFilter(project.id);
  const set = (patch) => setFilter(project.id, patch);
  const wss = projectWorkstreams(project.id);
  const n = activeFilterCount(f);
  const me = myPerson();
  return (
    <div class="filterbar">
      <div class="search">
        <Icon name="search" size={14} />
        <input id="flt-q" type="search" placeholder={t('Search task, description, person…')} value={f.q} onInput={(e) => set({ q: e.currentTarget.value })} />
      </div>
      <MultiSelect id="flt-ws" label={t('Workstream')} options={wss.map((w) => ({ value: w.id, label: w.name }))} value={f.ws} onChange={(ws) => set({ ws })} />
      <MultiSelect id="flt-st" label={t('Status')} options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} value={f.status} onChange={(status) => set({ status })} />
      <select id="flt-owner" class={`fsel ${f.owner ? 'on' : ''}`} value={f.owner || ''} onChange={(e) => set({ owner: e.currentTarget.value || null })} aria-label={t('Owner')}>
        <option value="">{t('All owners')}</option>
        <option value="_none">{t('No owner')}</option>
        {activePeople().map((p) => (
          <option value={p.id}>{p.name}</option>
        ))}
      </select>
      {(project.phases || []).length > 1 && (
        <select id="flt-phase" class={`fsel ${f.phase ? 'on' : ''}`} value={f.phase || ''} onChange={(e) => set({ phase: e.currentTarget.value || null })} aria-label={t('Phase')}>
          <option value="">{t('All phases')}</option>
          {project.phases.map((p) => (
            <option value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
      <button type="button" class={`fbtn ${f.late ? 'on bad' : ''}`} onClick={() => set({ late: !f.late })} aria-pressed={f.late}>
        {t('Overdue')}
      </button>
      {showDoneToggle && (
        <button type="button" class={`fbtn ${f.hideDone ? 'on' : ''}`} onClick={() => set({ hideDone: !f.hideDone })} aria-pressed={f.hideDone}>
          {t('Hide done')}
        </button>
      )}
      {me && (
        <button type="button" class={`fbtn ${f.mine ? 'on' : ''}`} onClick={() => set({ mine: !f.mine })} aria-pressed={f.mine}>
          {t('Mine')}
        </button>
      )}
      {n > 0 && (
        <button type="button" class="link-btn" onClick={() => clearFilter(project.id)}>
          {t('Clear filters ({n})', { n })}
        </button>
      )}
    </div>
  );
}
