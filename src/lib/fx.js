// Exchange rates from Frankfurter (European Central Bank reference rates, free, no key).
// Returns how many MYR one unit of `currency` was worth on `date` (or the nearest earlier business day).
const cache = new Map();

export const CURRENCIES = ['MYR', 'SGD', 'HKD', 'CNY', 'JPY', 'KRW', 'THB', 'IDR', 'TWD', 'USD', 'EUR', 'GBP', 'AUD'];

export async function rateToMYR(currency, date) {
  if (!currency || currency === 'MYR') return 1;
  const key = `${currency}:${date}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`https://api.frankfurter.app/${date}?from=${currency}&to=MYR`);
  if (!res.ok) throw new Error('Could not fetch exchange rate');
  const json = await res.json();
  const rate = json?.rates?.MYR;
  if (!rate) throw new Error('No MYR rate for ' + currency);
  cache.set(key, rate);
  return rate;
}
