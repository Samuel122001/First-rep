import { useEffect, useState } from 'preact/hooks';
import { t, plural, fmtDate } from '../i18n.js';
import { todayISO, stats, computeRag, dayLabel, taskHealth, daysLate, cmpDate, isOpen, diffDays } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, ensureHistory, ensureBaselines, ensureNotes, ensureReports, flattenHistory, canEdit, setWorkstreamRag, actorName, createTask } from '../store.js';
import { R, go, openTask, setFilter, DEFAULT_FILTER } from '../nav.js';
import { Icon, Progress, RagDot, Avatar, Modal, Empty, ragLabel } from '../components/ui.jsx';
import { EventList } from '../components/events.jsx';
import { Kpi, TaskRows } from './portfolio.jsx';
import { TaskList, Board } from './tasks.jsx';
import { Timeline } from './timeline.jsx';
import { Reports } from './report.jsx';
import { MeetingNotes } from './notes.jsx';
import { History } from './history.jsx';
import { Settings } from './settings.jsx';
import { exportExcel } from '../export.js';

const TABS = () => [
  { id: 'overview', label: t('Overview'), icon: 'grid' },
  { id: 'timeline', label: t('Timeline'), icon: 'gantt' },
  { id: 'tasks', label: t('Tasks'), icon: 'list' },
  { id: 'board', label: t('Board'), icon: 'board' },
  { id: 'notes', label: t('Meeting notes'), icon: 'comment' },
  { id: 'report', label: t('Reports'), icon: 'report' },
  { id: 'history', label: t('History'), icon: 'history' },
  { id: 'settings', label: t('Settings'), icon: 'settings' },
];

export function Project({ id }) {
  const p = IDX.projects.get(id);
  useEffect(() => {
    if (p) {
      ensureHistory(p.id);
      ensureBaselines(p.id);
      ensureNotes(p.id);
      ensureReports(p.id);
    }
  }, [p && p.id]);
  if (!p) {
    return (
      <div class="page">
        {S.loaded.projects ? (
          <Empty title={t('Project not found')} action={<button class="btn" onClick={() => go({ view: 'portfolio' })}>{t('Back to the portfolio')}</button>}>
            {t('It may have been removed, or you may not have access to it.')}
          </Empty>
        ) : (
          <p class="muted">{t('Loading project…')}</p>
        )}
      </div>
    );
  }
  const today = todayISO();
  const tasks = projectTasks(p.id);
  const s = stats(tasks, today);
  const lead = IDX.people.get(p.leadPersonId);
  const dl = dayLabel(p, today);
  const tab = R.tab || 'overview';

  const newTask = async () => {
    const wss = projectWorkstreams(p.id);
    const created = await createTask({ projectId: p.id, workstreamId: wss[0] && wss[0].id, phaseId: currentPhase(p, today), title: t('New task') }).catch(() => null);
    if (created) openTask(created.id);
  };

  return (
    <div class="page project">
      <header class="proj-head">
        <div class="ph-main">
          <button class="crumb-btn" onClick={() => go({ view: 'portfolio' })}>
            <Icon name="left" size={14} /> {t('Portfolio')}
          </button>
          <div class="ph-title">
            <h1>{p.name}</h1>
            {p.status === 'archived' && <span class="tag">{t('Archived')}</span>}
          </div>
          <div class="ph-meta">
            {p.company && <span>{p.company}</span>}
            {p.closingDate && (
              <span>
                {t('Day 1')}: <b class="mono">{fmtDate(p.closingDate, { year: 'numeric' })}</b>
              </span>
            )}
            {dl && (
              <span class="dchip" title={t('Days since closing (Day 1)')}>
                {dl}
              </span>
            )}
            {lead && (
              <span class="pc-lead">
                <Avatar person={lead} size={18} />
                {lead.name}
              </span>
            )}
          </div>
        </div>
        <div class="ph-side">
          <div class="ph-progress">
            <span class="small">
              <b>{s.pct}%</b> {t('complete')} · {t('{d} of {n}', { d: s.done, n: s.counted })}
            </span>
            <Progress s={s} />
          </div>
          <div class="row">
            <button class="btn ghost small" onClick={() => exportExcel(p)} title={t('Download the plan as Excel')}>
              <Icon name="download" size={14} /> {t('Excel')}
            </button>
            {canEdit() && p.status !== 'archived' && (
              <button class="btn primary small" onClick={newTask}>
                <Icon name="plus" size={14} /> {t('New task')}
              </button>
            )}
          </div>
        </div>
      </header>

      <nav class="tabs" role="tablist" aria-label={t('Project views')}>
        {TABS().map((x) => (
          <button role="tab" aria-selected={tab === x.id} class={tab === x.id ? 'on' : ''} onClick={() => go({ tab: x.id })}>
            <Icon name={x.icon} size={15} />
            <span>{x.label}</span>
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview p={p} tasks={tasks} s={s} today={today} />}
      {tab === 'timeline' && <Timeline p={p} />}
      {tab === 'tasks' && <TaskList p={p} />}
      {tab === 'board' && <Board p={p} />}
      {tab === 'notes' && <MeetingNotes p={p} />}
      {tab === 'report' && <Reports p={p} />}
      {tab === 'history' && <History p={p} />}
      {tab === 'settings' && <Settings p={p} />}
    </div>
  );
}

// The phase whose time window contains today (default for new tasks).
export function currentPhase(p, today) {
  const phases = p.phases || [];
  if (!phases.length) return null;
  if (phases.some((ph) => ph.until != null) && p.closingDate) {
    const off = diffDays(p.closingDate, today);
    const hit = phases.find((ph) => ph.until == null || off <= ph.until);
    if (hit) return hit.id;
  }
  if (p.closingDate && today >= p.closingDate && phases.length > 1) return phases[phases.length - 1].id;
  return phases[0].id;
}

function Overview({ p, tasks, s, today }) {
  const wss = projectWorkstreams(p.id);
  const [ragFor, setRagFor] = useState(null);
  const attention = tasks
    .filter((x) => ['overdue', 'blocked'].includes(taskHealth(x, today)))
    .sort((a, b) => (b.status === 'blocked') - (a.status === 'blocked') || daysLate(b, today) - daysLate(a, today));
  const upcoming = tasks.filter((x) => isOpen(x) && x.due && x.due >= today && diffDays(today, x.due) <= 14).sort((a, b) => cmpDate(a.due, b.due));
  const gaps = tasks.filter((x) => isOpen(x) && (!(x.ownerIds || []).length || !x.due));
  const milestones = tasks.filter((x) => x.milestone).sort((a, b) => cmpDate(a.due, b.due));
  const events = flattenHistory(S.history[p.id]).filter((e) => e.a !== 'import');

  return (
    <div class="overview">
      <div class="kpis">
        <Kpi label={t('Complete')} value={`${s.pct}%`} sub={t('{d} of {n} tasks', { d: s.done, n: s.counted })} />
        <Kpi label={t('In progress')} value={s.doing} />
        <Kpi label={t('Overdue')} value={s.overdue} tone={s.overdue ? 'bad' : ''} />
        <Kpi label={t('Blocked')} value={s.blocked} tone={s.blocked ? 'bad' : ''} />
        <Kpi label={t('Due within 14 days')} value={s.soon} tone={s.soon ? 'warn' : ''} />
      </div>

      <section class="card">
        <header class="card-head">
          <h2>{t('Workstreams')}</h2>
          <span class="muted small" title={t('Red: something is blocked or more than 14 days overdue. Amber: something is overdue. Green: nothing overdue.')}>
            {t('Computed status from dates · assessment from the lead')}
          </span>
        </header>
        {!wss.length ? (
          <p class="pad muted">{t('No workstreams. Add them under Settings.')}</p>
        ) : (
          <div class="table-wrap">
            <table class="wstable">
              <thead>
                <tr>
                  <th>{t('Workstream')}</th>
                  <th>{t('Lead')}</th>
                  <th class="w-prog">{t('Progress')}</th>
                  <th>{t('Computed')}</th>
                  <th>{t('Assessment')}</th>
                  <th>{t('Next due')}</th>
                </tr>
              </thead>
              <tbody>
                {wss.map((w) => {
                  const wt = tasks.filter((x) => x.workstreamId === w.id);
                  const ws = stats(wt, today);
                  const crag = computeRag(wt, today);
                  const next = wt.filter((x) => isOpen(x) && x.due).sort((a, b) => cmpDate(a.due, b.due))[0];
                  const lead = IDX.people.get(w.leadPersonId);
                  return (
                    <tr>
                      <td>
                        <button class="link-btn strong" onClick={() => (setFilter(p.id, { ...DEFAULT_FILTER, ws: [w.id] }), go({ tab: 'tasks' }))}>
                          {w.name}
                        </button>
                        <span class="small muted block">{plural(ws.total, '{n} task', '{n} tasks')}</span>
                      </td>
                      <td>{lead ? <span class="pc-lead"><Avatar person={lead} size={20} />{lead.name}</span> : <span class="muted">—</span>}</td>
                      <td class="w-prog">
                        <Progress s={ws} thin />
                        <span class="small muted">
                          {ws.pct}%{ws.overdue ? ` · ` : ''}
                          {ws.overdue ? <span class="bad">{t('{n} overdue', { n: ws.overdue })}</span> : ''}
                        </span>
                      </td>
                      <td>
                        <span class="rag-cell">
                          <RagDot rag={crag} /> {ragLabel(crag)}
                        </span>
                      </td>
                      <td>
                        <button class="rag-btn" disabled={!canEdit()} onClick={() => setRagFor(w.id)} title={canEdit() ? t('Set assessment') : ''}>
                          <RagDot rag={w.rag} />
                          <span>
                            {w.rag ? ragLabel(w.rag) : t('Set assessment')}
                            {w.ragNote && <span class="small muted block clamp">{w.ragNote}</span>}
                            {w.rag && w.ragAt && (
                              <span class="small muted block">
                                {fmtDate(w.ragAt.slice(0, 10))}
                                {w.ragBy ? ` · ${actorName(w.ragBy)}` : ''}
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                      <td class="small">
                        {next ? (
                          <button class="link-btn next-due" onClick={() => openTask(next.id)}>
                            <span class="mono">{fmtDate(next.due)}</span>
                            <span>{next.title}</span>
                          </button>
                        ) : (
                          <span class="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div class="two-col">
        <section class="card">
          <header class="card-head">
            <h2>{t('Needs attention')}</h2>
            <span class="count">{attention.length}</span>
          </header>
          {attention.length ? <TaskRows tasks={attention} today={today} /> : <p class="pad muted small">{t('Nothing is overdue or blocked.')}</p>}
        </section>
        <section class="card">
          <header class="card-head">
            <h2>{t('Next 14 days')}</h2>
            <span class="count">{upcoming.length}</span>
          </header>
          {upcoming.length ? <TaskRows tasks={upcoming} today={today} /> : <p class="pad muted small">{t('Nothing is due in the next two weeks.')}</p>}
        </section>
      </div>

      <div class="two-col">
        <section class="card">
          <header class="card-head">
            <h2>{t('Milestones')}</h2>
          </header>
          {milestones.length ? (
            <ul class="milestones">
              {milestones.map((m) => (
                <li class={m.status === 'done' ? 'done' : m.due && m.due < today ? 'late' : ''} onClick={() => openTask(m.id)}>
                  <Icon name="diamond" size={14} />
                  <span class="mono small">{m.due ? fmtDate(m.due, { year: 'numeric' }) : '—'}</span>
                  <span>{m.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="pad muted small">{t('No milestones. Mark a task as a milestone in the task panel.')}</p>
          )}
          {p.closingDate && (
            <p class="pad small muted">
              {t('Day 1 (closing)')}: <b class="mono">{fmtDate(p.closingDate, { year: 'numeric' })}</b>
            </p>
          )}
        </section>
        <section class="card">
          <header class="card-head">
            <h2>{t('Gaps in the plan')}</h2>
            <span class="count">{gaps.length}</span>
          </header>
          {gaps.length ? (
            <ul class="gaps">
              {gaps.slice(0, 10).map((x) => (
                <li onClick={() => openTask(x.id)}>
                  <span>{x.title}</span>
                  <span class="small muted">{[!(x.ownerIds || []).length && t('no owner'), !x.due && t('no due date')].filter(Boolean).join(', ')}</span>
                </li>
              ))}
              {gaps.length > 10 && <li class="muted small">{t('+ {n} more', { n: gaps.length - 10 })}</li>}
            </ul>
          ) : (
            <p class="pad muted small">{t('Every open task has an owner and a due date.')}</p>
          )}
        </section>
      </div>

      <section class="card">
        <header class="card-head">
          <h2>{t('Recent changes')}</h2>
          <button class="link-btn small" onClick={() => go({ tab: 'history' })}>
            {t('Full history')}
          </button>
        </header>
        <div class="pad">{S.historyLoaded[p.id] ? <EventList events={events.slice(0, 8)} showEntity onOpen={openTask} limit={8} empty={t('No changes since the import.')} /> : <p class="muted small">{t('Loading history…')}</p>}</div>
      </section>

      {ragFor && <RagModal w={IDX.workstreams.get(ragFor)} onClose={() => setRagFor(null)} />}
    </div>
  );
}

function RagModal({ w, onClose }) {
  const [rag, setRag] = useState(w.rag || null);
  const [note, setNote] = useState(w.ragNote || '');
  const save = async () => {
    await setWorkstreamRag(w, rag, rag ? note.trim() : '').catch(() => {});
    onClose();
  };
  const pick = (r) => {
    setRag(r);
    // "None" means no assessment, so its comment goes too.
    if (!r) setNote('');
  };
  return (
    <Modal
      title={t('Assessment: {n}', { n: w.name })}
      onClose={onClose}
      footer={
        <>
          <button class="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button class="btn primary" onClick={save}>
            {t('Save assessment')}
          </button>
        </>
      }
    >
      <p class="muted small">{t('The workstream lead\'s own assessment, for example ahead of the steering committee. The computed status is always shown next to it.')}</p>
      <div class="rag-pick" role="radiogroup" aria-label={t('Assessment')}>
        {['green', 'amber', 'red', null].map((r) => (
          <button type="button" role="radio" aria-checked={rag === r} class={rag === r ? 'on' : ''} onClick={() => pick(r)}>
            <RagDot rag={r} />
            {r ? ragLabel(r) : t('None')}
          </button>
        ))}
      </div>
      <label for="rag-note" class="lbl">
        {t('Comment')}
      </label>
      <textarea
        id="rag-note"
        rows={3}
        value={note}
        disabled={!rag}
        placeholder={rag ? t('What drives the assessment? What is needed from the steering committee?') : t('Choose Green, Amber or Red to add a comment.')}
        onInput={(e) => setNote(e.currentTarget.value)}
      />
    </Modal>
  );
}
