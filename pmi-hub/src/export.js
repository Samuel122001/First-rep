// Excel export of a project: the plan (same columns as the original Gantt
// sheet), a workstream summary and the change log.
import { t } from './i18n.js';
import { todayISO, networkDays, stats, computeRag, byOrder, cmpDate } from './util.js';
import { S, IDX, projectTasks, projectWorkstreams, flattenHistory, actorName, toast } from './store.js';
import { statusLabel, priorityLabel, ragLabel } from './components/ui.jsx';
import { saveFile, loadScript } from './files.js';
import { fieldLabel, formatValue } from './components/events.jsx';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

const names = (ids) => (ids || []).map((id) => (IDX.people.get(id) || {}).name).filter(Boolean).join(' / ');
const d = (s) => (s ? new Date(s + 'T00:00:00Z') : '');

export async function exportExcel(p) {
  let XLSX;
  try {
    XLSX = await loadScript(XLSX_URL, 'XLSX');
  } catch {
    toast('error', t('Could not load the Excel library. Check your connection and try again.'));
    return;
  }
  const today = todayISO();
  const wss = projectWorkstreams(p.id);
  const tasks = projectTasks(p.id);
  const phases = p.phases || [];
  const phaseName = (id) => (phases.find((x) => x.id === id) || {}).name || '';

  const plan = [
    [t('ORGANISATION'), 'DigitalTolk Group'],
    [t('PROJECT TITLE'), p.name],
    [t('COMPANY'), p.company || ''],
    [t('DAY 1 (CLOSING)'), d(p.closingDate)],
    [t('PMI LEAD'), (IDX.people.get(p.leadPersonId) || {}).name || ''],
    [t('EXPORTED'), d(today)],
    [],
    [t('PHASE'), t('WORKSTREAM'), t('TASK TITLE'), t('TASK DESCRIPTION'), t('DEFINITION OF DONE'), t('TASK OWNER'), t('SCHEDULED START'), t('SCHEDULED FINISH'), t('STATUS'), t('DURATION (working days)'), t('PRIORITY'), t('MILESTONE'), t('DEPENDS ON'), t('LAST UPDATED')],
  ];
  const phaseOrder = (id) => {
    const i = phases.findIndex((x) => x.id === id);
    return i < 0 ? 99 : i;
  };
  const wsOrder = new Map(wss.map((w, i) => [w.id, i]));
  [...tasks]
    .sort((a, b) => phaseOrder(a.phaseId) - phaseOrder(b.phaseId) || (wsOrder.get(a.workstreamId) ?? 99) - (wsOrder.get(b.workstreamId) ?? 99) || cmpDate(a.start, b.start) || byOrder(a, b))
    .forEach((x) =>
      plan.push([
        phaseName(x.phaseId),
        (IDX.workstreams.get(x.workstreamId) || {}).name || '',
        x.title,
        x.description || '',
        x.dod || '',
        names(x.ownerIds),
        d(x.start),
        d(x.due),
        statusLabel(x.status),
        networkDays(x.start, x.due) ?? '',
        priorityLabel(x.priority || 'normal'),
        x.milestone ? t('Yes') : '',
        (x.dependsOn || []).map((id) => (IDX.tasks.get(id) || {}).title).filter(Boolean).join('; '),
        x.updatedAt ? new Date(x.updatedAt) : '',
      ]),
    );

  const summary = [[t('WORKSTREAM'), t('LEAD'), t('TASKS'), t('DONE'), t('% COMPLETE'), t('OVERDUE'), t('BLOCKED'), t('COMPUTED STATUS'), t('ASSESSMENT'), t('COMMENT')]];
  for (const w of wss) {
    const wt = tasks.filter((x) => x.workstreamId === w.id);
    const s = stats(wt, today);
    summary.push([w.name, (IDX.people.get(w.leadPersonId) || {}).name || '', s.total, s.done, s.pct / 100, s.overdue, s.blocked, ragLabel(computeRag(wt, today)), w.rag ? ragLabel(w.rag) : '', w.ragNote || '']);
  }

  const log = [[t('TIME'), t('CHANGED BY'), t('ITEM'), t('ACTION'), t('FIELD'), t('BEFORE'), t('AFTER'), t('COMMENT')]];
  for (const ev of flattenHistory(S.history[p.id])) {
    const who = ev.a === 'import' ? 'Import' : ev.u ? actorName(ev.u) : '';
    const ctx = { type: ev.type, projectId: p.id };
    if (ev.c) {
      for (const [f, [from, to]] of Object.entries(ev.c)) log.push([new Date(ev.t), who, ev.l || '', ev.a, fieldLabel(f), formatValue(f, from, ctx), formatValue(f, to, ctx), '']);
    } else {
      log.push([new Date(ev.t), who, ev.l || '', ev.a, '', '', '', ev.x || '']);
    }
  }

  const wb = XLSX.utils.book_new();
  const sh1 = XLSX.utils.aoa_to_sheet(plan, { cellDates: true, dateNF: 'yyyy-mm-dd' });
  sh1['!cols'] = [18, 18, 46, 50, 30, 28, 14, 14, 12, 10, 10, 10, 30, 18].map((w) => ({ wch: w }));
  sh1['!autofilter'] = { ref: `A8:N${plan.length}` };
  const sh2 = XLSX.utils.aoa_to_sheet(summary);
  sh2['!cols'] = [22, 22, 8, 8, 10, 10, 10, 16, 14, 50].map((w) => ({ wch: w }));
  for (let r = 1; r < summary.length; r++) {
    const c = sh2[XLSX.utils.encode_cell({ r, c: 4 })];
    if (c) c.z = '0%';
  }
  const sh3 = XLSX.utils.aoa_to_sheet(log, { cellDates: true });
  sh3['!cols'] = [18, 20, 40, 10, 18, 30, 30, 50].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, sh1, t('Plan'));
  XLSX.utils.book_append_sheet(wb, sh2, t('Workstreams'));
  XLSX.utils.book_append_sheet(wb, sh3, t('Change log'));
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const filename = `DigitalTolk PMI - ${p.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'Project'} ${today}.xlsx`;
  await saveFile(filename, new Blob([buf]));
}
