// Trace tab — search + propagation chain + DAG view.
// Phase 2 will flesh out the SVG DAG; Phase 1 provides search + structured view.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderTraceTab(): string {
  return `
<div id="tab-trace" class="tab-panel">
  <div class="chart-container">
    <div class="chart-title">${'🔍 ' + escHtml(t('trace.title'))}</div>
    <div style="margin-bottom:12px;display:flex;gap:8px">
      <input id="traceSearchInput" type="text" placeholder="${escHtml(t('trace.searchPlaceholder'))}"
        style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:13px;font-family:inherit">
      <button id="traceSearchBtn" class="card-btn" style="padding:8px 16px;font-size:13px">${escHtml(t('trace.searchButton'))}</button>
    </div>
    <div id="traceSearchResults" style="max-height:500px;overflow-y:auto"></div>
  </div>
  <div class="chart-container" style="margin-top:12px">
    <div class="chart-title">${'📡 ' + escHtml(t('trace.propagationTitle'))}</div>
    <div id="tracePropagationView">
      <div class="empty-state"><div class="icon">🔗</div>${escHtml(t('trace.propagationEmpty'))}</div>
    </div>
  </div>
</div>`;
}

export function renderTraceJS(): string {
  return `
// ── Trace Search ──
var traceSearchResults = [];
var traceBridges = [];

function initTraceTab() {
  var searchInput = document.getElementById('traceSearchInput');
  var searchBtn = document.getElementById('traceSearchBtn');

  if (!searchInput || !searchBtn) return;

  function doSearch() {
    var query = (searchInput.value || '').trim().toLowerCase();
    var resultsContainer = document.getElementById('traceSearchResults');
    if (!resultsContainer) return;

    if (!query) {
      // Show recent assistant turns as default view
      var recentHtml = '<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">' + __('trace.recentHint') + '</div>';
      var count = 0;
      for (var i = turns.length - 1; i >= 0 && count < 20; i--) {
        var t = turns[i];
        if (t.role !== 'assistant') continue;
        count++;
        var idx = t.turnIndex != null ? t.turnIndex : i;
        recentHtml += '<div class="tool-call-item" data-trace-turn="' + esc(t.id) + '" style="cursor:pointer">' +
          '#' + (idx + 1) + ' ' + esc(t.contentSummary || '') +
          ' <span style="color:var(--text-dim)">(' + fmt(t.totalTokens) + ' tk)</span>' +
          '</div>';
      }
      resultsContainer.innerHTML = recentHtml;
    } else {
      // Search through turns
      traceSearchResults = [];
      for (var j = 0; j < turns.length; j++) {
        var st = turns[j];
        var matchField = '';
        var matchContext = '';
        var qIdx = st.turnIndex != null ? st.turnIndex : j;

        if ((st.contentSummary || '').toLowerCase().indexOf(query) >= 0) {
          matchField = 'summary';
          matchContext = (st.contentSummary || '').substring(0, 120);
        } else if ((st.content || '').toLowerCase().indexOf(query) >= 0) {
          matchField = 'content';
          var idx2 = (st.content || '').toLowerCase().indexOf(query);
          matchContext = '...' + (st.content || '').substring(Math.max(0, idx2 - 40), idx2 + query.length + 80) + '...';
        }

        // Search tool calls
        if (!matchField && st.toolCalls) {
          for (var k = 0; k < st.toolCalls.length; k++) {
            if ((st.toolCalls[k].toolName || '').toLowerCase().indexOf(query) >= 0) {
              matchField = 'toolCall';
              matchContext = 'Tool: ' + st.toolCalls[k].toolName;
              break;
            }
            if ((st.toolCalls[k].resultJson || '').toLowerCase().indexOf(query) >= 0) {
              matchField = 'toolResult';
              matchContext = 'Tool: ' + st.toolCalls[k].toolName + ' result matches';
              break;
            }
          }
        }

        if (matchField) {
          traceSearchResults.push({ turn: st, matchField: matchField, matchContext: matchContext });
        }
      }

      if (traceSearchResults.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state"><div class="icon">🔍</div>' + __('trace.noResults', esc(query)) + '</div>';
      } else {
        var html = '<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">' + __('trace.resultCount', traceSearchResults.length) + '</div>';
        for (var r = 0; r < traceSearchResults.length; r++) {
          var sr = traceSearchResults[r];
          var st2 = sr.turn;
          html += '<div class="tool-call-item" data-trace-turn="' + esc(st2.id) + '" style="cursor:pointer;margin-bottom:4px">' +
            '<span style="color:var(--text-dim)">#' + ((st2.turnIndex || 0) + 1) + '</span> ' +
            '<span style="font-size:10px;color:var(--orange)">[' + sr.matchField + ']</span> ' +
            esc(sr.matchContext) +
            '</div>';
        }
        resultsContainer.innerHTML = html;
      }
    }

    // Click on results → show propagation chain
    resultsContainer.querySelectorAll('[data-trace-turn]').forEach(function(item) {
      item.addEventListener('click', function() {
        var tid = this.getAttribute('data-trace-turn');
        showPropagationChain(tid);
      });
    });
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSearch();
  });

  // Initial load
  doSearch();
}

function showPropagationChain(turnId) {
  var view = document.getElementById('tracePropagationView');
  if (!view) return;

  var turn = null;
  for (var i = 0; i < turns.length; i++) {
    if (turns[i].id === turnId) { turn = turns[i]; break; }
  }
  if (!turn) { view.innerHTML = '<div class="empty-state">' + __('trace.turnNotFound') + '</div>'; return; }

  // Build propagation chain: show this turn + its tool calls + connected turns
  var html = '<div style="font-size:12px;font-weight:600;margin-bottom:12px;color:var(--text)">';
  html += __('trace.propagationFrom', (turn.turnIndex || 0) + 1, esc(turn.role));
  html += '</div>';

  // This turn info
  html += '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:10px">';
  html += '<div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:6px">📤 ' + __('trace.sourceTurn') + '</div>';
  html += '<div style="font-size:12px">' + esc(turn.contentSummary || __('trace.noSummary')) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-dim);margin-top:4px">' + fmt(turn.totalTokens) + ' tokens · ' + fmtMs(turn.latencyMs) + '</div>';
  html += '</div>';

  // Tool calls from this turn
  if (turn.toolCalls && turn.toolCalls.length > 0) {
    html += '<div style="font-size:11px;color:var(--text-dim);margin:8px 0">↓ ' + __('trace.toolCallsCount', turn.toolCalls.length) + '</div>';
    for (var ti = 0; ti < turn.toolCalls.length; ti++) {
      var tc = turn.toolCalls[ti];
      var stateColor = (tc.state === 'ok' || tc.state === 'completed') ? 'var(--green)' : 'var(--red)';
      html += '<div class="tool-call-item" style="margin-left:12px;margin-bottom:4px">' +
        '<span class="tool-name">' + esc(tc.toolName) + '</span> ' +
        '<span style="color:' + stateColor + '">[' + esc(tc.state) + ']</span>' +
        (tc.durationMs > 0 ? ' <span style="color:var(--text-dim)">' + fmtMs(tc.durationMs) + '</span>' : '') +
        '</div>';
    }
  }

  // Find related turns (same subagent session, or containing this turn's tool call IDs)
  var relatedTurns = [];
  if (turn.subagentSessionId) {
    for (var ri = 0; ri < turns.length; ri++) {
      if (turns[ri].id !== turn.id && turns[ri].subagentSessionId === turn.subagentSessionId) {
        relatedTurns.push(turns[ri]);
      }
    }
  }
  if (relatedTurns.length > 0) {
    html += '<div style="font-size:11px;color:var(--text-dim);margin:8px 0">↔ ' + __('trace.relatedTurns', relatedTurns.length) + '</div>';
    for (var rr = 0; rr < Math.min(relatedTurns.length, 10); rr++) {
      var rt = relatedTurns[rr];
      html += '<div class="tool-call-item" data-trace-turn="' + esc(rt.id) + '" style="cursor:pointer;margin-left:12px;margin-bottom:4px;border-left-color:var(--purple)">' +
        '#' + ((rt.turnIndex || 0) + 1) + ' ' + esc(rt.role) + ' ' + esc(rt.contentSummary || '') +
        '</div>';
    }
  }

  // Button to navigate to turns tab
  html += '<div style="margin-top:12px">' +
    '<button class="card-btn" data-nav-turn="' + esc(turn.id) + '">📋 ' + __('trace.viewInTurns') + '</button>' +
    '</div>';

  view.innerHTML = html;

  // Re-bind click handlers
  view.querySelectorAll('[data-trace-turn]').forEach(function(item) {
    item.addEventListener('click', function() {
      var tid = this.getAttribute('data-trace-turn');
      showPropagationChain(tid);
    });
  });

  // Bind nav button
  view.querySelectorAll('[data-nav-turn]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tid = this.getAttribute('data-nav-turn');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── Tab init ──
function initTraceSearch() { initTraceTab(); }

// ── Navigation listeners ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:trace', function(params) {
    if (params && params.searchQuery) {
      var input = document.getElementById('traceSearchInput');
      if (input) {
        input.value = params.searchQuery;
        initTraceTab();
      }
    }
    if (params && params.turnId) {
      setTimeout(function() { showPropagationChain(params.turnId); }, 100);
    }
  });
}
`;
}
