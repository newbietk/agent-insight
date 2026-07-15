"use strict";
// Context tab — multi-agent context growth chart with compact markers + turn bars + summary.
// Enhanced from parent project ContextTracker.tsx, adapted for vanilla JS webview.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderContextTab = renderContextTab;
exports.renderContextJS = renderContextJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderContextTab() {
    return `
<div id="tab-context" class="tab-panel">
  <!-- Agent summary cards -->
  <div class="cards" id="contextAgentCards"></div>

  <!-- Multi-agent growth chart -->
  <div class="chart-container" style="position:relative">
    <div class="chart-title">📈 ${(0, shared_1.escHtml)((0, i18n_1.t)('context.growthTitle'))}</div>
    <div id="contextGrowthChart" style="overflow-x:auto;max-height:460px"></div>
    <!-- Legend -->
    <div id="contextLegend" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:8px 0;font-size:11px"></div>
  </div>

  <!-- Summary stats -->
  <div class="ctx-summary" id="ctxSummary">
    <div class="ctx-summary-title">${(0, shared_1.escHtml)((0, i18n_1.t)('context.summary'))}</div>
    <div class="ctx-summary-grid" id="ctxSummaryGrid"></div>
  </div>
</div>`;
}
function renderContextJS() {
    return `
// ── Context Tab — Multi-Agent Growth Chart + Turn Bars ──

var CTX_AGENT_COLORS = ['#569cd6', '#4ec9b0', '#ce9178', '#c586c0', '#dcdcaa', '#d16969', '#608b4e', '#b5cea8'];

// ── Agent stats computation ──

function computeContextAgentStats() {
  // Group turns by subagentSessionId
  var sessionMap = {};
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (toNumber(t.totalTokens) <= 0) continue;
    var sid = t.isSubagent && t.subagentSessionId ? t.subagentSessionId : 'root';
    if (!sessionMap[sid]) sessionMap[sid] = [];
    sessionMap[sid].push(t);
  }

  // Detect /compact and continuation turns
  var compactEvents = [];
  var contTurns = [];
  for (var j = 0; j < turns.length; j++) {
    var ut = turns[j];
    if (ut.role !== 'user' || ut.isSubagent) continue;
    var txt = (ut.contentSummary || ut.content || '').toLowerCase();
    // Detect /compact command
    if (txt.indexOf('<command-name>/compact</command-name>') >= 0 || txt.indexOf('/compact') >= 0) {
      compactEvents.push({ turnIndex: ut.turnIndex, timestamp: ut.createdAt_ts, note: '/compact' });
    }
    // Detect continuation turn
    if (txt.indexOf('<command-name>') < 0 && (txt.indexOf('subagent') >= 0 || txt.indexOf('continu') >= 0)) {
      // Heuristic: short user turns right after compact might be continuation
    }
  }
  // For each compact, find the matching continuation (next user turn)
  for (var c = 0; c < compactEvents.length; c++) {
    var ce = compactEvents[c];
    // Find next non-command user turn
    for (var u = 0; u < turns.length; u++) {
      var cut = turns[u];
      if (cut.role !== 'user' || cut.turnIndex <= ce.turnIndex) continue;
      var ctxt = (cut.contentSummary || '').toLowerCase();
      if (ctxt.indexOf('<command-name>') < 0 && ctxt.indexOf('/') < 0) {
        ce.contTurnIndex = cut.turnIndex;
        ce.contTimestamp = cut.createdAt_ts;
        break;
      }
    }
  }

  var stats = [];
  var sessionIds = Object.keys(sessionMap);
  for (var si = 0; si < sessionIds.length; si++) {
    var sid = sessionIds[si];
    var agentTurns = sessionMap[sid];
    var isRoot = sid === 'root';
    var agentName = (agentTurns[0].agentName || (isRoot ? 'Main Agent' : 'Subagent'));
    var realInput = [], cacheRead = [], ctxPcts = [];
    for (var ai = 0; ai < agentTurns.length; ai++) {
      realInput.push(toNumber(agentTurns[ai].totalTokens));
      cacheRead.push(toNumber(agentTurns[ai].cacheReadTokens));
      var cp = toNumber(agentTurns[ai].contextWindowPct);
      if (cp > 0) ctxPcts.push(cp);
    }
    var peak = Math.max.apply(null, realInput);
    var sum = 0; for (var ri = 0; ri < realInput.length; ri++) sum += realInput[ri];
    var avg = Math.round(sum / realInput.length);
    var minVal = Math.min.apply(null, realInput);
    var avgGrowth = agentTurns.length > 1 ? Math.round((realInput[realInput.length - 1] - realInput[0]) / (agentTurns.length - 1)) : 0;

    var totalCacheHit = 0, totalForCache = 0;
    for (var ci = 0; ci < realInput.length; ci++) {
      totalCacheHit += cacheRead[ci];
      totalForCache += realInput[ci] + cacheRead[ci];
    }
    var cacheHitRate = totalForCache > 0 ? totalCacheHit / totalForCache : 0;
    var maxCtxPct = ctxPcts.length > 0 ? Math.max.apply(null, ctxPcts) : 0;

    // Events
    var events = [];
    if (agentTurns.length > 0) {
      events.push({ type: 'start', turnIndex: agentTurns[0].turnIndex, contextSize: realInput[0], note: isRoot ? 'Session start' : 'Subagent start' });
    }
    for (var gi = 1; gi < agentTurns.length; gi++) {
      var growth = realInput[gi] - realInput[gi - 1];
      if (growth > 5000) {
        events.push({ type: 'growth', turnIndex: agentTurns[gi].turnIndex, contextSize: realInput[gi], growth: growth, note: 'Growth +' + fmt(growth) });
      }
    }
    // Peak
    var peakTurn = agentTurns[0];
    for (var pi = 0; pi < agentTurns.length; pi++) {
      if (realInput[pi] > toNumber(peakTurn.totalTokens)) peakTurn = agentTurns[pi];
    }
    if (toNumber(peakTurn.totalTokens) > 0) {
      var pct = toNumber(peakTurn.contextWindowPct) || (toNumber(peakTurn.totalTokens) / ctxLimit * 100);
      events.push({ type: 'peak', turnIndex: peakTurn.turnIndex, contextSize: toNumber(peakTurn.totalTokens), note: pct > 80 ? 'Near limit (' + (ctxLimit/1000).toFixed(0) + 'K)' : 'Peak' });
    }
    // Warnings
    for (var wi = 0; wi < agentTurns.length; wi++) {
      var wpct = toNumber(agentTurns[wi].contextWindowPct);
      if (wpct > 80 && agentTurns[wi].turnIndex !== peakTurn.turnIndex) {
        events.push({ type: 'warning', turnIndex: agentTurns[wi].turnIndex, contextSize: realInput[wi], note: 'Window ' + wpct.toFixed(1) + '%' });
      }
    }
    if (agentTurns.length > 0) {
      events.push({ type: 'end', turnIndex: agentTurns[agentTurns.length - 1].turnIndex, contextSize: realInput[agentTurns.length - 1], note: isRoot ? 'Session end' : 'Subagent end' });
    }

    // Merge compact events into root
    if (isRoot && compactEvents.length > 0) {
      for (var cei = 0; cei < compactEvents.length; cei++) {
        var ce2 = compactEvents[cei];
        events.push({
          type: 'compact',
          turnIndex: ce2.turnIndex,
          contextSize: 0,
          note: ce2.note || '/compact',
          contTurnIndex: ce2.contTurnIndex,
          contTimestamp: ce2.contTimestamp
        });
      }
    }
    // Sort events by turnIndex
    events.sort(function(a, b) { return a.turnIndex - b.turnIndex; });

    stats.push({
      sessionId: sid, agentName: agentName, isRoot: isRoot,
      turns: agentTurns, peak: peak, average: avg, min: minVal,
      totalTurns: agentTurns.length, avgGrowthPerTurn: avgGrowth,
      cacheHitRate: cacheHitRate, maxContextWindowPct: maxCtxPct,
      events: events
    });
  }

  // Sort: root first, then by peak desc
  stats.sort(function(a, b) {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    return b.peak - a.peak;
  });

  return stats;
}

// ── Render agent cards ──

function renderContextAgentCards() {
  var container = document.getElementById('contextAgentCards');
  if (!container) return;

  var agentStats = computeContextAgentStats();
  if (agentStats.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📊</div>' + __('context.noData') + '</div>';
    return;
  }

  var displayStats = agentStats.slice(0, 6); // Max 6 cards
  var html = '';
  for (var i = 0; i < displayStats.length; i++) {
    var s = displayStats[i];
    var color = CTX_AGENT_COLORS[i % CTX_AGENT_COLORS.length];
    var hasWarning = s.maxContextWindowPct > 80;
    var label = s.isRoot ? s.agentName : (s.agentName.substring(0, 16));
    if (s.agentName.length > 16) label += '..';

    html += '<div class="card" style="cursor:pointer;' + (hasWarning ? 'border-color:var(--yellow)' : '') + '" data-ctx-agent="' + esc(s.sessionId) + '">';
    html += '<div class="card-label" style="color:' + color + '">' + esc(label) + ' ' + (s.isRoot ? '👑' : '🤖') + '</div>';
    html += '<div style="display:flex;gap:12px;font-size:11px;margin-top:4px">';
    html += '<span><span style="color:var(--text-dim)">' + __('context.cardPeak') + '</span> ' + fmt(s.peak) + '</span>';
    html += '<span><span style="color:var(--text-dim)">' + __('context.cardAvg') + '</span> ' + fmt(s.average) + '</span>';
    html += '<span><span style="color:var(--text-dim)">' + __('context.cardCache') + '</span> ' + (s.cacheHitRate * 100).toFixed(0) + '%</span>';
    if (s.maxContextWindowPct > 0) {
      html += '<span style="color:' + (s.maxContextWindowPct > 80 ? 'var(--red)' : 'var(--text-dim)') + '">' + s.maxContextWindowPct.toFixed(1) + '%</span>';
    }
    html += '</div>';
    html += '<div class="card-sub">' + s.totalTurns + ' ' + __('context.cardTurns') + (s.isRoot ? '' : ' · ' + esc(s.agentName)) + '</div>';
    html += '</div>';
  }
  container.innerHTML = html;

  // Store stats globally for SVG chart
  window._contextAgentStats = agentStats;

  // Click card -> scroll to that agent's line in chart
  container.querySelectorAll('[data-ctx-agent]').forEach(function(card) {
    card.addEventListener('click', function() {
      var sid = this.getAttribute('data-ctx-agent');
      // Highlight in chart
      window._contextHighlight = sid;
      renderContextGrowthChart();
    });
  });
}

// ── Multi-agent SVG growth chart ──

function renderContextGrowthChart() {
  var container = document.getElementById('contextGrowthChart');
  var legend = document.getElementById('contextLegend');
  if (!container) return;

  var agentStats = window._contextAgentStats || computeContextAgentStats();

  var allPoints = [];
  for (var si = 0; si < agentStats.length; si++) {
    var s = agentStats[si];
    for (var ti = 0; ti < s.turns.length; ti++) {
      var t = s.turns[ti];
      var ts = t.createdAt_ts ? new Date(t.createdAt_ts).getTime() : 0;
      allPoints.push({ sessionId: s.sessionId, turnIndex: t.turnIndex != null ? t.turnIndex : ti, ts: ts, tokens: toNumber(t.totalTokens), turn: t });
    }
  }

  if (allPoints.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📈</div>' + __('context.noData') + '</div>';
    if (legend) legend.innerHTML = '';
    return;
  }

  // Chart dimensions
  var SVG_H = 420;
  var PAD = { top: 36, bottom: 40, left: 60, right: 30 };
  var plotW = agentStats.length > 1 ? 900 : 600;
  var SVG_W = plotW + PAD.left + PAD.right;
  var plotH = SVG_H - PAD.top - PAD.bottom;
  var baseline = SVG_H - PAD.bottom;

  // Compute ranges
  var minTs = Infinity, maxTs = -Infinity, maxVal = 1;
  for (var p = 0; p < allPoints.length; p++) {
    if (allPoints[p].ts < minTs) minTs = allPoints[p].ts;
    if (allPoints[p].ts > maxTs) maxTs = allPoints[p].ts;
    if (allPoints[p].tokens > maxVal) maxVal = allPoints[p].tokens;
  }
  var timeRange = (maxTs - minTs) || 1;
  var yMax = Math.min(Math.ceil(maxVal * 1.15 / 10000) * 10000, ctxLimit * 1.2);
  if (yMax < ctxLimit) yMax = ctxLimit;

  function toX(ts) { return PAD.left + ((ts - minTs) / timeRange) * plotW; }
  function toY(tokens) { return PAD.top + plotH - (tokens / yMax) * plotH; }

  // Build SVG
  var svg = '<svg width="' + SVG_W + '" height="' + SVG_H + '" viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" style="display:block">';

  // Background
  svg += '<rect width="' + SVG_W + '" height="' + SVG_H + '" fill="' + (typeof currentTheme !== 'undefined' && currentTheme === 'light' ? '#fafafc' : '#1b1e2b') + '" rx="6"/>';

  // Context limit zones
  var safeY = toY(ctxLimit * 0.5);
  var cautionY = toY(ctxLimit * 0.8);
  var limitY = toY(ctxLimit);
  svg += '<rect x="' + PAD.left + '" y="' + safeY + '" width="' + plotW + '" height="' + (baseline - safeY) + '" fill="#22c55e" opacity="0.04"/>';
  svg += '<rect x="' + PAD.left + '" y="' + cautionY + '" width="' + plotW + '" height="' + (safeY - cautionY) + '" fill="#eab308" opacity="0.05"/>';
  svg += '<rect x="' + PAD.left + '" y="' + limitY + '" width="' + plotW + '" height="' + (cautionY - limitY) + '" fill="#ef4444" opacity="0.06"/>';

  // Zone boundary lines
  if (safeY > PAD.top) svg += '<line x1="' + PAD.left + '" y1="' + safeY + '" x2="' + (PAD.left + plotW) + '" y2="' + safeY + '" stroke="#22c55e" stroke-width="1" stroke-dasharray="6 4" opacity="0.35"/>';
  if (cautionY > PAD.top) svg += '<line x1="' + PAD.left + '" y1="' + cautionY + '" x2="' + (PAD.left + plotW) + '" y2="' + cautionY + '" stroke="#eab308" stroke-width="1" stroke-dasharray="6 4" opacity="0.4"/>';

  // Context limit line
  if (limitY >= PAD.top && limitY <= baseline) {
    svg += '<line x1="' + PAD.left + '" y1="' + limitY + '" x2="' + (PAD.left + plotW) + '" y2="' + limitY + '" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="8 4"/>';
    svg += '<text x="' + (PAD.left + 6) + '" y="' + (limitY - 5) + '" font-size="9" fill="#ef4444">' + __('context.modelLimit', fmt(ctxLimit)) + '</text>';
  }

  // Y-axis grid and labels
  var yStep = yMax <= 20000 ? 5000 : yMax <= 100000 ? 20000 : 40000;
  for (var v = 0; v <= yMax; v += yStep) {
    var gy = toY(v);
    svg += '<line x1="' + PAD.left + '" y1="' + gy + '" x2="' + (PAD.left + plotW) + '" y2="' + gy + '" stroke="var(--border)" stroke-width="0.5" opacity="0.5"/>';
    svg += '<text x="' + (PAD.left - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="#888">' + fmt(v) + '</text>';
  }

  // X-axis time ticks
  var timeStepMs = timeRange <= 600000 ? 120000 : timeRange <= 3600000 ? 600000 : 7200000;
  for (var ts = minTs - (minTs % timeStepMs); ts <= maxTs; ts += timeStepMs) {
    var tx = toX(ts);
    if (tx < PAD.left || tx > PAD.left + plotW) continue;
    svg += '<line x1="' + tx + '" y1="' + baseline + '" x2="' + tx + '" y2="' + (baseline + 6) + '" stroke="#888" stroke-width="0.5"/>';
    var d = new Date(ts);
    svg += '<text x="' + tx + '" y="' + (baseline + 18) + '" text-anchor="middle" font-size="9" fill="#888">' + (d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')) + '</text>';
  }

  // Plot border
  svg += '<rect x="' + PAD.left + '" y="' + PAD.top + '" width="' + plotW + '" height="' + plotH + '" fill="none" stroke="var(--border)" stroke-width="0.5" rx="2"/>';

  // Percentage labels on right
  svg += '<text x="' + (PAD.left + plotW + 6) + '" y="' + (safeY + 4) + '" font-size="9" fill="#22c55e" font-weight="bold">50%</text>';
  svg += '<text x="' + (PAD.left + plotW + 6) + '" y="' + (cautionY + 4) + '" font-size="9" fill="#eab308" font-weight="bold">80%</text>';
  svg += '<text x="' + (PAD.left + plotW + 6) + '" y="' + (limitY + 4) + '" font-size="9" fill="#ef4444" font-weight="bold">100%</text>';

  // Agent lines
  var highlight = window._contextHighlight || null;

  for (var li = 0; li < agentStats.length; li++) {
    var ls = agentStats[li];
    var lcolor = CTX_AGENT_COLORS[li % CTX_AGENT_COLORS.length];
    var isActive = highlight === ls.sessionId;
    var isDimmed = highlight && !isActive;

    // Build points sorted by time
    var pts = [];
    for (var pti = 0; pti < ls.turns.length; pti++) {
      var lt = ls.turns[pti];
      var lts = lt.createdAt_ts ? new Date(lt.createdAt_ts).getTime() : 0;
      pts.push({ x: toX(lts), y: toY(toNumber(lt.totalTokens)), turnIndex: lt.turnIndex != null ? lt.turnIndex : pti, turn: lt });
    }

    if (pts.length < 1) continue;

    // Polyline
    var opacity = isDimmed ? 0.15 : 1;
    svg += '<g opacity="' + opacity + '">';
    var polyline = '';
    for (var pti2 = 0; pti2 < pts.length; pti2++) {
      polyline += (pti2 === 0 ? 'M ' : ' L ') + pts[pti2].x.toFixed(1) + ',' + pts[pti2].y.toFixed(1);
    }
    svg += '<path d="' + polyline + '" fill="none" stroke="' + lcolor + '" stroke-width="' + (ls.isRoot ? 2 : 1.5) + '" stroke-linejoin="round"/>';

    // Dots — each is clickable to jump to the turn in Turns tab
    for (var dti = 0; dti < pts.length; dti++) {
      var r = ls.isRoot ? 2.5 : 2;
      if (isActive) r = 3.5;
      var turnId = pts[dti].turn.id || '';
      svg += '<circle class="ctx-chart-dot" data-turn-id="' + esc(turnId) + '" cx="' + pts[dti].x.toFixed(1) + '" cy="' + pts[dti].y.toFixed(1) + '" r="' + r + '" fill="' + lcolor + '" stroke="' + (typeof currentTheme !== 'undefined' && currentTheme === 'light' ? '#fff' : '#1b1e2b') + '" stroke-width="1" cursor="pointer"/>';
    }

    // Event markers (growth, peak, warning)
    for (var ei = 0; ei < ls.events.length; ei++) {
      var evt = ls.events[ei];
      if (evt.type === 'start' || evt.type === 'end' || evt.type === 'compact') continue;
      // Find matching point
      var ept = null;
      for (var epi = 0; epi < pts.length; epi++) {
        if (pts[epi].turnIndex === evt.turnIndex) { ept = pts[epi]; break; }
      }
      if (!ept) continue;

      if (evt.type === 'growth') {
        svg += '<polygon points="' + ept.x.toFixed(1) + ',' + (ept.y - 10) + ' ' + (ept.x + 5).toFixed(1) + ',' + (ept.y + 2) + ' ' + (ept.x - 5).toFixed(1) + ',' + (ept.y + 2) + '" fill="' + lcolor + '" opacity="0.85"/>';
      } else if (evt.type === 'peak') {
        svg += '<polygon points="' + ept.x.toFixed(1) + ',' + (ept.y - 10) + ' ' + (ept.x + 4).toFixed(1) + ',' + (ept.y - 3) + ' ' + (ept.x + 8).toFixed(1) + ',' + ept.y.toFixed(1) + ' ' + (ept.x + 4).toFixed(1) + ',' + (ept.y + 4) + ' ' + ept.x.toFixed(1) + ',' + (ept.y + 10) + ' ' + (ept.x - 4).toFixed(1) + ',' + (ept.y + 4) + ' ' + (ept.x - 8).toFixed(1) + ',' + ept.y.toFixed(1) + ' ' + (ept.x - 4).toFixed(1) + ',' + (ept.y - 3) + '" fill="#f59e0b" opacity="0.9"/>';
      } else if (evt.type === 'warning') {
        svg += '<polygon points="' + ept.x.toFixed(1) + ',' + (ept.y - 9) + ' ' + (ept.x + 7).toFixed(1) + ',' + (ept.y + 5) + ' ' + (ept.x - 7).toFixed(1) + ',' + (ept.y + 5) + '" fill="#ef4444" opacity="0.9"/>';
        svg += '<text x="' + ept.x.toFixed(1) + '" y="' + (ept.y - 2) + '" text-anchor="middle" font-size="8" fill="white" font-weight="bold">!</text>';
      }
    }

    // End-of-line label
    var lastPt = pts[pts.length - 1];
    var label = ls.isRoot ? ls.agentName : (ls.agentName.substring(0, 12));
    var lx = lastPt.x + 6, ly = lastPt.y - 4;
    // Adjust if label goes beyond chart
    if (lx + (label.length * 6.5) > PAD.left + plotW) {
      lx = lastPt.x - 6 - (label.length * 6.5);
    }
    svg += '<rect x="' + (lx - 4) + '" y="' + (ly - 9) + '" width="' + (label.length * 6.5 + 8) + '" height="14" rx="3" fill="' + (typeof currentTheme !== 'undefined' && currentTheme === 'light' ? '#fff' : '#1b1e2b') + '" fill-opacity="0.85"/>';
    svg += '<text x="' + lx + '" y="' + (ly + 2) + '" font-size="9" fill="' + lcolor + '" font-weight="' + (ls.isRoot ? '600' : '400') + '">' + label + '</text>';

    svg += '</g>';
  }

  // /compact event markers on root agent
  var rootStats = null;
  for (var rsi = 0; rsi < agentStats.length; rsi++) {
    if (agentStats[rsi].isRoot) { rootStats = agentStats[rsi]; break; }
  }
  if (rootStats) {
    var compactEvts = rootStats.events.filter(function(e) { return e.type === 'compact'; });
    for (var cei = 0; cei < compactEvts.length; cei++) {
      var ce3 = compactEvts[cei];
      var ceTurn = null;
      for (var ceti = 0; ceti < rootStats.turns.length; ceti++) {
        if (rootStats.turns[ceti].turnIndex === ce3.turnIndex) { ceTurn = rootStats.turns[ceti]; break; }
      }
      if (!ceTurn) continue;
      var ceTs = ceTurn.createdAt_ts ? new Date(ceTurn.createdAt_ts).getTime() : 0;
      if (!ceTs) continue;
      var cex = toX(ceTs);

      // Dashed vertical line at compact point
      svg += '<line x1="' + cex + '" y1="' + PAD.top + '" x2="' + cex + '" y2="' + baseline + '" stroke="#8b5cf6" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.6"/>';

      // Shaded zone for compact→continuation
      if (ce3.contTurnIndex && ce3.contTimestamp) {
        var contTurn = null;
        for (var cti = 0; cti < rootStats.turns.length; cti++) {
          if (rootStats.turns[cti].turnIndex === ce3.contTurnIndex) { contTurn = rootStats.turns[cti]; break; }
        }
        if (contTurn) {
          var contTs = contTurn.createdAt_ts ? new Date(contTurn.createdAt_ts).getTime() : 0;
          if (contTs > ceTs) {
            var contX = toX(contTs);
            svg += '<rect x="' + cex + '" y="' + PAD.top + '" width="' + (contX - cex) + '" height="' + plotH + '" fill="#8b5cf6" opacity="0.06"/>';
            svg += '<line x1="' + contX + '" y1="' + PAD.top + '" x2="' + contX + '" y2="' + baseline + '" stroke="#8b5cf6" stroke-width="1" stroke-dasharray="3 3" opacity="0.4"/>';
          }
        }
      }

      // Icon badge at top
      var iconY = PAD.top + 6;
      svg += '<rect x="' + (cex - 6) + '" y="' + iconY + '" width="12" height="14" rx="2" fill="#8b5cf6" opacity="0.9"/>';
      svg += '<text x="' + cex + '" y="' + (iconY + 10) + '" text-anchor="middle" font-size="8" fill="white" font-weight="bold">⚡</text>';
      svg += '<text x="' + (cex + 8) + '" y="' + (iconY + 14 + cei * 14) + '" font-size="8" fill="#8b5cf6">' + (ce3.note || '/compact') + '</text>';
    }
  }

  svg += '</svg>';
  container.innerHTML = svg;

  // Bind click handlers on dots → jump to Turns tab
  container.querySelectorAll('.ctx-chart-dot').forEach(function(dot) {
    dot.addEventListener('click', function(e) {
      e.stopPropagation();
      var tid = this.getAttribute('data-turn-id');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });

  // Render legend
  if (legend) {
    var legendHtml = '<span style="color:var(--text-dim);font-size:10px">' + __('context.legendAgents') + ':</span> ';
    for (var lgi = 0; lgi < agentStats.length; lgi++) {
      var lgs = agentStats[lgi];
      var lgcolor = CTX_AGENT_COLORS[lgi % CTX_AGENT_COLORS.length];
      var lglabel = lgs.isRoot ? lgs.agentName : (lgs.agentName.substring(0, 14));
      var isHighlighted = highlight === lgs.sessionId;
      legendHtml += '<span style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;' + (isHighlighted ? 'font-weight:600' : '') + ';' + (highlight && !isHighlighted ? 'opacity:0.4' : '') + '" data-ctx-legend="' + esc(lgs.sessionId) + '">';
      legendHtml += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + lgcolor + '"></span>';
      legendHtml += lglabel + ' (' + lgs.totalTurns + ')</span>';
    }
    legendHtml += ' · <span style="display:inline-flex;align-items:center;gap:2px;font-size:10px"><span style="display:inline-block;width:12px;height:2px;border-top:1.5px dashed #ef4444"></span> ' + __('context.modelLimit', fmt(ctxLimit)) + '</span>';
    if (rootStats && rootStats.events.some(function(e) { return e.type === 'compact'; })) {
      legendHtml += ' · <span style="color:#8b5cf6;font-size:10px">⚡ /compact</span>';
    }
    legend.innerHTML = legendHtml;

    // Click legend to toggle highlight
    legend.querySelectorAll('[data-ctx-legend]').forEach(function(el) {
      el.addEventListener('click', function() {
        var sid = this.getAttribute('data-ctx-legend');
        if (window._contextHighlight === sid) {
          window._contextHighlight = null;
        } else {
          window._contextHighlight = sid;
        }
        renderContextGrowthChart();
      });
    });
  }

  // Click on lines to navigate (via data from agent stats)
  // We add simple click area overlay
  // Skipping complex hover tooltip — vanilla JS limitation
}

// ── Context summary stats ──

function renderContextSummary() {
  var summaryGrid = document.getElementById('ctxSummaryGrid');
  if (!summaryGrid) return;

  var rootAst = [];
  for (var k = 0; k < turns.length; k++) {
    if (!turns[k].isSubagent && turns[k].role === 'assistant') rootAst.push(turns[k]);
  }
  if (rootAst.length === 0) {
    summaryGrid.innerHTML = '<div class="ctx-summary-item"><span>' + __('context.noData') + '</span></div>';
    return;
  }

  var peak = 0, sum = 0, count = 0;
  for (var m = 0; m < rootAst.length; m++) {
    var p = toNumber(rootAst[m].contextWindowPct);
    peak = Math.max(peak, p);
    sum += p;
    count++;
  }
  var avg = count > 0 ? sum / count : 0;
  var highCount = 0;
  for (var n = 0; n < rootAst.length; n++) {
    if (toNumber(rootAst[n].contextWindowPct) > 80) highCount++;
  }

  var agentStats = window._contextAgentStats || computeContextAgentStats();
  var totalSubagents = 0, totalSubTurns = 0;
  for (var as = 0; as < agentStats.length; as++) {
    if (!agentStats[as].isRoot) { totalSubagents++; totalSubTurns += agentStats[as].totalTurns; }
  }

  summaryGrid.innerHTML = [
    {label: __('context.peakUsage'), val: peak.toFixed(1) + '%'},
    {label: __('context.avgUsage'), val: avg.toFixed(1) + '%'},
    {label: __('context.turnsAbove80'), val: String(highCount)},
    {label: __('context.contextLimit'), val: fmt(ctxLimit)},
    {label: __('context.totalAst'), val: String(rootAst.length)},
    {label: __('common.model'), val: esc(session.model || '—')},
    {label: __('context.subAgents'), val: String(totalSubagents)},
    {label: __('context.subAgentTurns'), val: String(totalSubTurns)},
  ].map(function(s) {
    return '<div class="ctx-summary-item"><span>' + s.label + '</span><span>' + s.val + '</span></div>';
  }).join('');
}

// ── Initial draw ──

function initContextTab() {
  renderContextAgentCards();
  renderContextGrowthChart();
  renderContextSummary();
}

// ── Navigation listeners ──

if (window.__kirinai) {
  window.__kirinai.on('navigate:context', function(params) {
    initContextTab();
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