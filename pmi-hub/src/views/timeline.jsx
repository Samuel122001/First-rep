import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t, fmtDate, monthName, weekdayShort } from '../i18n.js';
import { todayISO, toDay, fromDay, addDays, diffDays, isoWeek, startOfWeek, weekdayIdx, taskHealth, cmpDate, stats, networkDays, isOpen } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, canEdit, updateTask } from '../store.js';
import { openTask, getFilter, getPref, setPref } from '../nav.js';
import { Icon, statusLabel } from '../components/ui.jsx';
import { FilterBar, applyFilter } from '../components/filters.jsx';

const ZOOM = { day: 26, week: 9, month: 3.2 };

export function Timeline({ p }) {
  const today = todayISO();
  const zoom = getPref('zoom', 'week');
  const px = ZOOM[zoom] || ZOOM.week;
  const f = getFilter(p.id);
  const tasks = applyFilter(projectTasks(p.id), f, today);
  const baselines = S.baselines[p.id] || [];
  const [baseId, setBaseId] = useState('');
  const base = baselines.find((b) => b.id === baseId);
  const [drag, setDrag] = useState(null); // {id, mode, x0, ds, de}
  const scroller = useRef(null);
  const editable = canEdit() && p.status !== 'archived';
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;
  const LEFT = narrow ? 168 : 300;

  // Date range: every date in the plan plus today and Day 1, with margin.
  const dates = [];
  tasks.forEach((x) => (x.start && dates.push(x.start), x.due && dates.push(x.due)));
  if (base) Object.values(base.tasks).forEach((b) => (b.s && dates.push(b.s), b.d && dates.push(b.d)));
  dates.push(today);
  if (p.closingDate) dates.push(p.closingDate);
  dates.sort();
  const rangeStart = startOfWeek(addDays(dates[0], -7));
  let rangeEnd = addDays(dates[dates.length - 1], 21);
  if (diffDays(rangeStart, rangeEnd) < 84) rangeEnd = addDays(rangeStart, 84);
  const days = diffDays(rangeStart, rangeEnd) + 1;
  const width = days * px;
  const x = (d) => (toDay(d) - toDay(rangeStart)) * px;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(today) - (el.clientWidth - LEFT) * 0.3);
  }, [p.id, zoom]);

  // Rows: phase -> workstream -> tasks
  const wss = projectWorkstreams(p.id);
  const phases = (p.phases || []).length ? p.phases : [{ id: null, name: '' }];
  const showPhase = phases.length > 1;
  const rows = [];
  for (const ph of phases) {
    const inPhase = tasks.filter((x) => (showPhase ? x.phaseId === ph.id || (ph === phases[0] && !phases.some((q) => q.id === x.phaseId)) : true));
    if (!inPhase.length) continue;
    if (showPhase) rows.push({ kind: 'phase', ph });
    for (const w of wss) {
      const wt = inPhase.filter((x) => x.workstreamId === w.id).sort((a, b) => cmpDate(a.start, b.start) || cmpDate(a.due, b.due));
      if (!wt.length) continue;
      rows.push({ kind: 'ws', w, tasks: wt });
      wt.forEach((task) => rows.push({ kind: 'task', task }));
    }
    const orphan = inPhase.filter((x) => !wss.some((w) => w.id === x.workstreamId));
    if (orphan.length) {
      rows.push({ kind: 'ws', w: { id: '_none', name: t('No workstream') }, tasks: orphan });
      orphan.forEach((task) => rows.push({ kind: 'task', task }));
    }
  }

  // Months and weeks for the header rows.
  const months = [];
  const weeks = [];
  for (let i = 0; i < days; i++) {
    const d = fromDay(toDay(rangeStart) + i);
    if (i === 0 || d.slice(8) === '01') months.push({ d, x: i * px });
    if (weekdayIdx(d) === 0) weeks.push({ d, x: i * px, w: isoWeek(d) });
  }
  months.forEach((m, i) => (m.w = (i + 1 < months.length ? months[i + 1].x : width) - m.x));

  // Drag to move or resize.
  const onPointerDown = (task, mode) => (e) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: task.id, mode, x0: e.clientX, dd: 0, moved: false });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const dd = Math.round((e.clientX - drag.x0) / px);
    if (dd !== drag.dd || (!drag.moved && Math.abs(e.clientX - drag.x0) > 3)) setDrag({ ...drag, dd, moved: drag.moved || Math.abs(e.clientX - drag.x0) > 3 });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const task = IDX.tasks.get(drag.id);
    const d = drag;
    setDrag(null);
    if (!task) return;
    if (!d.moved) return openTask(task.id);
    if (!d.dd) return;
    const r = previewDates(task, d);
    updateTask(task, { start: r.start, due: r.due }).catch(() => {});
  };

  return (
    <div class="timeline-view">
      <FilterBar project={p} />
      <div class="toolbar">
        <div class="seg" role="radiogroup" aria-label={t('Zoom')}>
          {[
            ['day', t('Days')],
            ['week', t('Weeks')],
            ['month', t('Months')],
          ].map(([z, l]) => (
            <button role="radio" aria-checked={zoom === z} class={zoom === z ? 'on' : ''} onClick={() => setPref('zoom', z)}>
              {l}
            </button>
          ))}
        </div>
        <button class="btn ghost small" onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, x(today) - (scroller.current.clientWidth - LEFT) * 0.3))}>
          {t('Today')}
        </button>
        <span class="spacer" />
        {baselines.length > 0 && (
          <label class="inline-sel">
            <span>{t('Compare with')}</span>
            <select id="tl-base" value={baseId} onChange={(e) => setBaseId(e.currentTarget.value)}>
              <option value="">{t('No plan version')}</option>
              {baselines.map((b) => (
                <option value={b.id}>
                  {b.name} ({fmtDate(b.createdAt.slice(0, 10))})
                </option>
              ))}
            </select>
          </label>
        )}
        <span class="legend small">
          <span class="lg today">{t('Today')}</span>
          {p.closingDate && <span class="lg day1">{t('Day 1')}</span>}
          {base && <span class="lg base">{t('Plan version')}</span>}
        </span>
      </div>
      {editable && !narrow && <p class="small muted hint-line">{t('Drag a bar to move the task, drag its edges to change start or due date. Click to open.')}</p>}

      {!rows.length ? (
        <p class="muted pad">{t('No tasks match the filter.')}</p>
      ) : (
        <div class={`gantt z-${zoom}`} ref={scroller} style={{ '--left': LEFT + 'px', '--px': px + 'px', '--week': px * 7 + 'px' }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
          <div class="g-inner" style={{ width: LEFT + width + 'px' }}>
            <div class="g-head">
              <div class="g-corner">
                <span>{t('Task')}</span>
              </div>
              <div class="g-scale" style={{ width: width + 'px' }}>
                <div class="g-months">
                  {months.map((m) => (
                    <span style={{ left: m.x + 'px', width: m.w + 'px' }}>{m.w > 70 ? `${monthName(m.d)} ${m.d.slice(0, 4)}` : m.w > 28 ? monthName(m.d, true) : ''}</span>
                  ))}
                </div>
                <div class="g-weeks">
                  {zoom === 'day'
                    ? Array.from({ length: days }, (_, i) => {
                        const d = fromDay(toDay(rangeStart) + i);
                        return (
                          <span class={`g-day ${weekdayIdx(d) > 4 ? 'we' : ''} ${d === today ? 'is-today' : ''}`} style={{ left: i * px + 'px', width: px + 'px' }} title={d}>
                            <b>{+d.slice(8)}</b>
                            <i>{weekdayShort(d)}</i>
                          </span>
                        );
                      })
                    : weeks.map((w) => (
                        <span style={{ left: w.x + 'px', width: px * 7 + 'px' }} title={t('Week {w}, from {d}', { w: w.w, d: fmtDate(w.d) })} class={diffDays(w.d, today) >= 0 && diffDays(w.d, today) < 7 ? 'is-today' : ''}>
                          {zoom === 'week' ? `${t('W')}${w.w}` : w.w}
                        </span>
                      ))}
                </div>
              </div>
            </div>

            <div class="g-body">
              <div class="g-lines" style={{ left: LEFT + 'px', width: width + 'px', backgroundPosition: `0 0` }} />
              {p.closingDate && toDay(p.closingDate) >= toDay(rangeStart) && (
                <div class="g-mark day1" style={{ left: LEFT + x(p.closingDate) + 'px' }}>
                  <span>{t('Day 1')}</span>
                </div>
              )}
              <div class="g-mark today" style={{ left: LEFT + x(today) + px / 2 + 'px' }}>
                <span>{t('Today')}</span>
              </div>
              {rows.map((r) => {
                if (r.kind === 'phase')
                  return (
                    <div class="g-row g-phase">
                      <div class="g-label">{r.ph.name}</div>
                      <div class="g-track" />
                    </div>
                  );
                if (r.kind === 'ws') {
                  const s = stats(r.tasks, today);
                  const st = r.tasks.map((x) => x.start || x.due).filter(Boolean).sort()[0];
                  const en = r.tasks.map((x) => x.due || x.start).filter(Boolean).sort().pop();
                  const lead = IDX.people.get(r.w.leadPersonId);
                  return (
                    <div class="g-row g-ws">
                      <div class="g-label">
                        <span class="g-ws-name">{r.w.name}</span>
                        {lead && <span class="small muted g-ws-lead">{lead.name}</span>}
                        <span class="small muted mono">{s.pct}%</span>
                      </div>
                      <div class="g-track">{st && en && <span class="g-span" style={{ left: x(st) + 'px', width: Math.max(px, (diffDays(st, en) + 1) * px) + 'px' }} />}</div>
                    </div>
                  );
                }
                const task = r.task;
                const h = taskHealth(task, today);
                const pv = drag && drag.id === task.id ? previewDates(task, drag) : task;
                const b = base && base.tasks[task.id];
                const isNew = base && !b;
                return (
                  <div class={`g-row g-task h-${h} ${drag && drag.id === task.id ? 'dragging' : ''}`}>
                    <div class="g-label" role="button" tabIndex={0} onClick={() => openTask(task.id)} onKeyDown={(e) => e.key === 'Enter' && openTask(task.id)} title={task.title}>
                      <span class={`sdot st-${task.status}`} title={statusLabel(task.status)} />
                      <span class="g-title">{task.title}</span>
                    </div>
                    <div class="g-track">
                      {b && b.s && b.d && <span class="g-base" style={{ left: x(b.s) + 'px', width: Math.max(px, (diffDays(b.s, b.d) + 1) * px) + 'px' }} title={t('Plan version: {a} – {b}', { a: fmtDate(b.s), b: fmtDate(b.d) })} />}
                      <Bar task={task} pv={pv} x={x} px={px} h={h} editable={editable} onDown={onPointerDown} isNew={isNew} slip={b && b.d && pv.due ? diffDays(b.d, pv.due) : 0} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function previewDates(task, d) {
  let start = task.start;
  let due = task.due;
  if (d.mode === 'move') {
    start = start && addDays(start, d.dd);
    due = due && addDays(due, d.dd);
  } else if (d.mode === 'start' && start) {
    start = addDays(start, d.dd);
    if (due && start > due) start = due;
  } else if (d.mode === 'end' && due) {
    due = addDays(due, d.dd);
    if (start && due < start) due = start;
  }
  return { ...task, start, due };
}

function Bar({ task, pv, x, px, h, editable, onDown, isNew, slip }) {
  const s = pv.start || pv.due;
  const e = pv.due || pv.start;
  if (!s) return <span class="g-nodate small muted">{t('no date')}</span>;
  const owners = (task.ownerIds || []).map((id) => (IDX.people.get(id) || {}).name).filter(Boolean).join(', ');
  const tip = `${task.title}${owners ? `\n${owners}` : ''}\n${statusLabel(task.status)} · ${fmtDate(pv.start || pv.due)} – ${fmtDate(pv.due || pv.start)}${pv.start && pv.due ? ` · ${t('{n} working days', { n: networkDays(pv.start, pv.due) })}` : ''}`;
  if (task.milestone || (pv.start && pv.due && pv.start === pv.due && px < 10)) {
    return (
      <span class={`g-ms st-${task.status} h-${h}`} style={{ left: x(e) + px / 2 + 'px' }} title={tip} onPointerDown={onDown(task, 'move')}>
        <Icon name="diamond" size={14} />
      </span>
    );
  }
  const left = x(s);
  const w = Math.max(px, (diffDays(s, e) + 1) * px);
  return (
    <span class={`g-bar st-${task.status} h-${h} ${isNew ? 'is-new' : ''} ${editable ? 'can-drag' : ''}`} style={{ left: left + 'px', width: w + 'px' }} title={tip} onPointerDown={onDown(task, 'move')}>
      {editable && pv.start && <span class="g-handle l" onPointerDown={onDown(task, 'start')} />}
      {editable && pv.due && <span class="g-handle r" onPointerDown={onDown(task, 'end')} />}
      {slip !== 0 && w > 40 && <span class={`g-slip ${slip > 0 ? 'later' : 'earlier'}`}>{slip > 0 ? `+${slip}` : slip} d</span>}
    </span>
  );
}
