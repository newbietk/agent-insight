// Shared helper functions — used by all tab modules to generate JS runtime code.
// These are the JS-side formatters embedded into the webview <script> block.

/** Returns JS function definitions for shared runtime helpers. */
export function sharedRuntimeJS(): string {
  return `
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(n) {
  if (n == null) return '-';
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return String(n);
}
function fmtCost(n) {
  if (n == null || n === 0) return '$0.00';
  return '$' + (typeof n === 'number' ? n.toFixed(4) : n);
}
function fmtMs(n) {
  if (n == null || n === 0) return '0ms';
  if (n >= 60000) return (n/60000).toFixed(1) + 'm';
  if (n >= 1000) return (n/1000).toFixed(1) + 's';
  return n + 'ms';
}
function toNumber(n) {
  var v = Number(n);
  return isNaN(v) ? 0 : v;
}
function fmtPct(n) {
  if (n == null) return '-';
  return (typeof n === 'number' ? n : Number(n)).toFixed(1) + '%';
}
`;
}

/** TypeScript-side HTML escaping (used when generating HTML strings). */
export function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** TypeScript-side JSON safe embedding. */
export function safeJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
