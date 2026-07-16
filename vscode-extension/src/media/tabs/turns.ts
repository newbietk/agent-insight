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
    var subagentCls = t.isSubagent ? ' turn-card-subagent' : '';
    html += '<div class="turn-card' + selectedCls + subagentCls + '" data-turn-id="' + esc(t.id) + '">' +
      '<div class="turn-card-top">' +
        '<span class="turn-card-role" style="color:' + roleColor + '">' + roleIcon + ' ' + esc(t.role) + '</span>' +
        '<span class="turn-card-index">#' + (t.turnIndex + 1) + '</span>' +
      '</div>' +
      '<div class="turn-card-summary">' + esc(t.contentSummary || __('turns.noSummary')) + '</div>';

    // Badges row: subagent marker + tool count + skill events
    var badges = [];
    if (t.isSubagent) {
      var subName = t.subagentName || t.agentName || '';
      badges.push({ text: '🖥 ' + esc(subName), cls: 'badge-orange' });
    }
    if (t.toolCalls && t.toolCalls.length > 0) {
      var taskCount = 0;
      for (var tci = 0; tci < t.toolCalls.length; tci++) {
        if (t.toolCalls[tci].toolName === 'Agent' || t.toolCalls[tci].toolName === 'Task') taskCount++;
      }
      var toolBadge = t.toolCalls.length + ' tools';
      if (taskCount > 0) toolBadge += ' · ' + taskCount + ' sub';
      badges.push({ text: toolBadge, cls: 'badge-outline' });
    }
    if (t.skillEvents && t.skillEvents.length > 0) {
      var skillName = t.skillEvents[0].skillName;
      var skillText = '⚡ ' + esc(skillName);
      if (t.skillEvents.length > 1) skillText += ' +' + (t.skillEvents.length - 1);
      badges.push({ text: skillText, cls: 'badge-yellow' });
    }
    if (badges.length > 0) {
      html += '<div class="turn-card-badges">';
      for (var bi = 0; bi < badges.length; bi++) {
        html += '<span class="badge ' + badges[bi].cls + '">' + badges[bi].text + '</span>';
      }
      html += '</div>';
    }

    html += '<div class="turn-card-meta">' +
        '<span class="turn-card-tokens">' + (t.totalTokens > 0 ? fmt(t.totalTokens) + ' tk' : '—') + '</span>' +
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

  // ── Show compression detection ──
  renderCompressionAlert(ctxData);
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
  var cacheR = toNumber(turn.cacheReadTokens);
  var cacheW = toNumber(turn.cacheWriteTokens);
  if (cacheR > 0) barTotal += cacheR; // cache reads are separate from input messages
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

  // Cache read segment (separate from messages)
  if (cacheR > 0) {
    hasAny = true;
    var crPct = barTotal > 0 ? (cacheR / barTotal * 100).toFixed(1) : '0';
    html += '<div class="ctx-role-seg ctx-role-seg-overhead" ' +
      'style="width:' + crPct + '%; background: repeating-linear-gradient(-45deg, rgba(220,200,122,0.3), rgba(220,200,122,0.3) 2px, transparent 2px, transparent 4px), rgba(255,255,255,0.02)" ' +
      'title="Cache Read: ' + fmt(cacheR) + ' tokens (' + crPct + '%)"></div>';
  }

  // Cache write segment
  if (cacheW > 0) {
    hasAny = true;
    var cwPct = barTotal > 0 ? (cacheW / barTotal * 100).toFixed(1) : '0';
    html += '<div class="ctx-role-seg ctx-role-seg-overhead" ' +
      'style="width:' + cwPct + '%; background: repeating-linear-gradient(45deg, rgba(184,152,232,0.3), rgba(184,152,232,0.3) 2px, transparent 2px, transparent 4px), rgba(255,255,255,0.02)" ' +
      'title="Cache Write: ' + fmt(cacheW) + ' tokens (' + cwPct + '%)"></div>';
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
  if (cacheR > 0) {
    html += '<div class="ctx-legend-item">' +
      '<span class="ctx-legend-dot" style="background:var(--yellow);opacity:0.3"></span>' +
      '📥 Cache Read: ' + fmt(cacheR) + ' tk' +
    '</div>';
  }
  if (cacheW > 0) {
    html += '<div class="ctx-legend-item">' +
      '<span class="ctx-legend-dot" style="background:var(--purple);opacity:0.3"></span>' +
      '📤 Cache Write: ' + fmt(cacheW) + ' tk' +
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

// ── Compression detection alert ──
function renderCompressionAlert(ctxData) {
  var turn = ctxData.turn;
  var ctxPct = turn.contextWindowPct != null ? toNumber(turn.contextWindowPct) : 0;
  if (ctxPct === 0) return;

  // Find previous assistant turn in same scope
  var scope = turn.subagentSessionId || '__root__';
  var prevTurn = null;
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    var tScope = t.subagentSessionId || '__root__';
    if (t.id === turn.id) break;
    if (t.role === 'assistant' && tScope === scope) {
      prevTurn = t;
    }
  }

  if (!prevTurn || prevTurn.contextWindowPct == null) return;
  var prevPct = toNumber(prevTurn.contextWindowPct);
  var drop = prevPct > 0 ? prevPct - ctxPct : 0;

  if (drop > 5) {
    // Compression detected
    var panel = document.getElementById('turnDetailPanel');
    if (!panel) return;
    var alert = document.createElement('div');
    alert.style.cssText = 'margin:0 0 12px 0;padding:10px 14px;border:1px solid var(--orange);border-radius:6px;background:rgba(224,154,107,0.08);font-size:12px';
    alert.innerHTML =
      '<span style="color:var(--orange);font-weight:600">🔄 Context compressed</span> ' +
      '<span style="color:var(--text-dim)">from ' + prevPct.toFixed(1) + '% → ' + ctxPct.toFixed(1) + '%</span> ' +
      '<span style="color:var(--orange)">(-' + drop.toFixed(1) + '%)</span>';
    panel.insertBefore(alert, panel.firstChild);
  }
}

// ── Turn detail (lower section) ──

// Shared storage for copy operations (avoids DOM attr encoding issues)
var turnDetailContents = {};

function parseContentSections(rawContent) {
  if (!rawContent) return [];
  var sections = [];
  // Extract <thinking>...</thinking> blocks
  var thinkingRe = /<thinking>([\\s\\S]*?)<\\/thinking>/gi;
  var remaining = rawContent;
  var match;
  var lastIdx = 0;
  // Use exec loop
  thinkingRe.lastIndex = 0;
  while ((match = thinkingRe.exec(rawContent)) !== null) {
    // Text before this thinking block
    var before = rawContent.substring(lastIdx, match.index).trim();
    if (before) sections.push({ type: 'text', content: before });
    sections.push({ type: 'thinking', content: match[1].trim() });
    lastIdx = match.index + match[0].length;
    remaining = rawContent.substring(lastIdx);
  }
  // Remaining text after last thinking block
  var after = remaining.trim();
  if (after) sections.push({ type: 'text', content: after });
  // If no thinking blocks found, whole content is text
  if (sections.length === 0 && rawContent.trim()) {
    sections.push({ type: 'text', content: rawContent });
  }
  return sections;
}

function renderTurnMetrics(turn) {
  var html = '<div class="turn-detail-stats">';
  if (turn.totalTokens > 0) {
    html += '<div class="td-stat"><span class="td-stat-label">' + __('common.tokens') + '</span><span class="td-stat-val" style="color:var(--blue)">' + fmt(turn.totalTokens) + '</span></div>';
  }
  if (turn.inputTokens > 0) {
    html += '<div class="td-stat"><span class="td-stat-label">' + __('common.input') + '</span><span class="td-stat-val">' + fmt(turn.inputTokens) + '</span></div>';
  }
  if (turn.outputTokens > 0) {
    html += '<div class="td-stat"><span class="td-stat-label">' + __('common.output') + '</span><span class="td-stat-val" style="color:var(--green)">' + fmt(turn.outputTokens) + '</span></div>';
  }
  if (turn.reasoningTokens > 0) {
    html += '<div class="td-stat"><span class="td-stat-label">Reasoning</span><span class="td-stat-val" style="color:var(--purple)">' + fmt(turn.reasoningTokens) + '</span></div>';
  }
  var totalCache = toNumber(turn.cacheReadTokens) + toNumber(turn.cacheWriteTokens);
  if (totalCache > 0) {
    html += '<div class="td-stat"><span class="td-stat-label">' + __('common.cache') + '</span><span class="td-stat-val" style="color:var(--yellow)">' + fmt(totalCache) + '</span></div>';
  }
  if (turn.latencyMs > 0) {
    html += '<div class="td-stat"><span class="td-stat-label">' + __('common.latency') + '</span><span class="td-stat-val" style="color:var(--orange)">' + fmtMs(turn.latencyMs) + '</span></div>';
  }
  html += '</div>';
  return html;
}

function renderTurnDetail(turn) {
  var panel = document.getElementById('turnDetailPanel');
  if (!panel) return;

  var html = '<div class="turn-detail">';

  // ── Metric badges ──
  html += renderTurnMetrics(turn);

  // ── Content section (User Input / LLM Output) ──
  var hasContent = turn.content && turn.content.length > 0;
  if (hasContent) {
    var contentSections = parseContentSections(turn.content);
    var contentLabel = turn.role === 'user' ? '👤 User Input'
      : (turn.role === 'assistant' ? '🤖 LLM Output'
      : '💬 ' + esc(turn.role));
    var contentId = 'td-content-' + turn.id;

    html += '<div class="turn-detail-section">';
    html += '<div class="td-section-header" data-expand="' + contentId + '">';
    html += '<span class="td-section-title">' + contentLabel + '</span>';
    html += '<span class="td-section-meta">~' + Math.round(turn.content.length / 3.5) + ' est. tk</span>';
    html += '<span class="td-section-arrow">▶</span>';
    html += '</div>';

    html += '<div id="' + contentId + '" class="td-section-body" style="display:none">';

    for (var si = 0; si < contentSections.length; si++) {
      var section = contentSections[si];
      if (section.type === 'thinking') {
        var thinkId = 'td-think-' + turn.id + '-' + si;
        var thinkContentId = 'td-think-content-' + turn.id + '-' + si;
        var thinkPreview = section.content.length > 500 ? section.content.substring(0, 500) + '...' : section.content;
        turnDetailContents[thinkContentId] = section.content;

        html += '<div class="td-thinking-block">';
        html += '<div class="td-section-header td-sub-header" data-expand="' + thinkId + '">';
        html += '<span class="badge badge-purple">💭 thinking</span>';
        html += '<span class="td-section-meta">' + thinkPreview.substring(0, 80) + '</span>';
        html += '<span class="td-section-arrow">▶</span>';
        html += '<button class="td-copy-btn" data-copy-id="' + thinkContentId + '" title="Copy">📋</button>';
        html += '</div>';
        html += '<div id="' + thinkId + '" class="td-section-body" style="display:none">';
        html += '<pre class="td-content-pre">' + esc(section.content.length > 10000 ? section.content.substring(0, 10000) + '\\n\\n... [' + __('turns.truncated') + ']' : section.content) + '</pre>';
        html += '</div>';
        html += '</div>';
      } else {
        var textContentId = 'td-text-content-' + turn.id + '-' + si;
        turnDetailContents[textContentId] = section.content;

        html += '<div class="td-text-block">';
        html += '<div class="td-text-header">';
        html += '<span class="badge badge-green">📝 text</span>';
        html += '<span class="td-section-meta">~' + Math.round(section.content.length / 3.5) + ' est. tk</span>';
        html += '<button class="td-copy-btn" data-copy-id="' + textContentId + '" title="Copy">📋</button>';
        html += '</div>';
        html += '<pre class="td-content-pre">' + esc(section.content.length > 20000 ? section.content.substring(0, 20000) + '\\n\\n... [' + __('turns.truncated') + ']' : section.content) + '</pre>';
        html += '</div>';
      }
    }

    html += '</div>'; // td-section-body
    html += '</div>'; // turn-detail-section
  } else if (turn.role === 'user') {
    // User turn with no text content (unusual but handle gracefully)
    html += '<div class="turn-detail-section">';
    html += '<div class="td-section-header" style="cursor:default">';
    html += '<span class="td-section-title">👤 User Input</span>';
    html += '<span class="td-section-meta" style="color:var(--text-dim)">(no content)</span>';
    html += '</div>';
    html += '</div>';
  } else if (turn.role === 'assistant') {
    html += '<div class="turn-detail-section">';
    html += '<div class="td-section-header" style="cursor:default">';
    html += '<span class="td-section-title">🤖 LLM Output</span>';
    html += '<span class="td-section-meta" style="color:var(--text-dim)">(tool-only turn)</span>';
    html += '</div>';
    html += '</div>';
  }

  // ── Tool Calls section ──
  if (turn.toolCalls && turn.toolCalls.length > 0) {
    html += '<div class="turn-detail-section">';
    html += '<div class="turn-detail-section-title">🔧 ' + __('turnDetail.toolCalls', turn.toolCalls.length) + '</div>';

    for (var tci = 0; tci < turn.toolCalls.length; tci++) {
      var tc = turn.toolCalls[tci];
      var tcId = 'td-tc-' + turn.id + '-' + tci;
      var isSkill = tc.isSkillRelated;
      var stateCls = (tc.state === 'ok' || tc.state === 'completed') ? 'tool-state-ok' : 'tool-state-error';

      // Store content for copy
      var tcContent = '';
      if (tc.argsJson) tcContent += '// Args:\\n' + (function() {
        try { return JSON.stringify(JSON.parse(tc.argsJson), null, 2); } catch(e) { return tc.argsJson; }
      })() + '\\n';
      if (tc.resultJson) tcContent += '\\n// Result:\\n' + tc.resultJson;
      turnDetailContents['td-tc-content-' + turn.id + '-' + tci] = tcContent;

      html += '<div class="tool-call-item tool-call-expandable" style="border-left-color:' + (isSkill ? 'var(--yellow)' : 'var(--accent)') + ';cursor:pointer">';
      html += '<div class="td-section-header td-tc-header" data-expand="' + tcId + '" style="padding:0;border:none;background:none;margin:0">';
      html += '<span class="tool-name">' + esc(tc.toolName) + '</span> ';
      html += '<span class="' + stateCls + '">[' + esc(tc.state) + ']</span>';
      if (tc.durationMs > 0) html += ' <span style="color:var(--text-dim)">' + fmtMs(tc.durationMs) + '</span>';
      if (tc.errorType) html += ' <span style="color:var(--red)">' + esc(tc.errorType) + '</span>';
      if (isSkill) html += ' <span class="badge badge-yellow" style="font-size:10px;margin-left:4px">⚡ skill</span>';
      html += '<span class="td-section-arrow" style="margin-left:auto">▶</span>';
      html += '</div>';

      html += '<div id="' + tcId + '" class="td-section-body" style="display:none;margin-top:8px">';

      if (tc.errorType || tc.state === 'error' || tc.state === 'failed') {
        html += '<div class="td-error-msg">' + esc(tc.errorType || tc.state) + '</div>';
      }

      if (tc.argsJson) {
        var argsStr;
        try { argsStr = JSON.stringify(JSON.parse(tc.argsJson), null, 2); } catch(e) { argsStr = tc.argsJson; }
        html += '<div style="margin-bottom:8px">';
        html += '<div style="font-size:10px;font-weight:600;color:var(--text-dim);margin-bottom:2px">📥 Args</div>';
        html += '<pre class="td-content-pre" style="max-height:200px">' + esc(argsStr.length > 3000 ? argsStr.substring(0, 3000) + '\\n... (truncated)' : argsStr) + '</pre>';
        html += '</div>';
      }

      if (tc.resultJson) {
        var resultStr = tc.resultJson;
        html += '<div>';
        html += '<div style="font-size:10px;font-weight:600;color:var(--text-dim);margin-bottom:2px">📤 Result</div>';
        html += '<pre class="td-content-pre" style="max-height:250px">' + esc(resultStr.length > 5000 ? resultStr.substring(0, 5000) + '\\n... (truncated)' : resultStr) + '</pre>';
        html += '</div>';
      }

      if (!tc.argsJson && !tc.resultJson) {
        html += '<div style="font-size:11px;color:var(--text-dim);font-style:italic">(no detail data)</div>';
      }

      html += '<button class="td-copy-btn" data-copy-id="td-tc-content-' + turn.id + '-' + tci + '" style="margin-top:6px">📋 Copy all</button>';
      html += '</div>'; // td-section-body
      html += '</div>'; // tool-call-item
    }

    html += '</div>'; // turn-detail-section
  }

  // ── Skill Events section ──
  if (turn.skillEvents && turn.skillEvents.length > 0) {
    html += '<div class="turn-detail-section">';
    html += '<div class="turn-detail-section-title">🧩 ' + __('turnDetail.skillEvents', turn.skillEvents.length) + '</div>';

    for (var sei = 0; sei < turn.skillEvents.length; sei++) {
      var se = turn.skillEvents[sei];
      var seId = 'td-se-' + turn.id + '-' + sei;

      html += '<div class="tool-call-item" style="border-left-color:var(--purple)">';
      html += '<div class="td-section-header td-tc-header" data-expand="' + seId + '" style="padding:0;border:none;background:none;margin:0;cursor:pointer">';
      html += '<span style="color:var(--purple);font-weight:600">' + esc(se.skillName) + '</span> ';
      html += '<span style="color:var(--text-dim)">[' + esc(se.eventType) + ']</span> ';
      html += (se.success ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--red)">❌</span>') + ' ';
      if (se.durationMs > 0) html += '<span style="color:var(--text-dim)">' + fmtMs(se.durationMs) + '</span>';
      html += '<span class="td-section-arrow" style="margin-left:auto">▶</span>';
      html += '</div>';

      html += '<div id="' + seId + '" class="td-section-body" style="display:none;margin-top:8px">';
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px">';
      html += '<span><span style="color:var(--text-dim)">Event:</span> ' + esc(se.eventType) + '</span>';
      html += '<span><span style="color:var(--text-dim)">Status:</span> ' + (se.success ? '✅ Success' : '❌ Failed') + '</span>';
      if (se.skillVersion != null) html += '<span><span style="color:var(--text-dim)">Version:</span> ' + se.skillVersion + '</span>';
      if (se.durationMs > 0) html += '<span><span style="color:var(--text-dim)">Duration:</span> ' + fmtMs(se.durationMs) + '</span>';
      html += '</div>';
      html += '</div>'; // td-section-body
      html += '</div>'; // tool-call-item
    }

    html += '</div>'; // turn-detail-section
  }

  html += '</div>'; // turn-detail
  panel.innerHTML = html;

  // ── Bind expand/collapse handlers ──
  panel.querySelectorAll('[data-expand]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      // Don't trigger if clicking a copy button
      if (e.target.closest('.td-copy-btn')) return;
      var targetId = this.getAttribute('data-expand');
      var body = document.getElementById(targetId);
      var arrow = this.querySelector('.td-section-arrow');
      if (body) {
        var isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
      }
    });
  });

  // ── Bind copy buttons ──
  panel.querySelectorAll('.td-copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var copyId = this.getAttribute('data-copy-id');
      var content = turnDetailContents[copyId] || '';
      navigator.clipboard.writeText(content).catch(function() {});
      var origText = this.textContent;
      this.textContent = '✓';
      var self = this;
      setTimeout(function() { self.textContent = origText; }, 1000);
    });
  });

  // ── Click on skill event → navigate to Skills tab ──
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
