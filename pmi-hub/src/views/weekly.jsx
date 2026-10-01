import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t, fmtDate, fmtDateTime, plural } from '../i18n.js';
import { todayISO, addDays, weekOf, isOpen, taskHealth, cmpDate, localDate, textToBullets, dayLabel } from '../util.js';
import { S, IDX, projectTasks, projectWorkstreams, flattenHistory, entityHistory, saveReport, canEdit, actorName, toast } from '../store.js';
import { R, openTask } from '../nav.js';
import { Icon, RagDot, ragLabel, confirmDialog, copyText } from '../components/ui.jsx';
import { EventList } from '../components/events.jsx';
import { saveFile, loadScript } from '../files.js';
import { weekLabel } from './notes.jsx';

const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@9.8.1/dist/index.iife.js';
const SECTIONS = () => [
  { key: 'happened', title: t('What happened this week') },
  { key: 'next', title: t('Coming up next week') },
];
const defaultTitle = (p) => `${p.company || p.name} PMI – ${t('Weekly update')}`;
const DEFAULT_FOOTER = 'Feel free to add any key updates from your workstreams';

// ---------- what the week consists of ----------
export function weekSources(p, start) {
  const end = addDays(start, 6);
  const nextStart = addDays(start, 7);
  const nextEnd = addDays(start, 13);
  const today = todayISO();
  const tasks = projectTasks(p.id);
  const inWeek = (d) => d && d >= start && d <= end;
  const events = flattenHistory(S.history[p.id]).filter((e) => inWeek(localDate(e.t)) && e.a !== 'import');
  const lastComment = (taskId) => {
    const ev = flattenHistory((S.history[p.id] || []).filter((d) => d.id === taskId)).find((e) => e.a === 'comment');
    return ev ? ev.x : '';
  };
  return {
    start,
    end,
    nextStart,
    nextEnd,
    notes: (S.notes[p.id] || []).filter((n) => !n.deleted && inWeek(n.date)).sort((a, b) => cmpDate(a.date, b.date)),
    done: tasks.filter((x) => x.status === 'done' && inWeek(x.doneAt)),
    blocked: tasks.filter((x) => x.status === 'blocked').map((x) => ({ ...x, lastComment: lastComment(x.id) })),
    overdue: tasks.filter((x) => taskHealth(x, today) === 'overdue'),
    dueNext: tasks.filter((x) => isOpen(x) && x.due && x.due >= nextStart && x.due <= nextEnd).sort((a, b) => cmpDate(a.due, b.due)),
    startingNext: tasks.filter((x) => isOpen(x) && x.start && x.start >= nextStart && x.start <= nextEnd && !(x.due && x.due <= nextEnd)),
    comments: events.filter((e) => e.a === 'comment' && e.type === 'task'),
    statusChanges: events.filter((e) => e.c && e.c.status && e.type === 'task'),
    assessments: projectWorkstreams(p.id).filter((w) => w.ragAt && inWeek(localDate(w.ragAt))),
  };
}

const NEXT_HEADING = /^(#+\s*)?(next steps?|next week|coming up|upcoming|to ?do|action items?|actions|follow[- ]?ups?)\b.*:?\s*$/i;
const ANY_HEADING = /^(#+\s*)?[^.!?]{2,48}:$/;
const firstNames = (ids) => (ids || []).map((id) => ((IDX.people.get(id) || {}).name || '').split(' ')[0]).filter(Boolean);

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => {
    const k = x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// A draft built only from the week's notes and the plan; no AI involved.
export function buildDraft(p, src) {
  const happened = [];
  const next = [];
  for (const n of src.notes) {
    let target = happened;
    let any = false;
    for (const raw of String(n.body || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (NEXT_HEADING.test(line) && (line.endsWith(':') || /^#/.test(line) || line.split(' ').length <= 3)) {
        target = next;
        continue;
      }
      if (ANY_HEADING.test(line)) {
        target = happened;
        continue;
      }
      const [bullet] = textToBullets(line);
      if (bullet) {
        target.push(bullet);
        any = true;
      }
    }
    if (!any && n.title) happened.push(n.title);
  }
  for (const x of src.done) happened.push(`${x.title} – done.`);
  for (const x of src.blocked) happened.push(`${x.title} is blocked${x.lastComment ? `: ${x.lastComment}` : '.'}`);
  for (const x of src.dueNext) {
    const who = firstNames(x.ownerIds);
    next.push(`${x.title}${who.length ? ` (${who.join(', ')})` : ''}`);
  }
  return { title: defaultTitle(p), happened: dedupe(happened), next: dedupe(next), footer: DEFAULT_FOOTER };
}

// ---------- asking Claude for a written draft ----------
const STYLE_EXAMPLE = `Acme PMI – Weekly update
What happened this week
- Held the first Finance walkthrough to map the month-end close. The work continues next week, and the group controller is already in the loop.
- The new team joined their first All Hands – great to have you there!
- The email migration is in progress but blocked while the external IT provider is on leave. The office move is waiting on the same thing, although it is close to done.
- The interim payroll solution is sorted.
- Onboarding sessions for the new team are now scheduled.
Coming up next week
- Continue mapping the month-end close based on the Finance walkthrough.
- Once the IT provider is back, finish the remaining steps of the office move.`;

function buildPrompt(p, src, previous) {
  const names = (ids) => (ids || []).map((id) => (IDX.people.get(id) || {}).name).filter(Boolean).join(', ');
  const ws = (id) => (IDX.workstreams.get(id) || {}).name || '';
  const L = [];
  L.push(`You are helping the PMI coordinator at DigitalTolk Group (DT) write the weekly PMI update about integrating the acquired company ${p.company || p.name}.`);
  L.push(`Week: ${src.start} to ${src.end}. Day 1 (closing) was ${p.closingDate || 'not set'}${p.closingDate ? ` (today is ${dayLabel(p, todayISO())})` : ''}.`);
  L.push('');
  L.push('Write two lists of bullet points in English:');
  L.push('- "happened": what happened this week, 3–8 bullets');
  L.push('- "next": what is coming up next week, 1–5 bullets');
  L.push('');
  L.push('Rules:');
  L.push('- Use only facts from the source material below. Never invent people, dates or outcomes.');
  L.push('- Write for the whole integration team and the acquired company: warm, plain and concise. Past tense for "happened".');
  L.push('- One or two sentences per bullet, no bullet symbols, no headings. Refer to people by first name.');
  L.push('- Merge related points, mention blockers and what they wait on, and skip internal task jargon, percentages and IDs.');
  L.push('- Prefer what the meeting notes say; use the plan data to fill gaps.');
  L.push('');
  L.push('Style example (tone and length only; do not reuse any of its content):');
  L.push('<example>');
  L.push(STYLE_EXAMPLE);
  L.push('</example>');
  L.push('');
  L.push('Reply with only JSON: {"happened": ["..."], "next": ["..."]}');
  L.push('');
  L.push('SOURCE MATERIAL');
  L.push('');
  L.push(`Meeting notes this week (${src.notes.length}):`);
  for (const n of src.notes) {
    L.push(`--- ${n.date} · ${n.title || 'Meeting'}${n.attendeeIds && n.attendeeIds.length ? ` · attendees: ${names(n.attendeeIds)}` : ''}${n.workstreamIds && n.workstreamIds.length ? ` · workstreams: ${n.workstreamIds.map(ws).join(', ')}` : ''}`);
    L.push(String(n.body || '').slice(0, 6000));
  }
  const taskLine = (x) => `- ${x.title} [${ws(x.workstreamId)}]${x.ownerIds && x.ownerIds.length ? ` owners: ${names(x.ownerIds)}` : ''}${x.due ? ` due ${x.due}` : ''}`;
  L.push('');
  L.push('Tasks completed this week:');
  src.done.forEach((x) => L.push(taskLine(x)));
  if (!src.done.length) L.push('- none');
  L.push('Blocked tasks:');
  src.blocked.forEach((x) => L.push(`${taskLine(x)}${x.lastComment ? ` — latest comment: ${x.lastComment}` : ''}`));
  if (!src.blocked.length) L.push('- none');
  L.push('Task comments this week:');
  src.comments.slice(0, 40).forEach((e) => L.push(`- on "${e.l}": ${String(e.x || '').slice(0, 400)}`));
  if (!src.comments.length) L.push('- none');
  L.push('Workstream assessments updated this week:');
  src.assessments.forEach((w) => L.push(`- ${w.name}: ${ragLabel(w.rag)}${w.ragNote ? ` — ${w.ragNote}` : ''}`));
  if (!src.assessments.length) L.push('- none');
  L.push(`Due next week (${src.nextStart} to ${src.nextEnd}):`);
  src.dueNext.forEach((x) => L.push(taskLine(x)));
  src.startingNext.forEach((x) => L.push(`${taskLine(x)} (starts next week)`));
  if (!src.dueNext.length && !src.startingNext.length) L.push('- none');
  L.push('Overdue tasks:');
  src.overdue.slice(0, 20).forEach((x) => L.push(taskLine(x)));
  if (!src.overdue.length) L.push('- none');
  if (previous) {
    L.push('');
    L.push("Last week's update, for continuity (do not repeat it):");
    previous.happened.forEach((b) => L.push(`- ${b}`));
    L.push('Planned for this week:');
    previous.next.forEach((b) => L.push(`- ${b}`));
  }
  return L.join('\n');
}

// ---------- export formats ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function asText(doc) {
  const L = [doc.title, ''];
  for (const s of SECTIONS()) {
    L.push(s.title);
    doc[s.key].forEach((b) => L.push(`• ${b}`));
    L.push('');
  }
  if (doc.footer) L.push(doc.footer);
  return L.join('\n').trim() + '\n';
}
function asMarkdown(doc) {
  const L = [`# ${doc.title}`, ''];
  for (const s of SECTIONS()) {
    L.push(`## ${s.title}`, '');
    doc[s.key].forEach((b) => L.push(`* ${b}`));
    L.push('');
  }
  if (doc.footer) L.push(doc.footer, '');
  return L.join('\n');
}
function asHtml(doc) {
  let h = `<h2>${esc(doc.title)}</h2>`;
  for (const s of SECTIONS()) {
    h += `<h3>${esc(s.title)}</h3><ul>${doc[s.key].map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  }
  if (doc.footer) h += `<p>${esc(doc.footer)}</p>`;
  return h;
}
async function asDocx(doc) {
  const D = await loadScript(DOCX_URL, 'docx');
  const P = (opts) => new D.Paragraph(opts);
  const children = [P({ text: doc.title, heading: D.HeadingLevel.HEADING_1, spacing: { after: 200 } })];
  for (const s of SECTIONS()) {
    children.push(P({ text: s.title, heading: D.HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
    doc[s.key].forEach((b) => children.push(P({ text: b, bullet: { level: 0 }, spacing: { after: 80 } })));
  }
  if (doc.footer) children.push(P({ text: doc.footer, spacing: { before: 240 } }));
  const file = new D.Document({
    creator: 'DigitalTolk Group – PMI Hub',
    title: doc.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return D.Packer.toBlob(file);
}

// ---------- the view ----------
export function WeeklyUpdate({ p }) {
  const today = todayISO();
  const thisWeek = weekOf(today).start;
  const [week, setWeek] = useState(R.week && /^\d{4}-\d{2}-\d{2}$/.test(R.week) ? weekOf(R.week).start : thisWeek);
  const reports = S.reports[p.id] || [];
  const report = reports.find((r) => r.weekStart === week) || null;
  const src = weekSources(p, week);
  const draft = buildDraft(p, src);
  const base = report ? { title: report.title, happened: report.happened || [], next: report.next || [], footer: report.footer ?? '' } : draft;
  const previous = reports.find((r) => r.weekStart === addDays(week, -7)) || null;
  const editable = canEdit();
  const [busy, setBusy] = useState(null); // null | 'claude' | 'export'
  const [claudeErr, setClaudeErr] = useState('');
  const ctl = useRef(null);

  // Weeks to choose from: from the earliest note/report (or Day 1) to next week.
  const earliest = [p.closingDate, ...(S.notes[p.id] || []).map((n) => n.date), ...reports.map((r) => r.weekStart), addDays(today, -7 * 12)].filter(Boolean).sort()[0];
  const weeks = [];
  for (let w = weekOf(addDays(today, 7)).start; w >= weekOf(earliest).start && weeks.length < 80; w = addDays(w, -7)) weeks.push(w);
  if (!weeks.includes(week)) weeks.push(week);

  const save = (doc, opts) => saveReport(p, week, doc, report, opts).catch(() => {});

  const rebuild = async () => {
    if (report) {
      const ok = await confirmDialog({
        title: t('Rebuild from notes and plan?'),
        body: t('The text is replaced with a new draft from this week\'s meeting notes and the plan. The current text stays in the version history and can be restored.'),
        ok: t('Rebuild'),
      });
      if (!ok) return;
    }
    await save(draft, { action: 'update', source: 'draft' });
    toast('ok', t('Draft rebuilt from this week\'s notes and plan.'));
  };

  const writeWithClaude = async () => {
    if (!S.sample || busy) return;
    setClaudeErr('');
    setBusy('claude');
    ctl.current = new AbortController();
    try {
      const out = await S.sample.json(buildPrompt(p, src, previous), { signal: ctl.current.signal, cache: false });
      const clean = (a) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : []);
      const doc = { ...base, happened: clean(out && out.happened), next: clean(out && out.next) };
      if (!doc.happened.length && !doc.next.length) throw { code: 'empty_completion' };
      await save(doc, { source: 'claude' });
      toast('ok', t('Claude wrote a draft. Edit it below; the earlier text is in the version history.'));
    } catch (e) {
      const code = e && e.code;
      if (code === 'cancelled') return;
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) setClaudeErr(t('Claude is not available for your account in this view.'));
      else if (code === 'rate_limited') setClaudeErr(t('Too many requests right now. Try again in a little while.'));
      else setClaudeErr(t('Claude could not write a draft this time. Try again, or build the draft from notes and plan.'));
    } finally {
      setBusy(null);
      ctl.current = null;
    }
  };

  const fileBase = `${(p.company || p.name).replace(/[^\p{L}\p{N} _-]+/gu, '').trim()} PMI weekly update ${weekLabelShort(week)}`;
  const exportAs = async (kind) => {
    setBusy('export');
    try {
      if (kind === 'copy') {
        let ok = false;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': new Blob([asHtml(base)], { type: 'text/html' }), 'text/plain': new Blob([asText(base)], { type: 'text/plain' }) }),
          ]);
          ok = true;
        } catch {
          ok = await copyText(asText(base), document.querySelector('.rp-doc'));
        }
        toast('ok', ok ? t('Copied. Paste it into an email, Teams or Slack.') : t('Copying was blocked. The text is selected, press Ctrl+C / Cmd+C.'));
      } else if (kind === 'docx') {
        await saveFile(`${fileBase}.docx`, await asDocx(base));
      } else {
        await saveFile(`${fileBase}.md`, new Blob([asMarkdown(base)], { type: 'text/markdown' }));
      }
    } catch {
      toast('error', t('Could not create the file. Check your connection and try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="weekly">
      <div class="toolbar">
        <label class="inline-sel">
          <span>{t('Week')}</span>
          <select id="wk-week" value={week} onChange={(e) => setWeek(e.currentTarget.value)}>
            {weeks.map((w) => (
              <option value={w}>
                {weekLabel(w)}
                {w === thisWeek ? ` (${t('this week')})` : ''}
                {reports.some((r) => r.weekStart === w) ? ` · ${t('saved')}` : ''}
              </option>
            ))}
          </select>
        </label>
        <span class="spacer" />
        <span class="export-group">
          <button class="btn ghost small" disabled={!!busy} onClick={() => exportAs('copy')}>
            <Icon name="copy" size={14} /> {t('Copy')}
          </button>
          <button class="btn ghost small" disabled={!!busy} onClick={() => exportAs('docx')}>
            <Icon name="download" size={14} /> {t('Word')}
          </button>
          <button class="btn ghost small" disabled={!!busy} onClick={() => exportAs('md')}>
            <Icon name="download" size={14} /> {t('Markdown')}
          </button>
        </span>
      </div>

      <div class="weekly-grid">
        <div class="weekly-main">
          <div class={`rp-state ${report ? 'saved' : 'draft'}`}>
            <div>
              {report ? (
                <>
                  <strong>{t('Saved')}</strong>
                  <span class="small muted">
                    {' · '}
                    {t('last edited {d}', { d: fmtDateTime(report.updatedAt || report.createdAt) })}
                    {(report.updatedBy || report.createdBy) && ` ${t('by')} ${actorName(report.updatedBy || report.createdBy)}`}
                  </span>
                </>
              ) : (
                <>
                  <strong>{t('Preview of an unsaved draft')}</strong>
                  <span class="small muted"> · {t('built from this week\'s meeting notes and plan. It is saved as soon as you edit it.')}</span>
                </>
              )}
            </div>
            {editable && (
              <div class="row wrap">
                {!report && (
                  <button class="btn small" onClick={() => save(draft, { source: 'draft' })}>
                    {t('Save draft')}
                  </button>
                )}
                {report && (
                  <button class="btn ghost small" onClick={rebuild} disabled={!!busy}>
                    <Icon name="restore" size={14} /> {t('Rebuild from notes and plan')}
                  </button>
                )}
                {S.sample && (
                  <button class="btn primary small" onClick={writeWithClaude} disabled={busy === 'export'}>
                    {busy === 'claude' ? t('Claude is writing…') : t('Write with Claude')}
                  </button>
                )}
                {busy === 'claude' && (
                  <button class="btn ghost small" onClick={() => ctl.current && ctl.current.abort()}>
                    {t('Stop')}
                  </button>
                )}
              </div>
            )}
          </div>
          {claudeErr && <p class="warn-line warn">{claudeErr}</p>}

          <ReportEditor key={p.id + week} value={base} editable={editable && busy !== 'claude'} onCommit={(doc) => save(doc)} />

          {report && (
            <details class="rp-history">
              <summary>{t('Version history of this weekly update')}</summary>
              <EventList events={entityHistory(p.id, report.id)} limit={15} />
            </details>
          )}
        </div>

        <aside class="weekly-sources card">
          <header class="card-head">
            <h2>{t('Sources this week')}</h2>
          </header>
          <SourceList title={t('Meeting notes')} items={src.notes} empty={t('No meeting notes this week.')} render={(n) => `${fmtDate(n.date)} · ${n.title || t('Meeting note')}`} />
          <SourceList title={t('Completed')} items={src.done} empty={t('Nothing marked done this week.')} render={(x) => x.title} onOpen={(x) => openTask(x.id)} />
          <SourceList title={t('Blocked')} items={src.blocked} tone="bad" empty={t('Nothing blocked.')} render={(x) => x.title} onOpen={(x) => openTask(x.id)} />
          <SourceList title={t('Due next week')} items={src.dueNext} empty={t('Nothing due next week.')} render={(x) => `${fmtDate(x.due)} · ${x.title}`} onOpen={(x) => openTask(x.id)} />
          <SourceList title={t('Overdue')} items={src.overdue} tone="bad" empty={t('Nothing overdue.')} render={(x) => x.title} onOpen={(x) => openTask(x.id)} />
          {src.assessments.length > 0 && (
            <div class="src-block">
              <h4>{t('Workstream assessments')}</h4>
              <ul>
                {src.assessments.map((w) => (
                  <li>
                    <RagDot rag={w.rag} /> {w.name}
                    {w.ragNote && <span class="small muted block">{w.ragNote}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const weekLabelShort = (start) => `W${weekOf(start).week} ${start.slice(0, 4)}`;

function SourceList({ title, items, render, empty, onOpen, tone }) {
  return (
    <div class={`src-block ${tone || ''}`}>
      <h4>
        {title} <span class="count">{items.length}</span>
      </h4>
      {items.length ? (
        <ul>
          {items.slice(0, 12).map((x) => (
            <li>{onOpen ? <button class="link-btn" onClick={() => onOpen(x)}>{render(x)}</button> : render(x)}</li>
          ))}
          {items.length > 12 && <li class="muted small">{plural(items.length - 12, '+ {n} more', '+ {n} more')}</li>}
        </ul>
      ) : (
        <p class="small muted">{empty}</p>
      )}
    </div>
  );
}

// ---------- editable preview ----------
// The report is edited in place in the same layout it is exported in. Text is
// kept locally while typing and saved when a field is left; adding, removing
// and moving points save right away.
function ReportEditor({ value, editable, onCommit }) {
  const [doc, setDoc] = useState(value);
  const dirty = useRef(false);
  const lastSent = useRef(JSON.stringify(value));
  const root = useRef(null);
  const valueKey = JSON.stringify(value);
  useEffect(() => {
    lastSent.current = valueKey;
    if (!dirty.current) setDoc(value);
  }, [valueKey]);

  const change = (next) => {
    dirty.current = true;
    setDoc(next);
  };
  const commit = (next = doc) => {
    dirty.current = false;
    const k = JSON.stringify(next);
    if (k === valueKey || k === lastSent.current) return;
    lastSent.current = k;
    onCommit(next);
  };
  // Focus moves in the same frame the new list is drawn, so typing right
  // after Enter lands in the new point.
  const pendingFocus = useRef(null);
  useLayoutEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    pendingFocus.current = null;
    const el = document.getElementById(f.id);
    if (el) {
      el.focus();
      const n = f.atStart ? 0 : el.value.length;
      el.setSelectionRange(n, n);
    }
  });
  const focusLater = (id, atStart) => (pendingFocus.current = { id, atStart });

  const setItem = (key, i, text) => change({ ...doc, [key]: doc[key].map((b, j) => (j === i ? text : b)) });
  const structural = (key, list, focusIdx, atStart) => {
    const next = { ...doc, [key]: list };
    if (focusIdx != null) focusLater(`rp-${key}-${focusIdx}`, atStart);
    setDoc(next);
    commit(next);
  };
  const onKey = (key, i) => (e) => {
    const list = doc[key];
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionEnd);
      structural(key, [...list.slice(0, i), before, after, ...list.slice(i + 1)], i + 1, true);
    } else if (e.key === 'Backspace' && !e.currentTarget.value && list.length > 0) {
      e.preventDefault();
      structural(key, list.filter((_, j) => j !== i), i > 0 ? i - 1 : null);
    }
  };

  return (
    <article class="rp-doc" ref={root}>
      <AutoText id="rp-title" class="rp-title" value={doc.title} disabled={!editable} single onInput={(v) => change({ ...doc, title: v })} onBlur={() => commit()} ariaLabel={t('Title')} />
      {SECTIONS().map((s) => (
        <section class="rp-section">
          <h3>{s.title}</h3>
          <ul class="rp-list">
            {doc[s.key].map((b, i) => (
              <li class="rp-item">
                <span class="rp-bullet" aria-hidden="true" />
                <AutoText id={`rp-${s.key}-${i}`} class="rp-text" value={b} disabled={!editable} placeholder={t('Write a point…')} onInput={(v) => setItem(s.key, i, v)} onBlur={() => commit()} onKeyDown={onKey(s.key, i)} ariaLabel={`${s.title} ${i + 1}`} />
                {editable && (
                  <span class="rp-tools">
                    <button type="button" class="icon-btn small" disabled={i === 0} aria-label={t('Move up')} onClick={() => structural(s.key, swap(doc[s.key], i, i - 1))}>
                      <Icon name="down" size={12} class="flip" />
                    </button>
                    <button type="button" class="icon-btn small" disabled={i === doc[s.key].length - 1} aria-label={t('Move down')} onClick={() => structural(s.key, swap(doc[s.key], i, i + 1))}>
                      <Icon name="down" size={12} />
                    </button>
                    <button type="button" class="icon-btn small" aria-label={t('Remove point')} onClick={() => structural(s.key, doc[s.key].filter((_, j) => j !== i))}>
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!doc[s.key].length && <p class="small muted rp-empty">{t('No points yet.')}</p>}
          {editable && (
            <button type="button" class="link-btn small rp-add" onClick={() => structural(s.key, [...doc[s.key], ''], doc[s.key].length)}>
              <Icon name="plus" size={12} /> {t('Add point')}
            </button>
          )}
        </section>
      ))}
      <AutoText id="rp-footer" class="rp-footer" value={doc.footer} disabled={!editable} single placeholder={t('Closing line (optional)')} onInput={(v) => change({ ...doc, footer: v })} onBlur={() => commit()} ariaLabel={t('Closing line')} />
    </article>
  );
}

const swap = (list, a, b) => {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

// A textarea that grows with its text, styled to look like the document.
function AutoText({ id, value, onInput, onBlur, onKeyDown, disabled, placeholder, single, ariaLabel, class: cls }) {
  const ref = useRef(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <textarea
      ref={ref}
      id={id}
      class={`autotext ${cls || ''}`}
      rows={1}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onInput={(e) => {
        const v = single ? e.currentTarget.value.replace(/\n/g, ' ') : e.currentTarget.value;
        onInput(v);
        fit();
      }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (single && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        onKeyDown && onKeyDown(e);
      }}
    />
  );
}
