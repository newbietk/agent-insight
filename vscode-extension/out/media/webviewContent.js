"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewContent = getWebviewContent;
const context_window_config_1 = require("../core/context-window-config");
const i18n_1 = require("../i18n");
const shared_1 = require("./shared");
const nav_1 = require("./nav");
const overview_1 = require("./tabs/overview");
const turns_1 = require("./tabs/turns");
const skills_1 = require("./tabs/skills");
const fileops_1 = require("./tabs/fileops");
const trace_1 = require("./tabs/trace");
const context_1 = require("./tabs/context");
const audit_1 = require("./tabs/audit");
// ── Tab definitions (7 tabs) ──
const TAB_DEFS = [
    { key: 'overview', label: (0, i18n_1.t)('detail.tabOverview'), icon: '📊' },
    { key: 'turns', label: (0, i18n_1.t)('detail.tabTurns'), icon: '💬' },
    { key: 'trace', label: (0, i18n_1.t)('detail.tabTrace'), icon: '🔗' },
    { key: 'context', label: (0, i18n_1.t)('detail.tabContext'), icon: '📈' },
    { key: 'audit', label: (0, i18n_1.t)('detail.tabAudit'), icon: '📋' },
    { key: 'skills', label: (0, i18n_1.t)('detail.tabSkills'), icon: '🧩' },
    { key: 'fileops', label: (0, i18n_1.t)('detail.tabFileOps'), icon: '📁' },
];
function getWebviewContent(data, cspSource, nonce, sessionId, initialTab, syncResult) {
    const { session, turns } = data;
    const ctxLimit = (0, context_window_config_1.getContextWindowLimit)(session.model);
    const i18nBundle = (0, i18n_1.getBundle)();
    const assistantTurns = turns.filter(t => t.role === 'assistant');
    // Chart-only: exclude turns with zero token data (prevents cliff drops)
    const chartTurns = assistantTurns.filter(t => t.totalTokens > 0);
    const bridges = data.bridges ?? [];
    const turnsJson = (0, shared_1.safeJson)(turns);
    const astJson = (0, shared_1.safeJson)(assistantTurns);
    const chartTurnsJson = (0, shared_1.safeJson)(chartTurns);
    const bridgesJson = (0, shared_1.safeJson)(bridges);
    const sessionJson = (0, shared_1.safeJson)(session);
    const i18nJson = (0, shared_1.safeJson)(i18nBundle);
    // Generate tab buttons
    const tabButtons = TAB_DEFS.map((tab, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-tab="${tab.key}">${tab.icon} ${(0, shared_1.escHtml)(tab.label)}</button>`).join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
<title>${(0, shared_1.escHtml)((0, i18n_1.t)('detail.panelTitle', session.taskId.substring(0, 30)))}</title>
<script nonce="${nonce}">
var __i18n = ${i18nJson};
function __(key) {
  var template = __i18n[key];
  if (template === undefined) return key;
  for (var i = 1; i < arguments.length; i++) {
    template = template.replace('{' + (i-1) + '}', String(arguments[i]));
  }
  return template;
}
</script>
<style nonce="${nonce}">
  :root {
    --bg: #f0f2f8; --card-bg: #ffffff;
    --text: #12141d; --text-dim: #464b5c;
    --border: #c8ccd8; --accent: #2563eb;
    --green: #1a8a50; --orange: #c46e10;
    --blue: #2563eb; --purple: #6d28d9;
    --red: #d42a34; --yellow: #9a7d0a;
    --theme-bar-bg: rgba(0,0,0,0.025);
    --theme-btn-ring: rgba(37,99,235,0.5);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    position: relative;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f2f3f7;
    color: var(--text);
    padding: 14px 18px 18px 18px;
    font-size: 13px;
    line-height: 1.55;
  }
  .refresh-bar { position: absolute; top: 10px; right: 16px; z-index: 10; }
  .refresh-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 12px; border-radius: 14px;
    border: 1px solid var(--border); background: var(--card-bg);
    color: var(--text-dim); font-size: 12px; cursor: pointer;
    transition: color 0.15s, border-color 0.15s; user-select: none;
  }
  .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
  .refresh-btn.manual { color: var(--accent); border-color: var(--accent); }
  .refresh-icon { font-size: 14px; line-height: 1; }
  .refresh-countdown { font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }

  .sync-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    padding: 8px 20px; border-radius: 8px;
    background: var(--card-bg); border: 1px solid var(--green);
    color: var(--text); font-size: 13px; font-weight: 500;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    z-index: 100; opacity: 0; transition: opacity 0.3s;
    pointer-events: none;
  }
  .sync-toast.show { opacity: 1; }
  .tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .tab {
    padding: 8px 14px; cursor: pointer;
    border: 1px solid transparent; border-bottom: none;
    border-radius: 6px 6px 0 0;
    color: var(--text-dim); background: transparent;
    font-size: 13px; font-family: inherit;
    transition: color 0.15s, background 0.15s;
  }
  .tab.active { color: var(--text); background: var(--card-bg); border-color: var(--border); font-weight: 600; }
  .tab:hover:not(.active) { color: var(--text); background: rgba(255,255,255,0.03); }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 14px;
  }
  .card-label { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .card-value { font-size: 26px; font-weight: 700; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-value.tokens { color: var(--blue); }
  .card-value.cost { color: var(--green); }
  .card-value.time { color: var(--orange); }
  .card-sub { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

  .chart-container { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; }
  canvas { display: block; width: 100%; border-radius: 4px; }

  /* ── Chart tooltip ── */
  .chart-tooltip {
    display: none; position: absolute; z-index: 50;
    pointer-events: none;
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px 10px;
    max-width: 240px; font-size: 11px; line-height: 1.4;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  }
  .chart-tooltip-title { font-weight: 600; color: var(--accent); margin-bottom: 2px; }
  .chart-tooltip-tokens { color: var(--text-dim); }
  .chart-tooltip-summary { color: var(--text); margin-top: 4px; }

  /* Clickable chart data dots */
  .ctx-chart-dot { transition: opacity 0.15s ease; }
  .ctx-chart-dot:hover { opacity: 0.7; filter: brightness(1.5); }

  .table-wrap { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
  .table-header { font-size: 13px; font-weight: 600; padding: 12px 16px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 14px; border-bottom: 1px solid var(--border); color: var(--text-dim); font-weight: 500; font-size: 12px; white-space: nowrap; position: sticky; top: 0; background: var(--card-bg); }
  td { padding: 7px 14px; border-bottom: 1px solid rgba(62,62,66,0.4); white-space: nowrap; }
  tr.turn-row { cursor: pointer; transition: background 0.1s; }
  tr.turn-row:hover td { background: rgba(255,255,255,0.04); }
  tr.turn-row.selected td { background: rgba(0, 122, 204, 0.12); }

  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  .info-row { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 18px; }
  .info-item { font-size: 13px; }
  .info-item span:first-child { color: var(--text-dim); }
  .info-item span:last-child { color: var(--text); font-weight: 500; }

  .cost-bar { display: flex; height: 24px; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
  .cost-seg { display: flex; align-items: center; justify-content: center; font-size: 10px; color: #1e1e1e; font-weight: 600; min-width: 0; }
  .cost-seg.input { background: var(--blue); }
  .cost-seg.output { background: var(--green); }
  .cost-seg.cache { background: var(--purple); }
  .cost-legend { display: flex; gap: 18px; font-size: 11px; color: var(--text-dim); margin-bottom: 18px; flex-wrap: wrap; }
  .cost-legend span::before { content: "■"; margin-right: 4px; }
  .cost-legend .input::before { color: var(--blue); }
  .cost-legend .output::before { color: var(--green); }
  .cost-legend .cache::before { color: var(--purple); }

  .ctx-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px; }
  .ctx-label { width: 52px; text-align: right; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .ctx-bar-outer { flex: 1; height: 16px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden; position: relative; }
  .ctx-bar-inner { height: 100%; border-radius: 3px; transition: width 0.25s ease; min-width: 2px; }
  .ctx-pct { width: 48px; font-size: 10px; color: var(--text-dim); font-variant-numeric: tabular-nums; text-align: left; }
  .ctx-compact-marker { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--yellow); opacity: 0.7; }

  .ctx-summary { background: rgba(220, 220, 170, 0.05); border: 1px solid rgba(220, 220, 170, 0.15); border-radius: 6px; padding: 12px 14px; margin-top: 14px; }
  .ctx-summary-title { font-size: 11px; color: var(--yellow); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
  .ctx-summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; font-size: 12px; }
  .ctx-summary-item { display: flex; justify-content: space-between; }
  .ctx-summary-item span:first-child { color: var(--text-dim); flex-shrink: 0; }
  .ctx-summary-item span:last-child { color: var(--text); font-weight: 500; overflow-wrap: anywhere; word-break: break-word; }

  .turn-detail { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-top: 14px; }
  .turn-detail h4 { font-size: 14px; color: var(--text); margin-bottom: 10px; font-weight: 600; }
  .turn-content { max-height: 320px; overflow-y: auto; white-space: pre-wrap; font-size: 13px; line-height: 1.7; color: var(--text); background: rgba(255,255,255,0.015); padding: 12px; border-radius: 4px; border: 1px solid rgba(62,62,66,0.3); }
  .tool-call-item { padding: 8px 12px; margin: 4px 0; border-left: 3px solid var(--accent); font-size: 12px; background: rgba(0,122,204,0.05); border-radius: 0 4px 4px 0; }
  .tool-name { color: var(--yellow); font-weight: 600; }
  .tool-state-ok { color: var(--green); }
  .tool-state-error { color: var(--red); }

  /* ── Turns Three-Column Layout ── */
  .turns-layout { display: flex; gap: 12px; height: calc(100vh - 180px); min-height: 500px; }
  .turns-left { width: 280px; min-width: 240px; display: flex; flex-direction: column; }
  .turns-left-header {
    font-size: 13px; font-weight: 600; padding: 10px 12px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: baseline;
    flex-shrink: 0;
  }
  .turns-card-list {
    flex: 1; overflow-y: auto; background: var(--card-bg);
    border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px;
  }
  .turn-card {
    padding: 12px 14px; border-bottom: 1px solid rgba(62,62,66,0.25);
    cursor: pointer; transition: background 0.1s;
  }
  .turn-card:hover { background: rgba(255,255,255,0.05); }
  .turn-card.selected { background: rgba(0, 122, 204, 0.14); border-left: 3px solid var(--accent); padding-left: 11px; }
  .turn-card-subagent { background: rgba(224,154,107,0.06); border-left: 3px solid var(--orange); padding-left: 11px; }
  .turn-card-subagent:hover { background: rgba(224,154,107,0.10); }
  .turn-card-subagent.selected { background: rgba(224,154,107,0.14); border-left-color: var(--accent); }
  .turn-card-role-user { background: rgba(78,201,176,0.07); }
  .turn-card-role-user:hover { background: rgba(78,201,176,0.13); }
  .turn-card-role-assistant { background: rgba(86,156,214,0.07); }
  .turn-card-role-assistant:hover { background: rgba(86,156,214,0.13); }
  .turn-card-role-system { background: rgba(197,134,192,0.06); }
  .turn-card-role-system:hover { background: rgba(197,134,192,0.10); }
  .turn-card-role-tool { background: rgba(220,220,170,0.06); }
  .turn-card-role-tool:hover { background: rgba(220,220,170,0.10); }
  .turn-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .turn-card-role { font-size: 12px; font-weight: 600; }
  .turn-card-index { font-size: 11px; color: var(--text-dim); }
  .turn-card-summary {
    font-size: 13px; color: var(--text); line-height: 1.45;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-bottom: 5px;
  }
  .turn-card-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 5px; }
  .turn-card-meta { display: flex; gap: 10px; font-size: 11px; color: var(--text-dim); margin-bottom: 5px; }
  .turn-card-tokens { font-weight: 600; color: var(--blue); }
  .turn-card-latency { color: var(--text-dim); }
  .turn-card-ctx { font-weight: 600; }
  .turn-card-actions { display: flex; gap: 4px; }
  .card-btn-sm { font-size: 11px; padding: 2px 8px; border-radius: 4px; }

  .turns-main {
    flex: 1; min-width: 0; overflow-y: auto;
  }

  /* ── Context Composition Chart ── */
  .ctx-composition {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px; margin-bottom: 12px;
    font-size: 12px;
  }
  .ctx-comp-header { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 14px; }
  .ctx-comp-section { margin-bottom: 14px; }
  .ctx-comp-section:last-child { margin-bottom: 0; }
  .ctx-comp-label {
    font-size: 10px; font-weight: 600; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px;
  }
  .ctx-usage-bar-outer {
    height: 20px; background: rgba(255,255,255,0.04); border-radius: 4px;
    overflow: hidden; margin-bottom: 4px;
  }
  .ctx-usage-bar-inner { height: 100%; border-radius: 4px; transition: width 0.3s ease; min-width: 2px; }

  /* Role stacked bar */
  .ctx-role-bar {
    display: flex; height: 22px; border-radius: 4px; overflow: hidden;
    margin-bottom: 10px; cursor: pointer;
  }
  .ctx-role-seg {
    min-width: 2px; transition: opacity 0.15s, filter 0.15s;
    position: relative;
  }
  .ctx-role-seg:hover { filter: brightness(1.3); }
  .ctx-role-seg-active { box-shadow: inset 0 0 0 2px var(--text); filter: brightness(1.2); }
  .ctx-role-seg-overhead { cursor: default; }

  .ctx-legend { display: flex; flex-wrap: wrap; gap: 4px; font-size: 10px; }
  .ctx-legend-item { display: flex; align-items: center; gap: 6px; color: var(--text-dim); }
  .ctx-legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .ctx-legend-clickable .ctx-legend-role {
    cursor: pointer; padding: 2px 8px; border-radius: 4px;
    border: 1px solid transparent; transition: background 0.1s, border-color 0.1s;
  }
  .ctx-legend-clickable .ctx-legend-role:hover { background: rgba(255,255,255,0.04); border-color: var(--border); }
  .ctx-legend-active { background: rgba(0, 122, 204, 0.12) !important; border-color: var(--accent) !important; }

  /* Context message list */
  .ctx-msg-section {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; margin-bottom: 12px; overflow: hidden;
  }
  .ctx-msg-section-header {
    display: flex; align-items: center; padding: 10px 14px;
    font-size: 11px; font-weight: 600; color: var(--text);
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .ctx-msg-card { border-bottom: 1px solid rgba(62,62,66,0.2); }
  .ctx-msg-card:last-child { border-bottom: none; }
  .ctx-msg-card-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 14px; cursor: pointer; user-select: none;
    font-size: 12px; transition: background 0.1s;
  }
  .ctx-msg-card-header:hover { background: rgba(255,255,255,0.03); }
  .ctx-msg-card-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .ctx-msg-tool-name { color: var(--yellow); font-weight: 600; font-size: 11px; }
  .ctx-msg-role-tag { font-weight: 600; font-size: 11px; flex-shrink: 0; }
  .ctx-msg-summary {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--text-dim);
  }
  .ctx-msg-card-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; margin-left: 12px; }
  .ctx-msg-tokens { font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .ctx-msg-card-body { padding: 0; border-top: 1px solid rgba(62,62,66,0.15); }
  .ctx-msg-content {
    margin: 0; padding: 12px 14px; font-size: 12px; line-height: 1.6;
    color: var(--text); white-space: pre-wrap; word-break: break-word;
    max-height: 400px; overflow-y: auto; background: rgba(255,255,255,0.01);
  }

  .turn-detail-stats { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
  .td-stat {
    display: flex; flex-direction: column; align-items: center;
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px 12px; min-width: 64px;
  }
  .td-stat-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.3px; }
  .td-stat-val { font-size: 15px; font-weight: 700; color: var(--text); margin-top: 2px; }
  .turn-detail-section { margin-bottom: 16px; }
  .turn-detail-section-title {
    font-size: 12px; font-weight: 600; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;
  }

  /* ── Expandable section headers (turn detail content / tool calls / skill events) ── */
  .td-section-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    cursor: pointer; user-select: none; border-radius: 6px;
    transition: background 0.15s, box-shadow 0.15s; font-size: 13px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  }
  .td-section-header:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.1);
    box-shadow: 0 2px 6px rgba(0,0,0,0.18);
  }
  .td-section-title { font-weight: 600; color: var(--text); }
  .td-section-meta { font-size: 10px; color: var(--text-dim); }
  .td-section-arrow { font-size: 9px; color: var(--text-dim); flex-shrink: 0; margin-left: auto; transition: transform 0.15s; }
  .td-section-body {
    padding: 8px 12px;
    margin: 2px 0 6px 0;
    background: rgba(255,255,255,0.015);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 4px;
  }

  .td-sub-header {
    padding: 6px 10px; font-size: 11px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }

  /* ── Thinking / text content blocks ── */
  .td-thinking-block {
    border-left: 3px solid var(--purple); border-radius: 0 4px 4px 0;
    margin-bottom: 8px; background: rgba(160,120,240,0.04);
  }
  .td-text-block {
    border-left: 3px solid var(--green); border-radius: 0 4px 4px 0;
    margin-bottom: 8px; background: rgba(80,200,140,0.04);
  }
  .td-text-header {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    font-size: 12px;
  }

  /* ── Badges ── */
  .badge {
    display: inline-block; font-size: 11px; font-weight: 600;
    padding: 2px 8px; border-radius: 4px; letter-spacing: 0.3px;
  }
  .badge-purple { background: rgba(160,120,240,0.15); color: var(--purple); }
  .badge-green { background: rgba(80,200,140,0.15); color: var(--green); }
  .badge-yellow { background: rgba(220,200,80,0.15); color: var(--yellow); }
  .badge-red { background: rgba(232,103,107,0.15); color: var(--red); }
  .badge-blue { background: rgba(98,154,240,0.15); color: var(--blue); }
  .badge-orange { background: rgba(224,154,107,0.15); color: var(--orange); }
  .badge-outline { background: transparent; border: 1px solid var(--border); color: var(--text-dim); }

  /* ── Copy button ── */
  .td-copy-btn {
    background: rgba(255,255,255,0.05); border: 1px solid var(--border);
    color: var(--text-dim); font-size: 11px; padding: 3px 8px;
    border-radius: 4px; cursor: pointer; transition: background 0.1s, color 0.1s;
  }
  .td-copy-btn:hover { background: rgba(255,255,255,0.1); color: var(--text); }

  /* ── Tool call header (compact) ── */
  .td-tc-header { padding: 6px 10px; font-size: 12px; }

  /* ── Error message ── */
  .td-error-msg {
    background: rgba(232,103,107,0.1); color: var(--red);
    border: 1px solid rgba(232,103,107,0.2); border-radius: 4px;
    padding: 6px 10px; font-size: 12px; margin-bottom: 10px;
  }

  /* ── Content pre block ── */
  .td-content-pre {
    margin: 0; padding: 10px 12px; font-size: 12px; line-height: 1.55;
    color: var(--text); white-space: pre-wrap; word-break: break-word;
    max-height: 400px; overflow-y: auto; background: rgba(255,255,255,0.015);
    border-radius: 4px; border: 1px solid rgba(62,62,66,0.3);
  }

  /* ── Skills tab: summary table ── */
  .skill-summary-row { transition: background 0.1s; }
  .skill-summary-row:hover { background: rgba(255,255,255,0.03); }
  .skill-detail-row td { border-top: 1px solid rgba(62,62,66,0.15); }
  .skill-events-detail { display: flex; flex-direction: column; gap: 4px; }
  .skill-event-item {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 4px 8px; border-radius: 4px; font-size: 11px;
    border: 1px solid rgba(62,62,66,0.2);
  }
  .skill-event-ok { background: rgba(80,200,140,0.04); }
  .skill-event-fail { background: rgba(232,103,107,0.05); border-color: rgba(232,103,107,0.2); }
  .skill-event-turn {
    color: var(--accent); cursor: pointer; font-weight: 500;
    text-decoration: underline; text-underline-offset: 2px;
  }
  .skill-event-turn:hover { color: var(--blue); }

  /* ── Skills tab: per-agent cards ── */
  .skill-agent-card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 6px; overflow: hidden;
  }
  .skill-agent-header { transition: background 0.1s; }
  .skill-agent-header:hover { background: rgba(255,255,255,0.03); }

  /* ── Skills tab: failed items ── */
  .skill-failed-item {
    padding: 8px 12px; border-bottom: 1px solid rgba(62,62,66,0.15);
    background: rgba(232,103,107,0.03);
  }
  .skill-failed-item:last-child { border-bottom: none; }

  .ctx-expand-arrow { font-size: 9px; color: var(--text-dim); flex-shrink: 0; }

  .empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
  .empty-state .icon { font-size: 32px; margin-bottom: 8px; }

  /* ── Session meta ── */
  .session-meta {
    font-size: 12px; color: var(--text-dim); background: var(--card-bg);
    border: 1px solid var(--border); border-radius: 5px; padding: 10px 12px;
    margin-top: 14px; line-height: 1.6;
  }
  .session-meta span { color: var(--text); font-weight: 500; }

  /* ── File Operations Audit Tab ── */
  .fileops-layout {
    display: flex; gap: 0; height: calc(100vh - 240px); min-height: 400px;
    border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
    background: var(--card-bg);
  }
  .fileops-timeline {
    width: 320px; min-width: 240px; overflow-y: auto; flex-shrink: 0;
    border-right: 1px solid var(--border);
  }
  .fileops-detail { flex: 1; overflow-y: auto; min-width: 0; }

  .fileops-filter-bar { display: flex; gap: 6px; padding: 8px 0; flex-wrap: wrap; }
  .fileops-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px; border-radius: 12px;
    font-size: 11px; cursor: pointer; user-select: none;
    border: 1px solid var(--border); color: var(--text-dim);
    background: transparent; transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .fileops-chip:hover { background: rgba(255,255,255,0.05); color: var(--text); }
  .fileops-chip.active {
    background: var(--accent); color: #fff; border-color: var(--accent);
  }

  .fileops-turn-item {
    padding: 10px 12px; border-bottom: 1px solid rgba(62,62,66,0.3);
    cursor: pointer; transition: background 0.1s;
  }
  .fileops-turn-item:hover { background: rgba(255,255,255,0.04); }
  .fileops-turn-item.selected {
    background: rgba(0, 122, 204, 0.12); border-left: 3px solid var(--accent);
    padding-left: 9px;
  }
  .fileops-turn-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .fileops-turn-index { font-size: 11px; font-weight: 700; font-family: monospace; color: var(--text); }
  .fileops-subagent-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 3px;
    background: rgba(224,154,107,0.15); color: var(--orange); font-weight: 500;
  }
  .fileops-turn-files { font-size: 10px; color: var(--text-dim); margin-left: auto; }
  .fileops-turn-ops { display: flex; gap: 6px; font-size: 11px; margin-bottom: 4px; }
  .fileops-turn-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .fileops-file-chip {
    font-size: 10px; padding: 2px 6px; border-radius: 4px;
    background: rgba(255,255,255,0.04); color: var(--text-dim);
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fileops-file-item-hidden { display: none !important; }
  .fileops-file-item { display: flex; align-items: center; gap: 10px; }

  .fileops-detail-inner { padding: 16px; }
  .fileops-detail-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .fileops-detail-turn { font-size: 14px; font-weight: 700; font-family: monospace; color: var(--text); }
  .fileops-detail-summary {
    font-size: 11px; color: var(--text-dim); font-style: italic;
    margin-bottom: 16px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fileops-nav-btn {
    margin-left: auto; font-size: 11px; padding: 3px 10px; border-radius: 4px;
    cursor: pointer; border: 1px solid var(--border); background: transparent;
    color: var(--text-dim); font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .fileops-nav-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }

  .fileops-file-group {
    border: 1px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 12px;
  }
  .fileops-file-group-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border);
  }
  .fileops-file-name { font-size: 12px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fileops-file-path { font-size: 10px; color: var(--text-dim); flex-shrink: 0; }

  .fileops-op-item { padding: 10px 12px; border-bottom: 1px solid rgba(62,62,66,0.15); }
  .fileops-op-item:last-child { border-bottom: none; }
  .fileops-op-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .fileops-op-type { font-size: 12px; font-weight: 600; }
  .fileops-op-range { font-size: 10px; color: var(--text-dim); font-family: monospace; }
  .fileops-op-duration { font-size: 10px; color: var(--text-dim); }

  .fileops-op-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 500;
  }
  .fileops-op-badge.ok { background: rgba(94,196,158,0.12); color: var(--green); }
  .fileops-op-badge.error { background: rgba(232,103,107,0.12); color: var(--red); }

  /* Diff grid */
  .fileops-diff-container { border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
  .fileops-diff-grid { display: grid; grid-template-columns: 1fr 1fr; font-size: 11px; }
  .fileops-diff-header-old, .fileops-diff-header-new {
    padding: 4px 10px; font-weight: 600; border-bottom: 1px solid var(--border);
  }
  .fileops-diff-header-old { border-right: 1px solid var(--border); }
  .fileops-diff-cell {
    padding: 1px 10px; font-family: monospace; font-size: 11px; line-height: 1.5;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fileops-diff-cell.old { border-right: 1px solid var(--border); }

  /* Code block */
  .fileops-code-block {
    font-size: 11px; font-family: monospace; line-height: 1.5;
    background: rgba(255,255,255,0.015); border: 1px solid var(--border);
    border-radius: 4px; overflow-y: auto; margin: 0;
  }
  .fileops-code-line { display: flex; min-height: 18px; }
  .fileops-code-ln {
    width: 36px; text-align: right; color: var(--text-dim);
    padding-right: 10px; user-select: none; flex-shrink: 0;
    font-size: 10px;
  }
  .fileops-code-text { flex: 1; white-space: pre-wrap; word-break: break-word; }

  .fileops-expand-btn {
    font-size: 10px; padding: 1px 8px; border-radius: 4px; cursor: pointer;
    border: 1px solid var(--border); background: transparent;
    color: var(--text-dim); font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .fileops-expand-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
  .fileops-copy-btn {
    font-size: 12px; padding: 1px 6px; border-radius: 4px; cursor: pointer;
    border: 1px solid transparent; background: transparent; color: var(--text-dim);
    transition: background 0.15s, color 0.15s;
  }
  .fileops-copy-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }

  /* ── Subagent lanes (turns tab) ── */
  .subagent-lane {
    margin-left: 16px; border-left: 3px solid var(--orange);
    background: rgba(224,154,107,0.03); border-radius: 0 4px 4px 0;
    padding: 0; margin-bottom: 2px;
  }
  .turn-row-sub {
    padding: 3px 8px; font-size: 10px;
    display: flex; justify-content: space-between;
    border-bottom: 1px solid rgba(62,62,66,0.15);
    transition: background 0.1s;
  }
  .turn-row-sub:hover { background: rgba(255,255,255,0.03); }

  /* ── Turns filter bar ── */
  .turns-filter-bar {
    padding: 6px 8px; border-bottom: 1px solid var(--border);
    background: var(--card-bg); display: flex; flex-direction: column; gap: 6px;
    flex-shrink: 0;
  }
  .turns-filter-roles { display: flex; gap: 3px; flex-shrink: 0; }
  .filter-role-chip {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 4px 10px; border-radius: 4px;
    font-size: 12px; cursor: pointer; user-select: none;
    border: 1px solid var(--border); color: var(--text-dim);
    background: transparent; font-family: inherit;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    line-height: 1;
  }
  .filter-role-chip:hover { background: rgba(255,255,255,0.06); color: var(--text); }
  .filter-role-chip.active {
    background: var(--accent); color: #fff; border-color: var(--accent);
  }
  .filter-role-count {
    font-size: 9px; opacity: 0.7; font-weight: 600;
    min-width: 14px; text-align: center;
  }
  .filter-role-chip.active .filter-role-count { opacity: 1; }

  .turns-filter-search { display: flex; gap: 4px; flex: 1; min-width: 0; position: relative; }
  .turns-filter-search input {
    flex: 1; padding: 6px 10px; background: rgba(255,255,255,0.03);
    border: 1px solid var(--border); border-radius: 4px;
    color: var(--text); font-size: 12px; font-family: inherit;
    min-width: 0; line-height: 1.4;
  }
  .turns-filter-search input::placeholder { color: var(--text-dim); font-size: 10px; }
  .turns-filter-search input:focus { outline: none; border-color: var(--accent); background: rgba(255,255,255,0.05); }
  .search-clear-btn {
    padding: 4px 8px; border: none; background: transparent;
    color: var(--text-dim); cursor: pointer; font-size: 12px;
    border-radius: 4px; font-family: inherit;
  }
  .search-clear-btn:hover { color: var(--text); background: rgba(255,255,255,0.05); }

  /* ── LLM Input message cards ── */
  .llm-input-section { margin-bottom: 16px; }
  .llm-input-msg-card {
    border-left: 3px solid; margin: 4px 0; padding: 0;
    background: rgba(255,255,255,0.02); border-radius: 0 4px 4px 0;
    overflow: hidden;
  }
  .llm-input-msg-header {
    display: flex; align-items: center; gap: 6px; padding: 6px 10px;
    cursor: pointer; user-select: none; font-size: 12px;
    transition: background 0.1s;
  }
  .llm-input-msg-header:hover { background: rgba(255,255,255,0.03); }
  .llm-input-role-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .llm-input-role-badge {
    font-size: 11px; font-weight: 600; flex-shrink: 0; min-width: 70px;
  }
  .llm-input-msg-index {
    font-size: 11px; color: var(--text-dim); font-family: monospace; flex-shrink: 0;
  }
  .llm-input-msg-preview {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--text-dim); font-size: 12px; min-width: 0;
  }
  .llm-input-msg-tokens {
    font-size: 11px; color: var(--text-dim); flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .llm-input-msg-body {
    display: none; padding: 0; border-top: 1px solid rgba(62,62,66,0.15);
  }
  .llm-input-msg-body .td-content-pre {
    margin: 0; border: none; border-radius: 0; max-height: 300px;
  }
  .llm-input-copy-btn {
    margin: 4px 8px 8px 8px; font-size: 10px;
  }
</style>
</head>
<body>
<div class="refresh-bar">
  <button class="refresh-btn" id="refreshBtn" title="点击手动刷新，自动 30s 刷新一次">
    <span class="refresh-icon">&#x21bb;</span>
    <span class="refresh-countdown" id="refreshCountdown">30s</span>
  </button>
</div>
<div class="info-row">
  <div class="info-item"><span>${(0, shared_1.escHtml)((0, i18n_1.t)('detail.taskId'))}: </span><span>${(0, shared_1.escHtml)(session.taskId)}</span></div>
  <div class="info-item"><span>${(0, shared_1.escHtml)((0, i18n_1.t)('common.model'))}: </span><span>${(0, shared_1.escHtml)(session.model ?? (0, i18n_1.t)('common.unknown'))}</span></div>
  <div class="info-item"><span>${(0, shared_1.escHtml)((0, i18n_1.t)('common.framework'))}: </span><span>${(0, shared_1.escHtml)(session.framework)}</span></div>
  <div class="info-item"><span>${(0, shared_1.escHtml)((0, i18n_1.t)('common.turns'))}: </span><span>${turns.length} (${(0, shared_1.escHtml)((0, i18n_1.t)('detail.turnsAssistant', assistantTurns.length))})</span></div>
</div>

<div class="tabs">
  ${tabButtons}
</div>

${(0, overview_1.renderOverviewTab)()}
${(0, turns_1.renderTurnsTab)()}
${(0, trace_1.renderTraceTab)()}
${(0, context_1.renderContextTab)()}
${(0, audit_1.renderAuditTab)()}
${(0, skills_1.renderSkillsTab)()}
${(0, fileops_1.renderFileOpsTab)()}

<script nonce="${nonce}">
// ── Data ──
var turns = ${turnsJson};
var assistantTurns = ${astJson};
var chartTurns = ${chartTurnsJson};   // filtered: totalTokens > 0, for charts only
var bridges = ${bridgesJson};
var session = ${sessionJson};
var ctxLimit = ${ctxLimit};
var __initialTab = '${initialTab || 'overview'}';

// ── VS Code API ──
var vscode = acquireVsCodeApi();

// ── Refresh countdown ──
var REFRESH_SEC = 30;
var refreshTimer = REFRESH_SEC;
var refreshIntervalId = null;

function updateCountdown() {
  var el = document.getElementById('refreshCountdown');
  if (el) el.textContent = refreshTimer + 's';
}

function resetCountdown() {
  refreshTimer = REFRESH_SEC;
  updateCountdown();
  var btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.remove('manual');
}

function doRefresh() {
  resetCountdown();
  vscode.postMessage({ type: 'requestRefresh' });
}

function startCountdown() {
  if (refreshIntervalId) clearInterval(refreshIntervalId);
  updateCountdown();
  refreshIntervalId = setInterval(function() {
    refreshTimer--;
    updateCountdown();
    if (refreshTimer <= 0) {
      doRefresh();
    }
  }, 1000);
}

document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('refreshBtn');
  if (btn) {
    btn.addEventListener('click', function() {
      resetCountdown();
      btn.classList.add('manual');
      vscode.postMessage({ type: 'requestRefresh' });
    });
  }
  startCountdown();
});

// ── Sync result toast ──
(function() {
  var toast = document.getElementById('syncToast');
  if (toast) {
    requestAnimationFrame(function() {
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 4000);
    });
  }
})();

// ── Shared Runtime ──
${(0, shared_1.sharedRuntimeJS)()}

// ── Navigation Bus ──
${(0, nav_1.navRuntimeJS)()}

// ── Tab Switching (shell responsibility) ──
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  var btn = document.querySelector('.tab[data-tab="' + name + '"]');
  if (btn) btn.classList.add('active');
  var panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');

  // Notify extension of tab change for state preservation across refreshes
  vscode.postMessage({ type: 'tabChange', tab: name });

  // Redraw charts when switching to their tabs
  setTimeout(function() {
    if (name === 'overview') drawTokenTrendChart();
    if (name === 'trace') initTraceTab();
    if (name === 'context') initContextTab();
    if (name === 'audit') initAuditTab();
    if (name === 'skills') renderSkills();
    if (name === 'fileops') renderFileOps();
    if (name === 'turns') renderTurnCards();
  }, 10);
}

function initTabs() {
  var tabButtons = document.querySelectorAll('.tab');
  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tabName = this.getAttribute('data-tab');
      if (tabName) switchTab(tabName);
    });
  });
}

// ── Tab-specific JS functions ──
${(0, overview_1.renderOverviewJS)()}
${(0, turns_1.renderTurnsJS)()}
${(0, trace_1.renderTraceJS)()}
${(0, context_1.renderContextJS)()}
${(0, audit_1.renderAuditJS)()}
${(0, skills_1.renderSkillsJS)()}
${(0, fileops_1.renderFileOpsJS)()}

// ── Initialize All ──
function initAll() {
  initTabs();
  // Restore last active tab if set (preserved across auto-refresh)
  if (__initialTab && __initialTab !== 'overview') {
    switchTab(__initialTab);
  }
  // Render initial state for all visible tabs
  renderOverviewCards();
  renderTurnCards();
  drawTokenTrendChart();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

</script>
${syncResult ? `<div class="sync-toast" id="syncToast">已更新：新增 ${syncResult.newTurnCount} 轮次，共 ${syncResult.totalTurnCount} 轮次</div>` : ''}
</body>
</html>`;
}
//# sourceMappingURL=webviewContent.js.map