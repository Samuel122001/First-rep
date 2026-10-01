import { useState } from 'preact/hooks';
import { t } from '../i18n.js';
import { S, canEdit, toast } from '../store.js';
import { go } from '../nav.js';
import { Icon, Modal } from './ui.jsx';
import { exportBackup, parseBackup, importBackup, COLLECTIONS } from '../backup.js';

export function BackupModal() {
  const close = () => go({ backup: false });
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState([0, 0]);
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState('');

  const doExport = async () => {
    setBusy('export');
    try {
      const counts = await exportBackup();
      toast('ok', t('Backup created: {n} documents.', { n: Object.values(counts).reduce((a, b) => a + b, 0) }));
    } catch {
      toast('error', t('Could not create the backup. Try again.'));
    } finally {
      setBusy(null);
    }
  };
  const pick = async (e) => {
    setErr('');
    setParsed(null);
    const file = e.currentTarget.files && e.currentTarget.files[0];
    if (!file) return;
    try {
      setParsed(parseBackup(await file.text()));
    } catch {
      setErr(t('This file is not a PMI Hub backup.'));
    }
  };
  const doImport = async () => {
    setBusy('import');
    try {
      const n = await importBackup(parsed, (a, b) => setProgress([a, b]));
      toast('ok', t('Imported {n} documents.', { n }));
      close();
    } catch (e) {
      setErr(t('The import stopped: {m}', { m: (e && e.message) || (e && e.code) || '' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={t('Backup and import')} onClose={busy ? null : close}>
      <section class="bk-block">
        <h3>{t('Download a backup')}</h3>
        <p class="small muted">{t('All projects, tasks, people, meeting notes, reports and the complete change history as one JSON file. Keep it somewhere safe; it contains confidential information.')}</p>
        <button class="btn" onClick={doExport} disabled={!!busy}>
          <Icon name="download" size={14} /> {busy === 'export' ? t('Creating backup…') : t('Download backup')}
        </button>
      </section>
      {canEdit() && (
        <section class="bk-block">
          <h3>{t('Import a backup')}</h3>
          <p class="small muted">
            {S.backend === 'firebase'
              ? t('Use this once to move the data from the claude.ai version: download a backup there, then import it here. Documents with the same id are overwritten.')
              : t('Restores a backup. Documents with the same id are overwritten.')}
          </p>
          <input id="bk-file" type="file" accept="application/json,.json" onChange={pick} disabled={!!busy} />
          {parsed && (
            <div class="bk-summary">
              <p class="small">
                {t('Backup from {d}', { d: new Date(parsed.data.exportedAt).toLocaleString('en-GB') })}
                {parsed.data.source && ` · ${parsed.data.source === 'claude' ? 'claude.ai' : parsed.data.source}`}
              </p>
              <ul class="small">
                {COLLECTIONS.map((c) => (
                  <li>
                    {c}: <b>{parsed.counts[c]}</b>
                  </li>
                ))}
              </ul>
              <button class="btn primary" onClick={doImport} disabled={!!busy}>
                {busy === 'import' ? t('Importing {a} of {b}…', { a: progress[0], b: progress[1] }) : t('Import {n} documents', { n: parsed.total })}
              </button>
            </div>
          )}
          {err && <p class="warn-line bad">{err}</p>}
        </section>
      )}
    </Modal>
  );
}
