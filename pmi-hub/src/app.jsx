import { t } from './i18n.js';
import { todayISO, stats, dayLabel, cmpDate } from './util.js';
import { S, useStore, projectTasks, myPerson, canEdit } from './store.js';
import { R, go } from './nav.js';
import { Icon, Avatar, ConfirmHost, Toasts } from './components/ui.jsx';
import { TaskDrawer } from './components/drawer.jsx';
import { NewProjectWizard } from './components/wizard.jsx';
import { IdentityModal } from './components/identity.jsx';
import { Portfolio } from './views/portfolio.jsx';
import { MyTasks } from './views/mytasks.jsx';
import { People } from './views/people.jsx';
import { Project } from './views/project.jsx';

export function App() {
  useStore();
  if (S.status === 'nodb') return <NoDb />;
  let content;
  if (S.status === 'connecting') content = <Loading />;
  else if (R.view === 'project' && R.projectId) content = <Project id={R.projectId} />;
  else if (R.view === 'mytasks') content = <MyTasks />;
  else if (R.view === 'people') content = <People />;
  else content = <Portfolio />;

  return (
    <div class={`app ${R.navOpen ? 'nav-open' : ''}`}>
      <Sidebar />
      <div class="mobilebar">
        <button class="icon-btn" onClick={() => go({ navOpen: !R.navOpen })} aria-label={t('Menu')} aria-expanded={R.navOpen}>
          <Icon name="menu" size={20} />
        </button>
        <Brand compact />
        <span class="mb-app">PMI Hub</span>
        <SyncState compact />
      </div>
      {R.navOpen && <div class="scrim" onClick={() => go({ navOpen: false })} />}
      <main class="main">{content}</main>
      {R.taskId && <TaskDrawer taskId={R.taskId} />}
      {R.wizard && <NewProjectWizard onClose={() => go({ wizard: false })} />}
      {R.identity && <IdentityModal />}
      <ConfirmHost />
      <Toasts />
    </div>
  );
}

// DigitalTolk Group wordmark with the brand's pink speech bubble, followed by
// the product name. Drawn in the brand colours; swap in the official logo file
// here if one is provided.
export function Brand({ compact }) {
  return (
    <span class="brand">
      <svg class="brand-mark" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5c5.5 0 9.5 3.7 9.5 8.4s-4 8.4-9.5 8.4c-1 0-2-.1-2.9-.4L4.4 21l1.1-4.1C3.6 15.4 2.5 13.3 2.5 10.9 2.5 6.2 6.5 2.5 12 2.5z" />
      </svg>
      <span class="brand-text">
        <span class="brand-name">DigitalTolk</span>
        {!compact && <span class="brand-group">Group</span>}
      </span>
    </span>
  );
}

function Sidebar() {
  const today = todayISO();
  const projects = S.projects.filter((p) => p.status !== 'archived').sort((a, b) => cmpDate(b.closingDate, a.closingDate));
  const nav = (view, label, icon) => (
    <button class={`nav-item ${R.view === view ? 'on' : ''}`} onClick={() => go({ view })} aria-current={R.view === view ? 'page' : undefined}>
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </button>
  );
  const me = myPerson();
  return (
    <aside class="sidebar" aria-label={t('Navigation')}>
      <div class="sb-top">
        <Brand />
        <span class="sb-app">
          <b>PMI Hub</b>
          <span>{t('Post-merger integration')}</span>
        </span>
      </div>
      <nav class="sb-nav">
        {nav('portfolio', t('Portfolio'), 'portfolio')}
        {nav('mytasks', t('My tasks'), 'user')}
        {nav('people', t('People'), 'people')}
      </nav>
      <div class="sb-section">
        <span class="sb-label">{t('Active projects')}</span>
        {projects.map((p) => {
          const s = stats(projectTasks(p.id), today);
          const on = R.view === 'project' && R.projectId === p.id;
          return (
            <button class={`sb-proj ${on ? 'on' : ''}`} onClick={() => go({ view: 'project', projectId: p.id, tab: on ? R.tab : 'overview' })}>
              <span class="sb-proj-name">{p.name}</span>
              <span class="sb-proj-meta">
                <span class="mono">{dayLabel(p, today) || ''}</span>
                {s.overdue > 0 && <span class="sb-late">{s.overdue}</span>}
              </span>
              <span class="sb-bar">
                <span style={{ width: s.pct + '%' }} />
              </span>
            </button>
          );
        })}
        {canEdit() && (
          <button class="sb-new" onClick={() => go({ wizard: true })}>
            <Icon name="plus" size={15} /> {t('New PMI project')}
          </button>
        )}
      </div>
      <div class="sb-foot">
        <SyncState />
        {S.me.id && (
          <button class="sb-me" onClick={() => go({ identity: true })} title={t('Change who you are')}>
            {S.me.avatarUrl ? <img src={S.me.avatarUrl} alt="" width="26" height="26" /> : <Avatar person={me} size={26} />}
            <span>
              <span class="sb-me-name">{me ? me.name : S.me.name || t('You')}</span>
              <span class="sb-me-hint">{me ? t('Change who you are') : t('Choose who you are')}</span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

function SyncState({ compact }) {
  let cls = 'ok';
  let label = t('All changes saved');
  if (S.status === 'connecting') {
    cls = 'busy';
    label = t('Connecting…');
  } else if (S.pending > 0) {
    cls = 'busy';
    label = t('Saving…');
  } else if (S.canWrite === false) {
    cls = 'ro';
    label = t('View only');
  } else if (!S.lastSavedAt) {
    label = t('Live, synced for everyone');
  }
  return (
    <span class={`sync ${cls} ${compact ? 'compact' : ''}`} role="status" title={label}>
      <span class="sync-dot" />
      {!compact && <span>{label}</span>}
    </span>
  );
}

function Loading() {
  return (
    <div class="page">
      <div class="skel title" />
      <div class="skeleton-grid">
        <div class="skel" />
        <div class="skel" />
        <div class="skel" />
      </div>
    </div>
  );
}

function NoDb() {
  return (
    <div class="nodb">
      <Brand />
      <h1>{t('The shared plans could not be loaded here')}</h1>
      <p>{t('PMI Hub keeps every project, task and change in a shared database that is only available when the page is opened in claude.ai while signed in. Open the link in claude.ai to see and edit the plans.')}</p>
    </div>
  );
}
