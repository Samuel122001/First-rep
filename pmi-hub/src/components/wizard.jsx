import { useMemo, useState } from 'preact/hooks';
import { t, plural, fmtDate } from '../i18n.js';
import { addDays, diffDays, todayISO, byOrder } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, createProject, toast } from '../store.js';
import { go } from '../nav.js';
import { Icon, Modal, Field, PersonPicker } from './ui.jsx';
import { LIBRARY, DEFAULT_PHASES, phaseForOffset } from '../templates.js';

// Wizard for starting a PMI project when a new company has been acquired.
export function NewProjectWizard({ onClose }) {
  const today = todayISO();
  const [step, setStep] = useState(1);
  const [deal, setDeal] = useState({ company: '', name: '', signingDate: '', closingDate: today, planEnd: '', leadPersonId: null, description: '' });
  const [mode, setMode] = useState('library'); // library | copy | empty
  const sources = S.projects.filter((p) => projectTasks(p.id).length).sort((a, b) => (a.closingDate < b.closingDate ? 1 : -1));
  const [sourceId, setSourceId] = useState(sources[0] ? sources[0].id : '');
  const [keepOwners, setKeepOwners] = useState(false);
  // Selected workstreams: key -> { on, leadPersonId, tasksOff: Set }
  const [sel, setSel] = useState(() => Object.fromEntries(LIBRARY.map((l) => [l.key, { on: l.preselect, leadPersonId: null, off: [] }])));
  const [copySel, setCopySel] = useState({});
  const [custom, setCustom] = useState([]);
  const [customName, setCustomName] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([0, 0]);

  const set = (k) => (e) => setDeal({ ...deal, [k]: e.currentTarget.value });
  const projectName = deal.name.trim() || (deal.company.trim() ? t('{c} Integration', { c: deal.company.trim() }) : '');
  const source = IDX.projects.get(sourceId);
  const sourceWs = source ? projectWorkstreams(source.id) : [];
  const sourceTasks = source ? projectTasks(source.id) : [];
  const shift = source && source.closingDate && deal.closingDate ? diffDays(source.closingDate, deal.closingDate) : 0;
  const cs = (id) => copySel[id] || { on: true, leadPersonId: (IDX.workstreams.get(id) || {}).leadPersonId || null };

  const spec = useMemo(() => {
    const closing = deal.closingDate;
    const workstreams = [];
    const tasks = [];
    let phases = DEFAULT_PHASES.map((p) => ({ ...p }));
    if (mode === 'copy' && source) {
      phases = (source.phases || []).map((p) => ({ ...p }));
      for (const w of sourceWs) {
        const c = cs(w.id);
        if (!c.on) continue;
        workstreams.push({ key: w.id, name: w.name, leadPersonId: c.leadPersonId, description: w.description || '' });
        sourceTasks
          .filter((x) => x.workstreamId === w.id)
          .sort(byOrder)
          .forEach((x) =>
            tasks.push({
              key: x.id,
              wsKey: w.id,
              phaseId: x.phaseId,
              title: x.title,
              description: x.description || '',
              dod: x.dod || '',
              ownerIds: keepOwners ? x.ownerIds || [] : [],
              start: x.start ? addDays(x.start, shift) : null,
              due: x.due ? addDays(x.due, shift) : null,
              milestone: !!x.milestone,
              priority: x.priority || 'normal',
              dependsOnKeys: x.dependsOn || [],
            }),
          );
      }
    } else {
      for (const l of LIBRARY) {
        const c = sel[l.key];
        if (!c.on) continue;
        workstreams.push({ key: l.key, name: l.name, leadPersonId: c.leadPersonId, description: l.desc });
        if (mode === 'library') {
          l.tasks
            .filter((x) => !c.off.includes(x.key))
            .forEach((x) =>
              tasks.push({
                key: x.key,
                wsKey: l.key,
                phaseId: phaseForOffset(x.end),
                title: x.title,
                description: x.description || '',
                start: closing ? addDays(closing, x.start) : null,
                due: closing ? addDays(closing, x.end) : null,
                milestone: !!x.milestone,
                ownerIds: c.leadPersonId ? [c.leadPersonId] : [],
                dependsOnKeys: x.dependsOnKeys || [],
              }),
            );
        }
      }
    }
    for (const c of custom) workstreams.push({ key: 'custom_' + c.name, name: c.name, leadPersonId: c.leadPersonId, description: '' });
    // Keep only dependencies that point to tasks included in the new plan.
    const keys = new Set(tasks.map((x) => x.key));
    tasks.forEach((x) => (x.dependsOnKeys = (x.dependsOnKeys || []).filter((k) => keys.has(k))));
    const dates = tasks.flatMap((x) => [x.start, x.due]).filter(Boolean).sort();
    return {
      name: projectName,
      company: deal.company.trim(),
      signingDate: deal.signingDate || null,
      closingDate: closing || null,
      planStart: dates[0] || closing || null,
      planEnd: deal.planEnd || (dates.length ? dates[dates.length - 1] : closing ? addDays(closing, 180) : null),
      leadPersonId: deal.leadPersonId,
      description: deal.description.trim(),
      phases,
      templateFrom: mode === 'copy' && source ? source.id : mode,
      workstreams,
      tasks,
    };
  }, [deal, mode, sourceId, keepOwners, sel, copySel, custom, S.tasks]);

  const step1Valid = deal.company.trim() && deal.closingDate;
  const step2Valid = spec.workstreams.length > 0;

  const create = async () => {
    setBusy(true);
    try {
      const pid = await createProject(spec, (a, b) => setProgress([a, b]));
      toast('ok', t('{n} has been created.', { n: spec.name }));
      go({ wizard: false, view: 'project', projectId: pid, tab: 'overview' });
    } catch {
      setBusy(false);
    }
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name || custom.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setCustom([...custom, { name, leadPersonId: null }]);
    setCustomName('');
  };

  const steps = [t('Deal'), t('Workstreams'), t('Review')];
  const footer = (
    <>
      {step > 1 && !busy && (
        <button class="btn ghost" onClick={() => setStep(step - 1)}>
          {t('Back')}
        </button>
      )}
      <span class="spacer" />
      {step < 3 ? (
        <button class="btn primary" disabled={step === 1 ? !step1Valid : !step2Valid} onClick={() => setStep(step + 1)}>
          {t('Next')}
        </button>
      ) : (
        <button class="btn primary" disabled={busy} onClick={create}>
          {busy ? t('Creating… {a} of {b}', { a: progress[0], b: progress[1] }) : t('Create project')}
        </button>
      )}
    </>
  );

  return (
    <Modal wide title={t('New PMI project')} onClose={busy ? null : onClose} footer={footer} class="wizard">
      <ol class="steps">
        {steps.map((s, i) => (
          <li class={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
            <span class="step-n">{step > i + 1 ? <Icon name="check" size={12} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div class="form-grid">
          <Field label={t('Acquired company')} htmlFor="wz-company">
            <input id="wz-company" value={deal.company} onInput={set('company')} placeholder={t('Company name')} required />
          </Field>
          <Field label={t('Project name')} htmlFor="wz-name" hint={!deal.name && projectName ? t('Will be called "{n}"', { n: projectName }) : null}>
            <input id="wz-name" value={deal.name} onInput={set('name')} placeholder={projectName || t('E.g. Acme Acquisition')} />
          </Field>
          <Field label={t('Signing')} htmlFor="wz-sign">
            <input id="wz-sign" type="date" value={deal.signingDate} onChange={set('signingDate')} />
          </Field>
          <Field label={t('Day 1 (closing)')} htmlFor="wz-close" hint={t('Template dates are calculated from this date.')}>
            <input id="wz-close" type="date" value={deal.closingDate} onChange={set('closingDate')} required />
          </Field>
          <Field label={t('PMI lead')} htmlFor="wz-lead">
            <PersonPicker id="wz-lead" multi={false} value={deal.leadPersonId} onChange={(leadPersonId) => setDeal({ ...deal, leadPersonId })} />
          </Field>
          <Field label={t('Planned end of integration')} htmlFor="wz-end" hint={t('Optional. Defaults to the last task date.')}>
            <input id="wz-end" type="date" value={deal.planEnd} onChange={set('planEnd')} />
          </Field>
          <Field label={t('Integration goals and deal rationale')} htmlFor="wz-desc" class="span2">
            <textarea id="wz-desc" rows={3} value={deal.description} onInput={set('description')} placeholder={t('What should the integration achieve? Which value drivers matter most?')} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div class="wz-ws">
          <div class="mode-pick" role="radiogroup" aria-label={t('Starting point')}>
            <button type="button" role="radio" aria-checked={mode === 'library'} class={mode === 'library' ? 'on' : ''} onClick={() => setMode('library')}>
              <strong>{t('Standard playbook')}</strong>
              <span class="small muted">{t('Standard workstreams with typical PMI tasks, timed relative to Day 1.')}</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'copy'} class={mode === 'copy' ? 'on' : ''} disabled={!sources.length} onClick={() => setMode('copy')}>
              <strong>{t('Copy an earlier project')}</strong>
              <span class="small muted">{sources.length ? t('Reuse the plan from an earlier acquisition. Dates shift to the new Day 1.') : t('No earlier projects yet.')}</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'empty'} class={mode === 'empty' ? 'on' : ''} onClick={() => setMode('empty')}>
              <strong>{t('Workstreams only')}</strong>
              <span class="small muted">{t('Choose workstreams and add the tasks yourself.')}</span>
            </button>
          </div>

          {mode === 'copy' && source ? (
            <>
              <div class="row wrap">
                <label class="inline-sel">
                  <span>{t('Copy from')}</span>
                  <select id="wz-src" value={sourceId} onChange={(e) => (setSourceId(e.currentTarget.value), setCopySel({}))}>
                    {sources.map((p) => (
                      <option value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label class="toggle">
                  <input id="wz-keep" type="checkbox" checked={keepOwners} onChange={(e) => setKeepOwners(e.currentTarget.checked)} />
                  <span>{t('Keep task owners')}</span>
                </label>
              </div>
              <p class="small muted">
                {shift ? t('Dates are shifted {n} days so that the plan lines up with the new Day 1. All tasks start as Open.', { n: shift > 0 ? '+' + shift : shift }) : t('All tasks start as Open.')}
              </p>
              <ul class="wz-list">
                {sourceWs.map((w) => {
                  const c = cs(w.id);
                  const n = sourceTasks.filter((x) => x.workstreamId === w.id).length;
                  return (
                    <li class={c.on ? 'on' : ''}>
                      <label class="wz-check">
                        <input type="checkbox" checked={c.on} onChange={(e) => setCopySel({ ...copySel, [w.id]: { ...c, on: e.currentTarget.checked } })} />
                        <span>
                          <strong>{w.name}</strong>
                          <span class="small muted block">{plural(n, '{n} task', '{n} tasks')}</span>
                        </span>
                      </label>
                      {c.on && <PersonPicker multi={false} value={c.leadPersonId} placeholder={t('Workstream lead…')} onChange={(leadPersonId) => setCopySel({ ...copySel, [w.id]: { ...c, leadPersonId } })} />}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <ul class="wz-list">
              {LIBRARY.map((l) => {
                const c = sel[l.key];
                const update = (patch) => setSel({ ...sel, [l.key]: { ...c, ...patch } });
                const nOn = l.tasks.length - c.off.length;
                return (
                  <li class={c.on ? 'on' : ''}>
                    <label class="wz-check">
                      <input type="checkbox" checked={c.on} onChange={(e) => update({ on: e.currentTarget.checked })} />
                      <span>
                        <strong>{l.name}</strong>
                        <span class="small muted block">{l.desc}</span>
                      </span>
                    </label>
                    {c.on && (
                      <div class="wz-ws-opts">
                        <PersonPicker multi={false} value={c.leadPersonId} placeholder={t('Workstream lead…')} onChange={(leadPersonId) => update({ leadPersonId })} />
                        {mode === 'library' && (
                          <button type="button" class="link-btn small" onClick={() => setOpen(open === l.key ? null : l.key)}>
                            <Icon name={open === l.key ? 'down' : 'right'} size={12} /> {t('{a} of {b} tasks', { a: nOn, b: l.tasks.length })}
                          </button>
                        )}
                      </div>
                    )}
                    {c.on && mode === 'library' && open === l.key && (
                      <ul class="wz-tasks">
                        {l.tasks.map((x) => (
                          <li>
                            <label>
                              <input type="checkbox" checked={!c.off.includes(x.key)} onChange={(e) => update({ off: e.currentTarget.checked ? c.off.filter((k) => k !== x.key) : [...c.off, x.key] })} />
                              <span>{x.title}</span>
                              <span class="mono small muted">
                                {x.start === x.end ? `D${x.end >= 0 ? '+' : ''}${x.end}` : `D${x.start >= 0 ? '+' : ''}${x.start} → D${x.end >= 0 ? '+' : ''}${x.end}`}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div class="wz-custom">
            <h4>{t('Own workstreams')}</h4>
            {custom.map((c, i) => (
              <div class="row">
                <span class="strong">{c.name}</span>
                <PersonPicker multi={false} value={c.leadPersonId} placeholder={t('Workstream lead…')} onChange={(leadPersonId) => setCustom(custom.map((x, j) => (j === i ? { ...x, leadPersonId } : x)))} />
                <button class="icon-btn" aria-label={t('Remove')} onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            <div class="row">
              <input id="wz-custom" value={customName} placeholder={t('E.g. Customer Success, Procurement')} onInput={(e) => setCustomName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
              <button class="btn small" disabled={!customName.trim()} onClick={addCustom}>
                {t('Add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div class="wz-review">
          <dl class="summary">
            <dt>{t('Project')}</dt>
            <dd>
              <strong>{spec.name}</strong> · {spec.company}
            </dd>
            <dt>{t('Day 1')}</dt>
            <dd class="mono">{spec.closingDate ? fmtDate(spec.closingDate, { year: 'numeric' }) : '—'}</dd>
            <dt>{t('PMI lead')}</dt>
            <dd>{(IDX.people.get(spec.leadPersonId) || {}).name || '—'}</dd>
            <dt>{t('Phases')}</dt>
            <dd>{spec.phases.map((p) => p.name).join(' → ')}</dd>
            <dt>{t('Plan')}</dt>
            <dd class="mono">
              {spec.planStart ? fmtDate(spec.planStart, { year: 'numeric' }) : '—'} – {spec.planEnd ? fmtDate(spec.planEnd, { year: 'numeric' }) : '—'}
            </dd>
          </dl>
          <h4>{t('{w} workstreams and {n} tasks', { w: spec.workstreams.length, n: spec.tasks.length })}</h4>
          <ul class="wz-review-list">
            {spec.workstreams.map((w) => (
              <li>
                <strong>{w.name}</strong>
                <span class="small muted">
                  {(IDX.people.get(w.leadPersonId) || {}).name || t('no lead yet')} · {plural(spec.tasks.filter((x) => x.wsKey === w.key).length, '{n} task', '{n} tasks')}
                </span>
              </li>
            ))}
          </ul>
          {busy && (
            <div class="progress big" role="progressbar" aria-valuenow={progress[0]} aria-valuemax={progress[1]}>
              <span class="seg done" style={{ width: progress[1] ? `${(progress[0] / progress[1]) * 100}%` : '0%' }} />
            </div>
          )}
          <p class="small muted">{t('Everything can be changed afterwards: workstreams, tasks, dates and owners.')}</p>
        </div>
      )}
    </Modal>
  );
}
