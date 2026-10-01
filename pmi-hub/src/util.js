// Dates are stored as 'YYYY-MM-DD'. All date arithmetic uses UTC day numbers so
// that daylight saving time never shifts a day.
const DAY = 86400000;

export const toDay = (s) => (s ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY : null);
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (s, n) => fromDay(toDay(s) + n);
export const diffDays = (a, b) => toDay(b) - toDay(a);
export const weekdayIdx = (s) => (new Date(toDay(s) * DAY).getUTCDay() + 6) % 7; // 0 = Monday

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isoWeek(s) {
  const d = new Date(toDay(s) * DAY);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3); // Thursday of the same week
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

export function startOfWeek(s) {
  return addDays(s, -weekdayIdx(s));
}

// Working days between two dates, both inclusive (like Excel's NETWORKDAYS).
export function networkDays(a, b) {
  if (!a || !b) return null;
  const s = toDay(a), e = toDay(b);
  if (e < s) return 0;
  const full = Math.floor((e - s + 1) / 7);
  let n = full * 5;
  for (let d = s + full * 7; d <= e; d++) {
    const wd = (new Date(d * DAY).getUTCDay() + 6) % 7;
    if (wd < 5) n++;
  }
  return n;
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function eventId() {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function equal(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  if ((a === '' && b == null) || (b === '' && a == null)) return true;
  return false;
}

export function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === undefined ? null : v;
  return out;
}

export function initials(name) {
  const parts = String(name || '?').replace(/[^\p{L}\p{N}\s&]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable colour per person, from a palette that works in both themes.
const HUES = [212, 168, 28, 280, 340, 120, 48, 190, 250, 8, 300, 90];
export function personHue(id) {
  let h = 0;
  for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export const OPEN_STATES = new Set(['open', 'doing', 'blocked']);
export const isOpen = (t) => OPEN_STATES.has(t.status);

// Health of a single task.
export function taskHealth(t, today) {
  if (!isOpen(t)) return 'closed';
  if (t.status === 'blocked') return 'blocked';
  if (t.due && t.due < today) return 'overdue';
  if (t.due && diffDays(today, t.due) <= 7) return 'soon';
  return 'ok';
}

export function daysLate(t, today) {
  return t.due && t.due < today ? diffDays(t.due, today) : 0;
}

// Computed RAG for a group of tasks:
//   red   – a task is blocked or more than 14 days overdue
//   amber – a task is overdue
//   green – nothing overdue
export function computeRag(tasks, today) {
  const active = tasks.filter((t) => t.status !== 'na');
  if (!active.length) return null;
  let late = 0;
  for (const t of active) {
    if (t.status === 'blocked') return 'red';
    const d = daysLate(t, today);
    if (d > 14) return 'red';
    if (d > 0) late++;
  }
  return late ? 'amber' : 'green';
}

export function stats(tasks, today) {
  const s = { total: 0, done: 0, doing: 0, open: 0, blocked: 0, na: 0, overdue: 0, soon: 0, noOwner: 0, noDates: 0 };
  for (const t of tasks) {
    s.total++;
    s[t.status] = (s[t.status] || 0) + 1;
    const h = taskHealth(t, today);
    if (h === 'overdue') s.overdue++;
    if (isOpen(t) && t.due && t.due >= today && diffDays(today, t.due) <= 14) s.soon++;
    if (isOpen(t) && !(t.ownerIds || []).length) s.noOwner++;
    if (isOpen(t) && (!t.start || !t.due)) s.noDates++;
  }
  s.counted = s.total - s.na;
  s.pct = s.counted ? Math.round((s.done / s.counted) * 100) : 0;
  return s;
}

export function dayLabel(project, today) {
  if (!project || !project.closingDate) return null;
  const d = diffDays(project.closingDate, today);
  return d >= 0 ? `D+${d}` : `D${d}`;
}

export function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || String(a.name || a.title).localeCompare(String(b.name || b.title));
}

export function cmpDate(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

export function debounce(fn, ms) {
  let h;
  return (...args) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
}

export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem('pmihub:' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem('pmihub:' + key, JSON.stringify(value));
  } catch {
    /* storage blocked: a convenience, not data */
  }
}

// Parses a pasted list (from Excel, CSV or one name per line).
export function parsePeopleList(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : lines.every((l) => l.split(',').length >= 2 && /@|,\s*\S/.test(l)) ? ',' : null;
  const rows = lines.map((l) => (sep ? l.split(sep) : [l]).map((c) => c.trim().replace(/^"|"$/g, '')));
  // Skip a header row if it looks like one (English or Swedish headers).
  const head = rows[0].map((c) => c.toLowerCase());
  const looksHeader = head.some((c) => /^(namn|name|förnamn|first name|titel|title|roll|role|e-?post|e-?mail|team|avdelning|department)$/.test(c));
  let map = { name: 0, role: 1, team: 2, email: 3 };
  let body = rows;
  if (looksHeader) {
    body = rows.slice(1);
    map = {};
    head.forEach((c, i) => {
      if (/^(namn|name|fullständigt namn|full name)$/.test(c)) map.name = i;
      else if (/^(förnamn|first name)$/.test(c)) map.first = i;
      else if (/^(efternamn|last name|surname)$/.test(c)) map.last = i;
      else if (/^(titel|title|roll|role|befattning|position)$/.test(c)) map.role = i;
      else if (/^(team|avdelning|department|enhet)$/.test(c)) map.team = i;
      else if (/^(e-?post|e-?mail|mail)$/.test(c)) map.email = i;
    });
    if (map.name == null && map.first == null) map.name = 0;
  }
  return body
    .map((r) => {
      let name = map.name != null ? r[map.name] : [r[map.first], r[map.last]].filter(Boolean).join(' ');
      let email = map.email != null ? r[map.email] || '' : '';
      // If the email ended up in another column, find it.
      if (!/@/.test(email)) email = r.find((c) => /@/.test(c || '')) || '';
      const pick = (i) => (i != null && r[i] && !/@/.test(r[i]) ? r[i] : '');
      return { name: (name || '').trim(), role: pick(map.role), team: pick(map.team), email: email.trim() };
    })
    .filter((p) => p.name);
}

// The ISO week (Monday–Sunday) that contains a date.
export function weekOf(s) {
  const start = startOfWeek(s);
  return { start, end: addDays(start, 6), week: isoWeek(s) };
}

// Bullet points from free text: lines starting with -, *, • or "1." become
// bullets; plain lines are kept as they are.
export function textToBullets(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^([-*•–]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

// The viewer's local calendar date of a timestamp, as 'YYYY-MM-DD'.
export function localDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
