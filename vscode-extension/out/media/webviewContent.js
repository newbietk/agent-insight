"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewContent = getWebviewContent;
const context_window_config_1 = require("../core/context-window-config");
const i18n_1 = require("../i18n");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const shared_1 = require("./shared");
const theme_1 = require("./theme");
const nav_1 = require("./nav");
const overview_1 = require("./tabs/overview");
const turns_1 = require("./tabs/turns");
const breakdown_1 = require("./tabs/breakdown");
const skills_1 = require("./tabs/skills");
const filereads_1 = require("./tabs/filereads");
const subagents_1 = require("./tabs/subagents");
// ── Load bot avatar as base64 (embedded once at module load) ──
let _botDataUri = null;
function getBotDataUri() {
    if (_botDataUri)
        return _botDataUri;
    try {
        const imgPath = path.join(__dirname, '..', 'media', 'bot.png');
        if (fs.existsSync(imgPath)) {
            const buf = fs.readFileSync(imgPath);
            const b64 = buf.toString('base64');
            _botDataUri = `data:image/png;base64,${b64}`;
            return _botDataUri;
        }
    }
    catch { /* fall through */ }
    _botDataUri = '';
    return '';
}
// ── Tab definitions (8 tabs, order matches parent project priority) ──
const TAB_DEFS = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'turns', label: 'Turns', icon: '💬' },
    { key: 'skills', label: 'Skills', icon: '🧩' },
    { key: 'filereads', label: 'File Reads', icon: '📁' },
    { key: 'subagents', label: 'Subagents', icon: '🤖' },
    { key: 'breakdown', label: 'Breakdown', icon: '📉' },
];
function getWebviewContent(data, cspSource, nonce, cloudUrl, sessionId) {
    const { session, turns } = data;
    const botUri = getBotDataUri();
    const ctxLimit = (0, context_window_config_1.getContextWindowLimit)(session.model);
    const i18nBundle = (0, i18n_1.getBundle)();
    const assistantTurns = turns.filter(t => t.role === 'assistant');
    const mainTurns = turns.filter(t => !t.isSubagent);
    const turnsJson = (0, shared_1.safeJson)(turns);
    const astJson = (0, shared_1.safeJson)(assistantTurns);
    const sessionJson = (0, shared_1.safeJson)(session);
    const cloudUrlJson = (0, shared_1.safeJson)(cloudUrl);
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
    --bg: #1b1e2b; --card-bg: #212433;
    --text: #cdd6e0; --text-dim: #7c8496;
    --border: #353a4e; --accent: #629af0;
    --green: #5ec49e; --orange: #e09a6b;
    --blue: #73abed; --purple: #b898e8;
    --red: #e8676b; --yellow: #dcc87a;
    --theme-bar-bg: rgba(255,255,255,0.03);
    --theme-btn-ring: rgba(255,255,255,0.3);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 0 16px 16px 16px;
    font-size: 13px;
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
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .chart-tooltip-title { font-weight: 600; color: var(--accent); margin-bottom: 2px; }
  .chart-tooltip-tokens { color: var(--text-dim); }
  .chart-tooltip-summary { color: var(--text); margin-top: 4px; }

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
  .ctx-summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; font-size: 12px; }
  .ctx-summary-item { display: flex; justify-content: space-between; }
  .ctx-summary-item span:first-child { color: var(--text-dim); }
  .ctx-summary-item span:last-child { color: var(--text); font-weight: 500; }

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
  .ctx-expand-arrow { font-size: 9px; color: var(--text-dim); flex-shrink: 0; }

  .empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
  .empty-state .icon { font-size: 32px; margin-bottom: 8px; }

  /* ── Feedback Bot ── */
  .feedback-fab {
    position: fixed; z-index: 100;
    top: calc(50% - 30px); right: -30px;
    width: 60px; height: 60px; border-radius: 50%;
    border: 3px solid var(--border);
    cursor: grab; user-select: none;
    background: var(--card-bg) center/cover no-repeat;
    box-shadow: 0 0 0 4px var(--theme-bar-bg), 0 4px 20px rgba(0,0,0,0.35);
    transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.25s, border-color 0.25s;
  }
  .feedback-fab:hover {
    right: 6px;
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--theme-bar-bg), 0 6px 28px rgba(0,0,0,0.45);
  }
  .feedback-fab.dragging { cursor: grabbing; border-color: var(--accent); transition: none; }
  .feedback-fab.docked { right: -30px; }
  .feedback-fab.docked:hover { right: 6px; }
  .feedback-fab.hidden { display: none; }

  .feedback-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.4); display: none;
    transition: opacity 0.25s;
  }
  .feedback-overlay.open { display: block; }

  .feedback-drawer {
    position: fixed; top: 0; right: -400px; z-index: 201;
    width: 380px; height: 100vh;
    background: var(--bg); border-left: 1px solid var(--border);
    display: flex; flex-direction: column;
    transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: -4px 0 20px rgba(0,0,0,0.25);
  }
  .feedback-drawer.open { right: 0; }

  .drawer-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
  }
  .drawer-header h3 { font-size: 15px; font-weight: 600; color: var(--text); }
  .drawer-close {
    background: none; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 20px; padding: 2px 6px; line-height: 1;
  }
  .drawer-close:hover { color: var(--text); }

  .drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
  .drawer-body label {
    display: block; font-size: 11px; font-weight: 600; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.4px; margin: 14px 0 6px 0;
  }
  .drawer-body label:first-child { margin-top: 0; }
  .drawer-body select, .drawer-body textarea, .drawer-body input[type=email] {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border);
    border-radius: 5px; background: var(--card-bg); color: var(--text);
    font-size: 12px; font-family: inherit;
    transition: border-color 0.15s;
  }
  .drawer-body select:focus, .drawer-body textarea:focus, .drawer-body input:focus {
    outline: none; border-color: var(--accent);
  }
  .drawer-body textarea { resize: vertical; min-height: 80px; }

  .session-meta {
    font-size: 11px; color: var(--text-dim); background: var(--card-bg);
    border: 1px solid var(--border); border-radius: 5px; padding: 10px 12px;
    margin-top: 14px; line-height: 1.6;
  }
  .session-meta span { color: var(--text); font-weight: 500; }

  .drawer-footer {
    padding: 14px 16px; border-top: 1px solid var(--border);
    display: flex; gap: 8px;
  }
  .drawer-footer button {
    flex: 1; padding: 8px; border-radius: 5px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; font-family: inherit;
    transition: opacity 0.15s;
  }
  .drawer-footer button:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-submit { background: var(--accent); color: #fff; }
  .btn-submit:hover:not(:disabled) { opacity: 0.9; }
  .btn-cancel { background: var(--card-bg); color: var(--text-dim); border: 1px solid var(--border) !important; }

  .feedback-toast {
    position: fixed; top: 16px; right: 16px; z-index: 300;
    padding: 10px 16px; border-radius: 6px; font-size: 12px;
    max-width: 340px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    transform: translateX(120%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .feedback-toast.show { transform: translateX(0); }
  .feedback-toast.success { background: #1a3a2a; color: #5ec49e; border: 1px solid #2a5a3a; }
  .feedback-toast.error { background: #3a1a1a; color: #e8676b; border: 1px solid #5a2a2a; }
</style>
</head>
<body>
<div class="theme-bar" id="themeBar">
  <span class="theme-bar-label">${(0, shared_1.escHtml)((0, i18n_1.t)('detail.theme'))}:</span>
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
${(0, skills_1.renderSkillsTab)()}
${(0, filereads_1.renderFileReadsTab)()}
${(0, subagents_1.renderSubagentsTab)()}
${(0, breakdown_1.renderBreakdownTab)()}

<!-- ── Feedback FAB ── -->
<button class="feedback-fab" id="feedbackFab" title="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.dragHint'))}" style="background-image:url(${botUri || ''})"></button>

<!-- ── Feedback Overlay ── -->
<div class="feedback-overlay" id="feedbackOverlay"></div>

<!-- ── Feedback Drawer ── -->
<div class="feedback-drawer" id="feedbackDrawer">
  <div class="drawer-header">
    <h3>${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.title'))}</h3>
    <button class="drawer-close" id="drawerClose">✕</button>
  </div>
  <div class="drawer-body">
    <label>${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueType'))}</label>
    <select id="fbIssueType">
      <option value="context_explosion">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueContextExplosion'))}</option>
      <option value="duplicate_reads">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueDuplicateReads'))}</option>
      <option value="cost_spike">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueCostSpike'))}</option>
      <option value="hallucination">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueHallucination'))}</option>
      <option value="other">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueOther'))}</option>
    </select>
    <label>${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.problemDesc'))}</label>
    <textarea id="fbProblem" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.problemPlaceholder'))}"></textarea>
    <label>${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.helpRequest'))}</label>
    <textarea id="fbHelp" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.helpPlaceholder'))}"></textarea>
    <label>${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.contactEmail'))}</label>
    <input type="email" id="fbEmail" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.emailPlaceholder'))}">
    <div class="session-meta" id="fbSessionMeta"></div>
  </div>
  <div class="drawer-footer">
    <button class="btn-cancel" id="drawerCancel">${(0, shared_1.escHtml)((0, i18n_1.t)('common.cancel'))}</button>
    <button class="btn-submit" id="drawerSubmit">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.submit'))}</button>
  </div>
</div>

<!-- ── Toast ── -->
<div class="feedback-toast" id="feedbackToast"></div>

<script nonce="${nonce}">
// ── Data ──
var turns = ${turnsJson};
var assistantTurns = ${astJson};
var session = ${sessionJson};
var ctxLimit = ${ctxLimit};

// ── Shared Runtime ──
${(0, shared_1.sharedRuntimeJS)()}

// ── Theme Engine ──
${(0, theme_1.themeRuntimeJS)()}

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

  // Redraw charts when switching to their tabs
  setTimeout(function() {
    if (name === 'overview') drawTokenTrendChart();
    if (name === 'breakdown') { renderBreakdown(); drawTokenCompositionChart(); }
    if (name === 'skills') renderSkills();
    if (name === 'filereads') renderFileReads();
    if (name === 'subagents') renderSubagents();
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
${(0, overview_1.renderOverviewJS)()}
${(0, turns_1.renderTurnsJS)()}
${(0, skills_1.renderSkillsJS)()}
${(0, filereads_1.renderFileReadsJS)()}
${(0, subagents_1.renderSubagentsJS)()}
${(0, breakdown_1.renderBreakdownJS)()}

// ── Initialize All ──
function initAll() {
  initTheme();
  initTabs();
  // Render initial state for all visible tabs
  renderOverviewCards();
  renderTurnCards(null);
  drawTokenTrendChart();
  renderBreakdown();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

// ── Feedback Drawer ──
(function() {
  var cloudUrl = ${cloudUrlJson};
  var sessionId = '${sessionId}';

  var fab = document.getElementById('feedbackFab');
  var overlay = document.getElementById('feedbackOverlay');
  var drawer = document.getElementById('feedbackDrawer');
  var closeBtn = document.getElementById('drawerClose');
  var cancelBtn = document.getElementById('drawerCancel');
  var submitBtn = document.getElementById('drawerSubmit');
  var toast = document.getElementById('feedbackToast');

  var meta = document.getElementById('fbSessionMeta');
  if (meta) {
    meta.innerHTML = [
      __('feedback.task') + ': <span>' + esc(session.taskId.substring(0, 40)) + '</span>',
      __('common.model') + ': <span>' + esc(session.model || 'unknown') + '</span>',
      __('common.tokens') + ': <span>' + fmt(toNumber(session.totalTokens)) + '</span>',
      __('common.cost') + ': <span>' + fmtCost(session.totalCost) + '</span>',
      __('common.turns') + ': <span>' + turns.length + '</span>',
      __('feedback.uploadTo') + ': <span>' + esc(cloudUrl) + '</span>'
    ].join(' · ');
  }

  function openDrawer() {
    fab.classList.add('hidden');
    overlay.classList.add('open');
    drawer.classList.add('open');
  }
  function closeDrawer() {
    fab.classList.remove('hidden');
    overlay.classList.remove('open');
    drawer.classList.remove('open');
  }

  // Drag logic
  (function() {
    var startX = 0, startY = 0, origRight = 0, origTop = 0;
    var dragging = false, moved = false;
    var DRAG_THRESHOLD = 4;

    function getRight() {
      return window.innerWidth - fab.offsetLeft - fab.offsetWidth;
    }

    fab.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startX = e.clientX; startY = e.clientY;
      origRight = getRight(); origTop = fab.offsetTop;
      dragging = true; moved = false;
      fab.classList.add('dragging');
      fab.style.right = 'auto';
      fab.style.left = fab.offsetLeft + 'px';
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved = true;
      if (moved) {
        var newLeft = window.innerWidth - origRight - 60 + dx;
        var newTop = origTop + dy;
        fab.style.left = Math.max(0, Math.min(window.innerWidth - 60, newLeft)) + 'px';
        fab.style.top = Math.max(0, Math.min(window.innerHeight - 60, newTop)) + 'px';
      }
    });

    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      fab.classList.remove('dragging');
      dragging = false;
      if (!moved) {
        fab.style.right = '-30px';
        fab.style.left = 'auto';
        fab.style.top = '';
        openDrawer();
      }
    });
  })();

  overlay.addEventListener('click', closeDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  cancelBtn.addEventListener('click', closeDrawer);

  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.className = 'feedback-toast ' + (isError ? 'error' : 'success') + ' show';
    setTimeout(function() { toast.classList.remove('show'); }, 4000);
  }

  submitBtn.addEventListener('click', function() {
    var issueType = document.getElementById('fbIssueType').value;
    var problemDescription = document.getElementById('fbProblem').value.trim();
    var helpRequest = document.getElementById('fbHelp').value.trim();
    var contactEmail = document.getElementById('fbEmail').value.trim();

    if (!problemDescription) {
      showToast(__('feedback.pleaseDescribe'), true);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = __('feedback.uploading');

    vscode.postMessage({
      type: 'submitFeedback',
      issueType: issueType,
      problemDescription: problemDescription,
      helpRequest: helpRequest,
      contactEmail: contactEmail
    });
  });

  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg && msg.type === 'feedbackResult') {
      submitBtn.disabled = false;
      submitBtn.textContent = __('feedback.submit');
      if (msg.success) {
        showToast(__('feedback.uploaded', msg.submissionId || 'N/A'), false);
        closeDrawer();
        document.getElementById('fbProblem').value = '';
        document.getElementById('fbHelp').value = '';
      } else {
        showToast(__('feedback.uploadFailed', msg.error || 'Unknown error'), true);
      }
    }
  });

  var vscode = acquireVsCodeApi();
})();
</script>
</body>
</html>`;
}
//# sourceMappingURL=webviewContent.js.map