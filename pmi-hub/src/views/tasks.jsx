import { useState } from 'preact/hooks';
import { t, fmtDate, relDue } from '../i18n.js';
import { todayISO, stats, taskHealth, cmpDate, byOrder, isOpen } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, canEdit, createTask, updateTask } from '../store.js';
import { openTask, getFilter, getPref, setPref } from '../nav.js';
import { Icon, Owners, StatusSelect, Progress, Avatar, Empty, STATUSES, statusLabel, priorityLabel } from '../components/ui.jsx';
import { FilterBar, applyFilter, activeFilterCount } from '../components/filters.jsx';
import { currentPhase } from './project.jsx';

function sortTasks(list, sort) {
  const arr = [...list];
  if (sort === 'start') arr.sort((a, b) => cmpDate(a.start, b.start) || cmpDate(a.due, b.due));
  else if (sort === 'title') arr.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'order') arr.sort(byOrder);
  else arr.sort((a, b) => cmpDate(a.due, b.due) || byOrder(a, b));
  return arr;
}

export function groupTasks(p, tasks, groupBy) {
  if (groupBy === 'ws') {
    const groups = projectWorkstreams(p.id).map((w) => ({ key: w.id, title: w.name, ws: w, tasks: tasks.filter((x) => x.workstreamId === w.id), create: { workstreamId: w.id } }));
    const orphan = tasks.filter((x) => !IDX.workstreams.get(x.workstreamId) || IDX.workstreams.get(x.workstreamId).deleted);
    if (orphan.length) groups.push({ key: '_none', title: t('No workstream'), tasks: orphan, create: {} });
    return groups;
  }
  if (groupBy === 'phase') {
    const groups = (p.phases || []).map((ph) => ({ key: ph.id, title: ph.name, tasks: tasks.filter((x) => x.phaseId === ph.id), create: { phaseId: ph.id } }));
    const orphan = tasks.filter((x) => !(p.phases || []).some((ph) => ph.id === x.phaseId));
    if (orphan.length) groups.push({ key: '_none', title: t('No phase'), tasks: orphan, create: { phaseId: null } });
    return groups;
  }
  if (groupBy === 'status') {
    return STATUSES.map((s) => ({ key: s, title: statusLabel(s), tasks: tasks.filter((x) => x.status === s), create: { status: s } }));
  }
  if (groupBy === 'owner') {
    const ids = new Set();
    tasks.forEach((x) => (x.ownerIds || []).forEach((id) => ids.add(id)));
    const groups = [...ids]
      .map((id) => IDX.people.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((person) => ({ key: person.id, title: person.name, person, tasks: tasks.filter((x) => (x.ownerIds || []).includes(person.id)), create: { ownerIds: [person.id] } }));
    const none = tasks.filter((x) => !(x.ownerIds || []).length);
    if (none.length) groups.push({ key: '_none', title: t('No owner'), tasks: none, create: {} });
    return groups;
  }
  return [{ key: 'all', title: t('All tasks'), tasks, create: {} }];
}

export function TaskList({ p }) {
  const today = todayISO();
  const f = getFilter(p.id);
  const all = projectTasks(p.id);
  const tasks = applyFilter(all, f, today);
  const groupBy = getPref('groupBy', 'ws');
  const sort = getPref('sort', 'due');
  const collapsed = getPref('collapsed', {});
  const groups = groupTasks(p, tasks, groupBy).filter((g) => g.tasks.length || (groupBy === 'ws' && !activeFilterCount(f)));
  const toggle = (key) => setPref('collapsed', { ...collapsed, [p.id + key]: !collapsed[p.id + key] });

  return (
    <div class="tasks-view">
      <FilterBar project={p} />
      <div class="toolbar">
        <span class="small muted">{t('{n} of {m} tasks', { n: tasks.length, m: all.length })}</span>
        <span class="spacer" />
        <label class="inline-sel">
          <span>{t('Group by')}</span>
          <select id="tl-group" value={groupBy} onChange={(e) => setPref('groupBy', e.currentTarget.value)}>
            <option value="ws">{t('Workstream')}</option>
            <option value="phase">{t('Phase')}</option>
            <option value="owner">{t('Owner')}</option>
            <option value="status">{t('Status')}</option>
            <option value="none">{t('None')}</option>
          </select>
        </label>
        <label class="inline-sel">
          <span>{t('Sort by')}</span>
          <select id="tl-sort" value={sort} onChange={(e) => setPref('sort', e.currentTarget.value)}>
            <option value="due">{t('Due date')}</option>
            <option value="start">{t('Start date')}</option>
            <option value="order">{t('Plan order')}</option>
            <option value="title">{t('Title')}</option>
          </select>
        </label>
      </div>

      {!groups.length ? (
        <Empty title={t('No tasks match the filter')}>{t('Change or clear the filter to see more tasks.')}</Empty>
      ) : (
        groups.map((g) => {
          const s = stats(g.tasks, today);
          const isCol = !!collapsed[p.id + g.key];
          const lead = g.ws && IDX.people.get(g.ws.leadPersonId);
          return (
            <section class="tgroup">
              <header class="tgroup-head">
                <button class="tg-toggle" onClick={() => toggle(g.key)} aria-expanded={!isCol}>
                  <Icon name={isCol ? 'right' : 'down'} size={14} />
                  {g.person && <Avatar person={g.person} size={20} />}
                  <h3>{g.title}</h3>
                  <span class="count">{g.tasks.length}</span>
                </button>
                {lead && (
                  <span class="small muted tg-lead">
                    {t('Lead')}: {lead.name}
                  </span>
                )}
                <span class="spacer" />
                {s.overdue > 0 && <span class="small bad">{t('{n} overdue', { n: s.overdue })}</span>}
                <span class="tg-prog">
                  <Progress s={s} thin />
                  <span class="small muted mono">{s.pct}%</span>
                </span>
              </header>
              {!isCol && (
                <div class="tg-body">
                  <div class="trow-head" aria-hidden="true">
                    <span>{t('Status')}</span>
                    <span>{t('Task')}</span>
                    <span>{t('Owners')}</span>
                    <span>{t('Start')}</span>
                    <span>{t('Due')}</span>
                  </div>
                  {sortTasks(g.tasks, sort).map((x) => (
                    <TaskLine x={x} p={p} today={today} groupBy={groupBy} />
                  ))}
                  {canEdit() && p.status !== 'archived' && groupBy !== 'none' && <QuickAdd p={p} create={g.create} today={today} />}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function TaskLine({ x, p, today, groupBy }) {
  const h = taskHealth(x, today);
  const ws = IDX.workstreams.get(x.workstreamId);
  const phase = (p.phases || []).find((ph) => ph.id === x.phaseId);
  const openDeps = (x.dependsOn || []).map((id) => IDX.tasks.get(id)).filter((d) => d && isOpen(d) && !d.deleted);
  const sub = [groupBy !== 'ws' && ws && ws.name, groupBy !== 'phase' && (p.phases || []).length > 1 && phase && phase.name].filter(Boolean).join(' · ');
  return (
    <div class={`tline h-${h}`} role="button" tabIndex={0} onClick={() => openTask(x.id)} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openTask(x.id)}>
      <span class="tl-status">
        <StatusSelect compact value={x.status} disabled={!canEdit()} onChange={(status) => updateTask(x, { status }).catch(() => {})} />
      </span>
      <span class="tl-main">
        <span class="tl-title">
          {x.milestone && <Icon name="diamond" size={12} class="ms-ic" />}
          {x.title}
          {x.priority === 'high' && <span class="tag hi">{priorityLabel('high')}</span>}
          {openDeps.length > 0 && (
            <span class="tag dep" title={t('Waiting for: {list}', { list: openDeps.map((d) => d.title).join(', ') })}>
              <Icon name="chain" size={11} /> {openDeps.length}
            </span>
          )}
        </span>
        {(x.description || sub) && <span class="tl-sub small muted">{[sub, x.description].filter(Boolean).join(' — ')}</span>}
      </span>
      <span class="tl-owners">
        <Owners ids={x.ownerIds} max={3} size={22} />
      </span>
      <span class="tl-date mono small">{x.start ? fmtDate(x.start) : <span class="muted">—</span>}</span>
      <span class={`tl-date mono small due ${h}`}>
        {x.due ? fmtDate(x.due) : <span class="muted">—</span>}
        {x.due && isOpen(x) && (h === 'overdue' || h === 'soon') && <span class="rel">{relDue(x.due, today)}</span>}
      </span>
    </div>
  );
}

function QuickAdd({ p, create, today }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const title = v.trim();
    if (!title || busy) return;
    setBusy(true);
    const wss = projectWorkstreams(p.id);
    await createTask({
      projectId: p.id,
      workstreamId: wss[0] && wss[0].id,
      phaseId: currentPhase(p, today),
      ...create,
      title,
    }).catch(() => {});
    setV('');
    setBusy(false);
  };
  return (
    <div class="quick-add">
      <Icon name="plus" size={14} />
      <input
        value={v}
        placeholder={t('Add a task: type a title and press Enter')}
        aria-label={t('New task')}
        onInput={(e) => setV(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        disabled={busy}
      />
    </div>
  );
}

// ---------- tavla ----------
export function Board({ p }) {
  const today = todayISO();
  const f = getFilter(p.id);
  const tasks = applyFilter(projectTasks(p.id), { ...f, hideDone: false }, today);
  const [over, setOver] = useState(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const editable = canEdit();
  const cols = ['open', 'doing', 'blocked', 'done'].concat(tasks.some((x) => x.status === 'na') ? ['na'] : []);

  const onDrop = (status) => (e) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const x = IDX.tasks.get(id);
    if (x && x.status !== status) updateTask(x, { status }).catch(() => {});
  };

  return (
    <div class="board-view">
      <FilterBar project={p} showDoneToggle={false} />
      <div class="board">
        {cols.map((s) => {
          let list = tasks.filter((x) => x.status === s);
          list = s === 'done' ? list.sort((a, b) => cmpDate(b.doneAt, a.doneAt)) : list.sort((a, b) => cmpDate(a.due, b.due));
          const total = list.length;
          if (s === 'done' && !showAllDone) list = list.slice(0, 15);
          return (
            <div
              class={`bcol st-${s} ${over === s ? 'over' : ''}`}
              onDragOver={(e) => editable && (e.preventDefault(), setOver(s))}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null)}
              onDrop={onDrop(s)}
            >
              <header class="bcol-head">
                <span class={`pill st-${s}`}>{statusLabel(s)}</span>
                <span class="count">{total}</span>
              </header>
              <div class="bcol-body">
                {list.map((x) => (
                  <Card x={x} today={today} draggable={editable} />
                ))}
                {s === 'done' && total > 15 && (
                  <button class="link-btn small" onClick={() => setShowAllDone(!showAllDone)}>
                    {showAllDone ? t('Show fewer') : t('Show all {n}', { n: total })}
                  </button>
                )}
                {!total && <p class="small muted bempty">{editable ? t('Drag a task here') : t('Empty')}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ x, today, draggable }) {
  const h = taskHealth(x, today);
  const ws = IDX.workstreams.get(x.workstreamId);
  return (
    <div
      class={`bcard h-${h}`}
      draggable={draggable}
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', x.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => openTask(x.id)}
      onKeyDown={(e) => e.key === 'Enter' && openTask(x.id)}
    >
      <span class="bc-title">
        {x.milestone && <Icon name="diamond" size={12} class="ms-ic" />}
        {x.title}
      </span>
      <span class="bc-meta">
        {ws && <span class="ws-chip">{ws.name}</span>}
        <span class="spacer" />
        {x.due && (
          <span class={`due-chip ${h}`}>
            <Icon name="clock" size={11} />
            {fmtDate(x.due)}
          </span>
        )}
        <Owners ids={x.ownerIds} max={2} size={20} />
      </span>
      <span class="bc-mobile-status" onClick={(e) => e.stopPropagation()}>
        <StatusSelect compact value={x.status} disabled={!draggable} onChange={(status) => updateTask(x, { status }).catch(() => {})} />
      </span>
    </div>
  );
}
