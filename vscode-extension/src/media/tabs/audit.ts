// Audit tab — JSON editor + simplified WorkflowFlowChart rendering.
// Ported from WorkflowAnalyseTab + WorkflowFlowChart, adapted for vanilla JS webview.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderAuditTab(): string {
  return `
<div id="tab-audit" class="tab-panel">
  <div style="display:flex;flex-direction:column;height:calc(100vh - 160px)">
  <!-- Editor panel -->
  <div id="auditEditor" style="flex:1;overflow-y:auto;padding:12px 16px">
    <!-- Instructions card -->
    <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px;background:var(--card-bg);font-size:13px;line-height:1.6">
      <h3 style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">📋 ${escHtml(t('audit.title'))}</h3>
      <p style="font-size:13px;color:var(--text-dim);margin-bottom:8px;line-height:1.7">${escHtml(t('audit.description'))}</p>
      <ol style="font-size:13px;color:var(--text-dim);padding-left:24px;line-height:1.8">
        <li>${escHtml(t('audit.step1'))}</li>
        <li>${escHtml(t('audit.step2'))}</li>
        <li>${escHtml(t('audit.step3'))}</li>
      </ol>
    </div>

    <!-- Textarea -->
    <textarea id="auditTextarea"
      placeholder="${escHtml(t('audit.pastePlaceholder'))}"
      style="width:100%;height:calc(100vh - 520px);min-height:200px;padding:12px 14px;border-radius:6px;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.6;resize:vertical;box-sizing:border-box;background:var(--card-bg);color:var(--text);border:1px solid var(--border);outline:none"></textarea>
    <div id="auditError" style="display:none;color:var(--red);font-size:12px;margin-top:6px"></div>

    <!-- Buttons -->
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="auditRenderBtn" style="padding:8px 18px;font-size:13px;font-weight:500;border-radius:6px;background:var(--accent);color:#fff;border:none;cursor:pointer">${escHtml(t('audit.renderBtn'))}</button>
      <button id="auditDemoBtn" style="padding:8px 18px;font-size:13px;font-weight:500;border-radius:6px;background:var(--card-bg);color:var(--text);border:1px solid var(--border);cursor:pointer">${escHtml(t('audit.loadDemo'))}</button>
    </div>
  </div>

  <!-- Chart panel -->
  <div id="auditChart" style="display:none;flex:1;overflow-y:auto">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:10">
      <span style="font-size:12px;color:var(--text-dim)">${escHtml(t('audit.storedAt'))}</span>
      <div style="display:flex;gap:8px">
        <button id="auditRepasteBtn" class="card-btn card-btn-sm">${escHtml(t('audit.repaste'))}</button>
        <button id="auditClearBtn" class="card-btn card-btn-sm">${escHtml(t('audit.clear'))}</button>
      </div>
    </div>
    <div id="auditChartContent" style="padding:16px"></div>
  </div>
  </div>
</div>`;
}

export function renderAuditJS(): string {
  return `
// ── Audit Tab — Workflow FlowChart ──

var auditAnalysis = null;
var auditSelectedNode = null;

// ── Persistence (localStorage per session) ──

function auditStorageKey() {
  return 'wf-analysis-' + (session ? session.id : 'demo');
}

function loadAuditFromStorage() {
  try {
    var raw = localStorage.getItem(auditStorageKey());
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.flow)) {
      auditAnalysis = parsed;
      showAuditChart();
    }
  } catch(e) {}
}

function saveAuditToStorage(json) {
  localStorage.setItem(auditStorageKey(), json);
}

function clearAuditStorage() {
  localStorage.removeItem(auditStorageKey());
}

// ── Parse & validate ──

function parseAuditJson(text) {
  try {
    var trimmed = text.trim();
    var parsed = JSON.parse(trimmed);
    if (!parsed || !Array.isArray(parsed.flow)) {
      return { error: __('audit.missingFlow') };
    }
    return { data: parsed };
  } catch(e) {
    return { error: __('audit.jsonError') + ': ' + (e.message || String(e)) };
  }
}

// ── UI: Editor → Chart ──

function showAuditEditor() {
  var editor = document.getElementById('auditEditor');
  var chart = document.getElementById('auditChart');
  if (editor) editor.style.display = '';
  if (chart) chart.style.display = 'none';
}

function showAuditChart() {
  var editor = document.getElementById('auditEditor');
  var chart = document.getElementById('auditChart');
  if (editor) editor.style.display = 'none';
  if (chart) chart.style.display = '';
  renderAuditChart();
}

function renderAuditChart() {
  if (!auditAnalysis) return;
  var container = document.getElementById('auditChartContent');
  if (!container) return;

  var a = auditAnalysis;
  var html = '';

  // ── Session meta card ──
  html += '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;background:var(--card-bg)">';
  html += '<h3 style="font-size:16px;font-weight:600;margin-bottom:4px">Workflow · ' + esc(a.sessionSummary || '') + '</h3>';
  if (a.sessionMeta) {
    var m = a.sessionMeta;
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-dim);margin-top:8px">';
    if (m.operator) html += '<span>operator: <b style="color:var(--text)">' + esc(String(m.operator)) + '</b></span>';
    if (m.model) html += '<span>model: <b style="color:var(--text)">' + esc(String(m.model)) + '</b></span>';
    if (m.duration) html += '<span>duration: <b style="color:var(--text)">' + esc(String(m.duration)) + '</b></span>';
    if (m.tokens) html += '<span>tokens: <b style="color:var(--text)">' + esc(String(m.tokens)) + '</b></span>';
    html += '</div>';
    // CPs
    if (m.cpsExecuted || m.cpsMissing) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:11px">';
      html += '<span style="color:var(--text-dim)">CPs:</span>';
      if (Array.isArray(m.cpsExecuted)) {
        for (var ci = 0; ci < m.cpsExecuted.length; ci++) {
          html += '<span style="padding:1px 6px;border-radius:3px;background:rgba(94,196,158,0.15);color:var(--green)">' + esc(String(m.cpsExecuted[ci])) + ' ✓</span>';
        }
      }
      if (Array.isArray(m.cpsMissing)) {
        for (var cmi = 0; cmi < m.cpsMissing.length; cmi++) {
          html += '<span style="padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.04);color:var(--text-dim)">' + esc(String(m.cpsMissing[cmi])) + '</span>';
        }
      }
      html += '</div>';
    }
  }
  html += '</div>';

  // ── SVG Flowchart ──
  var flow = a.flow || [];
  if (flow.length > 0) {
    html += renderAuditFlowchartSVG(flow);
  }

  // ── Side panels: selected node + workflow issues + priorities ──
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">';

  // Selected node problems
  html += '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card-bg)">';
  if (auditSelectedNode) {
    var sn = auditSelectedNode;
    html += '<h4 style="font-size:13px;font-weight:600;margin-bottom:4px">' + esc(sn.skill) + '</h4>';
    html += '<p style="font-size:11px;color:var(--text-dim);margin-bottom:8px">' + esc(sn.step) + ' · turn ' + sn.turn + ' · ' + esc(sn.type) + ' · ' + esc(sn.status) + '</p>';
    if (sn.retryOf) {
      html += '<p style="font-size:11px;color:var(--red);margin-bottom:4px">↻ Retry of: ' + esc(sn.retryOf) + '</p>';
    }
    if (!sn.problems || sn.problems.length === 0) {
      html += '<p style="font-size:11px;color:var(--green)">No problems</p>';
    } else {
      html += '<p style="font-size:11px;font-weight:600;margin-bottom:6px">Problems (' + sn.problems.length + ')</p>';
      for (var pi = 0; pi < sn.problems.length; pi++) {
        var p = sn.problems[pi];
        var sevColor = p.severity === 'high' ? 'var(--red)' : p.severity === 'medium' ? 'var(--orange)' : 'var(--text-dim)';
        html += '<div style="border:1px solid var(--border);border-radius:4px;padding:8px;margin-bottom:6px;font-size:11px">';
        html += '<span style="padding:1px 6px;border-radius:3px;margin-right:6px;background:' + (p.severity === 'high' ? 'rgba(232,103,107,0.15)' : p.severity === 'medium' ? 'rgba(224,154,107,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + sevColor + '">' + esc(p.severity) + '</span>';
        html += '<span style="font-family:monospace;font-size:10px;color:var(--text-dim)">' + esc(p.type || '') + '</span>';
        if (p.evidence) html += '<div style="color:var(--text-dim);margin-top:2px">Evidence: ' + esc(p.evidence) + '</div>';
        if (p.diagnosis) html += '<div style="margin-top:2px">Diagnosis: ' + esc(p.diagnosis) + '</div>';
        if (p.suggestion) html += '<div style="color:var(--accent);margin-top:2px">Suggestion: ' + esc(p.suggestion) + '</div>';
        html += '</div>';
      }
    }
  } else {
    html += '<p style="font-size:11px;color:var(--text-dim)">Click a node in the flowchart to view details</p>';
  }
  html += '</div>';

  // Right panel: workflow issues + priorities
  html += '<div style="display:flex;flex-direction:column;gap:12px">';

  // Workflow-level issues
  if (a.workflowLevelIssues && a.workflowLevelIssues.length > 0) {
    html += '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card-bg)">';
    html += '<h4 style="font-size:13px;font-weight:600;margin-bottom:8px">Workflow-level Issues</h4>';
    for (var wi = 0; wi < a.workflowLevelIssues.length; wi++) {
      var iss = a.workflowLevelIssues[wi];
      var isc = iss.severity === 'high' ? 'var(--red)' : iss.severity === 'medium' ? 'var(--orange)' : 'var(--text-dim)';
      html += '<div style="border:1px solid var(--border);border-radius:4px;padding:8px;margin-bottom:6px;font-size:11px">';
      html += '<span style="padding:1px 6px;border-radius:3px;margin-right:6px;background:' + (iss.severity === 'high' ? 'rgba(232,103,107,0.15)' : iss.severity === 'medium' ? 'rgba(224,154,107,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + isc + '">' + esc(iss.severity) + '</span>';
      html += '<span style="font-weight:600">' + esc(iss.title || '') + '</span>';
      if (iss.detail) html += '<div style="color:var(--text-dim);margin-top:2px">' + esc(iss.detail) + '</div>';
      if (iss.suggestion) html += '<div style="color:var(--accent);margin-top:2px">' + esc(iss.suggestion) + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Optimization priorities
  if (a.optimizationPriorities && a.optimizationPriorities.length > 0) {
    html += '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card-bg)">';
    html += '<h4 style="font-size:13px;font-weight:600;margin-bottom:8px">Optimization Priorities</h4>';
    for (var oi = 0; oi < a.optimizationPriorities.length; oi++) {
      var op = a.optimizationPriorities[oi];
      html += '<div style="border:1px solid var(--border);border-radius:4px;padding:8px;margin-bottom:6px;font-size:11px">';
      html += '<span style="padding:1px 6px;border-radius:3px;background:rgba(184,152,232,0.15);color:var(--purple);margin-right:6px">P' + op.priority + '</span>';
      html += '<span style="font-family:monospace;font-size:10px;color:var(--text-dim)">' + esc(op.target || '') + '</span>';
      html += '<div style="margin-top:2px">' + esc(op.action || '') + '</div>';
      if (op.expectedGain) html += '<div style="color:var(--green);margin-top:2px">↑ ' + esc(op.expectedGain) + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div></div>'; // end grid
  container.innerHTML = html;

  // Bind click on SVG nodes
  container.querySelectorAll('[data-audit-node]').forEach(function(el) {
    el.addEventListener('click', function() {
      var nid = this.getAttribute('data-audit-node');
      auditSelectedNode = null;
      var flowNodes = auditAnalysis.flow || [];
      for (var fi = 0; fi < flowNodes.length; fi++) {
        if (flowNodes[fi].id === nid) { auditSelectedNode = flowNodes[fi]; break; }
      }
      renderAuditChart();
    });
  });
}

// ── SVG Flowchart builder ──

var AUDIT_NODE_W = 170, AUDIT_NODE_H = 50, AUDIT_COL_GAP = 12, AUDIT_ROW_GAP = 28;
var AUDIT_PAD = 20;

function shortAuditName(s) {
  if (!s) return '';
  return s.replace(/^ascendc-ops-/, '').replace(/^ascendc-/, '').replace(/^ops-registry-invoke-/, 'wf-');
}

function renderAuditFlowchartSVG(flow) {
  // Group by step
  var groups = [];
  for (var i = 0; i < flow.length; i++) {
    var n = flow[i];
    var g = null;
    for (var j = 0; j < groups.length; j++) {
      if (groups[j].step === n.step) { g = groups[j]; break; }
    }
    if (g) g.nodes.push(n);
    else groups.push({ step: n.step, nodes: [n] });
  }

  var maxCols = 1;
  for (var gi = 0; gi < groups.length; gi++) {
    if (groups[gi].nodes.length > maxCols) maxCols = groups[gi].nodes.length;
  }

  var svgW = 180 + maxCols * (AUDIT_NODE_W + AUDIT_COL_GAP) + AUDIT_PAD * 2 + 60;
  var svgH = groups.length * (AUDIT_NODE_H + AUDIT_ROW_GAP) + AUDIT_PAD * 2 + 30;

  // Build layout
  var rows = [];
  var y = AUDIT_PAD + 20;
  var pos = {};
  for (var ri = 0; ri < groups.length; ri++) {
    var grp = groups[ri];
    var nodeXs = [];
    var startX = 170 + AUDIT_PAD;
    for (var ni = 0; ni < grp.nodes.length; ni++) {
      var nx = startX + ni * (AUDIT_NODE_W + AUDIT_COL_GAP);
      nodeXs.push(nx);
      pos[grp.nodes[ni].id] = { x: nx, y: y, cx: nx + AUDIT_NODE_W / 2, cy: y + AUDIT_NODE_H / 2 };
    }
    rows.push({ step: grp.step, y: y, nodes: grp.nodes, nodeXs: nodeXs });
    y += AUDIT_NODE_H + AUDIT_ROW_GAP;
  }

  // SVG string
  var svg = '<div style="overflow-x:auto"><svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '" style="display:block;min-width:' + svgW + 'px">';
  svg += '<rect width="' + svgW + '" height="' + svgH + '" fill="' + (typeof currentTheme !== 'undefined' && currentTheme === 'light' ? '#fafafc' : '#1b1e2b') + '" rx="6"/>';

  // Arrow marker
  svg += '<defs><marker id="auditArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#888"/></marker></defs>';

  // Draw rows
  for (var ri2 = 0; ri2 < rows.length; ri2++) {
    var row = rows[ri2];
    var nextRow = rows[ri2 + 1];

    // Step label on left
    svg += '<text x="' + AUDIT_PAD + '" y="' + (row.y + AUDIT_NODE_H / 2 + 4) + '" fill="#888" font-size="10" font-weight="600">' + esc(row.step) + '</text>';

    // Vertical connector to next row
    if (nextRow) {
      var connX = 170 + AUDIT_PAD;
      svg += '<line x1="' + connX + '" y1="' + (row.y + AUDIT_NODE_H) + '" x2="' + connX + '" y2="' + nextRow.y + '" stroke="#888" stroke-width="1.5" marker-end="url(#auditArrow)" opacity="0.5"/>';
    }

    // Nodes
    for (var nni = 0; nni < row.nodes.length; nni++) {
      var node = row.nodes[nni];
      var p = pos[node.id];
      var sev = nodeMaxAuditSev(node);
      var isGate = node.type === 'gate' || node.type === 'terminal';
      var stroke = sev === 'high' ? '#dc2626' : sev === 'medium' ? '#d97706' : isGate ? '#6366f1' : '#10b981';
      var fill = node.type === 'terminal' ? '#ede9fe' : node.type === 'gate' ? '#e0e7ff' : 'var(--card-bg)';
      var isSelected = auditSelectedNode && auditSelectedNode.id === node.id;
      var sw = isSelected ? 2.5 : 1.5;

      svg += '<g transform="translate(' + p.x + ',' + p.y + ')" style="cursor:pointer" data-audit-node="' + esc(node.id) + '">';
      svg += '<rect width="' + AUDIT_NODE_W + '" height="' + AUDIT_NODE_H + '" rx="' + (isGate ? 24 : 6) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
      svg += '<text x="' + (AUDIT_NODE_W / 2) + '" y="18" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">' + esc(shortAuditName(node.skill)) + '</text>';
      svg += '<text x="' + (AUDIT_NODE_W / 2) + '" y="34" text-anchor="middle" font-size="9" fill="#888">' + (isGate ? esc(node.status) : 'turn ' + node.turn + ' · ' + esc(node.type)) + '</text>';

      // Retry badge
      if (node.retryOf) {
        svg += '<circle cx="' + (AUDIT_NODE_W - 8) + '" cy="8" r="7" fill="#dc2626"/>';
        svg += '<text x="' + (AUDIT_NODE_W - 8) + '" y="11" text-anchor="middle" font-size="8" fill="white" font-weight="700">↻</text>';
      } else if (sev) {
        svg += '<circle cx="' + (AUDIT_NODE_W - 8) + '" cy="8" r="6" fill="' + stroke + '"/>';
        svg += '<text x="' + (AUDIT_NODE_W - 8) + '" y="11" text-anchor="middle" font-size="8" fill="white" font-weight="700">!</text>';
      }
      if (node.problems && node.problems.length > 1) {
        svg += '<text x="' + (AUDIT_NODE_W - 17) + '" y="11" text-anchor="middle" font-size="7" fill="white" font-weight="700">×' + node.problems.length + '</text>';
      }

      svg += '</g>';
    }
  }

  svg += '</svg></div>';

  // Legend
  svg += '<div style="display:flex;gap:14px;padding:8px 4px;font-size:11px;flex-wrap:wrap">';
  svg += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1.5px solid #10b981"></span> Normal</span>';
  svg += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1.5px solid #d97706"></span> Medium issue</span>';
  svg += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1.5px solid #dc2626"></span> High issue</span>';
  svg += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1.5px solid #6366f1"></span> Gate/Terminal</span>';
  svg += '<span style="display:flex;align-items:center;gap:4px;margin-left:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#dc2626"></span> Retry</span>';
  svg += '</div>';

  return svg;
}

function nodeMaxAuditSev(n) {
  if (!n.problems || n.problems.length === 0) return null;
  for (var i = 0; i < n.problems.length; i++) {
    if (n.problems[i].severity === 'high') return 'high';
  }
  for (var i = 0; i < n.problems.length; i++) {
    if (n.problems[i].severity === 'medium') return 'medium';
  }
  return 'low';
}

// ── Demo data (inline minimal — dummy flow for demo) ──

function getDemoAuditData() {
  return JSON.stringify({
    sessionSummary: "Demo workflow analysis for SoftplusV2Grad operator development",
    sessionMeta: {
      operator: "SoftplusV2Grad",
      model: "demo-model",
      duration: "12min",
      tokens: "5.2M",
      autonomy: "L3",
      reachedPhase: "Phase 1",
      cpsExecuted: ["CP1", "CP1.5"],
      cpsMissing: ["CP2", "CP3", "CP4"],
      phasesNotReached: ["Phase 2", "Phase 3"]
    },
    flow: [
      { id:"n1", skill:"ops-registry-invoke-workflow", step:"1. Load Workflow", type:"invoke", turn:1, parallel:null, retryOf:null, status:"ok", problems:[] },
      { id:"n2", skill:"spec-review", step:"2. Spec Review", type:"invoke", turn:2, parallel:null, retryOf:null, status:"ok", problems:[{ type:"ambiguity", severity:"medium", evidence:"Spec clause 3.2 unclear about boundary", diagnosis:"Missing edge case coverage", suggestion:"Add explicit boundary test cases" }] },
      { id:"n3", skill:"kernel-developer", step:"3. Kernel Dev", type:"dispatch", turn:3, parallel:null, retryOf:null, status:"ok", problems:[] },
      { id:"n4", skill:"kernel-developer", step:"3. Kernel Dev", type:"dispatch", turn:4, parallel:null, retryOf:"n3", status:"ok", problems:[{ type:"redundant", severity:"low", evidence:"Retry due to spec misalignment", suggestion:"Fix spec before dispatch" }] },
      { id:"n5", skill:"assemble-validator", step:"4. Assembly Check", type:"gate", turn:5, parallel:null, retryOf:null, status:"pass", problems:[] },
    ],
    workflowLevelIssues: [
      { severity:"medium", title:"Spec retry loop", detail:"Kernel dev retried once due to spec ambiguity. Clarifying spec upfront saves ~2 turns.", suggestion:"Gate spec review more strictly before dispatching dev" }
    ],
    optimizationPriorities: [
      { priority:1, target:"spec-review", action:"Add automated boundary check to spec review skill", expectedGain:"Reduce retry rate by 40%" }
    ]
  });
}

// ── Tab initialization ──

function initAuditTab() {
  var textarea = document.getElementById('auditTextarea');
  var renderBtn = document.getElementById('auditRenderBtn');
  var demoBtn = document.getElementById('auditDemoBtn');
  var errorEl = document.getElementById('auditError');
  var repasteBtn = document.getElementById('auditRepasteBtn');
  var clearBtn = document.getElementById('auditClearBtn');

  // Try loading from storage
  loadAuditFromStorage();

  if (!renderBtn) return;

  renderBtn.addEventListener('click', function() {
    if (!textarea) return;
    var result = parseAuditJson(textarea.value);
    if (result.error) {
      if (errorEl) { errorEl.style.display = ''; errorEl.textContent = result.error; }
      return;
    }
    if (errorEl) errorEl.style.display = 'none';
    auditAnalysis = result.data;
    auditSelectedNode = null;
    saveAuditToStorage(textarea.value.trim());
    showAuditChart();
  });

  if (demoBtn) {
    demoBtn.addEventListener('click', function() {
      var demo = getDemoAuditData();
      if (textarea) textarea.value = demo;
      var result = parseAuditJson(demo);
      if (!result.error) {
        auditAnalysis = result.data;
        auditSelectedNode = null;
        saveAuditToStorage(demo);
        showAuditChart();
      }
    });
  }

  if (repasteBtn) {
    repasteBtn.addEventListener('click', function() {
      auditSelectedNode = null;
      showAuditEditor();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      auditAnalysis = null;
      auditSelectedNode = null;
      clearAuditStorage();
      if (textarea) textarea.value = '';
      showAuditEditor();
    });
  }
}

// ── Navigation listeners ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:audit', function(params) {
    initAuditTab();
  });
}
`;
}
