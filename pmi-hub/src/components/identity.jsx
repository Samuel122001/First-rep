import { useState } from 'preact/hooks';
import { t } from '../i18n.js';
import { S, myPerson, linkMe, unlinkMe, toast } from '../store.js';
import { go } from '../nav.js';
import { Icon, Avatar, Modal } from './ui.jsx';

// Lets the signed-in user choose (or change) which person in the people list
// they are. The link decides what "My tasks" shows and whose name appears on
// their changes in the history.
export function IdentityModal() {
  const me = myPerson();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(me ? me.id : null);
  const [busy, setBusy] = useState(false);
  const close = () => go({ identity: false });
  const ql = q.trim().toLowerCase();
  const people = S.people
    .filter((p) => p.active !== false && p.type === 'employee')
    .filter((p) => !ql || p.name.toLowerCase().includes(ql) || (p.role || '').toLowerCase().includes(ql) || (p.team || '').toLowerCase().includes(ql))
    .sort((a, b) => a.name.localeCompare(b.name));

  const save = async () => {
    const person = S.people.find((p) => p.id === pick);
    if (!person || (me && me.id === person.id)) return close();
    setBusy(true);
    try {
      await linkMe(person);
      toast('ok', t('You are now {n}.', { n: person.name }));
      close();
    } catch {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      await unlinkMe();
      toast('ok', t('Your account is no longer linked to a person.'));
      close();
    } catch {
      setBusy(false);
    }
  };

  if (!S.me.id) {
    return (
      <Modal title={t('Who are you?')} onClose={close}>
        <p class="muted">{t('Your account could not be identified in this view. Open PMI Hub in claude.ai while signed in to link your account to a person.')}</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={t('Who are you?')}
      onClose={close}
      footer={
        <>
          {me && (
            <button class="btn ghost danger" onClick={unlink} disabled={busy}>
              {t('Unlink')}
            </button>
          )}
          <span class="spacer" />
          <button class="btn ghost" onClick={close}>
            {t('Cancel')}
          </button>
          <button class="btn primary" onClick={save} disabled={busy || !pick || (me && me.id === pick)}>
            {t('This is me')}
          </button>
        </>
      }
    >
      <p class="muted small">
        {me ? t('Your account is linked to {n}. Choose another person to change it.', { n: me.name }) : t('Choose yourself in the people list. Your tasks then show under My tasks, and your changes are logged under your name.')}
      </p>
      <div class="search">
        <Icon name="search" size={14} />
        <input id="id-q" type="search" value={q} placeholder={t('Search name, role, team…')} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <ul class="id-list" role="radiogroup" aria-label={t('People')}>
        {people.map((p) => {
          const takenByOther = p.userId && p.userId !== S.me.id;
          return (
            <li>
              <button type="button" role="radio" aria-checked={pick === p.id} class={`id-opt ${pick === p.id ? 'on' : ''}`} disabled={takenByOther} onClick={() => setPick(p.id)}>
                <Avatar person={p} size={26} />
                <span class="id-name">
                  {p.name}
                  <span class="small muted block">{[p.role, p.team].filter(Boolean).join(' · ')}</span>
                </span>
                {me && me.id === p.id && <span class="tag">{t('you now')}</span>}
                {takenByOther && <span class="small muted">{t('linked to another account')}</span>}
                {pick === p.id && <Icon name="check" size={16} />}
              </button>
            </li>
          );
        })}
        {!people.length && <li class="muted small pad">{t('No match')}</li>}
      </ul>
    </Modal>
  );
}
