"use strict";
// Trace tab — keyword search with propagation chain, list, and SVG DAG graph views.
// Ported from parent project TraceView.tsx with adaptations for vanilla JS webview.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTraceTab = renderTraceTab;
exports.renderTraceJS = renderTraceJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderTraceTab() {
    return `
<div id="tab-trace" class="tab-panel">
  <!-- Search bar -->
  <div class="chart-container">
    <div class="chart-title">${'🔍 ' + (0, shared_1.escHtml)((0, i18n_1.t)('trace.title'))}</div>
    <div style="margin-bottom:8px;display:flex;gap:8px">
      <input id="traceSearchInput" type="text" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('trace.searchPlaceholder'))}"
        style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:13px;font-family:inherit">
      <button id="traceSearchBtn" class="card-btn" style="padding:8px 16px;font-size:13px">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.searchButton'))}</button>
    </div>
    <!-- Recent searches -->
    <div id="traceRecentSearches" style="display:none;margin-bottom:8px"></div>
    <!-- Example keywords -->
    <div id="traceExamples" style="margin-bottom:8px"></div>
  </div>

  <!-- Results area (hidden until search) -->
  <div id="traceResultsArea" style="display:none">
    <!-- Header: keyword + count + distribution -->
    <div class="chart-container" style="padding:10px 16px">
      <div id="traceResultsHeader"></div>
      <div id="traceSourceDistribution" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
      <!-- View mode toggle -->
      <div style="display:flex;gap:4px;margin-top:8px" id="traceViewModeBtns">
        <button class="fileops-chip active" data-trace-mode="chain">📜 ${(0, shared_1.escHtml)((0, i18n_1.t)('trace.modeChain'))}</button>
        <button class="fileops-chip" data-trace-mode="list">📋 ${(0, shared_1.escHtml)((0, i18n_1.t)('trace.modeList'))}</button>
        <button class="fileops-chip" data-trace-mode="graph">🗺️ ${(0, shared_1.escHtml)((0, i18n_1.t)('trace.modeGraph'))}</button>
      </div>
    </div>
    <!-- Results content -->
    <div id="traceResultsContent" style="padding:0 8px"></div>
  </div>

  <!-- Empty state -->
  <div id="traceEmptyState" class="chart-container" style="text-align:center;padding:40px">
    <div style="font-size:32px;margin-bottom:8px">🔗</div>
    <p style="color:var(--text-dim);font-size:13px">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.emptyHint'))}</p>
    <div id="traceExampleKeywords" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:12px"></div>
  </div>
</div>`;
}
function renderTraceJS() {
    return `
// ── Trace Tab — Search + Propagation Views ──

var traceSearchResults = [];
var traceLastKeyword = '';
var traceViewMode = 'chain';
var traceRecentSearches = [];

// Source type config
var TRACE_SOURCE_TYPES = {
  user_input:     { icon: '👤', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.srcUserInput'))}',    color: '#3b82f6', badgeVar: 'blue'   },
  model_output:   { icon: '🤖', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.srcModelOutput'))}',   color: '#10b981', badgeVar: 'green'  },
  subagent_output:{ icon: '🤖', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.srcSubagentOutput'))}',color: '#10b981', badgeVar: 'green'  },
  tool_output:    { icon: '🔧', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.srcToolOutput'))}',    color: '#8b5cf6', badgeVar: 'purple' },
  root_dispatch:  { icon: '📤', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.srcRootDispatch'))}',  color: '#f97316', badgeVar: 'orange' },
};

var TRACE_MEDIUMS = {
  user_input:    { icon: '↓', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.medUserInput'))}' },
  tool_output:   { icon: '↓', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.medToolOutput'))}' },
  task_dispatch: { icon: '↓', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.medTaskDispatch'))}' },
  model_reasoning:{ icon: '↓', label: '${(0, shared_1.escHtml)((0, i18n_1.t)('trace.medModelReasoning'))}' },
};

// Badge color map for source types (matching fileops chip style)
var TRACE_BADGE_COLORS = {
  blue:   'background:rgba(59,130,246,0.15);color:#60a5fa',
  green:  'background:rgba(16,185,129,0.15);color:#34d399',
  purple: 'background:rgba(139,92,246,0.15);color:#a78bfa',
  orange: 'background:rgba(249,115,22,0.15);color:#fb923c',
};

// ── Source classification ──

function classifyTraceSource(item) {
  if (item.matchField === 'toolResult' || item.matchField === 'toolError') return 'tool_output';
  if (item.role === 'user') return 'user_input';
  if (item.role === 'assistant' && item.isSubagent) return 'subagent_output';
  if (item.role === 'assistant' && item.hasDispatch) return 'root_dispatch';
  if (item.role === 'assistant') return 'model_output';
  return 'model_output';
}

function inferTraceMedium(prevItem, currItem) {
  var src = classifyTraceSource(currItem);
  if (src === 'user_input') return 'user_input';
  if (src === 'tool_output') return 'tool_output';
  if (src === 'root_dispatch') return 'task_dispatch';
  return 'model_reasoning';
}

// ── Detect subagent dispatch turns ──

var _dispatchTurnIds = null;
function getDispatchTurnIds() {
  if (_dispatchTurnIds) return _dispatchTurnIds;
  _dispatchTurnIds = {};
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (!t.toolCalls) continue;
    for (var j = 0; j < t.toolCalls.length; j++) {
      var tc = t.toolCalls[j];
      // Agent/Task/Spawn tool calls indicate subagent dispatch
      var tn = (tc.toolName || '').toLowerCase();
      if (tn === 'agent' || tn === 'task' || tn === 'spawn' || tn.indexOf('agent') >= 0) {
        _dispatchTurnIds[t.id] = true;
        break;
      }
    }
  }
  return _dispatchTurnIds;
}

// ── Highlight keyword in text ──

function highlightKeyword(text, kw) {
  if (!kw || !text) return esc(String(text));
  var escaped = esc(String(text));
  var kwEscaped = esc(kw);
  var lowerText = escaped.toLowerCase();
  var lowerKw = kwEscaped.toLowerCase();
  var idx = lowerText.indexOf(lowerKw);
  if (idx < 0) return escaped;

  var result = '';
  var lastIdx = 0;
  while (idx >= 0) {
    result += escaped.substring(lastIdx, idx);
    result += '<mark style="background:rgba(250,204,21,0.3);color:var(--text);border-radius:2px;padding:0 2px">' + escaped.substring(idx, idx + kwEscaped.length) + '</mark>';
    lastIdx = idx + kwEscaped.length;
    idx = lowerText.indexOf(lowerKw, lastIdx);
  }
  result += escaped.substring(lastIdx);
  return result;
}

// ── Format timestamp ──

function formatTraceTs(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return h + ':' + m + ':' + s;
  } catch(e) { return ts; }
}

// ── Search ──

function doTraceSearch() {
  var input = document.getElementById('traceSearchInput');
  var emptyState = document.getElementById('traceEmptyState');
  var resultsArea = document.getElementById('traceResultsArea');
  var resultsContent = document.getElementById('traceResultsContent');

  if (!input) return;
  var query = (input.value || '').trim();
  if (!query) {
    if (emptyState) emptyState.style.display = '';
    if (resultsArea) resultsArea.style.display = 'none';
    renderTraceExamples();
    return;
  }

  traceSearchResults = [];
  var lowerQ = query.toLowerCase();
  var dispatchIds = getDispatchTurnIds();

  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    var matchField = '';
    var matchContext = '';
    var toolName = '';

    // Search contentSummary
    if ((t.contentSummary || '').toLowerCase().indexOf(lowerQ) >= 0) {
      matchField = 'contentSummary';
      matchContext = (t.contentSummary || '').substring(0, 200);
    }
    // Search content
    else if ((t.content || '').toLowerCase().indexOf(lowerQ) >= 0) {
      matchField = 'content';
      var cIdx = (t.content || '').toLowerCase().indexOf(lowerQ);
      matchContext = '...' + (t.content || '').substring(Math.max(0, cIdx - 40), cIdx + lowerQ.length + 80) + '...';
    }

    // Search tool calls
    if (!matchField && t.toolCalls) {
      for (var k = 0; k < t.toolCalls.length; k++) {
        var tc = t.toolCalls[k];
        if ((tc.toolName || '').toLowerCase().indexOf(lowerQ) >= 0) {
          matchField = 'toolCall';
          matchContext = 'Tool: ' + tc.toolName;
          toolName = tc.toolName;
          break;
        }
        if ((tc.resultJson || '').toLowerCase().indexOf(lowerQ) >= 0) {
          matchField = 'toolResult';
          matchContext = 'Tool result of ' + tc.toolName + ' matches';
          toolName = tc.toolName;
          break;
        }
        if ((tc.errorType || '').toLowerCase().indexOf(lowerQ) >= 0) {
          matchField = 'toolError';
          matchContext = 'Tool error: ' + tc.errorType;
          toolName = tc.toolName;
          break;
        }
      }
    }

    if (matchField) {
      traceSearchResults.push({
        turnId: t.id,
        turnIndex: t.turnIndex != null ? t.turnIndex : i,
        role: t.role,
        agentName: t.agentName || null,
        isSubagent: !!t.isSubagent,
        subagentName: t.subagentName || null,
        subagentSessionId: t.subagentSessionId || null,
        contentSummary: t.contentSummary || null,
        matchContext: matchContext,
        matchField: matchField,
        toolName: toolName || null,
        createdAt: t.createdAt_ts || null,
        hasDispatch: !!dispatchIds[t.id],
        totalTokens: toNumber(t.totalTokens),
        latencyMs: toNumber(t.latencyMs)
      });
    }
  }

  traceLastKeyword = query;
  addTraceRecentSearch(query);

  if (traceSearchResults.length === 0) {
    if (emptyState) emptyState.style.display = '';
    if (resultsArea) resultsArea.style.display = 'none';
    renderTraceExamples();
    return;
  }

  // Classify results
  for (var r = 0; r < traceSearchResults.length; r++) {
    traceSearchResults[r].sourceType = classifyTraceSource(traceSearchResults[r]);
  }

  if (emptyState) emptyState.style.display = 'none';
  if (resultsArea) resultsArea.style.display = '';

  renderTraceResultsHeader();
  renderTraceResultsContent();

  // Bind view mode buttons
  var modeBtns = document.querySelectorAll('[data-trace-mode]');
  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      traceViewMode = this.getAttribute('data-trace-mode');
      modeBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      renderTraceResultsContent();
    });
  });
}

function addTraceRecentSearch(kw) {
  traceRecentSearches = [kw].concat(traceRecentSearches.filter(function(s) { return s !== kw; })).slice(0, 8);
  renderTraceRecentSearches();
}

function renderTraceRecentSearches() {
  var container = document.getElementById('traceRecentSearches');
  if (!container || traceRecentSearches.length === 0) {
    if (container) container.style.display = 'none';
    return;
  }
  container.style.display = '';
  var html = '<span style="font-size:10px;color:var(--text-dim)">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.recentSearches'))}: </span>';
  for (var i = 0; i < traceRecentSearches.length; i++) {
    var kw = traceRecentSearches[i];
    html += '<span class="fileops-chip" data-trace-recent="' + esc(kw) + '" style="cursor:pointer;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(kw) + '</span>';
  }
  container.innerHTML = html;
  container.querySelectorAll('[data-trace-recent]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var kw = this.getAttribute('data-trace-recent');
      var input = document.getElementById('traceSearchInput');
      if (input) { input.value = kw; doTraceSearch(); }
    });
  });
}

function renderTraceExamples() {
  var container = document.getElementById('traceExampleKeywords');
  if (!container) return;
  var kws = [];
  // Add first user query words
  for (var i = 0; i < turns.length; i++) {
    if (turns[i].role === 'user' && turns[i].content) {
      var words = turns[i].content.split(/[\\s,，。.、]+/).filter(function(w) { return w.length >= 2 && w.length <= 20; });
      kws = kws.concat(words.slice(0, 3));
      break;
    }
  }
  // Add some tool names
  var seenTools = {};
  for (var j = 0; j < turns.length && kws.length < 6; j++) {
    if (!turns[j].toolCalls) continue;
    for (var k = 0; k < turns[j].toolCalls.length && kws.length < 6; k++) {
      var tn = turns[j].toolCalls[k].toolName;
      if (!seenTools[tn]) { seenTools[tn] = true; kws.push(tn); }
    }
  }
  if (kws.length === 0) { container.innerHTML = ''; return; }
  var html = '<span style="font-size:10px;color:var(--text-dim)">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.exampleHints'))}: </span>';
  for (var w = 0; w < kws.length; w++) {
    html += '<span class="fileops-chip" data-trace-example="' + esc(kws[w]) + '" style="cursor:pointer">' + esc(kws[w]) + '</span>';
  }
  container.innerHTML = html;
  container.querySelectorAll('[data-trace-example]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var kw = this.getAttribute('data-trace-example');
      var input = document.getElementById('traceSearchInput');
      if (input) { input.value = kw; doTraceSearch(); }
    });
  });
}

// ── Results header ──

function renderTraceResultsHeader() {
  var header = document.getElementById('traceResultsHeader');
  var dist = document.getElementById('traceSourceDistribution');
  if (!header) return;

  header.innerHTML = '<span style="font-size:14px;font-weight:600">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.searchFor'))} &quot;' + esc(traceLastKeyword) + '&quot;</span>' +
    '<span class="fileops-op-badge ok" style="margin-left:8px;font-size:12px">' + traceSearchResults.length + ' ${(0, shared_1.escHtml)((0, i18n_1.t)('trace.hits'))}</span>';

  if (!dist) return;
  // Source distribution
  var distMap = {};
  for (var i = 0; i < traceSearchResults.length; i++) {
    var st = traceSearchResults[i].sourceType;
    distMap[st] = (distMap[st] || 0) + 1;
  }
  var distKeys = Object.keys(distMap);
  var distHtml = '';
  for (var d = 0; d < distKeys.length; d++) {
    var cfg = TRACE_SOURCE_TYPES[distKeys[d]] || { icon: '?', label: distKeys[d], badgeVar: 'gray' };
    var style = TRACE_BADGE_COLORS[cfg.badgeVar] || '';
    distHtml += '<span style="font-size:11px;padding:2px 8px;border-radius:12px;' + style + '">' + cfg.icon + ' ' + cfg.label + ': ' + distMap[distKeys[d]] + '</span>';
  }
  dist.innerHTML = distHtml;
}

// ── Results content router ──

function renderTraceResultsContent() {
  var container = document.getElementById('traceResultsContent');
  if (!container) return;

  if (traceViewMode === 'chain') renderTraceChainView(container);
  else if (traceViewMode === 'list') renderTraceListView(container);
  else if (traceViewMode === 'graph') renderTraceGraphView(container);
}

// ── Chain View ──

var traceExpandedTurns = {};

function renderTraceChainView(container) {
  var chain = [];
  for (var i = 0; i < traceSearchResults.length; i++) {
    var medium = i === 0 ? null : inferTraceMedium(traceSearchResults[i - 1], traceSearchResults[i]);
    chain.push({ item: traceSearchResults[i], medium: medium });
  }

  var html = '';
  var origin = chain[0];
  if (origin) {
    var ocfg = TRACE_SOURCE_TYPES[origin.item.sourceType] || TRACE_SOURCE_TYPES.model_output;
    var obadgeStyle = TRACE_BADGE_COLORS.green || '';
    html += '<div style="border-left:4px solid #10b981;border-radius:8px;padding:10px 14px;margin-bottom:8px;background:rgba(16,185,129,0.05);border:1px solid var(--border);border-left-width:4px">';
    html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">';
    html += '<span style="font-size:11px;padding:2px 8px;border-radius:10px;' + obadgeStyle + ';font-weight:600">🟢 ${(0, shared_1.escHtml)((0, i18n_1.t)('trace.origin'))}</span>';
    html += '<span style="font-size:11px;padding:2px 8px;border-radius:10px;' + (TRACE_BADGE_COLORS[ocfg.badgeVar] || '') + '">' + ocfg.icon + ' ' + ocfg.label + '</span>';
    html += '<span style="font-size:11px;font-family:monospace;color:var(--text-dim)">Turn #' + origin.item.turnIndex + '</span>';
    if (origin.item.agentName) {
      html += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);color:var(--text-dim)">' + esc(origin.item.agentName) + '</span>';
    }
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text);line-height:1.5">' + highlightKeyword(origin.item.matchContext, traceLastKeyword) + '</div>';
    html += '<div style="margin-top:8px">';
    html += '<button class="card-btn card-btn-sm" data-nav-turn="' + esc(origin.item.turnId) + '">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.viewTurnBtn'))} →</button>';
    html += '</div>';
    html += '</div>';
  }

  // Propagation chain
  for (var ci = 1; ci < chain.length; ci++) {
    var item = chain[ci].item;
    var medium = chain[ci].medium;
    var cfg = TRACE_SOURCE_TYPES[item.sourceType] || TRACE_SOURCE_TYPES.model_output;
    var medCfg = medium ? (TRACE_MEDIUMS[medium] || null) : null;
    var isExpanded = !!traceExpandedTurns[item.turnId];
    var borderColor = TRACE_SOURCE_TYPES[item.sourceType] ? TRACE_SOURCE_TYPES[item.sourceType].color : '#6b7280';

    // Medium connector
    if (medCfg) {
      html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0 4px 24px">';
      html += '<div style="width:12px;height:12px;border-left:2px solid var(--text-dim);border-bottom:2px solid var(--text-dim);border-radius:0 0 0 6px"></div>';
      html += '<span style="font-size:10px;color:var(--text-dim)">' + medCfg.icon + ' ' + medCfg.label + '</span>';
      html += '</div>';
    }

    html += '<div style="border-left:4px solid ' + borderColor + ';border-radius:8px;padding:8px 14px;margin-bottom:4px;margin-left:8px;background:var(--card-bg);border:1px solid var(--border);border-left-width:4px;cursor:pointer" data-trace-expand="' + esc(item.turnId) + '">';
    html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">';
    html += '<span style="font-size:11px;padding:2px 8px;border-radius:10px;' + (TRACE_BADGE_COLORS[cfg.badgeVar] || '') + '">' + cfg.icon + ' ' + cfg.label + '</span>';
    html += '<span style="font-size:11px;font-family:monospace;color:var(--text-dim)">Turn #' + item.turnIndex + '</span>';
    if (item.agentName) {
      html += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);color:var(--text-dim)">' + esc(item.agentName) + '</span>';
    }
    if (item.isSubagent && item.subagentName) {
      html += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(249,115,22,0.12);color:var(--orange)">' + esc(item.subagentName) + '</span>';
    }
    if (item.matchField === 'toolResult') {
      html += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(139,92,246,0.12);color:var(--purple)">🔧 ' + esc(item.toolName || 'tool') + '</span>';
    }
    if (item.matchField === 'toolError') {
      html += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(232,103,107,0.12);color:var(--red)">❌ ' + esc(item.toolName || 'tool') + '</span>';
    }
    html += '<span style="font-size:10px;color:var(--text-dim)">' + formatTraceTs(item.createdAt) + '</span>';
    html += '</div>';

    html += '<div style="font-size:12px;color:var(--text);line-height:1.5">' +
      highlightKeyword(isExpanded ? (item.contentSummary || item.matchContext) : item.matchContext, traceLastKeyword) +
      '</div>';

    if (isExpanded) {
      html += '<div style="margin-top:6px">';
      html += '<button class="card-btn card-btn-sm" data-nav-turn="' + esc(item.turnId) + '">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.viewTurnBtn'))} →</button>';
      html += '</div>';
    }
    html += '</div>';
  }

  container.innerHTML = '<div style="padding:8px 0">' + html + '</div>';

  // Bind expand clicks
  container.querySelectorAll('[data-trace-expand]').forEach(function(el) {
    el.addEventListener('click', function() {
      var tid = this.getAttribute('data-trace-expand');
      if (traceExpandedTurns[tid]) {
        delete traceExpandedTurns[tid];
      } else {
        traceExpandedTurns[tid] = true;
      }
      renderTraceResultsContent();
    });
  });

  // Bind nav buttons
  container.querySelectorAll('[data-nav-turn]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var tid = this.getAttribute('data-nav-turn');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── List View ──

function renderTraceListView(container) {
  var html = '<div style="padding:8px 0">';
  for (var i = 0; i < traceSearchResults.length; i++) {
    var item = traceSearchResults[i];
    var cfg = TRACE_SOURCE_TYPES[item.sourceType] || TRACE_SOURCE_TYPES.model_output;
    html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;background:var(--card-bg)" data-nav-turn="' + esc(item.turnId) + '" class="turn-row">';
    html += '<span style="font-size:11px;font-family:monospace;color:var(--text-dim);min-width:28px">#' + item.turnIndex + '</span>';
    html += '<span style="font-size:11px;padding:1px 6px;border-radius:10px;' + (TRACE_BADGE_COLORS[cfg.badgeVar] || '') + '">' + cfg.icon + '</span>';
    html += '<span style="font-size:10px;color:var(--text-dim);min-width:32px">' + esc(item.agentName || '?') + '</span>';
    html += '<span style="font-size:10px;color:var(--text-dim)">' + formatTraceTs(item.createdAt) + '</span>';
    html += '<span style="font-size:12px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + highlightKeyword(item.matchContext, traceLastKeyword) + '</span>';
    html += '<button class="card-btn card-btn-sm" data-nav-turn="' + esc(item.turnId) + '">→</button>';
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('[data-nav-turn]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var tid = this.getAttribute('data-nav-turn');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── SVG DAG Graph View ──

function renderTraceGraphView(container) {
  var nodes = [];
  for (var i = 0; i < traceSearchResults.length; i++) {
    var item = traceSearchResults[i];
    var medium = i === 0 ? null : inferTraceMedium(traceSearchResults[i - 1], item);
    nodes.push({
      turnIndex: item.turnIndex,
      sourceType: item.sourceType,
      agentName: item.agentName,
      subagentName: item.subagentName,
      medium: medium,
      turnId: item.turnId
    });
  }

  if (nodes.length === 0) {
    container.innerHTML = '<div class="empty-state">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.noNodes'))}</div>';
    return;
  }

  var NODE_R = 11, ORIGIN_R = 15;
  var SPACING_Y = 56;
  var BRANCH_X = 80;
  var LEGEND_H = 80;
  var PAD = { left: 50, right: 100 };

  var hasBranch = false;
  for (var n = 0; n < nodes.length; n++) {
    if (nodes[n].sourceType === 'root_dispatch' || nodes[n].sourceType === 'subagent_output') {
      hasBranch = true; break;
    }
  }

  var mainX = hasBranch ? 140 : 180;
  var branchX = mainX + BRANCH_X;
  var SVG_W = Math.max(360, (hasBranch ? branchX + 120 : mainX + 180));
  var SVG_H = LEGEND_H + nodes.length * SPACING_Y + 40;

  function getNodeX(node) {
    if (node.sourceType === 'root_dispatch') return branchX;
    if (node.sourceType === 'subagent_output') return branchX;
    return mainX;
  }
  function getNodeY(idx) { return LEGEND_H + 24 + idx * SPACING_Y; }

  // Build SVG string
  var svg = '<svg width="' + SVG_W + '" height="' + SVG_H + '" viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" style="display:block;margin:0 auto;max-width:100%">';

  // Background
  svg += '<rect width="' + SVG_W + '" height="' + SVG_H + '" fill="#fafafc" rx="8"/>';

  // Legend background
  svg += '<rect x="8" y="6" width="' + (SVG_W - 16) + '" height="' + (LEGEND_H - 10) + '" fill="#f3f4f6" stroke="var(--border)" stroke-width="1" rx="6"/>';
  svg += '<text x="18" y="24" font-size="10" fill="#888" font-weight="bold">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.legend'))}</text>';

  // Legend items
  var usedTypes = {};
  for (var ut = 0; ut < nodes.length; ut++) { usedTypes[nodes[ut].sourceType] = true; }
  var legendTypes = Object.keys(usedTypes);
  var legendStartX = 18;
  for (var lt = 0; lt < legendTypes.length; lt++) {
    var lcfg = TRACE_SOURCE_TYPES[legendTypes[lt]] || { icon: '?', label: legendTypes[lt], color: '#888' };
    var lx = legendStartX + lt * 100;
    if (lx > SVG_W - 120) break;
    svg += '<circle cx="' + (lx + 8) + '" cy="44" r="7" fill="' + lcfg.color + '20" stroke="' + lcfg.color + '" stroke-width="2"/>';
    svg += '<text x="' + (lx + 18) + '" y="44" font-size="9" fill="#888" dominant-baseline="central">' + lcfg.icon + ' ' + lcfg.label + '</text>';
  }
  svg += '<line x1="18" y1="64" x2="50" y2="64" stroke="#888" stroke-width="2"/>';
  svg += '<text x="54" y="64" font-size="9" fill="#888" dominant-baseline="central">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.legSeqFlow'))}</text>';
  if (hasBranch) {
    svg += '<line x1="110" y1="64" x2="142" y2="64" stroke="#f97316" stroke-width="2" stroke-dasharray="4 2"/>';
    svg += '<text x="146" y="64" font-size="9" fill="#f97316" dominant-baseline="central">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.legDispatch'))}</text>';
  }

  // Nodes and edges
  for (var ni = 0; ni < nodes.length; ni++) {
    var node = nodes[ni];
    var nx = getNodeX(node);
    var ny = getNodeY(ni);
    var ncfg = TRACE_SOURCE_TYPES[node.sourceType] || { color: '#888' };
    var isOrigin = ni === 0;
    var r = isOrigin ? ORIGIN_R : NODE_R;

    // Edge from previous
    if (ni > 0) {
      var prev = nodes[ni - 1];
      var px = getNodeX(prev);
      var py = getNodeY(ni - 1);
      var prevR = (ni - 1 === 0) ? ORIGIN_R : NODE_R;
      var isCross = px !== nx;
      svg += '<line x1="' + px + '" y1="' + (py + prevR) + '" x2="' + nx + '" y2="' + (ny - r) + '" ' +
        'stroke="' + (isCross ? '#f97316' : '#888') + '" stroke-width="2" ' +
        (isCross ? 'stroke-dasharray="4 2" ' : '') + '/>';
      // Medium label
      if (node.medium) {
        var medCfg = TRACE_MEDIUMS[node.medium];
        if (medCfg) {
          var mx = (px + nx) / 2;
          var my = (py + ny) / 2;
          svg += '<text x="' + mx + '" y="' + (my - 4) + '" text-anchor="middle" font-size="7" fill="#888">' + medCfg.label + '</text>';
        }
      }
    }

    // Node circle
    svg += '<circle cx="' + nx + '" cy="' + ny + '" r="' + r + '" fill="' + (isOrigin ? ncfg.color : ncfg.color + '20') + '" ' +
      'stroke="' + ncfg.color + '" stroke-width="' + (isOrigin ? 3 : 2) + '" ' +
      'style="cursor:pointer" data-graph-node="' + esc(node.turnId) + '"/>';

    // Turn index inside circle
    svg += '<text x="' + nx + '" y="' + ny + '" text-anchor="middle" dominant-baseline="central" ' +
      'font-size="' + (isOrigin ? 10 : 9) + '" fill="' + (isOrigin ? '#fff' : ncfg.color) + '" font-weight="bold">' + node.turnIndex + '</text>';

    // Label
    svg += '<text x="' + (nx + r + 4) + '" y="' + ny + '" text-anchor="start" dominant-baseline="central" ' +
      'font-size="9" fill="#888">' + (node.agentName || '') + '</text>';

    // Origin label (left side)
    if (isOrigin) {
      svg += '<text x="' + (nx - r - 6) + '" y="' + ny + '" text-anchor="end" dominant-baseline="central" ' +
        'font-size="10" fill="#10b981" font-weight="bold">${(0, shared_1.escHtml)((0, i18n_1.t)('trace.origin'))} #' + node.turnIndex + '</text>';
    }
  }

  svg += '</svg>';

  container.innerHTML = '<div style="padding:12px 0;overflow-x:auto">' + svg + '</div>';

  // Click handler for SVG nodes
  container.querySelectorAll('[data-graph-node]').forEach(function(el) {
    el.addEventListener('click', function() {
      var tid = this.getAttribute('data-graph-node');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── Tab initialization ──

function initTraceTab() {
  var searchInput = document.getElementById('traceSearchInput');
  var searchBtn = document.getElementById('traceSearchBtn');
  if (!searchInput || !searchBtn) return;

  searchBtn.addEventListener('click', doTraceSearch);
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doTraceSearch();
  });

  renderTraceExamples();
}

// ── Navigation listeners ──

if (window.__kirinai) {
  window.__kirinai.on('navigate:trace', function(params) {
    if (params && params.searchQuery) {
      var input = document.getElementById('traceSearchInput');
      if (input) {
        input.value = params.searchQuery;
        doTraceSearch();
      }
    }
    if (params && params.turnId) {
      setTimeout(function() {
        var input = document.getElementById('traceSearchInput');
        if (input) { input.value = '#' + params.turnId; doTraceSearch(); }
      }, 100);
    }
  });
}
`;
}
//# sourceMappingURL=trace.js.map