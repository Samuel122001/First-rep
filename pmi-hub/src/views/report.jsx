import { useRef, useState } from 'preact/hooks';
import { t, fmtDate } from '../i18n.js';
import { todayISO, addDays, diffDays, stats, computeRag, dayLabel, taskHealth, daysLate, cmpDate, isOpen } from '../util.js';
import { IDX, projectTasks, projectWorkstreams, actorName, toast } from '../store.js';
import { openTask } from '../nav.js';
import { Icon, RagDot, ragLabel, copyText } from '../components/ui.jsx';
import { WeeklyUpdate } from './weekly.jsx';

// Reports: the weekly update (from meeting notes and the plan) and the
// steering committee report (per workstream, from the live plan).
export function Reports({ p }) {
  const [sub, setSub] = useState('weekly');
  return (
    <div class="reports-view">
      <div class="tabs small-tabs" role="tablist">
        <button role="tab" aria-selected={sub === 'weekly'} class={sub === 'weekly' ? 'on' : ''} onClick={() => setSub('weekly')}>
          {t('Weekly update')}
        </button>
        <button role="tab" aria-selected={sub === 'steering'} class={sub === 'steering' ? 'on' : ''} onClick={() => setSub('steering')}>
          {t('Steering committee report')}
        </button>
      </div>
      {sub === 'weekly' ? <WeeklyUpdate p={p} /> : <Report p={p} />}
    </div>
  );
}

// Status report for the steering committee, built from the live plan.
export function Report({ p }) {
  const today = todayISO();
  const [since, setSince] = useState(addDays(today, -7));
  const [ahead, setAhead] = useState(14);
  const docRef = useRef(null);
  const tasks = projectTasks(p.id);
  const s = stats(tasks, today);
  const horizon = addDays(today, ahead);
  const wss = projectWorkstreams(p.id);
  const owners = (x) => (x.ownerIds || []).map((id) => (IDX.people.get(id) || {}).name).filter(Boolean).join(', ');

  const sections = wss.map((w) => {
    const wt = tasks.filter((x) => x.workstreamId === w.id);
    const lead = IDX.people.get(w.leadPersonId);
    return {
      w,
      lead,
      computed: computeRag(wt, today),
      done: wt.filter((x) => x.status === 'done' && x.doneAt && x.doneAt >= since),
      next: wt.filter((x) => isOpen(x) && x.due && x.due >= today && x.due <= horizon).sort((a, b) => cmpDate(a.due, b.due)),
      late: wt.filter((x) => taskHealth(x, today) === 'overdue').sort((a, b) => daysLate(b, today) - daysLate(a, today)),
      blocked: wt.filter((x) => x.status === 'blocked'),
      st: stats(wt, today),
    };
  });
  const doneInPeriod = sections.reduce((n, x) => n + x.done.length, 0);
  const escalations = [
    ...tasks.filter((x) => x.status === 'blocked').map((x) => ({ kind: 'blocked', x })),
    ...wss.filter((w) => w.rag === 'red' && w.ragNote).map((w) => ({ kind: 'rag', w })),
  ];
  const milestones = tasks.filter((x) => x.milestone && isOpen(x) && x.due && x.due <= addDays(today, 60)).sort((a, b) => cmpDate(a.due, b.due));
  const dl = dayLabel(p, today);

  const asText = () => {
    const L = [];
    L.push(`DigitalTolk Group · ${t('Status report')}: ${p.name}`);
    L.push(`${fmtDate(today, { year: 'numeric' })}${dl ? ` (${dl})` : ''}`);
    L.push('');
    L.push(summaryLine());
    L.push('');
    for (const x of sections) {
      const rag = x.w.rag || x.computed;
      L.push(`${x.w.name.toUpperCase()}: ${ragLabel(rag)}${x.w.rag ? '' : ` (${t('computed')})`}${x.lead ? ` · ${t('Lead')}: ${x.lead.name}` : ''} · ${x.st.pct}% ${t('complete')}`);
      if (x.w.ragNote) L.push(`  ${x.w.ragNote}`);
      if (x.done.length) L.push(`  ${t('Completed')}:`, ...x.done.map((d) => `   - ${d.title}`));
      if (x.late.length) L.push(`  ${t('Overdue')}:`, ...x.late.map((d) => `   - ${d.title} (${t('{n} d late', { n: daysLate(d, today) })}${owners(d) ? `, ${owners(d)}` : ''})`));
      if (x.blocked.length) L.push(`  ${t('Blocked')}:`, ...x.blocked.map((d) => `   - ${d.title}${owners(d) ? ` (${owners(d)})` : ''}`));
      if (x.next.length) L.push(`  ${t('Next {n} days', { n: ahead })}:`, ...x.next.map((d) => `   - ${fmtDate(d.due)}: ${d.title}${owners(d) ? ` (${owners(d)})` : ''}`));
      L.push('');
    }
    if (escalations.length) {
      L.push(t('DECISIONS AND ESCALATIONS'));
      escalations.forEach((e) => L.push(e.kind === 'blocked' ? `  - ${t('Blocked')}: ${e.x.title}` : `  - ${e.w.name}: ${e.w.ragNote}`));
      L.push('');
    }
    if (milestones.length) {
      L.push(t('UPCOMING MILESTONES'));
      milestones.forEach((m) => L.push(`  - ${fmtDate(m.due, { year: 'numeric' })}: ${m.title}`));
    }
    return L.join('\n');
  };

  function summaryLine() {
    return t('{pct}% complete ({d} of {n} tasks). {late} overdue, {blocked} blocked. {done} completed since {since}.', {
      pct: s.pct,
      d: s.done,
      n: s.counted,
      late: s.overdue,
      blocked: s.blocked,
      done: doneInPeriod,
      since: fmtDate(since),
    });
  }

  const copy = async () => {
    const ok = await copyText(asText(), docRef.current);
    toast('ok', ok ? t('Report copied. Paste it into an email, Teams or Slack.') : t('Copying was blocked. The report is selected, press Ctrl+C / Cmd+C.'));
  };

  return (
    <div class="report-view">
      <div class="toolbar">
        <label class="inline-sel">
          <span>{t('Changes since')}</span>
          <input id="rp-since" type="date" value={since} max={today} onChange={(e) => e.currentTarget.value && setSince(e.currentTarget.value)} />
        </label>
        <label class="inline-sel">
          <span>{t('Look ahead')}</span>
          <select id="rp-ahead" value={ahead} onChange={(e) => setAhead(+e.currentTarget.value)}>
            <option value={7}>{t('7 days')}</option>
            <option value={14}>{t('14 days')}</option>
            <option value={30}>{t('30 days')}</option>
          </select>
        </label>
        <span class="spacer" />
        <button class="btn primary small" onClick={copy}>
          <Icon name="copy" size={14} /> {t('Copy as text')}
        </button>
      </div>

      <article class="memo" ref={docRef}>
        <header class="memo-head">
          <p class="eyebrow">{t('DigitalTolk Group · Status report')}</p>
          <h2>{p.name}</h2>
          <p class="mono small">
            {fmtDate(today, { year: 'numeric' })}
            {dl && ` · ${dl}`} · {t('period {a} – {b}', { a: fmtDate(since), b: fmtDate(today) })}
          </p>
        </header>
        <p class="memo-summary">{summaryLine()}</p>

        {sections.map((x) => {
          const rag = x.w.rag || x.computed;
          return (
            <section class="memo-ws">
              <h3>
                <RagDot rag={rag} />
                {x.w.name}
                <span class="small muted">
                  {ragLabel(rag)}
                  {!x.w.rag && rag ? ` (${t('computed')})` : ''}
                  {x.lead && ` · ${x.lead.name}`} · {x.st.pct}%
                </span>
              </h3>
              {x.w.ragNote && <p class="memo-note">{x.w.ragNote}</p>}
              {!x.done.length && !x.late.length && !x.blocked.length && !x.next.length && <p class="small muted">{t('Nothing completed, overdue or due in the period.')}</p>}
              <MemoList title={t('Completed')} items={x.done} render={(d) => d.title} />
              <MemoList title={t('Overdue')} tone="bad" items={x.late} render={(d) => `${d.title} · ${t('{n} d late', { n: daysLate(d, today) })}${owners(d) ? ` · ${owners(d)}` : ''}`} />
              <MemoList title={t('Blocked')} tone="bad" items={x.blocked} render={(d) => `${d.title}${owners(d) ? ` · ${owners(d)}` : ''}`} />
              <MemoList title={t('Next {n} days', { n: ahead })} items={x.next} render={(d) => `${fmtDate(d.due)}: ${d.title}${owners(d) ? ` · ${owners(d)}` : ''}`} />
            </section>
          );
        })}

        {escalations.length > 0 && (
          <section class="memo-ws esc">
            <h3>{t('Decisions and escalations')}</h3>
            <ul>
              {escalations.map((e) =>
                e.kind === 'blocked' ? (
                  <li>
                    <button class="link-btn" onClick={() => openTask(e.x.id)}>
                      {e.x.title}
                    </button>{' '}
                    <span class="small muted">{t('blocked')}</span>
                  </li>
                ) : (
                  <li>
                    <b>{e.w.name}:</b> {e.w.ragNote}
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
        {milestones.length > 0 && (
          <section class="memo-ws">
            <h3>{t('Upcoming milestones')}</h3>
            <ul>
              {milestones.map((m) => (
                <li>
                  <span class="mono small">{fmtDate(m.due, { year: 'numeric' })}</span> {m.title}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}

function MemoList({ title, items, render, tone }) {
  if (!items.length) return null;
  return (
    <div class={`memo-list ${tone || ''}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li>
            <button class="link-btn" onClick={() => openTask(x.id)}>
              {render(x)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
