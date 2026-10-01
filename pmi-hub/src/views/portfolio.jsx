import { useState } from 'preact/hooks';
import { t, fmtDate, relDue } from '../i18n.js';
import { todayISO, stats, computeRag, dayLabel, taskHealth, daysLate, cmpDate, isOpen } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, canEdit } from '../store.js';
import { go, openTask } from '../nav.js';
import { Icon, Progress, RagDot, Avatar, Owners, Empty, StatusSelect } from '../components/ui.jsx';
import { updateTask } from '../store.js';

export function Portfolio() {
  const today = todayISO();
  const [showArchived, setShowArchived] = useState(false);
  const projects = [...S.projects].sort((a, b) => cmpDate(b.closingDate, a.closingDate));
  const active = projects.filter((p) => p.status !== 'archived');
  const archived = projects.filter((p) => p.status === 'archived');

  const attention = active
    .flatMap((p) => projectTasks(p.id).filter((x) => ['overdue', 'blocked'].includes(taskHealth(x, today))))
    .sort((a, b) => (b.status === 'blocked') - (a.status === 'blocked') || daysLate(b, today) - daysLate(a, today));

  const all = active.flatMap((p) => projectTasks(p.id));
  const s = stats(all, today);

  return (
    <div class="page">
      <header class="page-head">
        <div>
          <p class="eyebrow">{t('Portfolio')}</p>
          <h1>{t('PMI projects')}</h1>
          <p class="lede">{t('The integration work for every acquired company in one place. Every change is saved instantly and visible to everyone.')}</p>
        </div>
        {canEdit() && (
          <button class="btn primary" onClick={() => go({ wizard: true })}>
            <Icon name="plus" /> {t('New PMI project')}
          </button>
        )}
      </header>

      {!S.loaded.projects ? (
        <div class="skeleton-grid">
          <div class="skel" />
          <div class="skel" />
        </div>
      ) : !projects.length ? (
        <Empty
          title={t('No PMI projects yet')}
          action={
            canEdit() && (
              <div class="row wrap">
                <button class="btn primary" onClick={() => go({ wizard: true })}>
                  <Icon name="plus" /> {t('Start the first PMI project')}
                </button>
                {S.backend === 'firebase' && (
                  <button class="btn" onClick={() => go({ backup: true })}>
                    <Icon name="upload" /> {t('Import a backup from the claude.ai version')}
                  </button>
                )}
              </div>
            )
          }
        >
          {t('When an acquisition is signed, create a project for the company, choose the relevant workstreams and assign the tasks.')}
        </Empty>
      ) : (
        <>
          {active.length > 0 && (
            <div class="kpis">
              <Kpi label={t('Active projects')} value={active.length} />
              <Kpi label={t('Complete overall')} value={`${s.pct}%`} sub={t('{d} of {n} tasks', { d: s.done, n: s.counted })} />
              <Kpi label={t('Overdue')} value={s.overdue} tone={s.overdue ? 'bad' : ''} />
              <Kpi label={t('Blocked')} value={s.blocked} tone={s.blocked ? 'bad' : ''} />
              <Kpi label={t('Due within 14 days')} value={s.soon} tone={s.soon ? 'warn' : ''} />
            </div>
          )}
          <div class="proj-grid">
            {active.map((p) => (
              <ProjectCard p={p} today={today} />
            ))}
            {canEdit() && (
              <button class="proj-card new" onClick={() => go({ wizard: true })}>
                <Icon name="plus" size={22} />
                <span>{t('New PMI project')}</span>
                <span class="small muted">{t('For a newly acquired company')}</span>
              </button>
            )}
          </div>

          {attention.length > 0 && (
            <section class="card">
              <header class="card-head">
                <h2>{t('Needs attention across projects')}</h2>
                <span class="muted small">{t('Blocked and overdue tasks')}</span>
              </header>
              <TaskRows tasks={attention.slice(0, 12)} today={today} showProject />
              {attention.length > 12 && <p class="small muted pad">{t('+ {n} more. Open each project for the full list.', { n: attention.length - 12 })}</p>}
            </section>
          )}

          {archived.length > 0 && (
            <section>
              <button class="link-btn" onClick={() => setShowArchived(!showArchived)}>
                <Icon name={showArchived ? 'down' : 'right'} size={14} /> {t('Archived projects ({n})', { n: archived.length })}
              </button>
              {showArchived && (
                <div class="proj-grid">
                  {archived.map((p) => (
                    <ProjectCard p={p} today={today} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div class={`kpi ${tone || ''}`}>
      <span class="kpi-label">{label}</span>
      <span class="kpi-value">{value}</span>
      {sub && <span class="kpi-sub">{sub}</span>}
    </div>
  );
}

function ProjectCard({ p, today }) {
  const tasks = projectTasks(p.id);
  const s = stats(tasks, today);
  const wss = projectWorkstreams(p.id);
  const lead = IDX.people.get(p.leadPersonId);
  const dl = dayLabel(p, today);
  return (
    <button class={`proj-card ${p.status === 'archived' ? 'archived' : ''}`} onClick={() => go({ view: 'project', projectId: p.id, tab: 'overview' })}>
      <div class="pc-top">
        <div>
          <h3>{p.name}</h3>
          <span class="muted small">{p.company}</span>
        </div>
        {dl && (
          <span class="dchip" title={t('Days since closing (Day 1)')}>
            {dl}
          </span>
        )}
      </div>
      <div class="pc-meta small">
        {p.closingDate && (
          <span>
            {t('Day 1')}: <b>{fmtDate(p.closingDate, { year: 'numeric' })}</b>
          </span>
        )}
        {lead && (
          <span class="pc-lead">
            <Avatar person={lead} size={18} /> {lead.name}
          </span>
        )}
      </div>
      <Progress s={s} />
      <div class="pc-stats small">
        <span>
          <b>{s.pct}%</b> {t('complete')} · {s.done}/{s.counted}
        </span>
        {s.overdue > 0 && <span class="bad">{t('{n} overdue', { n: s.overdue })}</span>}
        {s.blocked > 0 && <span class="bad">{t('{n} blocked', { n: s.blocked })}</span>}
      </div>
      <div class="pc-ws">
        {wss.map((w) => {
          const wt = tasks.filter((x) => x.workstreamId === w.id);
          const rag = w.rag || computeRag(wt, today);
          return (
            <span class="pc-ws-item" title={`${w.name}: ${w.rag ? t('assessed') : t('computed')}`}>
              <RagDot rag={rag} />
              {w.name}
            </span>
          );
        })}
      </div>
    </button>
  );
}

// Compact task list used in several places.
export function TaskRows({ tasks, today, showProject, showWs = true }) {
  return (
    <ul class="trows">
      {tasks.map((x) => {
        const h = taskHealth(x, today);
        const ws = IDX.workstreams.get(x.workstreamId);
        const p = IDX.projects.get(x.projectId);
        return (
          <li class={`trow h-${h}`} tabIndex={0} onClick={() => openTask(x.id)} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openTask(x.id)}>
            <StatusSelect compact value={x.status} disabled={!canEdit()} onChange={(status) => updateTask(x, { status }).catch(() => {})} />
            <span class="trow-main">
              <span class="trow-title">{x.title}</span>
              <span class="trow-sub small muted">
                {[showProject && p && p.name, showWs && ws && ws.name].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Owners ids={x.ownerIds} max={2} size={20} />
            <span class={`trow-due small ${h}`}>
              {x.due ? (
                <>
                  <span class="mono">{fmtDate(x.due)}</span>
                  {isOpen(x) && <span class="rel">{relDue(x.due, today)}</span>}
                </>
              ) : (
                <span class="muted">{t('No date')}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
