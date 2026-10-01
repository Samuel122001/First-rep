import { useState } from 'preact/hooks';
import { t, plural, fmtDate, fmtDateTime } from '../i18n.js';
import { todayISO, diffDays, cmpDate } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, flattenHistory, actorName, canEdit, restoreTask, restoreNote, createBaseline, deleteBaseline, toast } from '../store.js';
import { openTask } from '../nav.js';
import { Icon, Modal, Empty, StatusPill, confirmDialog, statusLabel } from '../components/ui.jsx';
import { EventItem, groupByDay } from '../components/events.jsx';

export function History({ p }) {
  const [sub, setSub] = useState('log');
  const deleted = [
    ...projectTasks(p.id, true).filter((x) => x.deleted),
    ...(S.notes[p.id] || []).filter((n) => n.deleted).map((n) => ({ ...n, isNote: true, title: n.title || `${t('Meeting note')} ${fmtDate(n.date)}` })),
  ];
  const baselines = S.baselines[p.id] || [];
  return (
    <div class="history-view">
      <div class="tabs small-tabs" role="tablist">
        <button role="tab" aria-selected={sub === 'log'} class={sub === 'log' ? 'on' : ''} onClick={() => setSub('log')}>
          {t('Change log')}
        </button>
        <button role="tab" aria-selected={sub === 'versions'} class={sub === 'versions' ? 'on' : ''} onClick={() => setSub('versions')}>
          {t('Plan versions')} <span class="count">{baselines.length}</span>
        </button>
        <button role="tab" aria-selected={sub === 'trash'} class={sub === 'trash' ? 'on' : ''} onClick={() => setSub('trash')}>
          {t('Trash')} <span class="count">{deleted.length}</span>
        </button>
      </div>
      {sub === 'log' && <ChangeLog p={p} />}
      {sub === 'versions' && <Versions p={p} baselines={baselines} />}
      {sub === 'trash' && <Trash p={p} deleted={deleted} />}
    </div>
  );
}

function ChangeLog({ p }) {
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('');
  const [ws, setWs] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(150);
  if (!S.historyLoaded[p.id]) return <p class="muted pad">{t('Loading history…')}</p>;
  const all = flattenHistory(S.history[p.id]).filter((e) => !(e.a === 'import' && e.type !== 'project'));
  const actors = [...new Set(all.map((e) => e.u).filter(Boolean))];
  const ql = q.trim().toLowerCase();
  const events = all.filter((e) => {
    if (who && e.u !== who) return false;
    if (kind === 'status' && !(e.c && e.c.status)) return false;
    if (kind === 'dates' && !(e.c && (e.c.start || e.c.due))) return false;
    if (kind === 'owners' && !(e.c && e.c.ownerIds)) return false;
    if (kind === 'comment' && e.a !== 'comment') return false;
    if (kind === 'create' && e.a !== 'create') return false;
    if (kind === 'delete' && !['delete', 'restore'].includes(e.a)) return false;
    if (kind === 'plan' && !['workstream', 'project'].includes(e.type)) return false;
    if (kind === 'notes' && !['note', 'report'].includes(e.type)) return false;
    if (ws) {
      const task = e.type === 'task' && IDX.tasks.get(e.entityId);
      if (!(task && task.workstreamId === ws) && e.entityId !== ws) return false;
    }
    if (ql && !`${e.l || ''} ${e.x || ''}`.toLowerCase().includes(ql)) return false;
    return true;
  });
  const days = groupByDay(events.slice(0, limit));
  return (
    <>
      <p class="small muted">{t('Every change is saved with who made it, when, and the value before and after. Use Restore to put a field back to its earlier value; the restore is logged as a new change.')}</p>
      <div class="filterbar">
        <div class="search">
          <Icon name="search" size={14} />
          <input id="hl-q" type="search" placeholder={t('Search task or comment…')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
        <select id="hl-kind" class={`fsel ${kind ? 'on' : ''}`} value={kind} onChange={(e) => setKind(e.currentTarget.value)} aria-label={t('Type of change')}>
          <option value="">{t('All changes')}</option>
          <option value="status">{t('Status changes')}</option>
          <option value="dates">{t('Date changes')}</option>
          <option value="owners">{t('Owner changes')}</option>
          <option value="comment">{t('Comments')}</option>
          <option value="create">{t('New tasks')}</option>
          <option value="delete">{t('Deleted and restored')}</option>
          <option value="plan">{t('Project and workstreams')}</option>
          <option value="notes">{t('Meeting notes and weekly updates')}</option>
        </select>
        <select id="hl-who" class={`fsel ${who ? 'on' : ''}`} value={who} onChange={(e) => setWho(e.currentTarget.value)} aria-label={t('Changed by')}>
          <option value="">{t('Everyone')}</option>
          {actors.map((u) => (
            <option value={u}>{actorName(u)}</option>
          ))}
        </select>
        <select id="hl-ws" class={`fsel ${ws ? 'on' : ''}`} value={ws} onChange={(e) => setWs(e.currentTarget.value)} aria-label={t('Workstream')}>
          <option value="">{t('All workstreams')}</option>
          {projectWorkstreams(p.id).map((w) => (
            <option value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
      {!events.length ? (
        <Empty title={t('No changes found')}>{all.length ? t('Change the filter to see more.') : t('Changes appear here as soon as someone edits the plan.')}</Empty>
      ) : (
        <div class="card pad">
          {days.map((d) => (
            <section class="day">
              <h3 class="day-head">{fmtDate(d.key, { weekday: 'long', year: 'numeric' })}</h3>
              <ul class="evlist">
                {d.events.map((ev) => (
                  <EventItem key={ev.eid + ev.entityId} ev={ev} showEntity onOpen={openTask} />
                ))}
              </ul>
            </section>
          ))}
          {events.length > limit && (
            <button class="btn ghost small" onClick={() => setLimit(limit + 150)}>
              {t('Show more ({n} more)', { n: events.length - limit })}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Versions({ p, baselines }) {
  const [creating, setCreating] = useState(false);
  const [compare, setCompare] = useState(null);
  const remove = async (b) => {
    const ok = await confirmDialog({ title: t('Delete plan version?'), body: t('"{n}" is deleted permanently. The plan and its change log are not affected.', { n: b.name }), ok: t('Delete'), danger: true });
    if (ok) deleteBaseline(b).catch(() => {});
  };
  const cmp = compare && baselines.find((b) => b.id === compare);
  return (
    <>
      <div class="intro-row">
        <p class="small muted">{t('A plan version is a snapshot of all tasks (dates, status, owners). Save one before each steering committee meeting and compare later to see what has slipped, what is new and what has been completed.')}</p>
        {canEdit() && (
          <button class="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="layers" size={14} /> {t('Save plan version')}
          </button>
        )}
      </div>
      {!baselines.length ? (
        <Empty title={t('No saved plan versions')}>{t('Save the current plan as version 1 to start tracking how it changes over time.')}</Empty>
      ) : (
        <div class="card">
          <ul class="versions">
            {baselines.map((b) => (
              <li class={compare === b.id ? 'on' : ''}>
                <div>
                  <strong>{b.name}</strong>
                  <span class="small muted block">
                    {fmtDateTime(b.createdAt)}
                    {b.createdBy && ` · ${actorName(b.createdBy)}`} · {plural(Object.keys(b.tasks || {}).length, '{n} task', '{n} tasks')}
                  </span>
                  {b.note && <span class="small block">{b.note}</span>}
                </div>
                <div class="row">
                  <button class="btn small" onClick={() => setCompare(compare === b.id ? null : b.id)}>
                    {compare === b.id ? t('Hide comparison') : t('Compare with current plan')}
                  </button>
                  {canEdit() && (
                    <button class="icon-btn" aria-label={t('Delete plan version')} onClick={() => remove(b)}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cmp && <Compare p={p} b={cmp} />}
      {creating && <NewVersion p={p} count={baselines.length} onClose={() => setCreating(false)} />}
    </>
  );
}

function NewVersion({ p, count, onClose }) {
  const today = todayISO();
  const [name, setName] = useState(`${t('Plan v{n}', { n: count + 1 })} · ${fmtDate(today, { year: 'numeric' })}`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createBaseline(p, name.trim(), note.trim());
      toast('ok', t('Plan version saved.'));
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('Save plan version')}
      onClose={onClose}
      footer={
        <>
          <button class="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button class="btn primary" onClick={save} disabled={busy || !name.trim()}>
            {t('Save')}
          </button>
        </>
      }
    >
      <label class="lbl" for="bv-name">
        {t('Name')}
      </label>
      <input id="bv-name" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <label class="lbl" for="bv-note">
        {t('Note (optional)')}
      </label>
      <textarea id="bv-note" rows={2} value={note} placeholder={t('E.g. "Approved by the steering committee"')} onInput={(e) => setNote(e.currentTarget.value)} />
    </Modal>
  );
}

function Compare({ p, b }) {
  const current = projectTasks(p.id);
  const curMap = new Map(current.map((x) => [x.id, x]));
  const rows = [];
  for (const [id, old] of Object.entries(b.tasks || {})) {
    const now = curMap.get(id);
    if (!now) {
      rows.push({ kind: 'removed', id, title: old.ti, ws: old.ws, old });
      continue;
    }
    const delta = old.d && now.due ? diffDays(old.d, now.due) : null;
    const statusChanged = old.st !== now.status;
    const ownersChanged = (old.o || []).join() !== (now.ownerIds || []).join();
    if ((delta && delta !== 0) || statusChanged || ownersChanged || (!old.d) !== (!now.due)) rows.push({ kind: 'changed', id, title: now.title, ws: now.workstreamId, old, now, delta, statusChanged, ownersChanged });
  }
  for (const x of current) if (!b.tasks[x.id]) rows.push({ kind: 'new', id: x.id, title: x.title, ws: x.workstreamId, now: x });
  const later = rows.filter((r) => r.delta > 0);
  const earlier = rows.filter((r) => r.delta < 0);
  const completed = rows.filter((r) => r.statusChanged && r.now.status === 'done');
  const avg = later.length ? Math.round(later.reduce((n, r) => n + r.delta, 0) / later.length) : 0;
  rows.sort((a, c) => (c.delta || 0) - (a.delta || 0) || (a.kind > c.kind ? 1 : -1));
  const wsName = (id) => (IDX.workstreams.get(id) || {}).name || '—';
  return (
    <section class="card compare">
      <header class="card-head">
        <h2>{t('{name} compared with the current plan', { name: b.name })}</h2>
      </header>
      <div class="kpis small-kpis pad">
        <div class={`kpi ${later.length ? 'warn' : ''}`}>
          <span class="kpi-label">{t('Moved later')}</span>
          <span class="kpi-value">{later.length}</span>
          {later.length > 0 && <span class="kpi-sub">{t('on average +{n} days', { n: avg })}</span>}
        </div>
        <div class="kpi">
          <span class="kpi-label">{t('Moved earlier')}</span>
          <span class="kpi-value">{earlier.length}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">{t('Completed since')}</span>
          <span class="kpi-value">{completed.length}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">{t('New tasks')}</span>
          <span class="kpi-value">{rows.filter((r) => r.kind === 'new').length}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">{t('Removed')}</span>
          <span class="kpi-value">{rows.filter((r) => r.kind === 'removed').length}</span>
        </div>
      </div>
      {!rows.length ? (
        <p class="pad muted">{t('No differences. The plan is the same as in this version.')}</p>
      ) : (
        <div class="table-wrap">
          <table class="ptable compact">
            <thead>
              <tr>
                <th>{t('Task')}</th>
                <th>{t('Workstream')}</th>
                <th>{t('Due then')}</th>
                <th>{t('Due now')}</th>
                <th class="num">{t('Shift')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr class={`cmp-${r.kind}`} onClick={() => r.kind !== 'removed' && openTask(r.id)}>
                  <td>
                    {r.title}
                    {r.kind === 'new' && <span class="tag">{t('new')}</span>}
                    {r.kind === 'removed' && <span class="tag">{t('removed')}</span>}
                    {r.ownersChanged && <span class="tag">{t('owner changed')}</span>}
                  </td>
                  <td class="small">{wsName(r.ws)}</td>
                  <td class="mono small">{r.old && r.old.d ? fmtDate(r.old.d) : '—'}</td>
                  <td class="mono small">{r.now && r.now.due ? fmtDate(r.now.due) : '—'}</td>
                  <td class={`num mono small ${r.delta > 0 ? 'bad' : r.delta < 0 ? 'good' : ''}`}>{r.delta ? (r.delta > 0 ? `+${r.delta}` : r.delta) : ''}</td>
                  <td class="small">
                    {r.statusChanged ? (
                      <>
                        {statusLabel(r.old.st)} → <b>{statusLabel(r.now.status)}</b>
                      </>
                    ) : r.now ? (
                      statusLabel(r.now.status)
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Trash({ p, deleted }) {
  if (!deleted.length) return <Empty title={t('The trash is empty')}>{t('Deleted tasks and meeting notes end up here and can be restored with their full history.')}</Empty>;
  const list = [...deleted].sort((a, b) => cmpDate(b.updatedAt, a.updatedAt));
  return (
    <div class="card">
      <ul class="trash">
        {list.map((x) => (
          <li>
            <div>
              {x.isNote ? (
                <strong>{x.title}</strong>
              ) : (
                <button class="link-btn" onClick={() => openTask(x.id)}>
                  {x.title}
                </button>
              )}
              <span class="small muted block">
                {x.isNote ? t('Meeting note') : (IDX.workstreams.get(x.workstreamId) || {}).name} · {t('deleted {d}', { d: fmtDateTime(x.updatedAt) })}
                {x.updatedBy && ` ${t('by')} ${actorName(x.updatedBy)}`}
              </span>
            </div>
            {!x.isNote && <StatusPill value={x.status} />}
            {canEdit() && (
              <button
                class="btn small"
                onClick={() =>
                  (x.isNote ? restoreNote((S.notes[p.id] || []).find((n) => n.id === x.id)) : restoreTask(x)).then(() => toast('ok', x.isNote ? t('Meeting note restored.') : t('Task restored.'))).catch(() => {})
                }
              >
                <Icon name="restore" size={14} /> {t('Restore')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
