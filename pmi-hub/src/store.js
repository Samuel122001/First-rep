// Data layer: subscribes to the shared database (synced live between all
// users and devices), writes changes and records every change in the
// version history.
//
// Database layout
//   people/{id}        people who can be assigned tasks (shared by all projects)
//   projects/{id}      one PMI project per acquired company
//   workstreams/{id}   workstreams, projectId points to the project
//   tasks/{id}         tasks, projectId + workstreamId
//   baselines/{id}     saved plan versions (snapshot of all tasks)
//   history/{entityId} version history of one entity: events = { eventId: event }
//
// The history is a map with unique keys. update() merges nested objects, so
// two people changing the same task at the same moment never overwrite each
// other's history entries.
import { useEffect, useState } from 'preact/hooks';
import { uid, eventId, equal, clean, todayISO, byOrder } from './util.js';
import { t } from './i18n.js';

export const S = {
  status: 'connecting', // connecting | ready | nodb
  me: { id: null, name: '', avatarUrl: '', color: '' },
  canWrite: null, // null = unknown, false = view only
  people: [],
  projects: [],
  workstreams: [],
  tasks: [],
  loaded: { people: false, projects: false, workstreams: false, tasks: false },
  history: {}, // scope -> [history documents]
  historyLoaded: {},
  baselines: {}, // projectId -> [plan versions]
  notes: {}, // projectId -> [meeting notes]
  notesLoaded: {},
  reports: {}, // projectId -> [weekly updates]
  sample: null, // ask-Claude function where the viewer supports it
  profiles: {}, // user id -> profile (name of whoever made a change)
  pending: 0,
  lastSavedAt: null,
  today: todayISO(),
  toasts: [],
  downloads: null,
};

let db = null;
let userApi = null;
const listeners = new Set();
let emitQueued = false;

export function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => {
    emitQueued = false;
    reindex();
    listeners.forEach((fn) => fn());
  });
}

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return S;
}

// ---------- index ----------
export const IDX = { people: new Map(), projects: new Map(), workstreams: new Map(), tasks: new Map(), personByUser: new Map() };
function reindex() {
  IDX.people = new Map(S.people.map((p) => [p.id, p]));
  IDX.projects = new Map(S.projects.map((p) => [p.id, p]));
  IDX.workstreams = new Map(S.workstreams.map((w) => [w.id, w]));
  IDX.tasks = new Map(S.tasks.map((x) => [x.id, x]));
  IDX.personByUser = new Map(S.people.filter((p) => p.userId).map((p) => [p.userId, p]));
}

export const projectTasks = (pid, withDeleted) => S.tasks.filter((x) => x.projectId === pid && (withDeleted || !x.deleted));
export const projectWorkstreams = (pid) => S.workstreams.filter((w) => w.projectId === pid && !w.deleted).sort(byOrder);
export const activePeople = () => S.people.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
export const myPerson = () => (S.me.id ? IDX.personByUser.get(S.me.id) || null : null);

// ---------- start-up ----------
export async function init() {
  const claude = window.claude;
  if (!claude || typeof claude.use !== 'function') {
    S.status = 'nodb';
    emit();
    return;
  }
  const [dbNs, userNs, dl, sampleFn] = await Promise.all([
    claude.use('db').catch(() => null),
    claude.use('user').catch(() => null),
    claude.use('downloads').catch(() => null),
    claude.use('sample').catch(() => null),
  ]);
  db = dbNs;
  userApi = userNs;
  S.downloads = dl;
  S.sample = sampleFn;
  if (userApi) {
    try {
      const me = await userApi.me();
      S.me = { id: me.id, name: me.name, avatarUrl: me.avatarUrl, color: me.color };
      const cw = await userApi.can('data.write');
      S.canWrite = cw === false ? false : cw === true ? true : null;
    } catch {
      /* reads never reject per the contract */
    }
  }
  if (!db) {
    S.status = 'nodb';
    emit();
    return;
  }
  S.status = 'ready';
  startClock();
  watch('people', (docs) => (S.people = docs));
  watch('projects', (docs) => (S.projects = docs));
  watch('workstreams', (docs) => (S.workstreams = docs));
  watch('tasks', (docs) => (S.tasks = docs));
  emit();
}

// Overdue, "due soon", the D+ counter and the timeline's today line are all
// computed from the viewer's current date at render time; nothing date-derived
// is stored. The clock re-renders the page every minute (and when the tab comes
// back into view), so a page left open overnight rolls over to the new day and
// relative times such as "5 min ago" stay current.
export function startClock() {
  if (startClock.started) return;
  startClock.started = true;
  S.today = todayISO();
  const tick = () => {
    S.today = todayISO();
    emit();
  };
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
}

function docsOf(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function watch(coll, assign) {
  const start = () =>
    db.collection(coll).onSnapshot(
      (snap) => {
        assign(docsOf(snap));
        S.loaded[coll] = true;
        emit();
      },
      (e) => {
        if (e && e.code === 'unavailable') setTimeout(start, 2000 + Math.random() * 2000);
        else if (e && e.code !== 'revoked') toast('error', describeError(e));
      },
    );
  start();
}

const scopeSubs = new Map();
// History is subscribed per project (or '_people' for the people list) when needed.
export function ensureHistory(scope) {
  if (!db || !scope || scopeSubs.has('h:' + scope)) return;
  const start = () =>
    db.collection('history').where('projectId', '==', scope).onSnapshot(
      (snap) => {
        S.history[scope] = docsOf(snap);
        S.historyLoaded[scope] = true;
        emit();
      },
      (e) => {
        if (e && e.code === 'unavailable') setTimeout(() => scopeSubs.set('h:' + scope, start()), 2000);
      },
    );
  scopeSubs.set('h:' + scope, start());
}

export function ensureBaselines(pid) {
  if (!db || !pid || scopeSubs.has('b:' + pid)) return;
  scopeSubs.set(
    'b:' + pid,
    db.collection('baselines').where('projectId', '==', pid).onSnapshot((snap) => {
      S.baselines[pid] = docsOf(snap).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      emit();
    }),
  );
}

// Meeting notes and weekly updates are subscribed per project when it is opened.
export function ensureNotes(pid) {
  if (!db || !pid || scopeSubs.has('n:' + pid)) return;
  scopeSubs.set(
    'n:' + pid,
    db.collection('notes').where('projectId', '==', pid).onSnapshot((snap) => {
      S.notes[pid] = docsOf(snap);
      S.notesLoaded[pid] = true;
      emit();
    }),
  );
}

export function ensureReports(pid) {
  if (!db || !pid || scopeSubs.has('r:' + pid)) return;
  scopeSubs.set(
    'r:' + pid,
    db.collection('reports').where('projectId', '==', pid).onSnapshot((snap) => {
      S.reports[pid] = docsOf(snap);
      emit();
    }),
  );
}

// Flattens history documents into a list of events, newest first.
export function flattenHistory(docs) {
  const out = [];
  for (const d of docs || []) {
    for (const [eid, ev] of Object.entries(d.events || {})) {
      out.push({ ...ev, eid, entityId: d.entityId || d.id, type: d.type, projectId: d.projectId });
    }
  }
  return out.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
}

export function entityHistory(scope, entityId) {
  const doc = (S.history[scope] || []).find((d) => d.id === entityId);
  return doc ? flattenHistory([doc]) : [];
}

// ---------- who made the change ----------
let profileQueue = new Set();
let profileTimer = null;
export function actorName(userId) {
  if (!userId) return null;
  const p = IDX.personByUser.get(userId);
  if (p) return p.name;
  if (S.me.id === userId && S.me.name) return S.me.name;
  const prof = S.profiles[userId];
  if (prof) return prof.name || t('Someone');
  if (userApi && !profileQueue.has(userId)) {
    profileQueue.add(userId);
    clearTimeout(profileTimer);
    profileTimer = setTimeout(async () => {
      const ids = [...profileQueue];
      try {
        const res = await userApi.profiles(ids);
        Object.assign(S.profiles, res);
      } catch {
        ids.forEach((id) => (S.profiles[id] = { name: '' }));
      }
      emit();
    }, 30);
  }
  return '…';
}

// ---------- writes ----------
const chains = new Map();
function write(path, op) {
  const prev = chains.get(path) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => retryOnce(() => op(db.doc(path))));
  chains.set(path, run);
  S.pending++;
  emit();
  return run
    .then((v) => {
      S.lastSavedAt = Date.now();
      return v;
    })
    .catch((e) => {
      handleWriteError(e);
      throw e;
    })
    .finally(() => {
      S.pending--;
      if (chains.get(path) === run) chains.delete(path);
      emit();
    });
}

async function retryOnce(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e && e.code === 'unavailable') {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
      return fn();
    }
    throw e;
  }
}

function handleWriteError(e) {
  if (e && e.code === 'invalid_argument' && S.canWrite !== true) {
    S.canWrite = false;
    toast('error', t('You have view-only access. Ask the owner for edit access to make changes.'));
    return;
  }
  toast('error', describeError(e));
}

function describeError(e) {
  if (!e) return t('Something went wrong.');
  if (e.code === 'quota_exceeded') return t('The database is full: {m}', { m: e.message });
  if (e.code === 'resource_exhausted') return t('Too many changes in a short time. Wait a few seconds and try again.');
  if (e.code === 'unavailable') return t('Could not reach the database. Check your connection and try again.');
  return t('Could not save: {m}', { m: e.message || e.code });
}

export function canEdit() {
  return S.status === 'ready' && S.canWrite !== false;
}

const nowISO = () => new Date().toISOString();

function newEvent(a, extra) {
  return clean({ t: nowISO(), u: S.me.id || null, a, ...extra });
}

async function logEvent(type, entityId, scope, ev) {
  const id = eventId();
  const path = 'history/' + entityId;
  return write(path, async (ref) => {
    try {
      await ref.update({ events: { [id]: ev } });
    } catch (e) {
      if (!e || e.code !== 'invalid_argument') throw e;
      const snap = await ref.get();
      if (snap.exists) throw e;
      await ref.set({ projectId: scope, type, entityId, events: { [id]: ev } });
    }
  }).catch(() => {});
}

const COLL = { task: 'tasks', project: 'projects', workstream: 'workstreams', person: 'people', note: 'notes', report: 'reports' };
const scopeOf = (type, ent) => (type === 'person' ? '_people' : type === 'project' ? ent.id : ent.projectId);
const labelOf = (type, ent) => (type === 'task' || type === 'report' ? ent.title : type === 'note' ? ent.title || `${t('Meeting')} ${ent.date || ''}`.trim() : ent.name);

export function findEntity(type, id) {
  if (type === 'task') return IDX.tasks.get(id);
  if (type === 'project') return IDX.projects.get(id);
  if (type === 'workstream') return IDX.workstreams.get(id);
  if (type === 'person') return IDX.people.get(id);
  const pool = type === 'note' ? S.notes : type === 'report' ? S.reports : {};
  for (const list of Object.values(pool)) {
    const hit = (list || []).find((x) => x.id === id);
    if (hit) return hit;
  }
  return null;
}

async function createEntity(type, id, data) {
  const body = clean({ ...data, createdAt: nowISO(), createdBy: S.me.id || null, updatedAt: nowISO(), updatedBy: S.me.id || null });
  await write(`${COLL[type]}/${id}`, (ref) => ref.set(body));
  const ev = newEvent('create', { l: labelOf(type, body) });
  write('history/' + id, (ref) => ref.set({ projectId: scopeOf(type, { id, ...body }), type, entityId: id, events: { [eventId()]: ev } })).catch(() => {});
  return { id, ...body };
}

async function updateEntity(type, ent, patch, opts = {}) {
  const changes = {};
  for (const k of Object.keys(patch)) {
    if (!equal(ent[k], patch[k])) changes[k] = [ent[k] ?? null, patch[k] ?? null];
  }
  if (!Object.keys(changes).length) return false;
  const body = clean({ ...patch, ...(opts.extra || {}), updatedAt: nowISO(), updatedBy: S.me.id || null });
  await write(`${COLL[type]}/${ent.id}`, (ref) => ref.update(body));
  const ev = newEvent(opts.action || 'update', { c: changes, l: labelOf(type, { ...ent, ...patch }), ...(opts.ref ? { r: opts.ref } : {}) });
  logEvent(type, ent.id, scopeOf(type, ent), ev);
  return true;
}

// ---------- tasks ----------
export async function createTask(data) {
  const id = uid('t');
  const base = {
    projectId: data.projectId,
    workstreamId: data.workstreamId || null,
    phaseId: data.phaseId || null,
    title: data.title || t('New task'),
    description: data.description || '',
    dod: data.dod || '',
    ownerIds: data.ownerIds || [],
    start: data.start || null,
    due: data.due || null,
    status: data.status || 'open',
    priority: data.priority || 'normal',
    milestone: !!data.milestone,
    dependsOn: data.dependsOn || [],
    order: data.order ?? Date.now(),
    deleted: false,
    doneAt: null,
  };
  return createEntity('task', id, base);
}

export function updateTask(task, patch, opts = {}) {
  const extra = { ...(opts.extra || {}) };
  if (patch.status && patch.status !== task.status) {
    extra.doneAt = patch.status === 'done' ? todayISO() : null;
  }
  return updateEntity('task', task, patch, { ...opts, extra });
}

export const deleteTask = (task) => updateEntity('task', task, { deleted: true }, { action: 'delete' });
export const restoreTask = (task) => updateEntity('task', task, { deleted: false }, { action: 'restore' });

export function addComment(type, ent, text) {
  const scope = scopeOf(type, ent);
  return logEvent(type, ent.id, scope, newEvent('comment', { x: text, l: labelOf(type, ent) }));
}

// Puts a field back to its value before a given change (logged as a new change).
export function revertChange(ev, field) {
  const [from] = ev.c[field];
  const type = ev.type;
  const ent = findEntity(type, ev.entityId);
  if (!ent) return Promise.resolve(false);
  const patch = { [field]: from };
  if (type === 'task') return updateTask(ent, patch, { action: 'revert', ref: ev.eid });
  return updateEntity(type, ent, patch, { action: 'revert', ref: ev.eid });
}

// ---------- projects and workstreams ----------
export const updateProject = (p, patch, opts) => updateEntity('project', p, patch, opts);
export const createWorkstream = (data) =>
  createEntity('workstream', uid('w'), { rag: null, ragNote: '', ragAt: null, ragBy: null, deleted: false, description: '', ...data });
export const updateWorkstream = (w, patch, opts) => updateEntity('workstream', w, patch, opts);
export const deleteWorkstream = (w) => updateEntity('workstream', w, { deleted: true }, { action: 'delete' });

export function setWorkstreamRag(w, rag, note) {
  // Clearing the assessment ("None") also clears its comment.
  return updateEntity('workstream', w, { rag: rag || null, ragNote: rag ? note || '' : '' }, { extra: { ragAt: nowISO(), ragBy: S.me.id || null } });
}

export async function createProject(spec, onProgress) {
  const pid = uid('p');
  const steps = 1 + spec.workstreams.length + spec.tasks.length;
  let done = 0;
  const tick = () => onProgress && onProgress(++done, steps);
  await createEntity('project', pid, {
    name: spec.name,
    company: spec.company,
    status: 'active',
    signingDate: spec.signingDate || null,
    closingDate: spec.closingDate || null,
    planStart: spec.planStart || null,
    planEnd: spec.planEnd || null,
    leadPersonId: spec.leadPersonId || null,
    description: spec.description || '',
    phases: spec.phases,
    templateFrom: spec.templateFrom || null,
  });
  tick();
  const wsIds = {};
  for (const [i, w] of spec.workstreams.entries()) {
    const id = uid('w');
    wsIds[w.key] = id;
    await createEntity('workstream', id, {
      projectId: pid,
      name: w.name,
      leadPersonId: w.leadPersonId || null,
      description: w.description || '',
      order: (i + 1) * 10,
      rag: null,
      ragNote: '',
      ragAt: null,
      ragBy: null,
      deleted: false,
    });
    tick();
  }
  // Tasks are written a few at a time in parallel; each document is written once.
  const queue = spec.tasks.map((x, i) => ({ ...x, order: (i + 1) * 10 }));
  const idMap = {};
  queue.forEach((x) => (idMap[x.key || x.order] = uid('t')));
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const x = queue.shift();
      await createEntity('task', idMap[x.key || x.order], {
        projectId: pid,
        workstreamId: wsIds[x.wsKey] || null,
        phaseId: x.phaseId || null,
        title: x.title,
        description: x.description || '',
        dod: x.dod || '',
        ownerIds: x.ownerIds || [],
        start: x.start || null,
        due: x.due || null,
        status: 'open',
        priority: x.priority || 'normal',
        milestone: !!x.milestone,
        dependsOn: (x.dependsOnKeys || []).map((k) => idMap[k]).filter(Boolean),
        order: x.order,
        deleted: false,
        doneAt: null,
      });
      tick();
    }
  });
  await Promise.all(workers);
  return pid;
}

// ---------- meeting notes ----------
export function createNote(data) {
  return createEntity('note', uid('n'), {
    projectId: data.projectId,
    date: data.date,
    title: data.title || '',
    attendeeIds: data.attendeeIds || [],
    workstreamIds: data.workstreamIds || [],
    body: data.body || '',
    deleted: false,
  });
}
export const updateNote = (n, patch) => updateEntity('note', n, patch);
export const deleteNote = (n) => updateEntity('note', n, { deleted: true }, { action: 'delete' });
export const restoreNote = (n) => updateEntity('note', n, { deleted: false }, { action: 'restore' });

// ---------- weekly updates (one document per project and week) ----------
// Remembers what was last written per report, so a second save that comes
// before the database has echoed the first one updates instead of re-creating.
const reportWritten = new Map();
export async function saveReport(project, weekStart, content, existing, opts = {}) {
  const id = `r_${project.id}_${weekStart}`;
  const fields = { title: content.title || '', happened: content.happened || [], next: content.next || [], footer: content.footer || '' };
  const known = existing || reportWritten.get(id);
  reportWritten.set(id, { id, projectId: project.id, weekStart, ...(known || {}), ...fields });
  if (!known) {
    return createEntity('report', id, { projectId: project.id, weekStart, ...fields, source: opts.source || 'manual' });
  }
  return updateEntity('report', known, fields, { action: opts.action });
}

// ---------- people ----------
export function createPerson(data) {
  return createEntity('person', uid('pe'), {
    name: data.name.trim(),
    role: data.role || '',
    team: data.team || '',
    email: data.email || '',
    type: data.type || 'employee',
    active: true,
    userId: null,
    source: data.source || 'manual',
  });
}
export const updatePerson = (p, patch, opts) => updateEntity('person', p, patch, opts);

export async function linkMe(person) {
  const prev = myPerson();
  if (prev && prev.id !== person.id) await updateEntity('person', prev, { userId: null }, { action: 'unlink' });
  return updateEntity('person', person, { userId: S.me.id }, { action: 'link' });
}
export async function unlinkMe() {
  const prev = myPerson();
  if (prev) await updateEntity('person', prev, { userId: null }, { action: 'unlink' });
}

// ---------- plan versions (baselines) ----------
export async function createBaseline(project, name, note) {
  const tasks = {};
  for (const x of projectTasks(project.id)) {
    tasks[x.id] = { ti: x.title, ws: x.workstreamId, ph: x.phaseId, s: x.start || null, d: x.due || null, st: x.status, o: x.ownerIds || [] };
  }
  const id = uid('b');
  await write('baselines/' + id, (ref) =>
    ref.set({ projectId: project.id, name, note: note || '', createdAt: nowISO(), createdBy: S.me.id || null, tasks }),
  );
  logEvent('project', project.id, project.id, newEvent('baseline', { l: project.name, x: name, b: id }));
  return id;
}

export function deleteBaseline(b) {
  return write('baselines/' + b.id, (ref) => ref.delete());
}

// ---------- notifications ----------
export function toast(kind, text, ms = 5000) {
  const id = Math.random().toString(36).slice(2);
  S.toasts = [...S.toasts, { id, kind, text }];
  emit();
  setTimeout(() => {
    S.toasts = S.toasts.filter((x) => x.id !== id);
    emit();
  }, ms);
}
