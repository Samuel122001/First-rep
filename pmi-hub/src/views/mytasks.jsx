import { useState } from 'preact/hooks';
import { t } from '../i18n.js';
import { todayISO, diffDays, isOpen, cmpDate } from '../util.js';
import { S, IDX, activePeople, myPerson, canEdit } from '../store.js';
import { go } from '../nav.js';
import { Empty, Avatar } from '../components/ui.jsx';
import { TaskRows } from './portfolio.jsx';

// "My tasks", or any person's tasks across all active projects.
export function MyTasks() {
  const today = todayISO();
  const me = myPerson();
  const [who, setWho] = useState(null);
  const personId = who || (me && me.id);
  const person = personId && IDX.people.get(personId);
  const activeProjects = new Set(S.projects.filter((p) => p.status !== 'archived').map((p) => p.id));
  const mine = person ? S.tasks.filter((x) => !x.deleted && activeProjects.has(x.projectId) && (x.ownerIds || []).includes(person.id)) : [];
  const open = mine.filter(isOpen).sort((a, b) => cmpDate(a.due, b.due));
  const groups = [
    { key: 'late', title: t('Overdue'), tasks: open.filter((x) => x.due && x.due < today) },
    { key: 'week', title: t('Next 7 days'), tasks: open.filter((x) => x.due && x.due >= today && diffDays(today, x.due) <= 7) },
    { key: 'later', title: t('Later'), tasks: open.filter((x) => x.due && diffDays(today, x.due) > 7) },
    { key: 'nodate', title: t('No due date'), tasks: open.filter((x) => !x.due) },
    { key: 'done', title: t('Done in the last 30 days'), tasks: mine.filter((x) => x.status === 'done' && x.doneAt && diffDays(x.doneAt, today) <= 30) },
  ];

  return (
    <div class="page">
      <header class="page-head">
        <div>
          <p class="eyebrow">{t('Tasks')}</p>
          <h1>{person && person.id !== (me && me.id) ? t('Tasks for {n}', { n: person.name }) : t('My tasks')}</h1>
          <p class="lede">
            {t('All open tasks in active PMI projects where the person is an owner.')}
            {me && canEdit() && (
              <>
                {' '}
                <button class="link-btn" onClick={() => go({ identity: true })}>
                  {t('Not {n}? Change who you are', { n: me.name })}
                </button>
              </>
            )}
          </p>
        </div>
        <div class="field inline">
          <label for="mt-who">{t('Show for')}</label>
          <select id="mt-who" value={personId || ''} onChange={(e) => setWho(e.currentTarget.value || null)}>
            <option value="">{t('Choose person…')}</option>
            {activePeople().map((p) => (
              <option value={p.id}>
                {p.name}
                {me && p.id === me.id ? ` (${t('you')})` : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!me && S.me.id && canEdit() && (
        <div class="card link-card">
          <div>
            <h2>{t('Which person are you?')}</h2>
            <p class="muted">{t('Link your account to your person in the people list. Your tasks then show up here, and your changes are logged under your name.')}</p>
          </div>
          <button class="btn primary" onClick={() => go({ identity: true })}>
            {t('Choose who you are')}
          </button>
        </div>
      )}

      {!person ? (
        <Empty title={t('Choose a person')}>{t('Choose a person above to see their tasks.')}</Empty>
      ) : !mine.length ? (
        <Empty title={t('No tasks')}>{t('{n} has no tasks in active projects.', { n: person.name })}</Empty>
      ) : (
        <>
          <div class="person-strip">
            <Avatar person={person} size={36} />
            <div>
              <strong>{person.name}</strong>
              <span class="muted small">{[person.role, person.team].filter(Boolean).join(' · ')}</span>
            </div>
            <span class="small">{t('{n} open', { n: open.length })}</span>
            {groups[0].tasks.length > 0 && <span class="small bad">{t('{n} overdue', { n: groups[0].tasks.length })}</span>}
          </div>
          {groups
            .filter((g) => g.tasks.length)
            .map((g) => (
              <section class={`card group-${g.key}`}>
                <header class="card-head">
                  <h2>{g.title}</h2>
                  <span class="count">{g.tasks.length}</span>
                </header>
                <TaskRows tasks={g.tasks} today={today} showProject />
              </section>
            ))}
        </>
      )}
    </div>
  );
}
