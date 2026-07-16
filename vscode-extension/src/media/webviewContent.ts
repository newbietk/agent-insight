import type { SessionDetailData } from '../storage/db';
import { getContextWindowLimit } from '../core/context-window-config';
import { t, getBundle } from '../i18n';
import { sharedRuntimeJS, escHtml, safeJson } from './shared';
import { themeRuntimeJS } from './theme';
import { navRuntimeJS } from './nav';
import { renderOverviewTab, renderOverviewJS } from './tabs/overview';
import { renderTurnsTab, renderTurnsJS } from './tabs/turns';
import { renderSkillsTab, renderSkillsJS } from './tabs/skills';
import { renderFileOpsTab, renderFileOpsJS } from './tabs/fileops';
import { renderTraceTab, renderTraceJS } from './tabs/trace';
import { renderContextTab, renderContextJS } from './tabs/context';
import { renderAuditTab, renderAuditJS } from './tabs/audit';
import { renderFeedbackTab, renderFeedbackJS } from './tabs/feedback';

// ── Tab definitions (8 tabs, order matches parent project priority) ──
const TAB_DEFS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'overview',  label: t('detail.tabOverview'),   icon: '📊' },
  { key: 'turns',     label: t('detail.tabTurns'),      icon: '💬' },
  { key: 'trace',     label: t('detail.tabTrace'),      icon: '🔗' },
  { key: 'context',   label: t('detail.tabContext'),    icon: '📈' },
  { key: 'audit',     label: t('detail.tabAudit'),      icon: '📋' },
  { key: 'skills',    label: t('detail.tabSkills'),     icon: '🧩' },
  { key: 'fileops',   label: t('detail.tabFileOps'),    icon: '📁' },
  { key: 'feedback',  label: t('detail.tabFeedback'),   icon: '📬' },
];

export function getWebviewContent(
  data: SessionDetailData,
  cspSource: string,
  nonce: string,
  cloudUrl: string,
  sessionId: string
): string {
  const { session, turns } = data;
  const ctxLimit = getContextWindowLimit(session.model);
  const i18nBundle = getBundle();

  const assistantTurns = turns.filter(t => t.role === 'assistant');
  const turnsJson = safeJson(turns);
  const astJson = safeJson(assistantTurns);
  const sessionJson = safeJson(session);
  const i18nJson = safeJson(i18nBundle);

  // Generate tab buttons
  const tabButtons = TAB_DEFS.map((tab, i) =>
    `<button class="tab${i === 0 ? ' active' : ''}" data-tab="${tab.key}">${tab.icon} ${escHtml(tab.label)}</button>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
<title>${escHtml(t('detail.panelTitle', session.taskId.substring(0, 30)))}</title>
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
    --bg: #fafafc; --card-bg: #ffffff;
    --text: #2c3040; --text-dim: #828ba0;
    --border: #e0e3eb; --accent: #4d7cde;
    --green: #2d9f6d; --orange: #c8712a;
    --blue: #4d7cde; --purple: #7849b8;
    --red: #d9434a; --yellow: #9d8200;
    --theme-bar-bg: rgba(0,0,0,0.03);
    --theme-btn-ring: rgba(77,124,222,0.5);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 0 16px 16px 16px;
    font-size: clamp(13px, 0.75vw, 17px);
    line-height: 1.5;
  }

  .theme-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 16px; margin: 0 -16px 12px -16px;
    background: var(--theme-bar-bg);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
  }
  .theme-bar-label { color: var(--text-dim); font-weight: 500; }
  .theme-toggle {
    display: flex; align-items: center; gap: 0;
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 6px; overflow: hidden;
  }
  .theme-btn {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 10px; cursor: pointer; border: none;
    background: transparent; color: var(--text-dim);
    font-size: 11px; font-family: inherit;
    transition: background 0.15s, color 0.15s;
    outline: none; white-space: nowrap;
  }
  .theme-btn:hover { color: var(--text); }
  .theme-btn.active { background: var(--accent); color: #fff; }
  .theme-btn:first-child { border-right: 1px solid var(--border); }

  .tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .tab {
    padding: 8px 14px; cursor: pointer;
    border: 1px solid transparent; border-bottom: none;
    border-radius: 6px 6px 0 0;
    color: var(--text-dim); background: transparent;
    font-size: 12px; font-family: inherit;
    transition: color 0.15s, background 0.15s;
  }
  .tab.active { color: var(--text); background: var(--card-bg); border-color: var(--border); font-weight: 600; }
  .tab:hover:not(.active) { color: var(--text); background: rgba(255,255,255,0.03); }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 14px;
  }
  .card-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .card-value { font-size: 22px; font-weight: 700; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-value.tokens { color: var(--blue); }
  .card-value.cost { color: var(--green); }
  .card-value.time { color: var(--orange); }
  .card-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

  .chart-container { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .chart-title { font-size: 12px; font-weight: 600; margin-bottom: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; }
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
  .table-header { font-size: 12px; font-weight: 600; padding: 12px 16px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px 14px; border-bottom: 1px solid var(--border); color: var(--text-dim); font-weight: 500; font-size: 11px; white-space: nowrap; position: sticky; top: 0; background: var(--card-bg); }
  td { padding: 7px 14px; border-bottom: 1px solid rgba(62,62,66,0.4); white-space: nowrap; }
  tr.turn-row { cursor: pointer; transition: background 0.1s; }
  tr.turn-row:hover td { background: rgba(255,255,255,0.04); }
  tr.turn-row.selected td { background: rgba(0, 122, 204, 0.12); }

  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  .info-row { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 18px; }
  .info-item { font-size: 12px; }
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
  .turn-detail h4 { font-size: 13px; color: var(--text); margin-bottom: 10px; font-weight: 600; }
  .turn-content { max-height: 320px; overflow-y: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.7; color: var(--text); background: rgba(255,255,255,0.015); padding: 12px; border-radius: 4px; border: 1px solid rgba(62,62,66,0.3); }
  .tool-call-item { padding: 7px 10px; margin: 4px 0; border-left: 3px solid var(--accent); font-size: 11px; background: rgba(0,122,204,0.04); border-radius: 0 4px 4px 0; }
  .tool-name { color: var(--yellow); font-weight: 600; }
  .tool-state-ok { color: var(--green); }
  .tool-state-error { color: var(--red); }

  /* ── Turns Three-Column Layout ── */
  .turns-layout { display: flex; gap: 12px; height: calc(100vh - 180px); min-height: 500px; }
  .turns-left { width: 280px; min-width: 240px; display: flex; flex-direction: column; }
  .turns-left-header {
    font-size: 12px; font-weight: 600; padding: 10px 12px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: baseline;
    flex-shrink: 0;
  }
  .turns-card-list {
    flex: 1; overflow-y: auto; background: var(--card-bg);
    border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px;
  }
  .turn-card {
    padding: 10px 12px; border-bottom: 1px solid rgba(62,62,66,0.3);
    cursor: pointer; transition: background 0.1s;
  }
  .turn-card:hover { background: rgba(255,255,255,0.04); }
  .turn-card.selected { background: rgba(0, 122, 204, 0.12); border-left: 3px solid var(--accent); padding-left: 9px; }
  .turn-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .turn-card-role { font-size: 11px; font-weight: 600; }
  .turn-card-index { font-size: 10px; color: var(--text-dim); }
  .turn-card-summary {
    font-size: 12px; color: var(--text); line-height: 1.4;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-bottom: 6px;
  }
  .turn-card-meta { display: flex; gap: 10px; font-size: 10px; color: var(--text-dim); margin-bottom: 6px; }
  .turn-card-tokens { font-weight: 600; color: var(--blue); }
  .turn-card-latency { color: var(--text-dim); }
  .turn-card-ctx { font-weight: 600; }
  .turn-card-actions { display: flex; gap: 4px; }
  .card-btn-sm { font-size: 10px; padding: 2px 8px; border-radius: 4px; }

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
    font-size: 11px; transition: background 0.1s;
  }
  .ctx-msg-card-header:hover { background: rgba(255,255,255,0.03); }
  .ctx-msg-card-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .ctx-msg-tool-name { color: var(--yellow); font-weight: 600; font-size: 10px; }
  .ctx-msg-role-tag { font-weight: 600; font-size: 10px; flex-shrink: 0; }
  .ctx-msg-summary {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--text-dim);
  }
  .ctx-msg-card-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; margin-left: 12px; }
  .ctx-msg-tokens { font-size: 10px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .ctx-msg-card-body { padding: 0; border-top: 1px solid rgba(62,62,66,0.15); }
  .ctx-msg-content {
    margin: 0; padding: 12px 14px; font-size: 11px; line-height: 1.6;
    color: var(--text); white-space: pre-wrap; word-break: break-word;
    max-height: 400px; overflow-y: auto; background: rgba(255,255,255,0.01);
  }

  .turn-detail-stats { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
  .td-stat {
    display: flex; flex-direction: column; align-items: center;
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px 12px; min-width: 64px;
  }
  .td-stat-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.3px; }
  .td-stat-val { font-size: 14px; font-weight: 700; color: var(--text); margin-top: 2px; }
  .turn-detail-section { margin-bottom: 16px; }
  .turn-detail-section-title {
    font-size: 11px; font-weight: 600; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;
  }

  /* ── Expandable section headers (turn detail content / tool calls / skill events) ── */
  .td-section-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    cursor: pointer; user-select: none; border-radius: 4px;
    transition: background 0.1s; font-size: 12px;
  }
  .td-section-header:hover { background: rgba(255,255,255,0.04); }
  .td-section-title { font-weight: 600; color: var(--text); }
  .td-section-meta { font-size: 10px; color: var(--text-dim); }
  .td-section-arrow { font-size: 9px; color: var(--text-dim); flex-shrink: 0; margin-left: auto; transition: transform 0.15s; }
  .td-section-body { padding: 8px 12px; }

  .td-sub-header { padding: 6px 10px; font-size: 11px; background: rgba(255,255,255,0.015); border-radius: 3px; }

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
    font-size: 11px;
  }

  /* ── Badges ── */
  .badge {
    display: inline-block; font-size: 10px; font-weight: 600;
    padding: 2px 8px; border-radius: 4px; letter-spacing: 0.3px;
  }
  .badge-purple { background: rgba(160,120,240,0.15); color: var(--purple); }
  .badge-green { background: rgba(80,200,140,0.15); color: var(--green); }
  .badge-yellow { background: rgba(220,200,80,0.15); color: var(--yellow); }
  .badge-red { background: rgba(232,103,107,0.15); color: var(--red); }
  .badge-blue { background: rgba(98,154,240,0.15); color: var(--blue); }

  /* ── Copy button ── */
  .td-copy-btn {
    background: rgba(255,255,255,0.05); border: 1px solid var(--border);
    color: var(--text-dim); font-size: 11px; padding: 3px 8px;
    border-radius: 4px; cursor: pointer; transition: background 0.1s, color 0.1s;
  }
  .td-copy-btn:hover { background: rgba(255,255,255,0.1); color: var(--text); }

  /* ── Tool call header (compact) ── */
  .td-tc-header { padding: 6px 10px; font-size: 11px; }

  /* ── Error message ── */
  .td-error-msg {
    background: rgba(232,103,107,0.1); color: var(--red);
    border: 1px solid rgba(232,103,107,0.2); border-radius: 4px;
    padding: 6px 10px; font-size: 11px; margin-bottom: 10px;
  }

  /* ── Content pre block ── */
  .td-content-pre {
    margin: 0; padding: 10px 12px; font-size: 11px; line-height: 1.5;
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
    font-size: 11px; color: var(--text-dim); background: var(--card-bg);
    border: 1px solid var(--border); border-radius: 5px; padding: 10px 12px;
    margin-top: 14px; line-height: 1.6;
  }
  .session-meta span { color: var(--text); font-weight: 500; }

  /* ── Feedback toast ── */
  .feedback-toast {
    position: fixed; top: 16px; right: 16px; z-index: 300;
    padding: 10px 16px; border-radius: 6px; font-size: 12px;
    max-width: 340px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    transform: translateX(120%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .feedback-toast.show { transform: translateX(0); }
  .feedback-toast.success { background: #1a3a2a; color: #5ec49e; border: 1px solid #2a5a3a; }
  .feedback-toast.error { background: #3a1a1a; color: #e8676b; border: 1px solid #5a2a2a; }

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
</style>
</head>
<body>
<div class="theme-bar" id="themeBar">
  <span class="theme-bar-label">${escHtml(t('detail.theme'))}:</span>
</div>
<div class="info-row">
  <div class="info-item"><span>${escHtml(t('detail.taskId'))}: </span><span>${escHtml(session.taskId)}</span></div>
  <div class="info-item"><span>${escHtml(t('common.model'))}: </span><span>${escHtml(session.model ?? t('common.unknown'))}</span></div>
  <div class="info-item"><span>${escHtml(t('common.framework'))}: </span><span>${escHtml(session.framework)}</span></div>
  <div class="info-item"><span>${escHtml(t('common.turns'))}: </span><span>${turns.length} (${escHtml(t('detail.turnsAssistant', assistantTurns.length))})</span></div>
</div>

<div class="tabs">
  ${tabButtons}
</div>

${renderOverviewTab()}
${renderTurnsTab()}
${renderTraceTab()}
${renderContextTab()}
${renderAuditTab()}
${renderSkillsTab()}
${renderFileOpsTab()}
${renderFeedbackTab()}

<!-- ── Toast ── -->
<div class="feedback-toast" id="feedbackToast"></div>

<script nonce="${nonce}">
// ── Data ──
var turns = ${turnsJson};
var assistantTurns = ${astJson};
var session = ${sessionJson};
var ctxLimit = ${ctxLimit};

// ── Shared Runtime ──
${sharedRuntimeJS()}

// ── Theme Engine ──
${themeRuntimeJS()}

// ── Navigation Bus ──
${navRuntimeJS()}

// ── Tab Switching (shell responsibility) ──
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  var btn = document.querySelector('.tab[data-tab="' + name + '"]');
  if (btn) btn.classList.add('active');
  var panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');

  // Redraw charts when switching to their tabs
  setTimeout(function() {
    if (name === 'overview') drawTokenTrendChart();
    if (name === 'trace') initTraceTab();
    if (name === 'context') initContextTab();
    if (name === 'audit') initAuditTab();
    if (name === 'skills') renderSkills();
    if (name === 'fileops') renderFileOps();
    if (name === 'feedback') initFeedbackTab();
    if (name === 'turns') renderTurnCards(null);
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
${renderOverviewJS()}
${renderTurnsJS()}
${renderTraceJS()}
${renderContextJS()}
${renderAuditJS()}
${renderSkillsJS()}
${renderFileOpsJS()}
${renderFeedbackJS()}

// ── Initialize All ──
function initAll() {
  initTheme();
  initTabs();
  // Render initial state for all visible tabs
  renderOverviewCards();
  renderTurnCards(null);
  drawTokenTrendChart();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

</script>
</body>
</html>`;
}
