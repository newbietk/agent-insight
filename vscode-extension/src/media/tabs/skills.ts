// Skills tab — skill events list grouped by skill name with stats.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderSkillsTab(): string {
  return `
<div id="tab-skills" class="tab-panel">
  <div class="cards" id="skillsCards"></div>
  <div class="chart-container" style="margin-top:12px">
    <div class="chart-title">📊 ${escHtml(t('skills.timelineTitle'))}</div>
    <canvas id="skillsChart"></canvas>
  </div>
  <div class="table-wrap" style="margin-top:12px">
    <div class="table-header">${escHtml(t('skills.allEvents'))}</div>
    <div style="max-height: 500px; overflow-y: auto;">
      <table>
        <thead><tr>
          <th>${escHtml(t('skills.colSkill'))}</th>
          <th>${escHtml(t('skills.colTurn'))}</th>
          <th>${escHtml(t('skills.colEvent'))}</th>
          <th>${escHtml(t('skills.colStatus'))}</th>
          <th>${escHtml(t('skills.colDuration'))}</th>
          <th>${escHtml(t('skills.colAgent'))}</th>
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
function renderSkills() {
  // Collect all skill events from turns
  var allSkills = [];
  var skillMap = {};
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (!t.skillEvents || t.skillEvents.length === 0) continue;
    for (var j = 0; j < t.skillEvents.length; j++) {
      var se = t.skillEvents[j];
      var key = se.skillName;
      var entry = {
        skillName: se.skillName,
        eventType: se.eventType,
        success: se.success,
        durationMs: se.durationMs || 0,
        turnIndex: t.turnIndex != null ? t.turnIndex : i,
        turnId: t.id,
        agentName: t.agentName || (t.isSubagent ? 'subagent' : 'root'),
        isSubagent: t.isSubagent
      };
      allSkills.push(entry);

      if (!skillMap[key]) {
        skillMap[key] = { name: key, total: 0, success: 0, durations: [], agents: {} };
      }
      skillMap[key].total++;
      if (se.success) skillMap[key].success++;
      skillMap[key].durations.push(se.durationMs || 0);
      var ag = entry.agentName || 'unknown';
      skillMap[key].agents[ag] = (skillMap[key].agents[ag] || 0) + 1;
    }
  }

  // Summary cards
  var cards = document.getElementById('skillsCards');
  if (cards) {
    var skillKeys = Object.keys(skillMap).sort(function(a, b) { return skillMap[b].total - skillMap[a].total; });
    if (skillKeys.length === 0) {
      cards.innerHTML = '<div class="empty-state"><div class="icon">🧩</div>' + __('skills.noEvents') + '</div>';
    } else {
      cards.innerHTML = skillKeys.map(function(k) {
        var sk = skillMap[k];
        var rate = sk.total > 0 ? (sk.success / sk.total * 100).toFixed(0) : '0';
        var avgMs = sk.durations.length > 0 ? Math.round(sk.durations.reduce(function(a,b){return a+b;},0) / sk.durations.length) : 0;
        return '<div class="card" data-skill="' + esc(k) + '" style="cursor:pointer">' +
          '<div class="card-label">' + esc(k) + '</div>' +
          '<div class="card-value" style="font-size:16px;color:var(--purple)">' + sk.total + __('skills.callsSuffix') + '</div>' +
          '<div class="card-sub">' + __('skills.cardSub', rate, fmtMs(avgMs)) + '</div>' +
        '</div>';
      }).join('');

      // Click card → filter table
      cards.querySelectorAll('.card[data-skill]').forEach(function(card) {
        card.addEventListener('click', function() {
          var sk = this.getAttribute('data-skill');
          renderSkillsTable(sk);
        });
      });
    }
  }

  // Full table
  renderSkillsTable(null);

  // Chart
  drawSkillsChart(allSkills);
}

function renderSkillsTable(filterSkill) {
  var tbody = document.getElementById('skillsTableBody');
  if (!tbody) return;
  var html = '';
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (!t.skillEvents || t.skillEvents.length === 0) continue;
    for (var j = 0; j < t.skillEvents.length; j++) {
      var se = t.skillEvents[j];
      if (filterSkill && se.skillName !== filterSkill) continue;
      var statusIcon = se.success ? '✅' : '❌';
      html += '<tr class="turn-row" data-turn-id="' + esc(t.id) + '" style="cursor:pointer">' +
        '<td style="color:var(--purple);font-weight:500">' + esc(se.skillName) + '</td>' +
        '<td>#' + ((t.turnIndex || 0) + 1) + '</td>' +
        '<td>' + esc(se.eventType) + '</td>' +
        '<td>' + statusIcon + '</td>' +
        '<td>' + fmtMs(se.durationMs || 0) + '</td>' +
        '<td style="color:var(--text-dim)">' + esc(t.agentName || 'root') + '</td>' +
      '</tr>';
    }
  }
  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">' + __('skills.noEventsTable') + '</td></tr>';

  tbody.querySelectorAll('.turn-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var tid = this.getAttribute('data-turn-id');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

function drawSkillsChart(allSkills) {
  var canvas = document.getElementById('skillsChart');
  if (!canvas || allSkills.length === 0) return;
  var parent = canvas.parentElement;
  if (!parent) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = parent.clientWidth - 32;
  var H = 160;
  var dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.fillStyle = currentTheme === 'light' ? '#fafafc' : '#1e1e1e';
  ctx.fillRect(0, 0, W, H);

  // Simple timeline: each skill event as a dot
  var pad = { top: 20, right: 20, bottom: 20, left: 10 };
  var pw = W - pad.left - pad.right;
  var ph = H - pad.top - pad.bottom;

  var maxTurn = 0;
  for (var i = 0; i < allSkills.length; i++) {
    maxTurn = Math.max(maxTurn, allSkills[i].turnIndex);
  }
  if (maxTurn === 0) maxTurn = 1;

  for (var si = 0; si < allSkills.length; si++) {
    var s = allSkills[si];
    var x = pad.left + (s.turnIndex / maxTurn) * pw;
    var y = pad.top + (si % 3) * (ph / 3) + ph / 6;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = s.success ? '#5ec49e' : '#e8676b';
    ctx.fill();
  }

  // X axis label
  ctx.fillStyle = '#888';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(__('skills.turnIndexAxis'), W / 2, H - 4);
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
