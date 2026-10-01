/** Bounded JSON primitives shared by imports, enrichment and backup restore. */
export function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
export function text(value, max = 500, label = 'Metadata text') {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${label} must be text.`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  const result = String(value).replace(/\s+/gu, ' ').trim();
  if (result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result)) throw new Error(`${label} exceeds its text bounds.`);
  return result;
}
export function strings(value, max = 50, length = 500, label = 'Metadata list') {
  if (value === undefined || value === null) return [];
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length > max) throw new Error(`${label} has too many entries.`);
  return [...new Set(entries.map(entry => text(entry, length, label)).filter(Boolean))];
}
export function date(value, label = 'Timestamp') {
  if (value === undefined || value === null || value === '') return null;
  const input = text(value, 40, label);
  const parts=/^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/u.exec(input);
  const calendar=new Date(0);
  if(parts)calendar.setUTCFullYear(Number(parts[1]),Number(parts[2])-1,Number(parts[3]));
  if (!parts || calendar.getUTCMonth()!==Number(parts[2])-1 || calendar.getUTCDate()!==Number(parts[3]) || !Number.isFinite(Date.parse(input))) throw new Error(`${label} must be an ISO date.`);
  return new Date(input).toISOString();
}
export function url(value, {hosts, googleId = false} = {}) {
  const input = text(value, 2048, 'Source URL');
  if (!input) return '';
  try {
    const parsed = new URL(input);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || (hosts && !hosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)))) return '';
    const query = googleId && parsed.hostname === 'books.google.com' && parsed.searchParams.has('id') ? `?id=${encodeURIComponent(text(parsed.searchParams.get('id'), 200, 'Google volume ID'))}` : '';
    return `${parsed.origin}${parsed.pathname}${query}`;
  } catch { return ''; }
}
export function count(value, label = 'Count', max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label} must be a bounded nonnegative integer.`);
  return value;
}
