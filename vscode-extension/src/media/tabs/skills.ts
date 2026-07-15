// Skills tab — expandable summary table + per-agent breakdown + charts.
// Enhanced from parent project SkillDetail + SkillCharts + SkillEventList.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderSkillsTab(): string {
  return `
<div id="tab-skills" class="tab-panel">
  <!-- Expandable summary table with token breakdown -->
  <div class="table-wrap" style="margin-bottom:16px">
    <div class="table-header">Skills Overview</div>
    <div style="max-height: 600px; overflow-y: auto;">
      <table>
        <thead><tr>
          <th style="width:20px"></th>
          <th>${escHtml(t('skills.colSkill'))}</th>
          <th style="width:50px">Ver</th>
          <th style="width:50px">Calls</th>
          <th style="width:36px">✓</th>
          <th style="width:36px">✗</th>
          <th style="width:60px">${escHtml(t('skills.colDuration'))}</th>
          <th style="width:55px">Input</th>
          <th style="width:55px">Output</th>
          <th style="width:55px">Reason</th>
          <th style="width:55px">Cache</th>
          <th style="width:60px">Total</th>
        </tr></thead>
        <tbody id="skillsSummaryBody"></tbody>
      </table>
    </div>
  </div>

  <!-- Per-Agent Skills -->
  <div id="skillsPerAgent"></div>

  <!-- Failed Skills -->
  <div id="skillsFailed"></div>

  <!-- Full event list -->
  <div class="table-wrap">
    <div class="table-header" style="display:flex;align-items:center;justify-content:space-between">
      <span>${escHtml(t('skills.allEvents'))}</span>
      <span id="skillsFilterLabel" style="font-size:11px;color:var(--accent);cursor:pointer;display:none">✕ Clear filter</span>
    </div>
    <div style="max-height: 500px; overflow-y: auto;">
      <table>
        <thead><tr>
          <th>${escHtml(t('skills.colSkill'))}</th>
          <th>${escHtml(t('skills.colTurn'))}</th>
          <th>${escHtml(t('skills.colEvent'))}</th>
          <th>${escHtml(t('skills.colStatus'))}</th>
          <th>${escHtml(t('skills.colDuration'))}</th>
          <th>${escHtml(t('skills.colAgent'))}</th>
          <th>Tokens</th>
        </tr></thead>
        <tbody id="skillsTableBody"></tbody>
      </table>
    </div>
  </div>
</div>`;
}

export function renderSkillsJS(): string {
  return `
// ── Skills Tab ──

var skillsAllEvents = [];  // populated by renderSkills()
var skillsActiveFilter = null;

function renderSkills() {
  // Collect all skill events from turns
  skillsAllEvents = [];
  var skillMap = {};       // skillName -> aggregate stats (includes events array)
  var agentMap = {};       // agentName -> skills breakdown

  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (!t.skillEvents || t.skillEvents.length === 0) continue;
    var agentName = t.agentName || (t.isSubagent ? 'subagent' : 'root');
    for (var j = 0; j < t.skillEvents.length; j++) {
      var se = t.skillEvents[j];
      var key = se.skillName;
      var entry = {
        skillName: se.skillName,
        skillVersion: se.skillVersion != null ? se.skillVersion : null,
        eventType: se.eventType,
        success: se.success,
        errorMessage: se.errorMessage || null,
        durationMs: se.durationMs || 0,
        turnIndex: t.turnIndex != null ? t.turnIndex : i,
        turnId: t.id,
        agentName: agentName,
        isSubagent: t.isSubagent,
        turnTokens: {
          total: toNumber(t.totalTokens),
          input: toNumber(t.inputTokens),
          output: toNumber(t.outputTokens),
          reasoning: toNumber(t.reasoningTokens),
          cacheRead: toNumber(t.cacheReadTokens)
        }
      };
      skillsAllEvents.push(entry);

      if (!skillMap[key]) {
        skillMap[key] = {
          name: key, version: se.skillVersion,
          totalEvents: 0, invocations: 0, success: 0, fail: 0, durations: [],
          totalTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0,
          events: []  // store all events for this skill
        };
      }
      var sm = skillMap[key];
      sm.totalEvents++;
      sm.events.push(entry);
      sm.durations.push(se.durationMs || 0);
      if (se.success) sm.success++; else sm.fail++;
      if (se.eventType === 'invoke' || se.eventType === 'use' || se.eventType === 'dispatch') {
        sm.invocations++;
      }

      // Token attribution: only for invoke/use events to avoid double-counting
      if (se.eventType === 'invoke' || se.eventType === 'use') {
        sm.totalTokens += toNumber(t.totalTokens);
        sm.inputTokens += toNumber(t.inputTokens);
        sm.outputTokens += toNumber(t.outputTokens);
        sm.reasoningTokens += toNumber(t.reasoningTokens);
        sm.cacheReadTokens += toNumber(t.cacheReadTokens);
      }

      // Agent aggregation
      if (!agentMap[agentName]) {
        agentMap[agentName] = { name: agentName, totalCalls: 0, totalTokens: 0, skills: {} };
      }
      agentMap[agentName].totalCalls++;
      if (se.eventType === 'invoke' || se.eventType === 'use') {
        agentMap[agentName].totalTokens += toNumber(t.totalTokens);
      }
      if (!agentMap[agentName].skills[key]) {
        agentMap[agentName].skills[key] = { calls: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, total: 0 };
      }
      agentMap[agentName].skills[key].calls++;
      if (se.eventType === 'invoke' || se.eventType === 'use') {
        agentMap[agentName].skills[key].input += toNumber(t.inputTokens);
        agentMap[agentName].skills[key].output += toNumber(t.outputTokens);
        agentMap[agentName].skills[key].reasoning += toNumber(t.reasoningTokens);
        agentMap[agentName].skills[key].cacheRead += toNumber(t.cacheReadTokens);
        agentMap[agentName].skills[key].total += toNumber(t.totalTokens);
      }
    }
  }

  var skillKeys = Object.keys(skillMap).sort(function(a, b) { return skillMap[b].totalEvents - skillMap[a].totalEvents; });

  // ── Summary table ──
  renderSkillsSummaryTable(skillMap, skillKeys);

  // ── Per-Agent Skills ──
  renderSkillsPerAgent(agentMap);

  // ── Failed Skills ──
  renderSkillsFailed(skillMap, skillKeys);

  // ── Event table ──
  renderSkillsTable(null);
}

// ── Expandable Summary Table ──

var skillsExpandedRows = {};

function renderSkillsSummaryTable(skillMap, skillKeys) {
  var tbody = document.getElementById('skillsSummaryBody');
  if (!tbody) return;

  if (skillKeys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-dim);padding:24px">' + __('skills.noEvents') + '</td></tr>';
    return;
  }

  // Detect shared turns (turns with multiple skills)
  var sharedTurnKeys = {};
  for (var i = 0; i < skillsAllEvents.length; i++) {
    var e = skillsAllEvents[i];
    var tk = e.turnIndex + '-' + (e.isSubagent ? '1' : '0');
    sharedTurnKeys[tk] = (sharedTurnKeys[tk] || 0) + 1;
  }

  var html = '';
  for (var si = 0; si < skillKeys.length; si++) {
    var k = skillKeys[si];
    var sm = skillMap[k];
    var avgMs = sm.durations.length > 0 ? Math.round(sm.durations.reduce(function(a,b){return a+b;},0) / sm.durations.length) : 0;
    var rowId = 'skill-summary-' + si;
    var isExpanded = skillsExpandedRows[rowId] || false;

    // Check if any events in this skill share turns with other skills
    var hasSharedTurns = false;
    for (var ei = 0; ei < sm.events.length; ei++) {
      var etk = sm.events[ei].turnIndex + '-' + (sm.events[ei].isSubagent ? '1' : '0');
      if ((sharedTurnKeys[etk] || 0) > 1) { hasSharedTurns = true; break; }
    }

    html += '<tr class="skill-summary-row" data-skill-row="' + rowId + '" style="cursor:pointer">';
    html += '<td style="text-align:center;font-size:10px;color:var(--text-dim)">' + (isExpanded ? '▼' : '▶') + '</td>';
    html += '<td style="color:var(--purple);font-weight:500">' + esc(sm.name) + '</td>';
    html += '<td style="font-size:10px;color:var(--text-dim)">' + (sm.version != null ? 'v' + sm.version : '—') + '</td>';
    html += '<td class="tabular-nums" style="font-weight:500">' + sm.invocations + '</td>';
    html += '<td style="color:var(--green)">' + sm.success + '</td>';
    html += '<td>' + (sm.fail > 0 ? '<span style="color:var(--red)">' + sm.fail + '</span>' : '0') + '</td>';
    html += '<td class="tabular-nums" style="color:var(--text-dim)">' + (avgMs > 0 ? fmtMs(avgMs) : '—') + '</td>';
    html += '<td class="tabular-nums" style="color:var(--text-dim)">' + fmt(sm.inputTokens) + '</td>';
    html += '<td class="tabular-nums" style="color:var(--text-dim)">' + fmt(sm.outputTokens) + '</td>';
    html += '<td class="tabular-nums" style="color:var(--text-dim)">' + fmt(sm.reasoningTokens) + '</td>';
    html += '<td class="tabular-nums" style="color:var(--text-dim)">' + fmt(sm.cacheReadTokens) + '</td>';
    html += '<td class="tabular-nums" style="font-weight:600">' + fmt(sm.totalTokens);
    if (hasSharedTurns) html += ' <span class="badge badge-yellow" style="font-size:9px;margin-left:3px" title="Some turns shared with other skills">shared</span>';
    html += '</td>';
    html += '</tr>';

    // Expanded detail rows
    if (isExpanded) {
      html += '<tr class="skill-detail-row" data-skill-row="' + rowId + '">';
      html += '<td colspan="12" style="padding:4px 8px 8px 32px;background:rgba(255,255,255,0.01)">';
      html += '<div class="skill-events-detail">';
      for (var di = 0; di < sm.events.length; di++) {
        var de = sm.events[di];
        var dtk = de.turnIndex + '-' + (de.isSubagent ? '1' : '0');
        var isShared = (sharedTurnKeys[dtk] || 0) > 1;
        var evtBadgeCls = (de.eventType === 'load' || de.eventType === 'unload') ? 'badge-blue'
          : (de.eventType === 'dispatch') ? 'badge-yellow' : 'badge-green';
        var successCls = de.success ? 'badge-green' : 'badge-red';
        var successText = de.success ? 'ok' : 'fail';

        html += '<div class="skill-event-item ' + (de.success ? 'skill-event-ok' : 'skill-event-fail') + '">';
        html += '<span class="skill-event-turn" data-turn-id="' + esc(de.turnId) + '" title="Jump to turn">Turn #' + (de.turnIndex + 1) + '</span>';
        html += '<span style="font-size:10px;color:var(--text-dim)">· ' + esc(de.agentName) + (de.isSubagent ? ' (sub)' : '') + '</span>';
        html += '<span class="badge ' + evtBadgeCls + '" style="font-size:9px">' + esc(de.eventType) + '</span>';
        html += '<span class="badge ' + successCls + '" style="font-size:9px">' + successText + '</span>';
        if (de.durationMs > 0) html += '<span style="font-size:10px;color:var(--text-dim)">' + fmtMs(de.durationMs) + '</span>';
        if (de.turnTokens.total > 0) {
          html += '<span style="font-size:10px;color:var(--text-dim);margin-left:auto">';
          html += fmt(de.turnTokens.total) + ' tok';
          html += ' <span style="font-size:9px">(' + fmt(de.turnTokens.input) + ' in / ' + fmt(de.turnTokens.output) + ' out';
          if (de.turnTokens.reasoning > 0) html += ' / ' + fmt(de.turnTokens.reasoning) + ' reason';
          if (de.turnTokens.cacheRead > 0) html += ' / ' + fmt(de.turnTokens.cacheRead) + ' cache';
          html += ')</span>';
          if (isShared) html += ' <span class="badge badge-yellow" style="font-size:8px" title="Token counts shared with other skills in same turn">shared</span>';
          html += '</span>';
        }
        if (de.errorMessage) html += '<span style="font-size:10px;color:var(--red);margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">' + esc(de.errorMessage) + '</span>';
        html += '</div>';
      }
      html += '</div>';
      html += '</td>';
      html += '</tr>';
    }
  }
  tbody.innerHTML = html;

  // Bind click: expand/collapse
  tbody.querySelectorAll('.skill-summary-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var rowId = this.getAttribute('data-skill-row');
      skillsExpandedRows[rowId] = !skillsExpandedRows[rowId];
      renderSkillsSummaryTable(skillMap, skillKeys);
    });
  });

  // Bind click: turn navigation
  tbody.querySelectorAll('.skill-event-turn').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var tid = this.getAttribute('data-turn-id');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── Skills per Agent ──

var skillsAgentExpanded = {};

function renderSkillsPerAgent(agentMap) {
  var container = document.getElementById('skillsPerAgent');
  if (!container) return;

  var agentNames = Object.keys(agentMap).sort(function(a, b) { return agentMap[b].totalTokens - agentMap[a].totalTokens; });
  if (agentNames.length === 0) { container.innerHTML = ''; return; }

  var agentPalette = ['#569cd6', '#4ec9b0', '#ce9178', '#c586c0', '#dcdcaa', '#d16969', '#608b4e', '#b5cea8'];

  var html = '<div class="table-wrap" style="margin-bottom:16px"><div class="table-header">Skills per Agent</div>';
  html += '<div style="padding:4px">';

  for (var ai = 0; ai < agentNames.length; ai++) {
    var aname = agentNames[ai];
    var ag = agentMap[aname];
    var color = agentPalette[ai % agentPalette.length];
    var isExpanded = skillsAgentExpanded[aname] || false;
    var skillNames = Object.keys(ag.skills).sort(function(a, b) { return ag.skills[b].calls - ag.skills[a].calls; });

    html += '<div class="skill-agent-card" style="border-left:3px solid ' + color + ';margin-bottom:4px">';
    html += '<div class="skill-agent-header" data-agent-name="' + esc(aname) + '" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:6px 10px">';
    html += '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:' + color + '22;color:' + color + ';font-size:10px;font-weight:700">' + esc(aname.charAt(0).toUpperCase()) + '</span>';
    html += '<span style="font-size:12px;font-weight:600">' + esc(aname) + '</span>';
    html += '<span style="font-size:10px;color:var(--text-dim)">' + ag.totalCalls + ' calls</span>';
    html += '<span style="font-size:10px;color:var(--text-dim)">' + fmt(ag.totalTokens) + ' tok</span>';
    html += '<span style="margin-left:auto;font-size:10px;color:var(--text-dim)">' + (isExpanded ? '▼' : '▶') + '</span>';
    html += '</div>';

    if (isExpanded) {
      html += '<div style="padding:4px 10px 8px 36px">';
      // Column headers
      html += '<div style="display:flex;gap:8px;font-size:9px;color:var(--text-dim);font-weight:600;padding:2px 0 4px 0;border-bottom:1px solid rgba(62,62,66,0.2)">';
      html += '<span style="flex:1;min-width:120px">Skill</span>';
      html += '<span style="width:36px;text-align:center">#</span>';
      html += '<span style="width:55px;text-align:right">Input</span>';
      html += '<span style="width:55px;text-align:right">Output</span>';
      html += '<span style="width:55px;text-align:right">Reason</span>';
      html += '<span style="width:55px;text-align:right">Cache</span>';
      html += '<span style="width:55px;text-align:right">Total</span>';
      html += '</div>';
      for (var si = 0; si < skillNames.length; si++) {
        var sk = ag.skills[skillNames[si]];
        html += '<div style="display:flex;gap:8px;font-size:10px;padding:2px 0">';
        html += '<span style="flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(skillNames[si]) + '</span>';
        html += '<span style="width:36px;text-align:center;color:var(--text-dim)">' + sk.calls + '</span>';
        html += '<span style="width:55px;text-align:right;color:var(--text-dim)">' + fmt(sk.input) + '</span>';
        html += '<span style="width:55px;text-align:right;color:var(--text-dim)">' + fmt(sk.output) + '</span>';
        html += '<span style="width:55px;text-align:right;color:var(--text-dim)">' + fmt(sk.reasoning) + '</span>';
        html += '<span style="width:55px;text-align:right;color:var(--text-dim)">' + fmt(sk.cacheRead) + '</span>';
        html += '<span style="width:55px;text-align:right;font-weight:500">' + fmt(sk.total) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div></div>';
  container.innerHTML = html;

  // Bind expand/collapse
  container.querySelectorAll('.skill-agent-header').forEach(function(el) {
    el.addEventListener('click', function() {
      var aname = this.getAttribute('data-agent-name');
      skillsAgentExpanded[aname] = !skillsAgentExpanded[aname];
      renderSkillsPerAgent(agentMap);
    });
  });
}

// ── Failed Skills ──

function renderSkillsFailed(skillMap, skillKeys) {
  var container = document.getElementById('skillsFailed');
  if (!container) return;

  // Collect failed skills
  var failed = [];
  for (var si = 0; si < skillKeys.length; si++) {
    var sm = skillMap[skillKeys[si]];
    if (sm.fail === 0) continue;
    // Gather unique error messages
    var msgs = [];
    for (var ei = 0; ei < sm.events.length; ei++) {
      var e = sm.events[ei];
      if (!e.success && e.errorMessage && msgs.indexOf(e.errorMessage) < 0) {
        msgs.push(e.errorMessage);
      }
    }
    failed.push({ name: sm.name, failCount: sm.fail, messages: msgs });
  }

  if (failed.length === 0) {
    container.innerHTML = '<div class="table-wrap" style="margin-bottom:16px"><div class="table-header">Failed Skills</div><div style="padding:12px;font-size:12px;color:var(--green);text-align:center">✅ All skill calls succeeded</div></div>';
    return;
  }

  var totalFails = 0;
  for (var fi = 0; fi < failed.length; fi++) { totalFails += failed[fi].failCount; }

  var html = '<div class="table-wrap" style="margin-bottom:16px">';
  html += '<div class="table-header">Failed Skills <span class="badge badge-red" style="margin-left:8px">' + totalFails + ' errors</span></div>';
  html += '<div style="padding:8px">';
  for (var fj = 0; fj < failed.length; fj++) {
    var f = failed[fj];
    html += '<div class="skill-failed-item">';
    html += '<div style="display:flex;align-items:center;gap:8px;font-size:12px">';
    html += '<span style="color:var(--red);font-weight:600">' + esc(f.name) + '</span>';
    html += '<span class="badge badge-red" style="font-size:10px">' + f.failCount + ' errors</span>';
    html += '</div>';
    if (f.messages.length > 0) {
      html += '<div style="margin-top:4px;font-size:10px;color:var(--red);opacity:0.8">';
      var showMsgs = f.messages.slice(0, 3);
      for (var mi = 0; mi < showMsgs.length; mi++) {
        html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(showMsgs[mi].substring(0, 200)) + '</div>';
      }
      if (f.messages.length > 3) html += '<span style="color:var(--text-dim)">+' + (f.messages.length - 3) + ' more</span>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div></div>';
  container.innerHTML = html;
}

// ── Full event table ──

function renderSkillsTable(filterSkill) {
  var tbody = document.getElementById('skillsTableBody');
  var label = document.getElementById('skillsFilterLabel');
  if (!tbody) return;

  skillsActiveFilter = filterSkill;
  if (label) {
    label.style.display = filterSkill ? '' : 'none';
    if (filterSkill) {
      label.innerHTML = '✕ Filter: ' + esc(filterSkill) + ' (click to clear)';
      label.onclick = function() { renderSkillsTable(null); };
    }
  }

  var html = '';
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (!t.skillEvents || t.skillEvents.length === 0) continue;
    for (var j = 0; j < t.skillEvents.length; j++) {
      var se = t.skillEvents[j];
      if (filterSkill && se.skillName !== filterSkill) continue;
      var statusIcon = se.success ? '✅' : '❌';
      var agentName = t.agentName || (t.isSubagent ? 'subagent' : 'root');
      var tokStr = toNumber(t.totalTokens) > 0 ? fmt(toNumber(t.totalTokens)) + ' (' + fmt(toNumber(t.inputTokens)) + '/' + fmt(toNumber(t.outputTokens)) + ')' : '—';
      html += '<tr class="turn-row" data-turn-id="' + esc(t.id) + '" style="cursor:pointer">' +
        '<td style="color:var(--purple);font-weight:500">' + esc(se.skillName) + '</td>' +
        '<td>#' + ((t.turnIndex || 0) + 1) + '</td>' +
        '<td>' + esc(se.eventType) + '</td>' +
        '<td>' + statusIcon + '</td>' +
        '<td>' + fmtMs(se.durationMs || 0) + '</td>' +
        '<td style="color:var(--text-dim)">' + esc(agentName) + '</td>' +
        '<td style="font-size:11px;color:var(--text-dim)">' + tokStr + '</td>' +
      '</tr>';
    }
  }
  tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:var(--text-dim)">' + __('skills.noEventsTable') + '</td></tr>';

  tbody.querySelectorAll('.turn-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var tid = this.getAttribute('data-turn-id');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── Navigation listeners ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:skills', function(params) {
    if (params && params.skillName) {
      renderSkillsTable(params.skillName);
    }
  });
}
`;
}
