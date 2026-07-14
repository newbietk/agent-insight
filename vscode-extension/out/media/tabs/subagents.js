"use strict";
// Subagents tab — subagent cards grouped by session.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSubagentsTab = renderSubagentsTab;
exports.renderSubagentsJS = renderSubagentsJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderSubagentsTab() {
    return `
<div id="tab-subagents" class="tab-panel">
  <div class="cards" id="subagentsCards"></div>
  <div class="table-wrap" style="margin-top:12px">
    <div class="table-header">${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.title'))}</div>
    <div style="max-height: 500px; overflow-y: auto;">
      <table>
        <thead><tr>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colAgentName'))}</th>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colSessionId'))}</th>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colTurns'))}</th>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colTokens'))}</th>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colCost'))}</th>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colLatency'))}</th>
          <th>${(0, shared_1.escHtml)((0, i18n_1.t)('subagents.colModel'))}</th>
        </tr></thead>
        <tbody id="subagentsTableBody"></tbody>
      </table>
    </div>
  </div>
</div>`;
}
function renderSubagentsJS() {
    return `
// ── Subagents Tab ──
function renderSubagents() {
  // Group turns by subagentSessionId
  var subagentGroups = {};
  var rootTurns = [];
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (t.isSubagent && t.subagentSessionId) {
      if (!subagentGroups[t.subagentSessionId]) {
        subagentGroups[t.subagentSessionId] = {
          sessionId: t.subagentSessionId,
          agentName: t.agentName || t.subagentName || 'unknown',
          turns: [],
          totalTokens: 0,
          totalCost: 0,
          totalLatencyMs: 0,
          model: t.model || 'unknown'
        };
      }
      var g = subagentGroups[t.subagentSessionId];
      g.turns.push(t);
      g.totalTokens += toNumber(t.totalTokens);
      g.totalLatencyMs += toNumber(t.latencyMs);
      if (t.model) g.model = t.model;
    } else if (!t.isSubagent) {
      rootTurns.push(t);
    }
  }

  // Summary cards
  var cards = document.getElementById('subagentsCards');
  if (cards) {
    var groupKeys = Object.keys(subagentGroups);
    var totalSubTurns = 0, totalSubTokens = 0;
    groupKeys.forEach(function(k) {
      totalSubTurns += subagentGroups[k].turns.length;
      totalSubTokens += subagentGroups[k].totalTokens;
    });

    cards.innerHTML = [
      {label:__('subagents.cardSessions'), val:String(groupKeys.length), cls:'', sub:''},
      {label:__('subagents.cardTurns'), val:String(totalSubTurns), cls:'tokens', sub:__('subagents.rootTurnsSub', rootTurns.length)},
      {label:__('subagents.cardTokens'), val:fmt(totalSubTokens), cls:'tokens', sub:''},
      {label:__('subagents.cardRootTurns'), val:String(rootTurns.length), cls:'', sub:__('subagents.mainAgentSub')},
    ].map(function(c) {
      return '<div class="card"><div class="card-label">'+c.label+'</div><div class="card-value '+c.cls+'" style="font-size:20px">'+c.val+'</div><div class="card-sub">'+c.sub+'</div></div>';
    }).join('');
  }

  // Table
  var tbody = document.getElementById('subagentsTableBody');
  if (!tbody) return;

  var sorted = groupKeys.sort(function(a, b) {
    return subagentGroups[b].totalTokens - subagentGroups[a].totalTokens;
  });

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:24px">' + __('subagents.noSessions') + '</td></tr>';
    return;
  }

  var html = '';
  for (var si = 0; si < sorted.length; si++) {
    var g = subagentGroups[sorted[si]];
    var sidShort = g.sessionId ? g.sessionId.substring(0, 12) : '—';
    var costStr = '—';
    html += '<tr class="turn-row" data-subagent-session="' + esc(g.sessionId) + '" style="cursor:pointer">' +
      '<td style="font-weight:600;color:var(--accent)">' + esc(g.agentName) + '</td>' +
      '<td style="color:var(--text-dim);font-family:monospace;font-size:11px">' + esc(sidShort) + '</td>' +
      '<td>' + g.turns.length + '</td>' +
      '<td>' + fmt(g.totalTokens) + '</td>' +
      '<td>' + costStr + '</td>' +
      '<td>' + fmtMs(g.totalLatencyMs) + '</td>' +
      '<td style="color:var(--text-dim);max-width:120px;overflow:hidden;text-overflow:ellipsis">' + esc(g.model || '—') + '</td>' +
    '</tr>';
  }
  tbody.innerHTML = html;

  // Click → filter turns tab
  tbody.querySelectorAll('.turn-row[data-subagent-session]').forEach(function(row) {
    row.addEventListener('click', function() {
      var sid = this.getAttribute('data-subagent-session');
      if (sid && window.__kirinai) {
        window.__kirinai.navigate('turns', { subagentSessionId: sid });
      }
    });
  });
}

// ── Navigation listeners ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:subagents', function(params) {
    // Re-render if needed
    renderSubagents();
  });
}
`;
}
//# sourceMappingURL=subagents.js.map