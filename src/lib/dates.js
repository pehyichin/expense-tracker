// All dates are local calendar dates stored as 'YYYY-MM-DD' strings.

const pad = (n) => String(n).padStart(2, '0');

export function toStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr() {
  return toStr(new Date());
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

export function addMonths(s, n) {
  const d = parse(s);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const day = Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth() + 1));
  return toStr(new Date(target.getFullYear(), target.getMonth(), day));
}

export function daysInMonth(y, m) {
  // m is 1-12
  return new Date(y, m, 0).getDate();
}

export function monthStart(s) {
  return s.slice(0, 8) + '01';
}

export function monthEnd(s) {
  const [y, m] = s.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

export function yearStart(s) {
  return s.slice(0, 4) + '-01-01';
}

export function dayOfMonth(s) {
  return Number(s.slice(8, 10));
}

export function startOfWeek(s) {
  // Sunday-start weeks
  return addDays(s, -parse(s).getDay());
}

export function diffDays(a, b) {
  // b - a in days
  return Math.round((parse(b) - parse(a)) / 86400000);
}

export function inRange(s, from, to) {
  return s >= from && s <= to;
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dowShort = (s) => DOW[parse(s).getDay()].slice(0, 2);
export const dowLong = (s) => DOW[parse(s).getDay()];
export const monShort = (s) => MON[Number(s.slice(5, 7)) - 1];
export const monthLong = (s) => MONTH_LONG[Number(s.slice(5, 7)) - 1];

export function prettyDate(s, today = todayStr()) {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  const base = `${DOW[parse(s).getDay()].slice(0, 3)}, ${dayOfMonth(s)} ${monShort(s)}`;
  return s.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${s.slice(0, 4)}`;
}

/** Date-range presets used on Insights. Returns {from, to, label, prev: {from,to}, lastYear: {from,to}} */
export function rangePreset(key, today = todayStr(), custom) {
  const mStart = monthStart(today);
  let from, to, label, prev, lastYear;
  const shiftYear = (s, n) => `${Number(s.slice(0, 4)) + n}${clampYearDay(s, n)}`;
  switch (key) {
    case 'lastMonth': {
      from = addMonths(mStart, -1);
      to = monthEnd(from);
      label = `${monthLong(from)} ${from.slice(0, 4)}`;
      prev = { from: addMonths(from, -1), to: monthEnd(addMonths(from, -1)) };
      break;
    }
    case 'last3': {
      from = addMonths(mStart, -2);
      to = today;
      label = 'Last 3 months';
      const pf = addMonths(from, -3);
      prev = { from: pf, to: sameOffset(from, today, pf) };
      break;
    }
    case 'ytd': {
      from = yearStart(today);
      to = today;
      label = 'Year to date';
      prev = null;
      break;
    }
    case 'lastYear': {
      from = `${Number(today.slice(0, 4)) - 1}-01-01`;
      to = `${Number(today.slice(0, 4)) - 1}-12-31`;
      label = from.slice(0, 4);
      prev = null;
      break;
    }
    case 'custom': {
      from = custom?.from || mStart;
      to = custom?.to || today;
      label = `${prettyDate(from, today)} – ${prettyDate(to, today)}`;
      const len = diffDays(from, to);
      prev = { from: addDays(from, -len - 1), to: addDays(from, -1) };
      break;
    }
    case 'mtd':
    default: {
      from = mStart;
      to = today;
      label = 'Month to date';
      // same point last month: 1st → same day number (clamped)
      const pm = addMonths(mStart, -1);
      const pmEnd = monthEnd(pm);
      const day = Math.min(dayOfMonth(today), dayOfMonth(pmEnd));
      prev = { from: pm, to: `${pm.slice(0, 8)}${pad(day)}` };
    }
  }
  lastYear = { from: shiftYear(from, -1), to: shiftYear(to, -1) };
  return { key, from, to, label, prev, lastYear };
}

function clampYearDay(s, n) {
  const y = Number(s.slice(0, 4)) + n;
  const m = Number(s.slice(5, 7));
  const d = Math.min(dayOfMonth(s), daysInMonth(y, m));
  return `-${pad(m)}-${pad(d)}`;
}

function sameOffset(from, to, newFrom) {
  return addDays(newFrom, diffDays(from, to));
}

export function rangeText(r, today = todayStr()) {
  const f = parse(r.from), t = parse(r.to);
  const sameMonth = r.from.slice(0, 7) === r.to.slice(0, 7);
  const yr = r.to.slice(0, 4) !== today.slice(0, 4) ? ` ${r.to.slice(0, 4)}` : '';
  if (sameMonth) return `${f.getDate()}–${t.getDate()} ${monShort(r.to)}${yr}`;
  return `${f.getDate()} ${monShort(r.from)} – ${t.getDate()} ${monShort(r.to)}${yr}`;
}
