"use strict";
// Overview tab — metric cards + token trend chart.
// Extracted from webviewContent.ts, modularized for the new tab framework.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderOverviewTab = renderOverviewTab;
exports.renderOverviewJS = renderOverviewJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderOverviewTab() {
    return `
<div id="tab-overview" class="tab-panel active">
  <div class="cards" id="overviewCards"></div>
  <div class="chart-container" style="position:relative">
    <div class="chart-title">${(0, shared_1.escHtml)((0, i18n_1.t)('chart.tokenTrend'))}</div>
    <canvas id="tokenTrendChart"></canvas>
    <div id="chartTooltip" class="chart-tooltip"></div>
  </div>
</div>`;
}
function renderOverviewJS() {
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

  cards.innerHTML = [
    {label:__('overview.totalTokens'), value:fmt(totalT), cls:'tokens', sub:__('overview.totalTokensSub')},
    {label:__('overview.inputTokens'), value:fmt(totalIn), cls:'tokens', sub:__('overview.inputTokensSub', fmt(cacheR), fmt(cacheW))},
    {label:__('overview.outputTokens'), value:fmt(totalOut), cls:'tokens', sub:(reason > 0 ? __('overview.outputTokensSubReasoning', fmt(reason)) : __('overview.outputTokensSubNone'))},
    {label:__('overview.cost'), value:fmtCost(cost), cls:'cost', sub:''},
    {label:__('overview.totalLatency'), value:fmtMs(latencyMs), cls:'time', sub:__('overview.totalLatencySub', assistantTurns.length)},
    {label:__('overview.model'), value:modelName.substring(0,35), cls:'', sub:__('overview.modelSub', ctxPct, fmt(ctxLimit)), title:modelName},
  ].map(function(c) {
    var titleAttr = c.title ? ' title="'+esc(c.title)+'"' : '';
    return '<div class="card"'+titleAttr+'><div class="card-label">'+c.label+'</div><div class="card-value '+c.cls+'">'+c.value+'</div><div class="card-sub">'+c.sub+'</div></div>';
  }).join('');
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
      if (currentHoverDot === bestDot) return; // same dot, no update needed
      currentHoverDot = bestDot;
      var summary = bestDot.contentSummary || '';
      if (summary.length > 60) summary = summary.substring(0, 60) + '...';
      tooltip.innerHTML =
        '<div class="chart-tooltip-title">#' + (bestDot.turnIndex + 1) + ' · ' + esc(bestDot.role) + '</div>' +
        '<div class="chart-tooltip-tokens">' + fmt(bestDot.totalTokens) + ' tokens · ' + fmtMs(bestDot.latencyMs) + '</div>' +
        (summary ? '<div class="chart-tooltip-summary">' + esc(summary) + '</div>' : '');
      tooltip.style.display = 'block';
      // Position tooltip near cursor, keeping it within the chart container
      var containerRect = canvas.parentElement.getBoundingClientRect();
      var tx = e.clientX - containerRect.left + 14;
      var ty = e.clientY - containerRect.top - 10;
      // Prevent overflow
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

  // Also hide tooltip when leaving the chart container
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
//# sourceMappingURL=overview.js.map