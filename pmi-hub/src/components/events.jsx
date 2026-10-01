import { useState } from 'preact/hooks';
import { t, plural, fmtDate, ago, fmtDateTime } from '../i18n.js';
import { S, IDX, actorName, revertChange, canEdit, toast, findEntity } from '../store.js';
import { Icon, statusLabel, priorityLabel, ragLabel, typeLabel } from './ui.jsx';

const FIELD = () => ({
  title: t('Title'),
  status: t('Status'),
  ownerIds: t('Owners'),
  start: t('Start'),
  due: t('Due'),
  description: t('Description'),
  dod: t('Definition of Done'),
  workstreamId: t('Workstream'),
  phaseId: t('Phase'),
  priority: t('Priority'),
  milestone: t('Milestone'),
  dependsOn: t('Dependencies'),
  rag: t('Assessed status (RAG)'),
  ragNote: t('Assessment comment'),
  name: t('Name'),
  leadPersonId: t('Lead'),
  closingDate: t('Day 1 (closing)'),
  signingDate: t('Signing'),
  planStart: t('Plan start'),
  planEnd: t('Planned end'),
  company: t('Company'),
  phases: t('Phases'),
  role: t('Role / title'),
  team: t('Team / company'),
  email: t('Email'),
  type: t('Type'),
  active: t('Active'),
  userId: t('Linked account'),
  order: t('Order'),
  deleted: t('Deleted'),
  date: t('Date'),
  attendeeIds: t('Attendees'),
  workstreamIds: t('Workstreams'),
  body: t('Notes'),
  happened: t('What happened this week'),
  next: t('Coming up next week'),
  footer: t('Closing line'),
  weekStart: t('Week'),
});

const HIDDEN = new Set(['order', 'deleted', 'userId']);

export function fieldLabel(f) {
  return FIELD()[f] || f;
}

export function formatValue(field, v, ctx = {}) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
  switch (field) {
    case 'status':
      return ctx.type === 'project' ? (v === 'archived' ? t('Archived') : t('Active')) : statusLabel(v);
    case 'ownerIds':
    case 'attendeeIds':
      return v.map((id) => (IDX.people.get(id) || {}).name || t('Unknown')).join(', ');
    case 'workstreamIds':
      return v.map((id) => (IDX.workstreams.get(id) || {}).name || t('Removed workstream')).join(', ');
    case 'happened':
    case 'next':
      return v.map((x) => '• ' + x).join('  ');
    case 'date':
    case 'weekStart':
      return fmtDate(v, { year: 'numeric' });
    case 'leadPersonId':
      return (IDX.people.get(v) || {}).name || t('Unknown');
    case 'start':
    case 'due':
    case 'closingDate':
    case 'signingDate':
    case 'planStart':
    case 'planEnd':
      return fmtDate(v, { year: 'numeric' });
    case 'workstreamId':
      return (IDX.workstreams.get(v) || {}).name || t('Removed workstream');
    case 'phaseId': {
      const p = IDX.projects.get(ctx.projectId);
      const ph = p && (p.phases || []).find((x) => x.id === v);
      return ph ? ph.name : v;
    }
    case 'priority':
      return priorityLabel(v);
    case 'milestone':
    case 'active':
    case 'deleted':
      return v ? t('Yes') : t('No');
    case 'dependsOn':
      return v.map((id) => (IDX.tasks.get(id) || {}).title || t('Deleted task')).join(', ');
    case 'rag':
      return ragLabel(v);
    case 'phases':
      return v.map((p) => p.name).join(', ');
    case 'type':
      return typeLabel(v);
    default:
      return String(v);
  }
}

// Verb for the event headline. With an object ("changed task X") when the
// entity is named, without one inside the entity's own panel.
function verb(ev, withObject) {
  switch (ev.a) {
    case 'create':
      return t('created');
    case 'update':
      return withObject ? t('changed') : t('made changes');
    case 'delete':
      return t('deleted');
    case 'restore':
      return t('restored');
    case 'comment':
      return withObject ? t('commented on') : t('commented');
    case 'revert':
      return withObject ? t('restored an earlier value on') : t('restored an earlier value');
    case 'import':
      return t('was imported from Excel');
    case 'baseline':
      return t('saved the plan version');
    case 'link':
      return withObject ? t('linked their account to') : t('linked their account');
    case 'unlink':
      return withObject ? t('unlinked their account from') : t('unlinked their account');
    default:
      return ev.a;
  }
}

const TYPE_WORD = () => ({ task: t('task'), project: t('project'), workstream: t('workstream'), person: t('person'), note: t('meeting note'), report: t('weekly update') });

function LongValue({ text, kind }) {
  const [open, setOpen] = useState(false);
  if (text.length <= 90) return <span class={kind}>{text}</span>;
  return (
    <span class={kind}>
      {open ? text : text.slice(0, 90) + '…'}{' '}
      <button type="button" class="link-btn small" onClick={() => setOpen(!open)}>
        {open ? t('show less') : t('show all')}
      </button>
    </span>
  );
}

export function EventItem({ ev, showEntity, onOpen }) {
  const actor = ev.a === 'import' ? null : ev.u ? actorName(ev.u) : t('Unknown user');
  const ctx = { type: ev.type, projectId: ev.type === 'project' ? ev.entityId : ev.projectId };
  const changes = ev.c ? Object.entries(ev.c).filter(([f]) => !HIDDEN.has(f)) : [];
  const ent = findEntity(ev.type, ev.entityId);
  const editable = canEdit() && ent && !((ev.type === 'task' || ev.type === 'note') && ent.deleted);
  const label = ev.l || (ent ? ent.title || ent.name : '');
  const doRevert = async (f) => {
    try {
      const changed = await revertChange(ev, f);
      if (changed) toast('ok', t('Restored: {f}', { f: fieldLabel(f) }));
      else toast('ok', t('The value is already the same as before that change.'));
    } catch {
      /* the error is already shown */
    }
  };
  return (
    <li class={`ev ev-${ev.a}`}>
      <span class="ev-dot" aria-hidden="true">
        <Icon name={ev.a === 'comment' ? 'comment' : ev.a === 'delete' ? 'trash' : ev.a === 'restore' || ev.a === 'revert' ? 'restore' : ev.a === 'create' ? 'plus' : ev.a === 'baseline' ? 'layers' : ev.a === 'import' ? 'upload' : 'edit'} size={12} />
      </span>
      <div class="ev-main">
        <div class="ev-head">
          {ev.a === 'import' ? (
            <>
              {showEntity ? (
                <>
                  <span class="ev-type">{TYPE_WORD()[ev.type]}</span> <EntityLink ev={ev} label={label} onOpen={onOpen} />{' '}
                </>
              ) : (
                <span>{t('Imported from Excel')}</span>
              )}
              {showEntity && verb(ev)}
              {ev.n ? ` (${plural(ev.n, '{n} task', '{n} tasks')})` : ''}
            </>
          ) : (
            <>
              <strong>{actor}</strong> {verb(ev, showEntity)}{' '}
              {ev.a === 'baseline' ? (
                <em>{ev.x}</em>
              ) : (
                showEntity && (
                  <>
                    <span class="ev-type">{TYPE_WORD()[ev.type]}</span> <EntityLink ev={ev} label={label} onOpen={onOpen} />
                  </>
                )
              )}
            </>
          )}
          <time datetime={ev.t} title={fmtDateTime(ev.t)}>
            {ago(ev.t)}
          </time>
        </div>
        {changes.length > 0 && (
          <ul class="ev-changes">
            {changes.map(([f, [from, to]]) => (
              <li>
                <span class="ev-f">{fieldLabel(f)}</span>
                <LongValue text={formatValue(f, from, ctx)} kind="from" />
                <span class="arrow" aria-hidden="true">→</span>
                <LongValue text={formatValue(f, to, ctx)} kind="to" />
                {editable && (ev.a === 'update' || ev.a === 'revert') && (
                  <button type="button" class="revert" title={t('Put back the value from before this change')} onClick={() => doRevert(f)}>
                    <Icon name="restore" size={12} /> {t('Restore')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {ev.a === 'comment' && <p class="ev-comment">{ev.x}</p>}
      </div>
    </li>
  );
}

function EntityLink({ ev, label, onOpen }) {
  if (ev.type === 'task' && onOpen && IDX.tasks.get(ev.entityId)) {
    return (
      <button type="button" class="link-btn ent" onClick={() => onOpen(ev.entityId)}>
        {label}
      </button>
    );
  }
  return <span class="ent">{label}</span>;
}

export function EventList({ events, showEntity, onOpen, limit = 50, empty }) {
  const [n, setN] = useState(limit);
  if (!events.length) return <p class="muted small">{empty || t('No changes yet.')}</p>;
  return (
    <>
      <ul class="evlist">
        {events.slice(0, n).map((ev) => (
          <EventItem key={ev.eid + ev.entityId} ev={ev} showEntity={showEntity} onOpen={onOpen} />
        ))}
      </ul>
      {events.length > n && (
        <button type="button" class="btn ghost small" onClick={() => setN(n + limit)}>
          {t('Show more ({n} more)', { n: events.length - n })}
        </button>
      )}
    </>
  );
}

// Groups events per day for the history view.
export function groupByDay(events) {
  const out = [];
  let cur = null;
  for (const ev of events) {
    const d = new Date(ev.t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!cur || cur.key !== key) {
      cur = { key, events: [] };
      out.push(cur);
    }
    cur.events.push(ev);
  }
  return out;
}

export const scopeLoaded = (scope) => !!S.historyLoaded[scope];
