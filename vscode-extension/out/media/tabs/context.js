"use strict";
// Context tab — context window growth bars + summary stats.
// Extracted from webviewContent.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderContextTab = renderContextTab;
exports.renderContextJS = renderContextJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderContextTab() {
    return `
<div id="tab-context" class="tab-panel">
  <div class="chart-container">
    <div class="chart-title">${(0, shared_1.escHtml)((0, i18n_1.t)('context.title'))}</div>
    <div id="contextBars"></div>
  </div>
  <div class="ctx-summary" id="ctxSummary">
    <div class="ctx-summary-title">${(0, shared_1.escHtml)((0, i18n_1.t)('context.summary'))}</div>
    <div class="ctx-summary-grid" id="ctxSummaryGrid"></div>
  </div>
</div>`;
}
function renderContextJS() {
    return `
// ── Context Growth Bars ──
function drawContextBars() {
  var container = document.getElementById('contextBars');
  if (!container) return;
  var mainAst = [];
  for (var i = 0; i < turns.length; i++) {
    if (!turns[i].isSubagent && turns[i].role === 'assistant') {
      mainAst.push(turns[i]);
    }
  }
  if (mainAst.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📊</div>'+__('context.noAst')+'</div>';
    return;
  }

  var html = '';
  for (var j = 0; j < mainAst.length; j++) {
    var t = mainAst[j];
    var pct = t.contextWindowPct != null ? toNumber(t.contextWindowPct) : 0;
    var color = '#4ec9b0';
    if (pct > 80) color = '#f14c4c';
    else if (pct > 60) color = '#ce9178';
    else if (pct > 40) color = '#dcdcaa';

    var turnId = esc(t.id || '');
    html += '<div class="ctx-row" data-turn-id="' + turnId + '" style="cursor:pointer" title="' + esc(__('context.jumpToTurn', j+1)) + '">' +
      '<span class="ctx-label">#' + (j+1) + '</span>' +
      '<div class="ctx-bar-outer">' +
        '<div class="ctx-bar-inner" style="width:' + Math.min(pct, 100).toFixed(1) + '%; background:' + color + '"></div>' +
      '</div>' +
      '<span class="ctx-pct">' + pct.toFixed(1) + '%</span>' +
    '</div>';
  }
  container.innerHTML = html;

  // Click on context bar → jump to turns tab
  container.querySelectorAll('.ctx-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var tid = this.getAttribute('data-turn-id');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });

  // Context summary stats
  var summaryGrid = document.getElementById('ctxSummaryGrid');
  if (!summaryGrid) return;
  var peak = 0, sum = 0, count = 0;
  for (var k = 0; k < mainAst.length; k++) {
    var p = toNumber(mainAst[k].contextWindowPct);
    peak = Math.max(peak, p);
    sum += p;
    count++;
  }
  var avg = count > 0 ? sum / count : 0;
  var highCount = 0;
  for (var m = 0; m < mainAst.length; m++) {
    if (toNumber(mainAst[m].contextWindowPct) > 80) highCount++;
  }
  summaryGrid.innerHTML = [
    {label: __('context.peakUsage'), val: peak.toFixed(1) + '%'},
    {label: __('context.avgUsage'), val: avg.toFixed(1) + '%'},
    {label: __('context.turnsAbove80'), val: String(highCount)},
    {label: __('context.contextLimit'), val: fmt(ctxLimit)},
    {label: __('context.totalAst'), val: String(mainAst.length)},
    {label: __('common.model'), val: esc(session.model || '—')},
  ].map(function(s) {
    return '<div class="ctx-summary-item"><span>'+s.label+'</span><span>'+s.val+'</span></div>';
  }).join('');
}

// ── Navigation listeners for context tab ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:context', function(params) {
    drawContextBars();
    if (params && params.turnId) {
      setTimeout(function() {
        var row = document.querySelector('.ctx-row[data-turn-id="' + esc(params.turnId) + '"]');
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.background = 'rgba(98,154,240,0.15)';
          setTimeout(function() { row.style.background = ''; }, 2000);
        }
      }, 100);
    }
  });
}
`;
}
//# sourceMappingURL=context.js.map