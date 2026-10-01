import { useState } from 'preact/hooks';
import { t, fmtDate, fmtDateTime, fmtParts } from '../i18n.js';
import { todayISO, weekOf } from '../util.js';
import { S, IDX, projectWorkstreams, canEdit, createNote, updateNote, deleteNote, actorName, entityHistory, toast } from '../store.js';
import { go } from '../nav.js';
import { Icon, Avatar, Modal, Field, PersonPicker, Empty, confirmDialog } from '../components/ui.jsx';
import { EventList } from '../components/events.jsx';

export const weekLabel = (start) => {
  const w = weekOf(start);
  return t('Week {w} · {a} – {b}', { w: w.week, a: fmtDate(w.start), b: fmtDate(w.end, { year: 'numeric' }) });
};

// Meeting notes per project, dated, grouped by ISO week. They feed the weekly update.
export function MeetingNotes({ p }) {
  const [q, setQ] = useState('');
  const [ws, setWs] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | note
  const notes = (S.notes[p.id] || []).filter((n) => !n.deleted);
  const ql = q.trim().toLowerCase();
  const shown = notes
    .filter((n) => !ws || (n.workstreamIds || []).includes(ws))
    .filter((n) => !ql || `${n.title} ${n.body}`.toLowerCase().includes(ql))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const weeks = [];
  for (const n of shown) {
    const w = weekOf(n.date).start;
    let g = weeks[weeks.length - 1];
    if (!g || g.start !== w) weeks.push((g = { start: w, notes: [] }));
    g.notes.push(n);
  }
  const editable = canEdit();

  return (
    <div class="notes-view">
      <div class="toolbar">
        <div class="search">
          <Icon name="search" size={14} />
          <input id="nt-q" type="search" placeholder={t('Search meeting notes…')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
        <select id="nt-ws" class={`fsel ${ws ? 'on' : ''}`} value={ws} onChange={(e) => setWs(e.currentTarget.value)} aria-label={t('Workstream')}>
          <option value="">{t('All workstreams')}</option>
          {projectWorkstreams(p.id).map((w) => (
            <option value={w.id}>{w.name}</option>
          ))}
        </select>
        <span class="spacer" />
        <button class="btn ghost small" onClick={() => go({ tab: 'report', week: weekOf(todayISO()).start })}>
          <Icon name="report" size={14} /> {t("This week's update")}
        </button>
        {editable && (
          <button class="btn primary small" onClick={() => setEditing('new')}>
            <Icon name="plus" size={14} /> {t('New meeting note')}
          </button>
        )}
      </div>

      {!S.notesLoaded[p.id] ? (
        <p class="muted">{t('Loading meeting notes…')}</p>
      ) : !notes.length ? (
        <Empty
          title={t('No meeting notes yet')}
          action={
            editable && (
              <button class="btn primary" onClick={() => setEditing('new')}>
                <Icon name="plus" /> {t('Write the first meeting note')}
              </button>
            )
          }
        >
          {t('Write down what was discussed and decided in PMI meetings, walkthroughs and 1:1s. The notes are dated and feed the weekly update.')}
        </Empty>
      ) : !shown.length ? (
        <Empty title={t('No meeting notes match the filter')} />
      ) : (
        weeks.map((g) => (
          <section class="note-week">
            <header class="note-week-head">
              <h3>{weekLabel(g.start)}</h3>
              <span class="count">{g.notes.length}</span>
              <span class="spacer" />
              <button class="link-btn small" onClick={() => go({ tab: 'report', week: g.start })}>
                {t('Weekly update for this week')} <Icon name="right" size={12} />
              </button>
            </header>
            {g.notes.map((n) => (
              <NoteCard n={n} p={p} editable={editable} onEdit={() => setEditing(n)} />
            ))}
          </section>
        ))
      )}

      {editing && <NoteEditor p={p} note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function NoteCard({ n, p, editable, onEdit }) {
  const [showHistory, setShowHistory] = useState(false);
  const attendees = (n.attendeeIds || []).map((id) => IDX.people.get(id)).filter(Boolean);
  const wss = (n.workstreamIds || []).map((id) => IDX.workstreams.get(id)).filter(Boolean);
  const remove = async () => {
    const ok = await confirmDialog({
      title: t('Delete meeting note?'),
      body: t('"{n}" is moved to the trash under History and can be restored with its full history.', { n: n.title || fmtDate(n.date) }),
      ok: t('Delete'),
      danger: true,
    });
    if (ok) deleteNote(n).then(() => toast('ok', t('Meeting note moved to the trash.'))).catch(() => {});
  };
  return (
    <article class="note-card">
      <div class="note-date">
        <span class="nd-day">{fmtParts(n.date, { weekday: 'short' })}</span>
        <span class="nd-num">{+n.date.slice(8)}</span>
        <span class="nd-mon">{fmtParts(n.date, { month: 'short' })}</span>
      </div>
      <div class="note-main">
        <header class="note-head">
          <h4>{n.title || t('Meeting note')}</h4>
          {editable && (
            <span class="note-actions">
              <button class="icon-btn small" onClick={onEdit} aria-label={t('Edit')} title={t('Edit')}>
                <Icon name="edit" size={14} />
              </button>
              <button class="icon-btn small" onClick={remove} aria-label={t('Delete')} title={t('Delete')}>
                <Icon name="trash" size={14} />
              </button>
            </span>
          )}
        </header>
        {(attendees.length > 0 || wss.length > 0) && (
          <div class="note-meta small">
            {attendees.length > 0 && (
              <span class="owners-names">
                {attendees.map((a) => (
                  <span class="owner-chip">
                    <Avatar person={a} size={18} />
                    <span>{a.name}</span>
                  </span>
                ))}
              </span>
            )}
            {wss.map((w) => (
              <span class="ws-chip">{w.name}</span>
            ))}
          </div>
        )}
        <NoteBody text={n.body} />
        <footer class="note-foot small muted">
          {n.updatedAt && n.updatedAt !== n.createdAt
            ? t('Edited {d}', { d: fmtDateTime(n.updatedAt) }) + (n.updatedBy ? ` ${t('by')} ${actorName(n.updatedBy)}` : '')
            : t('Written {d}', { d: fmtDateTime(n.createdAt) }) + (n.createdBy ? ` ${t('by')} ${actorName(n.createdBy)}` : '')}
          {' · '}
          <button class="link-btn small" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? t('Hide history') : t('History')}
          </button>
        </footer>
        {showHistory && (
          <div class="note-history">
            <EventList events={entityHistory(p.id, n.id)} limit={10} />
          </div>
        )}
      </div>
    </article>
  );
}

// Renders note text: "- " lines as bullets, "Heading:" lines as small headings.
export function NoteBody({ text }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const m = line.match(/^([-*•–]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }));
      list.items.push(m[2]);
    } else if (/^[^.!?]{2,48}:$/.test(line)) {
      list = null;
      blocks.push({ type: 'h', text: line.slice(0, -1) });
    } else {
      list = null;
      blocks.push({ type: 'p', text: line });
    }
  }
  if (!blocks.length) return <p class="muted small">{t('No notes written.')}</p>;
  return (
    <div class="note-body">
      {blocks.map((b) => (b.type === 'ul' ? <ul>{b.items.map((i) => <li>{i}</li>)}</ul> : b.type === 'h' ? <h5>{b.text}</h5> : <p>{b.text}</p>))}
    </div>
  );
}

function NoteEditor({ p, note, onClose }) {
  const [f, setF] = useState(() => ({
    date: note ? note.date : todayISO(),
    title: note ? note.title : '',
    attendeeIds: note ? note.attendeeIds || [] : [],
    workstreamIds: note ? note.workstreamIds || [] : [],
    body: note ? note.body : '',
  }));
  const [busy, setBusy] = useState(false);
  const wss = projectWorkstreams(p.id);
  const set = (patch) => setF({ ...f, ...patch });
  const save = async () => {
    if (!f.date || busy) return;
    setBusy(true);
    try {
      if (note) await updateNote(note, f);
      else await createNote({ projectId: p.id, ...f });
      toast('ok', note ? t('Meeting note saved.') : t('Meeting note added.'));
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={note ? t('Edit meeting note') : t('New meeting note')}
      onClose={onClose}
      footer={
        <>
          <button class="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button class="btn primary" onClick={save} disabled={busy || !f.date || !(f.title.trim() || f.body.trim())}>
            {t('Save')}
          </button>
        </>
      }
    >
      <div class="form-grid">
        <Field label={t('Date')} htmlFor="ne-date">
          <input id="ne-date" type="date" value={f.date} onChange={(e) => set({ date: e.currentTarget.value })} />
        </Field>
        <Field label={t('Meeting')} htmlFor="ne-title">
          <input id="ne-title" value={f.title} placeholder={t('E.g. Weekly PMI sync, Ops walkthrough')} onInput={(e) => set({ title: e.currentTarget.value })} />
        </Field>
        <Field label={t('Attendees')} htmlFor="ne-att" class="span2">
          <PersonPicker id="ne-att" value={f.attendeeIds} onChange={(attendeeIds) => set({ attendeeIds })} />
        </Field>
        <div class="field span2">
          <span class="lbl">{t('Workstreams')}</span>
          <div class="chip-toggles">
            {wss.map((w) => {
              const on = f.workstreamIds.includes(w.id);
              return (
                <button type="button" class={`fbtn ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ workstreamIds: on ? f.workstreamIds.filter((x) => x !== w.id) : [...f.workstreamIds, w.id] })}>
                  {w.name}
                </button>
              );
            })}
          </div>
        </div>
        <Field
          label={t('Notes')}
          htmlFor="ne-body"
          class="span2"
          hint={t('Start lines with "- " for bullet points. Put next steps under a line "Next steps:" and they go to "Coming up next week" in the weekly update.')}
        >
          <textarea
            id="ne-body"
            rows={12}
            value={f.body}
            placeholder={'- Walked through the order process with the operations team\n- First 1:1 between the new team lead and their manager\n\nNext steps:\n- Write down the requirements from the walkthrough'}
            onInput={(e) => set({ body: e.currentTarget.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
