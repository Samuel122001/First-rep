import { useEffect, useMemo, useState } from 'preact/hooks';
import { t } from '../i18n.js';
import { todayISO, taskHealth, isOpen, parsePeopleList, cmpDate } from '../util.js';
import { S, IDX, createPerson, updatePerson, canEdit, ensureHistory, flattenHistory, myPerson, linkMe, unlinkMe, toast } from '../store.js';
import { Icon, Avatar, Modal, Field, Empty, typeLabel, confirmDialog } from '../components/ui.jsx';
import { EventList } from '../components/events.jsx';
import { TaskRows } from './portfolio.jsx';

export function People() {
  const today = todayISO();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(null); // {kind:'add'|'import'|'person', id}
  const [tab, setTab] = useState('list');
  useEffect(() => ensureHistory('_people'), []);

  const openByPerson = useMemo(() => {
    const m = new Map();
    const activeProjects = new Set(S.projects.filter((p) => p.status !== 'archived').map((p) => p.id));
    for (const x of S.tasks) {
      if (x.deleted || !isOpen(x) || !activeProjects.has(x.projectId)) continue;
      for (const id of x.ownerIds || []) {
        const r = m.get(id) || { open: 0, late: 0 };
        r.open++;
        if (taskHealth(x, today) === 'overdue') r.late++;
        m.set(id, r);
      }
    }
    return m;
  }, [S.tasks, S.projects]);

  const ql = q.trim().toLowerCase();
  const list = S.people
    .filter((p) => showInactive || p.active !== false)
    .filter((p) => !type || p.type === type)
    .filter((p) => !ql || [p.name, p.role, p.team, p.email].some((v) => (v || '').toLowerCase().includes(ql)))
    .sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));
  const inactiveCount = S.people.filter((p) => p.active === false).length;
  const me = myPerson();

  return (
    <div class="page">
      <header class="page-head">
        <div>
          <p class="eyebrow">{t('People')}</p>
          <h1>{t('People directory')}</h1>
          <p class="lede">{t('Everyone who can be assigned tasks in the PMI projects. New colleagues and external parties added here can be assigned right away, for every user on every device.')}</p>
        </div>
        {canEdit() && (
          <div class="row">
            <button class="btn ghost" onClick={() => setModal({ kind: 'import' })}>
              <Icon name="upload" /> {t('Import list')}
            </button>
            <button class="btn primary" onClick={() => setModal({ kind: 'add' })}>
              <Icon name="plus" /> {t('Add person')}
            </button>
          </div>
        )}
      </header>

      <div class="tabs small-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'list'} class={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          {t('List')} <span class="count">{S.people.filter((p) => p.active !== false).length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'log'} class={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
          {t('Change log')}
        </button>
      </div>

      {tab === 'log' ? (
        <section class="card pad">
          {S.historyLoaded._people ? (
            <EventList events={flattenHistory(S.history._people)} showEntity limit={60} />
          ) : (
            <p class="muted">{t('Loading history…')}</p>
          )}
        </section>
      ) : (
        <>
          <div class="filterbar">
            <div class="search">
              <Icon name="search" size={14} />
              <input id="pp-q" type="search" placeholder={t('Search name, role, team, email…')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
            </div>
            <select id="pp-type" class={`fsel ${type ? 'on' : ''}`} value={type} onChange={(e) => setType(e.currentTarget.value)} aria-label={t('Type')}>
              <option value="">{t('All types')}</option>
              <option value="employee">{t('Employees')}</option>
              <option value="external">{t('External parties')}</option>
              <option value="group">{t('Groups / teams')}</option>
            </select>
            {inactiveCount > 0 && (
              <button class={`fbtn ${showInactive ? 'on' : ''}`} onClick={() => setShowInactive(!showInactive)} aria-pressed={showInactive}>
                {t('Show inactive ({n})', { n: inactiveCount })}
              </button>
            )}
          </div>

          {!S.loaded.people ? (
            <p class="muted">{t('Loading people…')}</p>
          ) : !list.length ? (
            <Empty title={q ? t('No match') : t('No people yet')}>{q ? t('Try another search.') : t('Add people or import a list from Excel.')}</Empty>
          ) : (
            <div class="table-wrap">
              <table class="ptable">
                <thead>
                  <tr>
                    <th>{t('Name')}</th>
                    <th>{t('Role / title')}</th>
                    <th>{t('Team / company')}</th>
                    <th>{t('Type')}</th>
                    <th class="num">{t('Open')}</th>
                    <th class="num">{t('Overdue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const c = openByPerson.get(p.id) || { open: 0, late: 0 };
                    return (
                      <tr class={p.active === false ? 'inactive' : ''} tabIndex={0} onClick={() => setModal({ kind: 'person', id: p.id })} onKeyDown={(e) => e.key === 'Enter' && setModal({ kind: 'person', id: p.id })}>
                        <td>
                          <span class="pname">
                            <Avatar person={p} size={26} />
                            <span>
                              <strong>{p.name}</strong>
                              {me && me.id === p.id && <span class="tag">{t('you')}</span>}
                              {p.active === false && <span class="tag">{t('inactive')}</span>}
                              {p.email && <span class="small muted block">{p.email}</span>}
                            </span>
                          </span>
                        </td>
                        <td>{p.role || <span class="muted">—</span>}</td>
                        <td>{p.team || <span class="muted">—</span>}</td>
                        <td class="small">{typeLabel(p.type)}</td>
                        <td class="num mono">{c.open || ''}</td>
                        <td class={`num mono ${c.late ? 'bad' : ''}`}>{c.late || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal && modal.kind === 'add' && <PersonForm onClose={() => setModal(null)} />}
      {modal && modal.kind === 'import' && <ImportPeople onClose={() => setModal(null)} />}
      {modal && modal.kind === 'person' && <PersonDetail id={modal.id} onClose={() => setModal(null)} />}
    </div>
  );
}

export function PersonForm({ onClose, person, onCreated }) {
  const [f, setF] = useState({ name: person ? person.name : '', role: person ? person.role : '', team: person ? person.team : '', email: person ? person.email : '', type: person ? person.type : 'employee' });
  const [busy, setBusy] = useState(false);
  const dup = !person && f.name.trim() && S.people.find((p) => p.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      if (person) {
        await updatePerson(person, { name: f.name.trim(), role: f.role.trim(), team: f.team.trim(), email: f.email.trim(), type: f.type });
        toast('ok', t('Saved.'));
      } else {
        const p = await createPerson({ ...f, name: f.name.trim(), role: f.role.trim(), team: f.team.trim(), email: f.email.trim() });
        toast('ok', t('{n} has been added and can now be assigned tasks.', { n: p.name }));
        onCreated && onCreated(p);
      }
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={person ? t('Edit person') : t('Add person')}
      onClose={onClose}
      footer={
        <>
          <button class="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button class="btn primary" form="person-form" type="submit" disabled={!f.name.trim() || busy}>
            {person ? t('Save') : t('Add')}
          </button>
        </>
      }
    >
      <form id="person-form" class="form-grid" onSubmit={submit}>
        <Field label={t('Name')} htmlFor="pf-name" class="span2" hint={dup ? t('There is already a person with this name.') : null}>
          <input id="pf-name" value={f.name} onInput={set('name')} required autocomplete="off" />
        </Field>
        <Field label={t('Role / title')} htmlFor="pf-role">
          <input id="pf-role" value={f.role} onInput={set('role')} placeholder={t('E.g. CFO, HR Manager')} />
        </Field>
        <Field label={t('Team / company')} htmlFor="pf-team">
          <input id="pf-team" value={f.team} onInput={set('team')} placeholder={t('E.g. Finance')} />
        </Field>
        <Field label={t('Email')} htmlFor="pf-email">
          <input id="pf-email" type="email" value={f.email} onInput={set('email')} />
        </Field>
        <Field label={t('Type')} htmlFor="pf-type">
          <select id="pf-type" value={f.type} onChange={set('type')}>
            <option value="employee">{t('Employee')}</option>
            <option value="external">{t('External party')}</option>
            <option value="group">{t('Group / team')}</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function ImportPeople({ onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const rows = useMemo(() => parsePeopleList(text), [text]);
  const existing = new Set(S.people.map((p) => p.name.trim().toLowerCase()));
  const existingEmail = new Set(S.people.map((p) => (p.email || '').trim().toLowerCase()).filter(Boolean));
  const seen = new Set();
  const preview = rows.map((r) => {
    const key = r.name.toLowerCase();
    const dup = existing.has(key) || (r.email && existingEmail.has(r.email.toLowerCase())) || seen.has(key);
    seen.add(key);
    return { ...r, dup };
  });
  const toAdd = preview.filter((r) => !r.dup);
  const run = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const r of toAdd) {
        await createPerson({ ...r, source: 'import' });
        setProgress(++n);
      }
      toast('ok', t('{n} people imported.', { n }));
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={t('Import people')}
      onClose={busy ? null : onClose}
      footer={
        <>
          <button class="btn ghost" onClick={onClose} disabled={busy}>
            {t('Cancel')}
          </button>
          <button class="btn primary" onClick={run} disabled={!toAdd.length || busy}>
            {busy ? t('Importing {a} of {b}…', { a: progress, b: toAdd.length }) : t('Import {n} people', { n: toAdd.length })}
          </button>
        </>
      }
    >
      <p class="muted">{t('Paste the list of employees, for example straight from Excel. One person per row. Column order: Name, Role/title, Team, Email. A header row is detected automatically.')}</p>
      <textarea id="imp-text" class="mono-in" rows={8} value={text} placeholder={'Anna Andersson\tCFO\tFinance\tanna@bolaget.se\nErik Eriksson\tHR Manager\tPeople\terik@bolaget.se'} onInput={(e) => setText(e.currentTarget.value)} />
      {preview.length > 0 && (
        <div class="table-wrap import-preview">
          <table class="ptable compact">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Role / title')}</th>
                <th>{t('Team / company')}</th>
                <th>{t('Email')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr class={r.dup ? 'inactive' : ''}>
                  <td>{r.name}</td>
                  <td>{r.role}</td>
                  <td>{r.team}</td>
                  <td>{r.email}</td>
                  <td class="small">{r.dup ? t('Already exists, skipped') : t('New')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function PersonDetail({ id, onClose }) {
  const today = todayISO();
  const p = IDX.people.get(id);
  const [edit, setEdit] = useState(false);
  if (!p) return null;
  const me = myPerson();
  const isMe = me && me.id === p.id;
  const tasks = S.tasks.filter((x) => !x.deleted && (x.ownerIds || []).includes(p.id));
  const open = tasks.filter(isOpen).sort((a, b) => cmpDate(a.due, b.due));
  const leads = S.workstreams.filter((w) => !w.deleted && w.leadPersonId === p.id);
  const events = flattenHistory((S.history._people || []).filter((d) => d.id === p.id));
  const toggleActive = async () => {
    if (p.active !== false) {
      const ok = await confirmDialog({
        title: t('Deactivate {n}?', { n: p.name }),
        body: t('The person stays on existing tasks and in the history, but can no longer be chosen for new tasks. You can reactivate them at any time.'),
        ok: t('Deactivate'),
        danger: true,
      });
      if (!ok) return;
    }
    updatePerson(p, { active: p.active === false }).catch(() => {});
  };
  if (edit) return <PersonForm person={p} onClose={() => setEdit(false)} />;
  return (
    <Modal wide title={p.name} onClose={onClose}>
      <div class="person-head">
        <Avatar person={p} size={44} />
        <div>
          <p>
            {[p.role, p.team].filter(Boolean).join(' · ') || <span class="muted">{t('No role given')}</span>}
          </p>
          <p class="small muted">
            {typeLabel(p.type)}
            {p.email && ` · ${p.email}`}
            {p.active === false && ` · ${t('inactive')}`}
            {p.userId && ` · ${t('linked to an account')}`}
          </p>
        </div>
        {canEdit() && (
          <div class="row wrap">
            <button class="btn ghost small" onClick={() => setEdit(true)}>
              <Icon name="edit" size={14} /> {t('Edit')}
            </button>
            {S.me.id && p.type === 'employee' && !isMe && !p.userId && (
              <button class="btn ghost small" onClick={() => linkMe(p).catch(() => {})}>
                <Icon name="link" size={14} /> {t('This is me')}
              </button>
            )}
            {isMe && (
              <button class="btn ghost small" onClick={() => unlinkMe().catch(() => {})}>
                {t('Unlink from my account')}
              </button>
            )}
            <button class={`btn small ${p.active === false ? 'primary' : 'ghost danger'}`} onClick={toggleActive}>
              {p.active === false ? t('Reactivate') : t('Deactivate')}
            </button>
          </div>
        )}
      </div>
      {leads.length > 0 && (
        <p class="small">
          <b>{t('Leads workstream:')}</b> {leads.map((w) => `${w.name} (${(IDX.projects.get(w.projectId) || {}).name || '–'})`).join(', ')}
        </p>
      )}
      <h3 class="sub">{t('Open tasks ({n})', { n: open.length })}</h3>
      {open.length ? <TaskRows tasks={open} today={today} showProject /> : <p class="muted small">{t('No open tasks.')}</p>}
      <h3 class="sub">{t('History')}</h3>
      <EventList events={events} limit={20} />
    </Modal>
  );
}
