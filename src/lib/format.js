export function money(n, { cents = true, sign = false } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-MY', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  });
  const prefix = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${prefix}RM${s}`;
}

export function compact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
}

export function pct(part, whole, digits = 1) {
  if (!whole) return '0%';
  return ((part / whole) * 100).toFixed(digits) + '%';
}

/** "↑ RM42" / "↓ 7.0%" style change labels */
export function changeLabel(cur, prev, mode = 'abs') {
  if (prev == null) return '';
  const diff = cur - prev;
  if (Math.abs(diff) < 0.5) return 'No change';
  const arrow = diff > 0 ? '↑' : '↓';
  if (mode === 'pct') {
    if (!prev) return 'New';
    return `${arrow} ${Math.abs((diff / prev) * 100).toFixed(1)}%`;
  }
  return `${arrow} ${money(Math.abs(diff), { cents: false })}`;
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
