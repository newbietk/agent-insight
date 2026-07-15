// Overview tab — metric cards + error turns + token trend chart + tool calls summary.
// Ported from parent project renderOverview(), adapted for vanilla JS webview.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderOverviewTab(): string {
  return `
<div id="tab-overview" class="tab-panel active">
  <div class="cards" id="overviewCards"></div>

  <!-- Error Turns Section (hidden when no errors) -->
  <div id="overviewErrorSection" style="display:none;margin-bottom:20px">
    <div class="table-wrap">
      <div class="table-header" style="display:flex;align-items:center;gap:8px;color:var(--red)">
        <span>⚠️ Error Turns</span>
        <span id="overviewErrorCount" style="font-size:11px;color:var(--text-dim);font-weight:400"></span>
      </div>
      <div id="overviewErrorList" style="max-height:400px;overflow-y:auto"></div>
    </div>
  </div>

  <div class="chart-container" style="position:relative">
    <div class="chart-title">${escHtml(t('chart.tokenTrend'))}</div>
    <canvas id="tokenTrendChart"></canvas>
    <div id="chartTooltip" class="chart-tooltip"></div>
  </div>

  <!-- Tool Calls Summary Section (hidden when no tool calls) -->
  <div id="overviewToolSection" style="display:none;margin-top:20px">
    <div class="table-wrap">
      <div class="table-header">🔧 Tool Calls Summary</div>
      <div style="padding:0 16px 12px" id="overviewToolList"></div>
    </div>
  </div>
</div>`;
}

export function renderOverviewJS(): string {
  return `
// ── Overview Cards ──
function renderOverviewCards() {
  var cards = document.getElementById('overviewCards');
  if (!cards) return;
  var totalT = toNumber(session.totalTokens), totalIn = toNumber(session.totalInputTokens),
      totalOut = toNumber(session.totalOutputTokens), reason = toNumber(session.totalReasoningTokens),
      cacheR = toNumber(session.totalCacheReadTokens), cacheW = toNumber(session.totalCacheWriteTokens);
  var cost = session.totalCost;
  var latencyMs = toNumber(session.totalLatencyMs);
  var modelName = session.model || 'unknown';
  var ctxUsed = assistantTurns.length > 0 ? toNumber(assistantTurns[assistantTurns.length-1].inputMessagesTokens) : 0;
  var ctxPct = ctxLimit > 0 ? (ctxUsed / ctxLimit * 100).toFixed(1) : '0.0';

  // Compute error counts
  var errSummary = summarizeAllErrors();

  var cardDefs = [
    {label:__('overview.totalTokens'), value:fmt(totalT), cls:'tokens', sub:__('overview.totalTokensSub')},
    {label:__('overview.inputTokens'), value:fmt(totalIn), cls:'tokens', sub:__('overview.inputTokensSub', fmt(cacheR), fmt(cacheW))},
    {label:__('overview.outputTokens'), value:fmt(totalOut), cls:'tokens', sub:(reason > 0 ? __('overview.outputTokensSubReasoning', fmt(reason)) : __('overview.outputTokensSubNone'))},
    {label:__('overview.cost'), value:fmtCost(cost), cls:'cost', sub:''},
    {label:__('overview.totalLatency'), value:fmtMs(latencyMs), cls:'time', sub:__('overview.totalLatencySub', assistantTurns.length)},
    {label:__('overview.model'), value:modelName.substring(0,28), cls:'', sub:__('overview.modelSub', ctxPct, fmt(ctxLimit)), title:modelName},
  ];

  // Extra stat cards (LLM calls, Tool calls, Skills, Subagents, Errors)
  var extra = [];
  var llmCalls = toNumber(session.totalLlmCallCount);
  if (llmCalls > 0) extra.push({label:'LLM Calls', value:fmt(llmCalls), cls:'', sub:assistantTurns.length + ' assistant turns'});
  var toolCalls = toNumber(session.totalToolCallCount);
  if (toolCalls > 0) extra.push({label:'Tool Calls', value:fmt(toolCalls), cls:'', sub:errSummary.failed > 0 ? errSummary.failed + ' errors' : 'all ok'});
  var skills = toNumber(session.totalSkillLoadCount);
  if (skills > 0) extra.push({label:'Skills', value:fmt(skills), cls:'', sub:errSummary.skillFail > 0 ? errSummary.skillFail + ' failed' : 'all ok'});
  var subagents = toNumber(session.totalSubagentCount);
  if (subagents > 0) extra.push({label:'Subagents', value:fmt(subagents), cls:'', sub:''});
  if (errSummary.total > 0) extra.push({label:'Errors', value:String(errSummary.total), cls:'cost', sub:errSummary.failed + ' tool · ' + errSummary.skillFail + ' skill', style:'border-color:var(--red);'});

  cardDefs = cardDefs.concat(extra);

  cards.innerHTML = cardDefs.map(function(c) {
    var titleAttr = c.title ? ' title="'+esc(c.title)+'"' : '';
    var styleAttr = c.style ? ' style="'+c.style+'"' : '';
    return '<div class="card"'+titleAttr+styleAttr+'><div class="card-label">'+c.label+'</div><div class="card-value '+c.cls+'">'+c.value+'</div><div class="card-sub">'+c.sub+'</div></div>';
  }).join('');

  // Render error section if there are errors
  if (errSummary.total > 0) {
    renderErrorSection(errSummary);
  }

  // Render tool calls summary
  renderToolCallsSummary();
}

// ── Error summarization ──
// Scans toolCalls and skillEvents across all turns to detect errors.
function summarizeAllErrors() {
  var result = { total: 0, failed: 0, cancelled: 0, skillFail: 0, errorTurns: [] };

  for (var ti = 0; ti < turns.length; ti++) {
    var t = turns[ti];
    var tcs = t.toolCalls || [];
    var ses = t.skillEvents || [];
    var turnErrors = { turn: t, failed: 0, cancelled: 0, skillFail: 0, details: [] };

    for (var ci = 0; ci < tcs.length; ci++) {
      var tc = tcs[ci];
      var state = tc.state || '';
      var resultStr = tc.resultJson || '';
      var isErr = false;

      // Tool use error / cancelled
      if (resultStr.indexOf('<tool_use_error>') >= 0 || resultStr.indexOf('Cancelled') >= 0) {
        turnErrors.cancelled++;
        turnErrors.details.push({ toolName: tc.toolName, type: 'cancelled' });
        isErr = true;
      }
      // Exit code errors
      if (resultStr.indexOf('Exit code') >= 0 || state === 'error' || state === 'failed' || (tc.errorType && tc.errorType.length > 0)) {
        turnErrors.failed++;
        turnErrors.details.push({ toolName: tc.toolName, type: 'failed', errorType: tc.errorType || '' });
        isErr = true;
      }
      if (isErr) turnErrors.total++;
    }

    for (var si = 0; si < ses.length; si++) {
      var se = ses[si];
      if (!se.success) {
        turnErrors.skillFail++;
        turnErrors.total++;
        turnErrors.details.push({ toolName: se.skillName, type: 'skill_fail' });
      }
    }

    if (turnErrors.total > 0) {
      result.errorTurns.push(turnErrors);
    }
  }

  for (var ei = 0; ei < result.errorTurns.length; ei++) {
    var et = result.errorTurns[ei];
    result.total += et.total;
    result.failed += et.failed;
    result.cancelled += et.cancelled;
    result.skillFail += et.skillFail;
  }
  return result;
}

// ── Error turns list ──
function renderErrorSection(errSummary) {
  var section = document.getElementById('overviewErrorSection');
  var list = document.getElementById('overviewErrorList');
  var count = document.getElementById('overviewErrorCount');
  if (!section || !list) return;
  section.style.display = '';

  if (count) {
    count.textContent = errSummary.errorTurns.length + ' turn(s) with errors (' + errSummary.total + ' total)';
  }

  var html = '';
  for (var ei = 0; ei < errSummary.errorTurns.length; ei++) {
    var et = errSummary.errorTurns[ei];
    var t = et.turn;
    var summary = t.contentSummary || '';
    if (summary.length > 80) summary = summary.substring(0, 80) + '...';

    html += '<div style="padding:10px 14px;border-bottom:1px solid rgba(62,62,66,0.3);cursor:pointer;transition:background 0.1s" class="overview-error-row" data-turn-id="' + esc(t.id) + '" onmouseover="this.style.background=\\'rgba(255,255,255,0.04)\\'" onmouseout="this.style.background=\\'\\'">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">';
    html += '<span style="font-weight:700;font-family:monospace;font-size:12px;color:var(--text)">#' + t.turnIndex + '</span>';
    html += '<span style="font-size:11px;color:var(--text-dim);padding:1px 6px;border-radius:3px;border:1px solid var(--border)">' + esc(t.role) + '</span>';
    if (t.isSubagent) {
      html += '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(224,154,107,0.15);color:var(--orange)">subagent</span>';
    }

    // Error badges
    if (et.failed > 0) html += '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(232,103,107,0.15);color:var(--red)">' + et.failed + ' failed</span>';
    if (et.cancelled > 0) html += '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(224,154,107,0.15);color:var(--orange)">' + et.cancelled + ' cancelled</span>';
    if (et.skillFail > 0) html += '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(232,103,107,0.15);color:var(--red)">' + et.skillFail + ' skill fail</span>';

    html += '<span style="margin-left:auto;font-size:10px;color:var(--text-dim)">' + esc(t.model || '') + '</span>';
    html += '</div>';

    // Summary
    html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">' + esc(summary) + '</div>';

    // Detail: specific tool/skill names
    if (et.details.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      for (var di = 0; di < et.details.length; di++) {
        var d = et.details[di];
        var color = d.type === 'failed' ? 'var(--red)' : d.type === 'cancelled' ? 'var(--orange)' : 'var(--red)';
        html += '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.03);color:' + color + '">' + esc(d.toolName) + '</span>';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  list.innerHTML = html;

  // Click handlers: navigate to turns tab
  list.querySelectorAll('.overview-error-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var turnId = this.getAttribute('data-turn-id');
      if (turnId && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: turnId });
      }
    });
  });
}

// ── Tool calls summary section ──
function renderToolCallsSummary() {
  var section = document.getElementById('overviewToolSection');
  var list = document.getElementById('overviewToolList');
  if (!section || !list) return;

  // Collect all tool calls across turns
  var tcMap = {}; // toolName -> { count, totalDuration, errorCount }
  for (var ti = 0; ti < turns.length; ti++) {
    var tcs = turns[ti].toolCalls || [];
    for (var ci = 0; ci < tcs.length; ci++) {
      var tc = tcs[ci];
      var name = tc.toolName || 'unknown';
      if (!tcMap[name]) tcMap[name] = { count: 0, totalDuration: 0, errorCount: 0 };
      tcMap[name].count++;
      tcMap[name].totalDuration += toNumber(tc.durationMs);
      if (tc.state === 'error' || tc.state === 'failed' || (tc.errorType && tc.errorType.length > 0)) {
        tcMap[name].errorCount++;
      }
    }
  }

  var entries = [];
  for (var k in tcMap) {
    if (tcMap.hasOwnProperty(k)) {
      entries.push({ name: k, count: tcMap[k].count, avgMs: Math.round(tcMap[k].totalDuration / tcMap[k].count), errors: tcMap[k].errorCount });
    }
  }
  entries.sort(function(a, b) { return b.count - a.count; });

  if (entries.length === 0) return;
  section.style.display = '';

  var html = '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  for (var ei = 0; ei < entries.length; ei++) {
    var e = entries[ei];
    html += '<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);font-size:11px">';
    html += '<span style="font-weight:600;color:var(--text)">' + esc(e.name) + '</span>';
    html += '<span style="background:rgba(98,154,240,0.12);color:var(--accent);padding:1px 6px;border-radius:3px;font-size:10px">' + e.count + 'x</span>';
    if (e.avgMs > 0) {
      html += '<span style="color:var(--text-dim);font-size:10px">' + fmtMs(e.avgMs) + ' avg</span>';
    }
    if (e.errors > 0) {
      html += '<span style="background:rgba(232,103,107,0.12);color:var(--red);padding:1px 6px;border-radius:3px;font-size:10px">' + e.errors + ' err</span>';
    }
    html += '</div>';
  }
  html += '</div>';
  list.innerHTML = html;
}

// ── Token Trend Chart ──
var chartDots = []; // { x, y, turnId, turnIndex, totalTokens, contentSummary, role, latencyMs }

function drawTokenTrendChart() {
  var canvas = document.getElementById('tokenTrendChart');
  if (!canvas || assistantTurns.length === 0) return;
  var parent = canvas.parentElement;
  if (!parent) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = parent.clientWidth - 32;
  var H = 240;
  var dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  var pad = { top: 16, right: 20, bottom: 34, left: 60 };
  var pw = W - pad.left - pad.right;
  var ph = H - pad.top - pad.bottom;

  var maxVal = 1;
  for (var i = 0; i < assistantTurns.length; i++) {
    maxVal = Math.max(maxVal, toNumber(assistantTurns[i].totalTokens));
  }

  ctx.fillStyle = currentTheme === 'light' ? '#fafafc' : '#1e1e1e';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = currentTheme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (var gi = 0; gi <= 4; gi++) {
    var gy = pad.top + ph * (1 - gi/4);
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(Math.round(maxVal * gi / 4)), pad.left - 8, gy + 4);
  }

  // X labels (keep xstep for label spacing)
  var xstep = Math.max(1, Math.floor(assistantTurns.length / 8));
  ctx.textAlign = 'center';
  for (var xi = 0; xi < assistantTurns.length; xi += xstep) {
    var lx = pad.left + (xi / (assistantTurns.length - 1 || 1)) * pw;
    ctx.fillStyle = '#888';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText('#' + (xi+1), lx, H - pad.bottom + 15);
  }

  // Area fill
  ctx.beginPath();
  var ax = pad.left;
  var ay = pad.top + ph * (1 - toNumber(assistantTurns[0].totalTokens) / maxVal);
  ctx.moveTo(ax, pad.top + ph);
  ctx.lineTo(ax, ay);
  for (var ai = 0; ai < assistantTurns.length; ai++) {
    var aax = pad.left + (ai / (assistantTurns.length - 1 || 1)) * pw;
    var aay = pad.top + ph * (1 - toNumber(assistantTurns[ai].totalTokens) / maxVal);
    ctx.lineTo(aax, aay);
  }
  ctx.lineTo(aax, pad.top + ph);
  ctx.closePath();
  ctx.fillStyle = 'rgba(86, 156, 214, 0.08)';
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  for (var li = 0; li < assistantTurns.length; li++) {
    var llx = pad.left + (li / (assistantTurns.length - 1 || 1)) * pw;
    var lly = pad.top + ph * (1 - toNumber(assistantTurns[li].totalTokens) / maxVal);
    ctx.lineTo(llx, lly);
  }
  ctx.strokeStyle = '#569cd6';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots — draw for EVERY turn and store positions for hover/click
  chartDots = [];
  for (var di = 0; di < assistantTurns.length; di++) {
    var dx = pad.left + (di / (assistantTurns.length - 1 || 1)) * pw;
    var dy = pad.top + ph * (1 - toNumber(assistantTurns[di].totalTokens) / maxVal);
    ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, Math.PI*2);
    ctx.fillStyle = '#569cd6'; ctx.fill();
    ctx.strokeStyle = currentTheme === 'light' ? '#fafafc' : '#1e1e1e'; ctx.lineWidth = 1.5; ctx.stroke();
    chartDots.push({
      x: dx, y: dy,
      turnId: assistantTurns[di].id,
      turnIndex: di,
      totalTokens: toNumber(assistantTurns[di].totalTokens),
      contentSummary: assistantTurns[di].contentSummary || '',
      role: assistantTurns[di].role,
      latencyMs: toNumber(assistantTurns[di].latencyMs)
    });
  }

  // Context limit line
  var climY = pad.top + ph * (1 - ctxLimit / maxVal);
  if (climY >= pad.top) {
    ctx.strokeStyle = 'rgba(241, 76, 76, 0.4)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left, climY); ctx.lineTo(W - pad.right, climY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f14c4c';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(__('context.ctxLimit', fmt(ctxLimit)), W - pad.right, climY - 5);
  }
}

// ── Chart hover tooltip ──
(function() {
  var canvas = document.getElementById('tokenTrendChart');
  var tooltip = document.getElementById('chartTooltip');
  if (!canvas || !tooltip) return;

  var currentHoverDot = null;

  canvas.addEventListener('mousemove', function(e) {
    if (chartDots.length === 0) return;
    var rect = this.getBoundingClientRect();
    var cx = e.clientX - rect.left;
    var cy = e.clientY - rect.top;
    var bestDist = 24;
    var bestDot = null;
    for (var i = 0; i < chartDots.length; i++) {
      var d = chartDots[i];
      var dist = Math.sqrt((cx - d.x) * (cx - d.x) + (cy - d.y) * (cy - d.y));
      if (dist < bestDist) { bestDist = dist; bestDot = d; }
    }

    if (bestDot) {
      if (currentHoverDot === bestDot) return;
      currentHoverDot = bestDot;
      var summary = bestDot.contentSummary || '';
      if (summary.length > 60) summary = summary.substring(0, 60) + '...';
      tooltip.innerHTML =
        '<div class="chart-tooltip-title">#' + (bestDot.turnIndex + 1) + ' · ' + esc(bestDot.role) + '</div>' +
        '<div class="chart-tooltip-tokens">' + fmt(bestDot.totalTokens) + ' tokens · ' + fmtMs(bestDot.latencyMs) + '</div>' +
        (summary ? '<div class="chart-tooltip-summary">' + esc(summary) + '</div>' : '');
      tooltip.style.display = 'block';
      var containerRect = canvas.parentElement.getBoundingClientRect();
      var tx = e.clientX - containerRect.left + 14;
      var ty = e.clientY - containerRect.top - 10;
      if (tx + 220 > containerRect.width) tx = tx - 240;
      if (ty < 0) ty = e.clientY - containerRect.top + 20;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
    } else {
      hideTooltip();
    }
  });

  canvas.addEventListener('mouseout', function() {
    hideTooltip();
  });

  function hideTooltip() {
    tooltip.style.display = 'none';
    currentHoverDot = null;
  }

  var chartContainer = canvas.parentElement;
  if (chartContainer) {
    chartContainer.addEventListener('mouseleave', function() {
      hideTooltip();
    });
  }
})();

// ── Chart click → navigate to turn ──
(function() {
  var canvas = document.getElementById('tokenTrendChart');
  if (!canvas) return;
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', function(e) {
    if (chartDots.length === 0) return;
    var rect = this.getBoundingClientRect();
    var cx = e.clientX - rect.left;
    var cy = e.clientY - rect.top;
    var bestDist = 24;
    var bestDot = null;
    for (var i = 0; i < chartDots.length; i++) {
      var d = chartDots[i];
      var dist = Math.sqrt((cx - d.x) * (cx - d.x) + (cy - d.y) * (cy - d.y));
      if (dist < bestDist) { bestDist = dist; bestDot = d; }
    }
    if (bestDot && window.__kirinai) {
      window.__kirinai.navigate('turns', { turnId: bestDot.turnId });
    }
  });
})();
`;
}
