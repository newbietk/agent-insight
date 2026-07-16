"use strict";
// Breakdown tab — token composition cards + stacked bar chart.
// Extracted from webviewContent.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBreakdownTab = renderBreakdownTab;
exports.renderBreakdownJS = renderBreakdownJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderBreakdownTab() {
    return `
<div id="tab-breakdown" class="tab-panel">
  <div class="cards" id="breakdownCards"></div>
  <div id="breakdownCostBar"></div>
  <div class="chart-container">
    <div class="chart-title">${(0, shared_1.escHtml)((0, i18n_1.t)('breakdown.title'))}</div>
    <canvas id="tokenCompositionChart"></canvas>
  </div>
</div>`;
}
function renderBreakdownJS() {
    return `
// ── Token Breakdown ──
function renderBreakdown() {
  var cards = document.getElementById('breakdownCards');
  if (!cards) return;
  var ast = assistantTurns;
  var totalIn = 0, totalOut = 0, totalReason = 0, totalCacheR = 0, totalCacheW = 0;
  for (var i = 0; i < ast.length; i++) {
    var t = ast[i];
    totalIn += toNumber(t.inputTokens);
    totalOut += toNumber(t.outputTokens);
    totalReason += toNumber(t.reasoningTokens);
    totalCacheR += toNumber(t.cacheReadTokens);
    totalCacheW += toNumber(t.cacheWriteTokens);
  }
  var totalCache = totalCacheR + totalCacheW;
  var grand = totalIn + totalOut + totalReason + totalCache || 1;

  cards.innerHTML = [
    {label:__('breakdown.inputLabel'), val:fmt(totalIn), cls:'tokens', pct:(totalIn/grand*100).toFixed(1)+'%'},
    {label:__('breakdown.outputLabel'), val:fmt(totalOut), cls:'', pct:(totalOut/grand*100).toFixed(1)+'%'},
    {label:__('breakdown.reasoningLabel'), val:fmt(totalReason), cls:'', pct:(totalReason/grand*100).toFixed(1)+'%'},
    {label:__('breakdown.cacheReadLabel'), val:fmt(totalCacheR), cls:'', pct:(totalCacheR/grand*100).toFixed(1)+'%'},
    {label:__('breakdown.cacheWriteLabel'), val:fmt(totalCacheW), cls:'', pct:(totalCacheW/grand*100).toFixed(1)+'%'},
  ].map(function(c) {
    return '<div class="card"><div class="card-label">'+c.label+'</div><div class="card-value '+c.cls+'">'+c.val+'</div><div class="card-sub">'+c.pct+__('breakdown.ofTotal')+'</div></div>';
  }).join('');

  // Insert cost bar + legend after cards
  var barHtml = '<div class="cost-bar">';
  if (totalIn > 0) barHtml += '<div class="cost-seg input" style="flex:' + totalIn + '">' + (totalIn/grand*100).toFixed(0) + '%</div>';
  if (totalOut > 0) barHtml += '<div class="cost-seg output" style="flex:' + totalOut + '">' + (totalOut/grand*100).toFixed(0) + '%</div>';
  if (totalCache > 0) barHtml += '<div class="cost-seg cache" style="flex:' + totalCache + '">' + (totalCache/grand*100).toFixed(0) + '%</div>';
  barHtml += '</div>' +
    '<div class="cost-legend">' +
      '<span class="input">' + __('breakdown.input', fmt(totalIn)) + '</span>' +
      '<span class="output">' + __('breakdown.output', fmt(totalOut)) + '</span>' +
      '<span class="cache">' + __('breakdown.cache', fmt(totalCache)) + '</span>' +
    '</div>';
  var costBar = document.getElementById('breakdownCostBar');
  if (costBar) costBar.innerHTML = barHtml;
}

// ── Token Composition Chart ──
function drawTokenCompositionChart() {
  var canvas = document.getElementById('tokenCompositionChart');
  if (!canvas || assistantTurns.length === 0) return;
  var parent = canvas.parentElement;
  if (!parent) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = parent.clientWidth - 32;
  var H = 220;
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
    var bt = assistantTurns[i];
    maxVal = Math.max(maxVal, toNumber(bt.inputTokens) + toNumber(bt.outputTokens) + toNumber(bt.cacheReadTokens) + toNumber(bt.cacheWriteTokens));
  }

  ctx.fillStyle = '#fafafc';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (var gi = 0; gi <= 4; gi++) {
    var gy = pad.top + ph * (1 - gi/4);
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(Math.round(maxVal * gi / 4)), pad.left - 8, gy + 4);
  }

  var step = Math.max(1, Math.floor(assistantTurns.length / 40));
  var barW = Math.max(3, Math.min(20, (pw / assistantTurns.length) * step - 1));

  for (var bi = 0; bi < assistantTurns.length; bi += step) {
    var at = assistantTurns[bi];
    var bx = pad.left + (bi / (assistantTurns.length - 1 || 1)) * pw;
    var inH = ph * toNumber(at.inputTokens) / maxVal;
    var outH = ph * toNumber(at.outputTokens) / maxVal;
    var cacheH = ph * (toNumber(at.cacheReadTokens) + toNumber(at.cacheWriteTokens)) / maxVal;
    var base = pad.top + ph;

    if (cacheH > 0.5) { ctx.fillStyle = '#c586c0'; ctx.fillRect(bx - barW/2, base - inH - outH - cacheH, barW, Math.max(1, cacheH)); }
    if (outH > 0.5) { ctx.fillStyle = '#4ec9b0'; ctx.fillRect(bx - barW/2, base - inH - outH, barW, Math.max(1, outH)); }
    if (inH > 0.5) { ctx.fillStyle = '#569cd6'; ctx.fillRect(bx - barW/2, base - inH, barW, Math.max(1, inH)); }
  }

  // Legend
  var ly = H - 6;
  ctx.font = '10px -apple-system, sans-serif';
  var legend = [{label:__('chart.input'),color:'#569cd6'},{label:__('chart.output'),color:'#4ec9b0'},{label:__('chart.cache'),color:'#c586c0'}];
  for (var lz = 0; lz < legend.length; lz++) {
    var llx = pad.left + lz * 80;
    ctx.fillStyle = legend[lz].color;
    ctx.fillRect(llx, ly - 10, 10, 10);
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText(legend[lz].label, llx + 14, ly);
  }
}
`;
}
//# sourceMappingURL=breakdown.js.map