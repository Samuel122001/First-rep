import { useState } from 'preact/hooks';
import { t, plural } from '../i18n.js';
import { uid } from '../util.js';
import { IDX, projectTasks, projectWorkstreams, updateProject, createWorkstream, updateWorkstream, deleteWorkstream, canEdit, toast } from '../store.js';
import { Icon, EditText, DateInput, PersonPicker, confirmDialog } from '../components/ui.jsx';
import { LIBRARY } from '../templates.js';

export function Settings({ p }) {
  const editable = canEdit();
  const save = (patch) => updateProject(p, patch).catch(() => {});
  const tasks = projectTasks(p.id);
  const wss = projectWorkstreams(p.id);

  const toggleArchive = async () => {
    const archiving = p.status !== 'archived';
    const ok = await confirmDialog({
      title: archiving ? t('Archive {n}?', { n: p.name }) : t('Reactivate {n}?', { n: p.name }),
      body: archiving
        ? t('The project is hidden from the portfolio and from "My tasks", but all data and history are kept. You can reactivate it at any time.')
        : t('The project is shown in the portfolio again.'),
      ok: archiving ? t('Archive') : t('Reactivate'),
      danger: archiving,
    });
    if (ok) save({ status: archiving ? 'archived' : 'active' });
  };

  return (
    <div class="settings">
      <section class="card pad">
        <h2>{t('Project details')}</h2>
        <div class="form-grid">
          <div class="field span2">
            <label for="st-name">{t('Project name')}</label>
            <EditText id="st-name" value={p.name} disabled={!editable} onSave={(name) => name && save({ name })} />
          </div>
          <div class="field">
            <label for="st-company">{t('Acquired company')}</label>
            <EditText id="st-company" value={p.company} disabled={!editable} onSave={(company) => save({ company })} />
          </div>
          <div class="field">
            <label for="st-lead">{t('PMI lead')}</label>
            <PersonPicker id="st-lead" multi={false} value={p.leadPersonId} disabled={!editable} onChange={(leadPersonId) => save({ leadPersonId })} />
          </div>
          <div class="field">
            <label for="st-sign">{t('Signing')}</label>
            <DateInput id="st-sign" value={p.signingDate} disabled={!editable} onSave={(signingDate) => save({ signingDate })} />
          </div>
          <div class="field">
            <label for="st-close">{t('Day 1 (closing)')}</label>
            <DateInput id="st-close" value={p.closingDate} disabled={!editable} onSave={(closingDate) => save({ closingDate })} />
            <span class="hint">{t('Drives the D+ counter and the Day 1 line in the timeline.')}</span>
          </div>
          <div class="field">
            <label for="st-end">{t('Planned end of integration')}</label>
            <DateInput id="st-end" value={p.planEnd} disabled={!editable} onSave={(planEnd) => save({ planEnd })} />
          </div>
          <div class="field span2">
            <label for="st-desc">{t('Integration goals and deal rationale')}</label>
            <EditText id="st-desc" multiline rows={3} value={p.description} disabled={!editable} placeholder={t('What should the integration achieve? Which value drivers matter most?')} onSave={(description) => save({ description })} />
          </div>
        </div>
      </section>

      <Workstreams p={p} wss={wss} tasks={tasks} editable={editable} />
      <Phases p={p} tasks={tasks} editable={editable} save={save} />

      {editable && (
        <section class="card pad danger-zone">
          <h2>{p.status === 'archived' ? t('Archived project') : t('Archive project')}</h2>
          <p class="small muted">{t('Archive the project when the integration is complete. Nothing is deleted.')}</p>
          <button class={`btn ${p.status === 'archived' ? 'primary' : 'ghost danger'}`} onClick={toggleArchive}>
            <Icon name="archive" size={14} /> {p.status === 'archived' ? t('Reactivate project') : t('Archive project')}
          </button>
        </section>
      )}
    </div>
  );
}

function Workstreams({ p, wss, tasks, editable }) {
  const [custom, setCustom] = useState('');
  const [lib, setLib] = useState('');
  const existing = new Set(wss.map((w) => w.name.toLowerCase()));
  const available = LIBRARY.filter((l) => !existing.has(l.name.toLowerCase()));
  const nextOrder = (wss.length ? Math.max(...wss.map((w) => w.order || 0)) : 0) + 10;

  const add = async (name, description) => {
    if (!name.trim()) return;
    await createWorkstream({ projectId: p.id, name: name.trim(), description: description || '', leadPersonId: null, order: nextOrder }).catch(() => {});
    toast('ok', t('Workstream "{n}" added.', { n: name.trim() }));
  };
  const move = async (i, dir) => {
    const a = wss[i];
    const b = wss[i + dir];
    if (!a || !b) return;
    await updateWorkstream(a, { order: b.order }).catch(() => {});
    await updateWorkstream(b, { order: a.order }).catch(() => {});
  };
  const remove = async (w) => {
    const ok = await confirmDialog({ title: t('Remove {n}?', { n: w.name }), body: t('The workstream is removed from the project. Its history is kept.'), ok: t('Remove'), danger: true });
    if (ok) deleteWorkstream(w).catch(() => {});
  };

  return (
    <section class="card pad">
      <h2>{t('Workstreams')}</h2>
      <p class="small muted">{t('Add workstreams as the integration evolves. A workstream can be removed once it has no tasks.')}</p>
      <ul class="ws-edit">
        {wss.map((w, i) => {
          const n = tasks.filter((x) => x.workstreamId === w.id).length;
          return (
            <li>
              <div class="ws-order">
                <button class="icon-btn small" disabled={!editable || i === 0} onClick={() => move(i, -1)} aria-label={t('Move up')}>
                  <Icon name="down" size={12} class="flip" />
                </button>
                <button class="icon-btn small" disabled={!editable || i === wss.length - 1} onClick={() => move(i, 1)} aria-label={t('Move down')}>
                  <Icon name="down" size={12} />
                </button>
              </div>
              <div class="ws-fields">
                <EditText id={`ws-name-${w.id}`} class="strong" value={w.name} disabled={!editable} onSave={(name) => name && updateWorkstream(w, { name }).catch(() => {})} ariaLabel={t('Workstream name')} />
                <PersonPicker id={`ws-lead-${w.id}`} multi={false} value={w.leadPersonId} disabled={!editable} placeholder={t('Workstream lead…')} onChange={(leadPersonId) => updateWorkstream(w, { leadPersonId }).catch(() => {})} />
                <EditText id={`ws-desc-${w.id}`} value={w.description} disabled={!editable} placeholder={t('Scope (optional)')} onSave={(description) => updateWorkstream(w, { description }).catch(() => {})} ariaLabel={t('Scope')} />
              </div>
              <span class="small muted">{plural(n, '{n} task', '{n} tasks')}</span>
              {editable && (
                <button class="icon-btn" disabled={n > 0} title={n > 0 ? t('Move or delete its tasks first') : t('Remove workstream')} aria-label={t('Remove workstream')} onClick={() => remove(w)}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <div class="add-row">
          {available.length > 0 && (
            <div class="row">
              <select id="ws-lib" value={lib} onChange={(e) => setLib(e.currentTarget.value)} aria-label={t('Standard workstream')}>
                <option value="">{t('Add a standard workstream…')}</option>
                {available.map((l) => (
                  <option value={l.key}>{l.name}</option>
                ))}
              </select>
              <button
                class="btn small"
                disabled={!lib}
                onClick={() => {
                  const l = LIBRARY.find((x) => x.key === lib);
                  add(l.name, l.desc);
                  setLib('');
                }}
              >
                {t('Add')}
              </button>
            </div>
          )}
          <div class="row">
            <input id="ws-custom" value={custom} placeholder={t('Or type a name for a new workstream')} onInput={(e) => setCustom(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && (add(custom), setCustom(''))} />
            <button class="btn small" disabled={!custom.trim()} onClick={() => (add(custom), setCustom(''))}>
              {t('Add')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Phases({ p, tasks, editable, save }) {
  const [name, setName] = useState('');
  const phases = p.phases || [];
  const used = (id) => tasks.filter((x) => x.phaseId === id).length;
  const setPhases = (next) => save({ phases: next });
  const rename = (i, v) => v && setPhases(phases.map((ph, j) => (j === i ? { ...ph, name: v } : ph)));
  const move = (i, dir) => {
    const next = [...phases];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setPhases(next);
  };
  return (
    <section class="card pad">
      <h2>{t('Phases')}</h2>
      <p class="small muted">{t('Phases group the plan over time, for example pre-close, the first 100 days and long-term integration.')}</p>
      <ul class="ws-edit">
        {phases.map((ph, i) => (
          <li>
            <div class="ws-order">
              <button class="icon-btn small" disabled={!editable || i === 0} onClick={() => move(i, -1)} aria-label={t('Move up')}>
                <Icon name="down" size={12} class="flip" />
              </button>
              <button class="icon-btn small" disabled={!editable || i === phases.length - 1} onClick={() => move(i, 1)} aria-label={t('Move down')}>
                <Icon name="down" size={12} />
              </button>
            </div>
            <div class="ws-fields">
              <EditText id={`ph-${ph.id}`} class="strong" value={ph.name} disabled={!editable} onSave={(v) => rename(i, v)} ariaLabel={t('Phase name')} />
            </div>
            <span class="small muted">{plural(used(ph.id), '{n} task', '{n} tasks')}</span>
            {editable && (
              <button class="icon-btn" disabled={used(ph.id) > 0} title={used(ph.id) ? t('Phase is in use') : t('Remove phase')} aria-label={t('Remove phase')} onClick={() => setPhases(phases.filter((x) => x.id !== ph.id))}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div class="row add-row">
          <input id="ph-new" value={name} placeholder={t('New phase')} onInput={(e) => setName(e.currentTarget.value)} />
          <button class="btn small" disabled={!name.trim()} onClick={() => (setPhases([...phases, { id: uid('ph'), name: name.trim() }]), setName(''))}>
            {t('Add phase')}
          </button>
        </div>
      )}
    </section>
  );
}
