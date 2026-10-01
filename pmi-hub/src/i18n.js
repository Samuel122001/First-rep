// Text and date formatting. The UI is English; t() only interpolates
// {placeholders}, which keeps every user-facing string in one recognisable call
// should another language ever be added.
import { toDay, diffDays } from './util.js';

const LOCALE = 'en-GB';

export function t(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : s;
}

export function fmtDate(s, opts) {
  if (!s) return '';
  const d = new Date(toDay(s) * 86400000);
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC', ...(opts || {}) });
}

export function fmtDateLong(s) {
  return fmtDate(s, { year: 'numeric' });
}

export function monthName(s, short) {
  const d = new Date(toDay(s) * 86400000);
  return d.toLocaleDateString(LOCALE, { month: short ? 'short' : 'long', timeZone: 'UTC' });
}

export function weekdayShort(s) {
  const d = new Date(toDay(s) * 86400000);
  return d.toLocaleDateString(LOCALE, { weekday: 'narrow', timeZone: 'UTC' });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relDue(due, today) {
  if (!due) return '';
  const d = diffDays(today, due);
  if (d === 0) return t('today');
  if (d === 1) return t('tomorrow');
  if (d === -1) return t('yesterday');
  if (d > 0) return t('in {n} d', { n: d });
  return t('{n} d late', { n: -d });
}

export function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
  if (s < 86400 * 30) return t('{n} d ago', { n: Math.floor(s / 86400) });
  return fmtDateTime(ts);
}

export function plural(n, one, many) {
  return t(n === 1 ? one : many, { n });
}

// A date formatted with exactly the given parts (e.g. only the weekday).
export function fmtParts(s, opts) {
  if (!s) return '';
  return new Date(toDay(s) * 86400000).toLocaleDateString(LOCALE, { timeZone: 'UTC', ...opts });
}
