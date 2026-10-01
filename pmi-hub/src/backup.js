// Full backup of the database as one JSON file, and import of such a file.
// Used to move the data from the claude.ai version to the GitHub Pages
// version (Firebase), and as a safety copy in general.
import { S, IDX, getBackend } from './store.js';
import { saveFile } from './files.js';
import { todayISO } from './util.js';

export const COLLECTIONS = ['people', 'projects', 'workstreams', 'tasks', 'baselines', 'history', 'notes', 'reports'];

export async function exportBackup(onProgress) {
  const b = getBackend();
  const out = { format: 'pmi-hub-backup', version: 1, exportedAt: new Date().toISOString(), source: b.kind, collections: {}, users: {} };
  for (const [i, c] of COLLECTIONS.entries()) {
    const snap = await b.db.collection(c).get();
    out.collections[c] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    onProgress && onProgress(i + 1, COLLECTIONS.length);
  }
  // Names of everyone who appears in the data, so the history still shows
  // who did what after a move to another host (account ids differ there).
  const ids = new Set();
  const add = (v) => v && typeof v === 'string' && ids.add(v);
  for (const list of Object.values(out.collections)) {
    for (const { data } of list) {
      ['createdBy', 'updatedBy', 'ragBy', 'userId'].forEach((k) => add(data[k]));
      for (const ev of Object.values(data.events || {})) add(ev.u);
    }
  }
  for (const id of ids) {
    const person = IDX.personByUser.get(id);
    if (person) out.users[id] = person.name;
  }
  if (b.user && ids.size) {
    const prof = await b.user.profiles([...ids]).catch(() => ({}));
    for (const [id, p] of Object.entries(prof)) if (p && p.name) out.users[id] = p.name;
  }
  await saveFile(`DigitalTolk PMI Hub backup ${todayISO()}.json`, new Blob([JSON.stringify(out)], { type: 'application/json' }));
  return Object.fromEntries(COLLECTIONS.map((c) => [c, out.collections[c].length]));
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  if (!data || data.format !== 'pmi-hub-backup' || !data.collections) throw new Error('not a PMI Hub backup');
  const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, (data.collections[c] || []).length]));
  return { data, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// History changes are stored as {from, to}; older backups use [from, to],
// which Firestore cannot hold (no arrays inside arrays).
function normalize(coll, data, sameHost) {
  const d = { ...data };
  if (coll === 'history' && d.events) {
    d.events = Object.fromEntries(
      Object.entries(d.events).map(([id, ev]) => {
        if (!ev || !ev.c) return [id, ev];
        const c = Object.fromEntries(Object.entries(ev.c).map(([f, v]) => [f, Array.isArray(v) ? { from: v[0] ?? null, to: v[1] ?? null } : v]));
        return [id, { ...ev, c }];
      }),
    );
  }
  // Account links only mean something on the host they were made on.
  if (coll === 'people' && !sameHost) d.userId = null;
  return d;
}

export async function importBackup(parsed, onProgress) {
  const b = getBackend();
  const sameHost = parsed.data.source === b.kind;
  const entries = [];
  for (const c of COLLECTIONS) {
    for (const { id, data } of parsed.data.collections[c] || []) entries.push({ path: `${c}/${id}`, data: normalize(c, data, sameHost) });
  }
  if (b.db.setMany) {
    await b.db.setMany(entries, onProgress);
  } else {
    let done = 0;
    const queue = [...entries];
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (queue.length) {
          const e = queue.shift();
          await b.db.doc(e.path).set(e.data);
          onProgress && onProgress(++done, entries.length);
        }
      }),
    );
  }
  if (!sameHost && parsed.data.users && Object.keys(parsed.data.users).length) {
    const ref = b.db.doc('meta/legacyUsers');
    const cur = await ref.get().catch(() => null);
    const names = { ...((cur && cur.exists && cur.data().names) || {}), ...parsed.data.users };
    await ref.set({ names });
  }
  return entries.length;
}

export const databaseIsEmpty = () => S.loaded.projects && S.loaded.people && !S.projects.length && !S.people.length;
