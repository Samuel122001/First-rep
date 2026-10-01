import { t } from './i18n.js';
import { todayISO, stats, dayLabel, cmpDate } from './util.js';
import { S, useStore, projectTasks, myPerson, canEdit } from './store.js';
import { R, go } from './nav.js';
import { Icon, Avatar, ConfirmHost, Toasts } from './components/ui.jsx';
import { TaskDrawer } from './components/drawer.jsx';
import { NewProjectWizard } from './components/wizard.jsx';
import { IdentityModal } from './components/identity.jsx';
import { BackupModal } from './components/backup.jsx';
import { useState } from 'preact/hooks';
import { Portfolio } from './views/portfolio.jsx';
import { MyTasks } from './views/mytasks.jsx';
import { People } from './views/people.jsx';
import { Project } from './views/project.jsx';

export function App() {
  useStore();
  if (S.status === 'nodb') return <NoDb />;
  if (S.status === 'setup') return <SetupNeeded />;
  if (S.status === 'checking') return <Gate busy />;
  if (S.status === 'signin') return <SignIn />;
  if (S.status === 'denied') return <Denied />;
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
      {R.backup && <BackupModal />}
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
        <div class="sb-links">
          <button class="sb-link" onClick={() => go({ backup: true })}>
            <Icon name="archive" size={14} /> {t('Backup')}
          </button>
          {S.authApi && (
            <button class="sb-link" onClick={() => S.authApi.signOut()}>
              {t('Sign out')}
            </button>
          )}
        </div>
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

// ---------- sign-in (GitHub Pages version with Microsoft 365) ----------
function Gate({ busy, children }) {
  return (
    <div class="gate">
      <div class="gate-card">
        <Brand />
        <p class="gate-app">
          <b>PMI Hub</b> · {t('Post-merger integration')}
        </p>
        {busy ? <p class="muted">{t('Checking your sign-in…')}</p> : children}
      </div>
    </div>
  );
}

const AUTH_ERRORS = {
  'auth/popup-closed-by-user': 'The sign-in window was closed before you finished. Try again.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before you finished. Try again.',
  'auth/unauthorized-domain': 'This web address is not yet allowed to sign in. Add it under Authorized domains in Firebase Authentication.',
  'auth/operation-not-allowed': 'Microsoft sign-in is not switched on in Firebase Authentication yet.',
  'auth/invalid-credential': 'Microsoft did not accept the sign-in. Make sure you use your DigitalTolk account.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection and try again.',
  'auth/account-exists-with-different-credential': 'This email is already registered with another sign-in method.',
};

function SignIn() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(S.authError ? AUTH_ERRORS[S.authError] || S.authError : '');
  const start = async () => {
    setBusy(true);
    setErr('');
    try {
      await S.authApi.signIn();
    } catch (e) {
      setErr(t(AUTH_ERRORS[e && e.code] || 'Sign-in failed: {m}', { m: (e && (e.code || e.message)) || '' }));
      setBusy(false);
    }
  };
  return (
    <Gate>
      <h1>{t('Sign in')}</h1>
      <p class="muted">{t('Use your DigitalTolk Microsoft 365 account. Everything you change is saved for the whole team.')}</p>
      <button class="btn ms-btn" onClick={start} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        {busy ? t('Signing in…') : t('Sign in with Microsoft')}
      </button>
      {err && <p class="warn-line bad">{err}</p>}
    </Gate>
  );
}

function Denied() {
  const u = S.authApi && S.authApi.current();
  return (
    <Gate>
      <h1>{t('No access')}</h1>
      <p class="muted">{t('{e} does not have access to PMI Hub. Sign in with your DigitalTolk account, or ask the PMI coordinator for access.', { e: (u && u.email) || t('This account') })}</p>
      <button class="btn" onClick={() => S.authApi.signOut()}>
        {t('Sign out and try another account')}
      </button>
    </Gate>
  );
}

function SetupNeeded() {
  return (
    <Gate>
      <h1>{t('Setup needed')}</h1>
      <p class="muted">{t('This copy of PMI Hub has no Firebase configuration yet. Fill in firebase.config.json as described in docs/SETUP.md and build again.')}</p>
    </Gate>
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
