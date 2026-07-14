// Turns tab — two-column layout: turn cards (left) + merged detail/context panel (right).
// Upper: context composition stacked bar by role (system/user/assistant/tool).
// Lower: turn detail + expandable message list when a role segment is clicked.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderTurnsTab(): string {
  return `
<div id="tab-turns" class="tab-panel">
  <div class="turns-layout">
    <!-- Left column: turn cards -->
    <div class="turns-left">
      <div class="turns-left-header">
        <span>${escHtml(t('detail.allTurns'))}</span>
        <span style="font-size:10px;color:var(--text-dim);font-weight:400">${escHtml(t('detail.clickRowHint'))}</span>
      </div>
      <div class="turns-card-list" id="turnsCardList"></div>
    </div>

    <!-- Right column: merged context + detail -->
    <div class="turns-main" id="turnsMain">
      <div class="empty-state" id="turnsMainEmpty">
        <div class="icon">💬</div>
        <div>${escHtml(t('turns.selectTurnHint'))}</div>
      </div>
      <div id="turnMergedPanel" style="display:none">
        <!-- Context composition chart -->
        <div class="ctx-composition" id="ctxCompositionChart"></div>
        <!-- Expandable message list -->
        <div id="ctxMessageList" style="display:none"></div>
        <!-- Turn detail -->
        <div id="turnDetailPanel"></div>
      </div>
    </div>
  </div>
</div>`;
}

export function renderTurnsJS(): string {
  return `
// ── Turns Tab — Two-column layout ──

// Track currently selected turn and active context role filter
var selectedTurnId = null;
var activeCtxRole = null; // which role's messages are expanded: 'system'|'user'|'assistant'|'tool'|null

// Role color mapping for context composition
var ROLE_COLORS = {
  system: '#c586c0',
  user: '#4ec9b0',
  assistant: '#569cd6',
  tool: '#dcdcaa'
};
var ROLE_ICONS = {
  system: '⚙️',
  user: '👤',
  assistant: '🤖',
  tool: '🔧'
};

function renderTurnCards(filterSubagentSessionId) {
  var list = document.getElementById('turnsCardList');
  if (!list) return;

  var html = '';
  var filtered = [];
  for (var i = 0; i < turns.length; i++) {
    if (filterSubagentSessionId) {
      if (turns[i].subagentSessionId !== filterSubagentSessionId) continue;
    }
    filtered.push(turns[i]);
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:24px"><div class="icon">📭</div>' + __('turns.noTurns') + '</div>';
    return;
  }

  for (var i = 0; i < filtered.length; i++) {
    var t = filtered[i];
    var roleColor = t.role === 'assistant' ? '#569cd6' : t.role === 'user' ? '#4ec9b0' : '#888';
    var roleIcon = t.role === 'assistant' ? '🤖' : t.role === 'user' ? '👤' : '💬';
    var totalCache = toNumber(t.cacheReadTokens) + toNumber(t.cacheWriteTokens);
    var pctStr = t.contextWindowPct != null ? toNumber(t.contextWindowPct).toFixed(0) + '%' : '';
    var pctColor = '';
    if (t.contextWindowPct != null) {
      var cp = toNumber(t.contextWindowPct);
      if (cp > 80) pctColor = 'color:var(--red)';
      else if (cp > 60) pctColor = 'color:var(--orange)';
      else if (cp > 40) pctColor = 'color:var(--yellow)';
      else pctColor = 'color:var(--green)';
    }

    var selectedCls = (selectedTurnId === t.id) ? ' selected' : '';
    html += '<div class="turn-card' + selectedCls + '" data-turn-id="' + esc(t.id) + '">' +
      '<div class="turn-card-top">' +
        '<span class="turn-card-role" style="color:' + roleColor + '">' + roleIcon + ' ' + esc(t.role) + (t.isSubagent ? ' 🖥' : '') + '</span>' +
        '<span class="turn-card-index">#' + (t.turnIndex + 1) + '</span>' +
      '</div>' +
      '<div class="turn-card-summary">' + esc(t.contentSummary || __('turns.noSummary')) + '</div>' +
      '<div class="turn-card-meta">' +
        '<span class="turn-card-tokens">' + fmt(t.totalTokens) + ' tk</span>' +
        '<span class="turn-card-latency">' + fmtMs(t.latencyMs) + '</span>' +
        (pctStr ? '<span class="turn-card-ctx" style="' + pctColor + '">' + pctStr + '</span>' : '') +
      '</div>' +
    '</div>';
  }
  list.innerHTML = html;

  list.querySelectorAll('.turn-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.card-btn')) return;
      var tid = this.getAttribute('data-turn-id');
      if (tid) selectTurn(tid);
    });
  });

}

function selectTurn(turnId) {
  selectedTurnId = turnId;
  activeCtxRole = null;

  var cards = document.querySelectorAll('.turn-card');
  cards.forEach(function(c) {
    c.classList.remove('selected');
    if (c.getAttribute('data-turn-id') === turnId) c.classList.add('selected');
  });

  renderMergedPanel(turnId);
}

// ── Build context message list from prior turns in same scope ──
function buildContextMessages(turnId) {
  var targetTurn = null;
  var targetIdx = -1;
  for (var i = 0; i < turns.length; i++) {
    if (turns[i].id === turnId) { targetTurn = turns[i]; targetIdx = i; break; }
  }
  if (!targetTurn) return null;

  var scope = targetTurn.subagentSessionId || '__root__';
  var messages = [];

  // Collect prior turns in the same scope
  for (var j = 0; j < targetIdx; j++) {
    var t = turns[j];
    var tScope = t.subagentSessionId || '__root__';
    if (tScope !== scope) continue;

    // System messages
    if (t.role === 'system') {
      messages.push({
        role: 'system',
        turnId: t.id,
        turnIndex: t.turnIndex,
        content: t.content || '',
        summary: t.contentSummary || '',
        tokenEstimate: Math.round((t.content || '').length / 3.5)
      });
    }

    // User messages
    if (t.role === 'user') {
      messages.push({
        role: 'user',
        turnId: t.id,
        turnIndex: t.turnIndex,
        content: t.content || '',
        summary: t.contentSummary || '',
        tokenEstimate: Math.round((t.content || '').length / 3.5)
      });
    }

    // Prior assistant turns
    if (t.role === 'assistant' && t.id !== turnId) {
      // Add the assistant content as a message
      var astContent = t.content || '';
      messages.push({
        role: 'assistant',
        turnId: t.id,
        turnIndex: t.turnIndex,
        content: astContent,
        summary: t.contentSummary || '',
        tokenEstimate: Math.round(astContent.length / 3.5)
      });

      // Add tool call results as separate messages
      if (t.toolCalls && t.toolCalls.length > 0) {
        for (var k = 0; k < t.toolCalls.length; k++) {
          var tc = t.toolCalls[k];
          var tcResult = tc.resultJson || '';
          messages.push({
            role: 'tool',
            turnId: t.id,
            turnIndex: t.turnIndex,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            content: tcResult,
            summary: 'Tool: ' + (tc.toolName || 'unknown') + ' [' + (tc.state || '?') + ']',
            tokenEstimate: Math.round(tcResult.length / 3.5)
          });
        }
      }
    }
  }

  // Group by role
  var groups = {};
  var totalEstimated = 0;
  for (var m = 0; m < messages.length; m++) {
    var msg = messages[m];
    if (!groups[msg.role]) {
      groups[msg.role] = { role: msg.role, messages: [], totalEstimate: 0 };
    }
    groups[msg.role].messages.push(msg);
    groups[msg.role].totalEstimate += msg.tokenEstimate;
    totalEstimated += msg.tokenEstimate;
  }

  // Compute overhead
  var reportedInput = toNumber(targetTurn.inputMessagesTokens);
  var overhead = reportedInput > 0 ? Math.max(0, reportedInput - totalEstimated) : 0;

  return {
    turn: targetTurn,
    messages: messages,
    groups: groups,
    totalEstimated: totalEstimated,
    reportedInput: reportedInput,
    overhead: overhead
  };
}

// ── Render merged panel (context chart + detail) ──
function renderMergedPanel(turnId) {
  var panel = document.getElementById('turnMergedPanel');
  var empty = document.getElementById('turnsMainEmpty');
  if (!panel || !empty) return;

  var ctxData = buildContextMessages(turnId);
  if (!ctxData) {
    panel.style.display = 'none';
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  panel.style.display = '';

  var turn = ctxData.turn;

  // ── Render context composition chart ──
  renderContextChart(ctxData);

  // ── Render message list if a role is active ──
  renderContextMessageList(ctxData);

  // ── Render turn detail ──
  renderTurnDetail(turn);
}

// ── Context composition stacked bar ──
function renderContextChart(ctxData) {
  var container = document.getElementById('ctxCompositionChart');
  if (!container) return;

  var turn = ctxData.turn;
  var groups = ctxData.groups;
  var roleOrder = ['system', 'user', 'assistant', 'tool'];
  var ctxPct = turn.contextWindowPct != null ? toNumber(turn.contextWindowPct) : 0;

  var barColor = '#4ec9b0';
  var barLabel = __('turns.ctxLow');
  if (ctxPct > 80) { barColor = '#f14c4c'; barLabel = __('turns.ctxCritical'); }
  else if (ctxPct > 60) { barColor = '#ce9178'; barLabel = __('turns.ctxHigh'); }
  else if (ctxPct > 40) { barColor = '#dcdcaa'; barLabel = __('turns.ctxMedium'); }

  var html = '';

  // Header
  html += '<div class="ctx-comp-header">📊 ' + __('turns.contextComposition') + ' — ' + __('turnDetail.turn') + ' #' + (turn.turnIndex + 1) + '</div>';

  // Context usage bar
  html += '<div class="ctx-comp-section">';
  html += '<div class="ctx-comp-label">' + __('context.contextLimit') + ' <span style="color:' + barColor + '">' + barLabel + ' (' + ctxPct.toFixed(1) + '%)</span></div>';
  html += '<div class="ctx-usage-bar-outer">';
  html += '<div class="ctx-usage-bar-inner" style="width:' + Math.min(ctxPct, 100).toFixed(1) + '%; background:' + barColor + '"></div>';
  html += '</div>';
  html += '</div>';

  // Role breakdown stacked bar
  html += '<div class="ctx-comp-section">';
  html += '<div class="ctx-comp-label">' + __('turns.inputContextBreakdown') + ' (' + fmt(ctxData.reportedInput) + ' ' + __('common.tokens') + ')</div>';

  // Build segments for the stacked bar
  var barTotal = ctxData.reportedInput > 0 ? ctxData.reportedInput : (ctxData.totalEstimated + ctxData.overhead);
  html += '<div class="ctx-role-bar">';
  var hasAny = false;
  for (var ri = 0; ri < roleOrder.length; ri++) {
    var role = roleOrder[ri];
    var grp = groups[role];
    if (grp && grp.totalEstimate > 0) {
      hasAny = true;
      var pct = barTotal > 0 ? (grp.totalEstimate / barTotal * 100).toFixed(1) : '0';
      var activeCls = (activeCtxRole === role) ? ' ctx-role-seg-active' : '';
      html += '<div class="ctx-role-seg' + activeCls + '" data-ctx-role="' + role + '" ' +
        'style="width:' + pct + '%; background:' + (ROLE_COLORS[role] || '#888') + '" ' +
        'title="' + esc(role) + ': ' + fmt(grp.totalEstimate) + ' tokens (' + pct + '%)"></div>';
    }
  }
  // Overhead segment (system prompt + unaccounted tokens)
  if (ctxData.overhead > 0) {
    hasAny = true;
    var ohPct = barTotal > 0 ? (ctxData.overhead / barTotal * 100).toFixed(1) : '0';
    html += '<div class="ctx-role-seg ctx-role-seg-overhead" ' +
      'style="width:' + ohPct + '%; background: repeating-linear-gradient(45deg, rgba(180,180,180,0.2), rgba(180,180,180,0.2) 3px, transparent 3px, transparent 6px), rgba(255,255,255,0.04)" ' +
      'title="' + esc(__('turns.overheadTooltip', fmt(ctxData.overhead))) + '"></div>';
  }
  if (!hasAny) {
    html += '<div class="ctx-role-seg" style="flex:1;background:rgba(255,255,255,0.04)" title="' + esc(__('turns.noContextData')) + '"></div>';
  }
  html += '</div>';

  // Legend
  html += '<div class="ctx-legend ctx-legend-clickable">';
  for (var li = 0; li < roleOrder.length; li++) {
    var r2 = roleOrder[li];
    var g2 = groups[r2];
    if (g2 && g2.totalEstimate > 0) {
      var activeLegend = (activeCtxRole === r2) ? ' ctx-legend-active' : '';
      html += '<div class="ctx-legend-item ctx-legend-role' + activeLegend + '" data-ctx-role="' + r2 + '">' +
        '<span class="ctx-legend-dot" style="background:' + (ROLE_COLORS[r2] || '#888') + '"></span>' +
        ROLE_ICONS[r2] + ' ' + esc(r2) + ': ' + fmt(g2.totalEstimate) + ' tk · ' + g2.messages.length + ' ' + __('turns.messages') +
      '</div>';
    }
  }
  if (ctxData.overhead > 0) {
    html += '<div class="ctx-legend-item">' +
      '<span class="ctx-legend-dot" style="background:rgba(180,180,180,0.4);border:1px dashed rgba(255,255,255,0.2)"></span>' +
      __('turns.overhead') + ': ~' + fmt(ctxData.overhead) + ' tk' +
    '</div>';
  }
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  // Click on role segments or legend items to toggle message list
  container.querySelectorAll('[data-ctx-role]').forEach(function(el) {
    el.addEventListener('click', function() {
      var role = this.getAttribute('data-ctx-role');
      if (activeCtxRole === role) {
        activeCtxRole = null; // toggle off
      } else {
        activeCtxRole = role;
      }
      // Re-render the chart and message list
      renderContextChart(ctxData);
      renderContextMessageList(ctxData);
      // Scroll to message list
      var msgList = document.getElementById('ctxMessageList');
      if (msgList && activeCtxRole) {
        setTimeout(function() { msgList.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
      }
    });
  });
}

// ── Expandable message list for active role ──
function renderContextMessageList(ctxData) {
  var container = document.getElementById('ctxMessageList');
  if (!container) return;

  if (!activeCtxRole) {
    container.style.display = 'none';
    return;
  }

  var groups = ctxData.groups;
  var grp = groups[activeCtxRole];
  if (!grp || grp.messages.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';

  var html = '<div class="ctx-msg-section">';
  html += '<div class="ctx-msg-section-header">' +
    ROLE_ICONS[activeCtxRole] + ' ' + esc(activeCtxRole) + ' — ' +
    grp.messages.length + ' ' + __('turns.messages') + ' · ' + fmt(grp.totalEstimate) + ' ' + __('turns.estTokens') +
    '<button class="card-btn card-btn-sm" style="margin-left:12px" data-action="close-msgs">✕ ' + esc(__('common.cancel') || 'Close') + '</button>' +
  '</div>';

  for (var mi = 0; mi < grp.messages.length; mi++) {
    var msg = grp.messages[mi];
    var msgId = 'ctxMsg_' + activeCtxRole + '_' + mi;
    var contentPreview = msg.content || '';
    if (contentPreview.length > 200) contentPreview = contentPreview.substring(0, 200) + '...';

    html += '<div class="ctx-msg-card">';
    // Header row
    html += '<div class="ctx-msg-card-header" data-target="' + msgId + '">';
    html += '<div class="ctx-msg-card-left">';
    if (activeCtxRole === 'tool') {
      html += '<span class="ctx-msg-tool-name">' + esc(msg.toolName || 'tool') + '</span>';
    }
    html += '<span class="ctx-msg-role-tag" style="color:' + (ROLE_COLORS[activeCtxRole] || '#888') + '">#' + (msg.turnIndex + 1) + '</span>';
    html += '<span class="ctx-msg-summary">' + esc(msg.summary || msg.contentPreview || '').substring(0, 120) + '</span>';
    html += '</div>';
    html += '<div class="ctx-msg-card-right">';
    html += '<span class="ctx-msg-tokens">~' + fmt(msg.tokenEstimate) + ' tk</span>';
    html += '<span class="ctx-expand-arrow">▶</span>';
    html += '</div>';
    html += '</div>';
    // Expandable body
    html += '<div class="ctx-msg-card-body" id="' + msgId + '" style="display:none">';
    if (msg.content) {
      html += '<pre class="ctx-msg-content">' + esc(msg.content) + '</pre>';
    } else {
      html += '<div style="color:var(--text-dim);font-style:italic">' + esc(__('turns.noContent')) + '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  // Bind expandable cards
  container.querySelectorAll('.ctx-msg-card-header').forEach(function(header) {
    header.addEventListener('click', function() {
      var targetId = this.getAttribute('data-target');
      var body = document.getElementById(targetId);
      var arrow = this.querySelector('.ctx-expand-arrow');
      if (body) {
        var isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
      }
    });
  });

  // Close button
  container.querySelectorAll('[data-action="close-msgs"]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      activeCtxRole = null;
      renderContextChart(ctxData);
      renderContextMessageList(ctxData);
    });
  });
}

// ── Turn detail (lower section) ──
function renderTurnDetail(turn) {
  var panel = document.getElementById('turnDetailPanel');
  if (!panel) return;

  var html = '<div class="turn-detail">';

  // Content
  if (turn.content) {
    var contentText = turn.content.length > 8000 ? turn.content.substring(0, 8000) + '\\n\\n... [' + __('turns.truncated') + ']' : turn.content;
    html += '<div class="turn-detail-section">';
    html += '<div class="turn-detail-section-title">📝 ' + __('turns.content') + '</div>';
    html += '<div class="turn-content">' + esc(contentText) + '</div>';
    html += '</div>';
  }

  // Tool calls
  if (turn.toolCalls && turn.toolCalls.length > 0) {
    html += '<div class="turn-detail-section">';
    html += '<div class="turn-detail-section-title">🔧 ' + __('turnDetail.toolCalls', turn.toolCalls.length) + '</div>';
    for (var ti = 0; ti < turn.toolCalls.length; ti++) {
      var tc = turn.toolCalls[ti];
      var stateCls = (tc.state === 'ok' || tc.state === 'completed') ? 'tool-state-ok' : 'tool-state-error';
      html += '<div class="tool-call-item" data-tc-id="' + esc(tc.toolCallId) + '" style="cursor:pointer">' +
        '<span class="tool-name">' + esc(tc.toolName) + '</span> ' +
        '<span class="' + stateCls + '">[' + esc(tc.state) + ']</span>' +
        (tc.durationMs > 0 ? ' <span style="color:var(--text-dim)">' + fmtMs(tc.durationMs) + '</span>' : '') +
        (tc.errorType ? ' <span style="color:var(--red)">' + esc(tc.errorType) + '</span>' : '') +
      '</div>';
    }
    html += '</div>';
  }

  // Skill events
  if (turn.skillEvents && turn.skillEvents.length > 0) {
    html += '<div class="turn-detail-section">';
    html += '<div class="turn-detail-section-title">🧩 ' + __('turnDetail.skillEvents', turn.skillEvents.length) + '</div>';
    for (var si = 0; si < turn.skillEvents.length; si++) {
      var se = turn.skillEvents[si];
      html += '<div class="tool-call-item" style="border-left-color:var(--purple);cursor:pointer" data-skill="' + esc(se.skillName) + '">' +
        esc(se.skillName) + ' [' + se.eventType + '] ' +
        (se.success ? '✅' : '❌') + ' ' + fmtMs(se.durationMs) +
      '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  panel.innerHTML = html;

  // Click on skill event → navigate to Skills
  panel.querySelectorAll('.tool-call-item[data-skill]').forEach(function(item) {
    item.addEventListener('click', function() {
      var sk = this.getAttribute('data-skill');
      if (sk && window.__kirinai) {
        window.__kirinai.navigate('skills', { skillName: sk });
      }
    });
  });
}

// ── Navigation listeners for turns tab ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:turns', function(params) {
    if (params && params.subagentSessionId) {
      renderTurnCards(params.subagentSessionId);
    }
    if (params && params.turnId) {
      renderTurnCards(null);
      setTimeout(function() {
        var card = document.querySelector('.turn-card[data-turn-id="' + esc(params.turnId) + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          selectTurn(params.turnId);
        }
      }, 50);
    }
  });
}
`;
}
