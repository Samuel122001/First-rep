// Navigation state lives in memory and in the browser history, so the browser's
// back and forward buttons move one step at a time through the app (opening a
// project, switching tab, opening a task, ...). The last place is also
// remembered locally so a reload comes back to it.
import { emit } from './store.js';
import { lsGet, lsSet } from './util.js';

const saved = lsGet('route', null);
export const R = {
  view: 'portfolio', // portfolio | mytasks | people | project
  projectId: null,
  tab: 'overview', // overview | timeline | tasks | board | report | history | settings
  taskId: null,
  wizard: false,
  identity: false, // "Who are you?" dialog
  navOpen: false,
  ...(saved && typeof saved === 'object' ? { view: saved.view, projectId: saved.projectId, tab: saved.tab || 'overview' } : {}),
};

// A link ending in #p_xxx opens that project directly.
try {
  const h = (location.hash || '').slice(1);
  if (/^p_[A-Za-z0-9_-]+$/.test(h)) Object.assign(R, { view: 'project', projectId: h, tab: 'overview' });
} catch {
  /* no hash */
}

// The parts of the state that make up one step in the history.
const snapshot = () => ({ view: R.view, projectId: R.projectId, tab: R.tab, taskId: R.taskId, wizard: R.wizard });
const keyOf = (s) => (s ? `${s.view}|${s.projectId}|${s.tab}|${s.taskId}|${s.wizard}` : '');

// stack mirrors the entries this page has pushed, so going "back" to the
// previous step (closing a task, closing the wizard) can use history.back()
// instead of adding a new entry.
let stack = [];
let idx = 0;
try {
  const st = history.state && history.state.pmi;
  if (st) {
    Object.assign(R, st);
    idx = history.state.i || 0;
  }
  stack[idx] = snapshot();
  history.replaceState({ ...(history.state || {}), pmi: stack[idx], i: idx }, '');
} catch {
  /* history not available in this view: navigation still works, without back/forward */
}

function apply(next) {
  Object.assign(R, next, { navOpen: false, identity: false });
  lsSet('route', { view: R.view, projectId: R.projectId, tab: R.tab });
  emit();
}

try {
  window.addEventListener('popstate', (e) => {
    const st = e.state && e.state.pmi;
    if (!st) return;
    idx = typeof e.state.i === 'number' ? e.state.i : idx;
    stack[idx] = st;
    const changedPage = st.view !== R.view || st.projectId !== R.projectId || st.tab !== R.tab;
    apply(st);
    if (changedPage) scrollTop();
  });
} catch {
  /* no window */
}

function scrollTop() {
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
}

export function go(patch) {
  const before = snapshot();
  const next = { ...before, ...patch };
  if (patch.view && patch.view !== 'project') next.projectId = patch.projectId ?? null;
  if ((patch.view || patch.projectId || patch.tab) && !('taskId' in patch)) next.taskId = null;
  if (keyOf(next) === keyOf(before)) {
    // Not a navigation (e.g. only the mobile menu toggled).
    Object.assign(R, patch, { navOpen: patch.navOpen ?? false });
    emit();
    return;
  }
  try {
    if (idx > 0 && keyOf(next) === keyOf(stack[idx - 1])) {
      // Returning to the previous step: same as pressing back.
      idx--;
      history.back();
    } else {
      stack = stack.slice(0, idx + 1);
      stack.push(next);
      idx++;
      history.pushState({ pmi: next, i: idx }, '');
    }
  } catch {
    /* history not available: just navigate */
  }
  apply(next);
  if (patch.view || patch.tab || patch.projectId) scrollTop();
}

export const openTask = (taskId) => go({ taskId });
export const closeTask = () => go({ taskId: null });

// Filters per project (remembered locally per browser).
const filters = lsGet('filters', {});
export const DEFAULT_FILTER = { q: '', ws: [], owner: null, status: [], phase: null, late: false, hideDone: false, mine: false };
export function getFilter(pid) {
  return { ...DEFAULT_FILTER, ...(filters[pid] || {}) };
}
export function setFilter(pid, patch) {
  filters[pid] = { ...getFilter(pid), ...patch };
  lsSet('filters', filters);
  emit();
}
export function clearFilter(pid) {
  filters[pid] = { ...DEFAULT_FILTER };
  lsSet('filters', filters);
  emit();
}

const prefs = lsGet('prefs', {});
export const getPref = (k, d) => (k in prefs ? prefs[k] : d);
export function setPref(k, v) {
  prefs[k] = v;
  lsSet('prefs', prefs);
  emit();
}
