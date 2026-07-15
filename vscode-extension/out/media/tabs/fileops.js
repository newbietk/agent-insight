"use strict";
// File Operations Audit tab — turn-based timeline with expandable file content and edit diff.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderFileOpsTab = renderFileOpsTab;
exports.renderFileOpsJS = renderFileOpsJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderFileOpsTab() {
    return `
<div id="tab-fileops" class="tab-panel">
  <div class="cards" id="fileopsCards"></div>
  <div id="fileopsFileAnalysis" style="display:none;margin-bottom:12px">
    <div class="chart-container" style="padding:12px">
      <div class="chart-title">📁 Per-File Read Analysis</div>
      <div id="fileopsFileList"></div>
    </div>
  </div>
  <div class="fileops-filter-bar" id="fileopsFilterBar"></div>
  <div class="fileops-layout">
    <div class="fileops-timeline" id="fileopsTimeline">
      <div class="empty-state"><div class="icon">📁</div><div>${(0, shared_1.escHtml)((0, i18n_1.t)('fileops.loading'))}</div></div>
    </div>
    <div class="fileops-detail" id="fileopsDetail">
      <div class="empty-state"><div class="icon">📋</div><div>${(0, shared_1.escHtml)((0, i18n_1.t)('fileops.selectTurnHint'))}</div></div>
    </div>
  </div>
</div>`;
}
function renderFileOpsJS() {
    return `
// ── File Operations Audit Tab ──

var READ_TOOLS = ['Read', 'read', 'read_file', 'view', 'view_file'];
var WRITE_TOOLS = ['Write', 'write', 'write_file', 'create_file'];
var EDIT_TOOLS = ['Edit'];
var FILE_TOOLS = READ_TOOLS.concat(WRITE_TOOLS, EDIT_TOOLS);

var OP_ICONS = { read: '📖', write: '📝', edit: '✏️' };
var OP_COLORS = { read: 'var(--blue)', write: 'var(--green)', edit: 'var(--orange)' };

var fileOpsData = null;   // { turns: [...], summary: {...} }
var fileOpsFilter = 'all'; // 'all' | 'reads' | 'writes'
var fileOpsSelectedTurnId = null;
var fileOpsContents = {};  // blockId → content string (avoids DOM attr encoding issues)

// ── Helpers ──

function extractFilePath(argsJson) {
  if (!argsJson) return 'unknown';
  try {
    var args = JSON.parse(argsJson);
    return args.file_path || args.filePath || args.path || args.file || 'unknown';
  } catch(e) { return 'unknown'; }
}

function getDisplayPath(filePath) {
  var parts = filePath.replace(/\\\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

function extractRange(argsJson) {
  if (!argsJson) return null;
  try {
    var args = JSON.parse(argsJson);
    var offset = args.offset != null ? args.offset : args.start;
    var limit = args.limit != null ? args.limit : args.end;
    if (offset == null && limit == null) return { type: 'full', start: 0, end: null };
    var start = typeof offset === 'number' ? offset : 0;
    if (limit == null) return { type: 'full', start: start, end: null };
    return { type: 'partial', start: start, end: start + (typeof limit === 'number' ? limit : 0) };
  } catch(e) { return null; }
}

function formatRange(range) {
  if (!range) return '';
  if (range.type === 'full' && range.start === 0) return __('fileops.fullText');
  if (range.type === 'full') return __('fileops.fullFrom', range.start);
  return __('fileops.partialRange', range.start, range.end);
}

function extractEditContent(argsJson) {
  if (!argsJson) return { oldContent: null, newContent: null };
  try {
    var args = JSON.parse(argsJson);
    return {
      oldContent: args.old_string || args.oldString || args.old || null,
      newContent: args.new_string || args.newString || args.new || null
    };
  } catch(e) { return { oldContent: null, newContent: null }; }
}

function extractWriteContent(argsJson) {
  if (!argsJson) return null;
  try {
    var args = JSON.parse(argsJson);
    return args.content || args.text || args.data || args.file_text || null;
  } catch(e) { return null; }
}

function classifyTool(toolName) {
  for (var i = 0; i < READ_TOOLS.length; i++) {
    if (READ_TOOLS[i].toLowerCase() === toolName.toLowerCase()) return 'read';
  }
  for (var i = 0; i < EDIT_TOOLS.length; i++) {
    if (EDIT_TOOLS[i].toLowerCase() === toolName.toLowerCase()) return 'edit';
  }
  for (var i = 0; i < WRITE_TOOLS.length; i++) {
    if (WRITE_TOOLS[i].toLowerCase() === toolName.toLowerCase()) return 'write';
  }
  return null;
}

function safeContent(content, maxLen) {
  if (!content) return null;
  maxLen = maxLen || 50000;
  if (content.length <= maxLen) return content;
  return content.substring(0, maxLen) + '\\n\\n... (truncated, ' + content.length + ' chars total)';
}

function escContent(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Build file ops data from turns ──

function buildFileOpsData() {
  var resultTurns = [];
  var totalReads = 0, totalWrites = 0, totalEdits = 0;
  var allFiles = {};

  for (var ti = 0; ti < turns.length; ti++) {
    var t = turns[ti];
    if (!t.toolCalls || t.toolCalls.length === 0) continue;

    var operations = [];

    for (var ci = 0; ci < t.toolCalls.length; ci++) {
      var tc = t.toolCalls[ci];
      var opType = classifyTool(tc.toolName);
      if (!opType) continue;

      var filePath = extractFilePath(tc.argsJson);

      if (!allFiles[filePath]) allFiles[filePath] = { reads: 0, writes: 0 };
      allFiles[filePath][opType === 'read' ? 'reads' : 'writes']++;

      var op = {
        opType: opType,
        toolCallId: tc.toolCallId || '',
        toolName: tc.toolName,
        filePath: filePath,
        displayPath: getDisplayPath(filePath),
        range: null,
        content: null,
        oldContent: null,
        newContent: null,
        state: tc.state || 'unknown',
        durationMs: tc.durationMs || 0
      };

      if (opType === 'read') {
        totalReads++;
        op.range = extractRange(tc.argsJson);
        op.content = safeContent(tc.resultJson);
      } else if (opType === 'edit') {
        totalEdits++;
        var ec = extractEditContent(tc.argsJson);
        op.oldContent = safeContent(ec.oldContent, 20000);
        op.newContent = safeContent(ec.newContent, 20000);
      } else if (opType === 'write') {
        totalWrites++;
        op.newContent = safeContent(extractWriteContent(tc.argsJson) || tc.resultJson);
      }

      operations.push(op);
    }

    if (operations.length > 0) {
      resultTurns.push({
        turnId: t.id,
        turnIndex: t.turnIndex != null ? t.turnIndex : ti,
        role: t.role || 'unknown',
        agentName: t.agentName || (t.isSubagent ? (t.subagentName || 'subagent') : 'root'),
        isSubagent: !!t.isSubagent,
        subagentName: t.subagentName || null,
        contentSummary: t.contentSummary || null,
        operations: operations
      });
    }
  }

  var totalFiles = Object.keys(allFiles).length;

  fileOpsData = {
    turns: resultTurns,
    summary: {
      totalTurns: resultTurns.length,
      totalReads: totalReads,
      totalWrites: totalWrites,
      totalEdits: totalEdits,
      totalFiles: totalFiles
    }
  };
}

// ── Render Summary Cards ──

function renderFileOpsSummaryCards() {
  var cards = document.getElementById('fileopsCards');
  if (!cards || !fileOpsData) return;

  var s = fileOpsData.summary;
  var items = [
    { label: '📖 ' + __('fileops.cardReads'), val: s.totalReads, cls: 'tokens' },
    { label: '✏️ ' + __('fileops.cardEdits'), val: s.totalEdits, cls: 'cost' },
    { label: '📝 ' + __('fileops.cardWrites'), val: s.totalWrites, cls: '' },
    { label: '📁 ' + __('fileops.cardFiles'), val: s.totalFiles, cls: '' },
    { label: '🔄 ' + __('fileops.cardTurns'), val: s.totalTurns, cls: '' }
  ];

  cards.innerHTML = items.map(function(item) {
    return '<div class="card">' +
      '<div class="card-label">' + item.label + '</div>' +
      '<div class="card-value ' + item.cls + '" style="font-size:20px">' + item.val + '</div>' +
      '<div class="card-sub"></div>' +
    '</div>';
  }).join('');

  // Also render file analysis
  renderFileAnalysis();
}

// ── Per-File Read Analysis (from parent project FileReadAnalysis) ──

function parseLineRange(range) {
  if (!range) return { start: 0, end: Infinity };
  return { start: range.start || 0, end: range.end || Infinity };
}

function rangesOverlap(a, b) {
  return !(a.end <= b.start || b.end <= a.start);
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  var sorted = intervals.slice().sort(function(a, b) { return a.start - b.start; });
  var merged = [sorted[0]];
  for (var i = 1; i < sorted.length; i++) {
    var last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ start: sorted[i].start, end: sorted[i].end });
    }
  }
  return merged;
}

function computeUniqueLines(intervals) {
  var merged = mergeIntervals(intervals);
  var total = 0;
  for (var i = 0; i < merged.length; i++) {
    if (isFinite(merged[i].end)) {
      total += merged[i].end - merged[i].start;
    }
  }
  return total;
}

function renderFileAnalysis() {
  var section = document.getElementById('fileopsFileAnalysis');
  var list = document.getElementById('fileopsFileList');
  if (!section || !list || !fileOpsData) return;

  // Collect read operations per file
  var fileReads = {}; // filePath -> { reads: [{turnIndex, range, op}], writes: [], edits: [] }
  for (var ti = 0; ti < fileOpsData.turns.length; ti++) {
    var turn = fileOpsData.turns[ti];
    for (var oi = 0; oi < turn.operations.length; oi++) {
      var op = turn.operations[oi];
      var fp = op.filePath;
      if (!fileReads[fp]) fileReads[fp] = { path: fp, displayPath: op.displayPath, reads: [], writes: [], edits: [] };
      if (op.opType === 'read') {
        fileReads[fp].reads.push({ turnIndex: turn.turnIndex, turnId: turn.turnId, range: op.range });
      } else if (op.opType === 'write') {
        fileReads[fp].writes.push(turn.turnIndex);
      } else {
        fileReads[fp].edits.push(turn.turnIndex);
      }
    }
  }

  var fileKeys = Object.keys(fileReads);
  if (fileKeys.length === 0) return;
  section.style.display = '';

  // Build file analysis cards
  var items = [];
  for (var fi = 0; fi < fileKeys.length; fi++) {
    var fr = fileReads[fileKeys[fi]];
    var intervalCount = fr.reads.length;

    // Compute overlap/redundancy
    var intervals = [];
    var totalReadLines = 0;
    for (var ri = 0; ri < fr.reads.length; ri++) {
      var rng = parseLineRange(fr.reads[ri].range);
      intervals.push({ start: rng.start, end: rng.end });
      if (isFinite(rng.end)) totalReadLines += rng.end - rng.start;
    }
    var uniqueLines = computeUniqueLines(intervals);
    var redundancy = totalReadLines > 0 ? Math.round((1 - uniqueLines / totalReadLines) * 100) : 0;

    // Count overlapping pairs
    var overlapCount = 0;
    for (var ai = 0; ai < intervals.length; ai++) {
      for (var bi = ai + 1; bi < intervals.length; bi++) {
        if (rangesOverlap(intervals[ai], intervals[bi])) overlapCount++;
      }
    }

    items.push({
      path: fr.path,
      display: fr.displayPath,
      reads: intervalCount,
      writes: fr.writes.length,
      edits: fr.edits.length,
      redundancy: redundancy,
      overlaps: overlapCount,
      uniqueLines: uniqueLines,
      totalReadLines: totalReadLines,
      readsList: fr.reads
    });
  }

  // Sort: most overlaps first, then most reads
  items.sort(function(a, b) { return b.overlaps !== a.overlaps ? b.overlaps - a.overlaps : b.reads - a.reads; });

  var MAX_VISIBLE = 5;
  var hasMore = items.length > MAX_VISIBLE;

  function renderOneFileItem(it, extraClass) {
    var hasIssue = it.overlaps > 0;
    var borderColor = hasIssue ? 'var(--orange)' : 'var(--border)';
    var bgColor = hasIssue ? 'rgba(224,154,107,0.03)' : 'transparent';
    var cls = 'fileops-file-item' + (extraClass ? ' ' + extraClass : '');

    var itemHtml = '<div class="' + cls + '" style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:4px;border:1px solid ' + borderColor + ';border-radius:6px;background:' + bgColor + ';font-size:11px">';

    itemHtml += '<span style="font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(it.path) + '">📄 ' + esc(it.display) + '</span>';

    itemHtml += '<span style="color:var(--blue);white-space:nowrap">📖 ' + it.reads + ' reads</span>';

    if (it.writes > 0 || it.edits > 0) {
      var weParts = [];
      if (it.writes > 0) weParts.push('📝 ' + it.writes);
      if (it.edits > 0) weParts.push('✏️ ' + it.edits);
      itemHtml += '<span style="color:var(--green);white-space:nowrap">' + weParts.join(' ') + '</span>';
    }

    if (it.reads > 1 && it.totalReadLines > 0) {
      itemHtml += '<span style="color:var(--text-dim);white-space:nowrap;font-size:10px">' + fmt(it.uniqueLines) + ' unique lines</span>';
    }

    if (hasIssue) {
      itemHtml += '<span style="padding:2px 8px;border-radius:4px;background:rgba(224,154,107,0.15);color:var(--orange);font-weight:600;white-space:nowrap">' + it.redundancy + '% redundant</span>';
      itemHtml += '<span style="color:var(--orange);font-size:10px;white-space:nowrap">' + it.overlaps + ' overlaps</span>';
    } else if (it.reads > 1) {
      itemHtml += '<span style="padding:2px 8px;border-radius:4px;background:rgba(94,196,158,0.1);color:var(--green);font-size:10px;white-space:nowrap">no overlap</span>';
    }

    itemHtml += '</div>';
    return itemHtml;
  }

  var html = '';
  for (var ii = 0; ii < items.length; ii++) {
    var hiddenClass = (hasMore && ii >= MAX_VISIBLE) ? 'fileops-file-item-hidden' : '';
    html += renderOneFileItem(items[ii], hiddenClass);
  }

  if (hasMore) {
    html += '<button id="fileopsToggleFiles" class="fileops-expand-btn" style="display:block;width:100%;text-align:center;padding:6px;margin-top:4px">' + __('fileops.showAllFiles', items.length) + '</button>';
  }

  list.innerHTML = html;

  if (hasMore) {
    var toggleBtn = document.getElementById('fileopsToggleFiles');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        var isExpanded = this.getAttribute('data-expanded') === '1';
        var hiddenItems = list.querySelectorAll('.fileops-file-item-hidden');
        if (isExpanded) {
          for (var hi = 0; hi < hiddenItems.length; hi++) { hiddenItems[hi].style.display = 'none'; }
          this.textContent = __('fileops.showAllFiles', items.length);
          this.setAttribute('data-expanded', '0');
        } else {
          for (var hj = 0; hj < hiddenItems.length; hj++) { hiddenItems[hj].style.display = ''; }
          this.textContent = __('fileops.showLessFiles');
          this.setAttribute('data-expanded', '1');
        }
      });
    }
  }
}

// ── Render Filter Bar ──

function renderFileOpsFilterBar() {
  var bar = document.getElementById('fileopsFilterBar');
  if (!bar || !fileOpsData) return;

  var turns = fileOpsData.turns;
  var readsCount = turns.filter(function(t) { return t.operations.some(function(op) { return op.opType === 'read'; }); }).length;
  var writesCount = turns.filter(function(t) { return t.operations.some(function(op) { return op.opType === 'write' || op.opType === 'edit'; }); }).length;

  var chips = [
    { filter: 'all',    label: __('fileops.filterAll', turns.length), active: fileOpsFilter === 'all' },
    { filter: 'reads',  label: __('fileops.filterReads', readsCount), active: fileOpsFilter === 'reads' },
    { filter: 'writes', label: __('fileops.filterWrites', writesCount), active: fileOpsFilter === 'writes' }
  ];

  bar.innerHTML = chips.map(function(c) {
    var cls = c.active ? 'fileops-chip active' : 'fileops-chip';
    return '<span class="' + cls + '" data-filter="' + c.filter + '">' + c.label + '</span>';
  }).join('');

  // Attach click handlers
  bar.querySelectorAll('.fileops-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      fileOpsFilter = this.getAttribute('data-filter') || 'all';
      renderFileOpsFilterBar();
      renderFileOpsTimeline();
    });
  });
}

// ── Render Timeline (left panel) ──

function renderFileOpsTimeline() {
  var container = document.getElementById('fileopsTimeline');
  if (!container || !fileOpsData) return;

  var turns = fileOpsData.turns;

  // Apply filter
  var filtered = turns;
  if (fileOpsFilter === 'reads') {
    filtered = turns.filter(function(t) {
      return t.operations.some(function(op) { return op.opType === 'read'; });
    });
  } else if (fileOpsFilter === 'writes') {
    filtered = turns.filter(function(t) {
      return t.operations.some(function(op) { return op.opType === 'write' || op.opType === 'edit'; });
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><div>' + __('fileops.noMatch') + '</div></div>';
    return;
  }

  var selectedId = fileOpsSelectedTurnId;

  container.innerHTML = filtered.map(function(turn) {
    var readCount = turn.operations.filter(function(op) { return op.opType === 'read'; }).length;
    var editCount = turn.operations.filter(function(op) { return op.opType === 'edit'; }).length;
    var writeCount = turn.operations.filter(function(op) { return op.opType === 'write'; }).length;
    var uniqueFiles = {};
    turn.operations.forEach(function(op) { uniqueFiles[op.filePath] = op.displayPath; });
    var filePaths = Object.keys(uniqueFiles);
    var fileCount = filePaths.length;
    var isSelected = selectedId === turn.turnId;

    var opsHtml = '';
    if (readCount > 0) opsHtml += '<span style="color:var(--blue);font-weight:600;margin-right:8px">📖 ' + readCount + '</span>';
    if (editCount > 0) opsHtml += '<span style="color:var(--orange);font-weight:600;margin-right:8px">✏️ ' + editCount + '</span>';
    if (writeCount > 0) opsHtml += '<span style="color:var(--green);font-weight:600">📝 ' + writeCount + '</span>';

    var chipsHtml = '';
    var maxChips = 3;
    for (var i = 0; i < Math.min(filePaths.length, maxChips); i++) {
      chipsHtml += '<span class="fileops-file-chip">' + esc(uniqueFiles[filePaths[i]]) + '</span>';
    }
    if (filePaths.length > maxChips) {
      chipsHtml += '<span class="fileops-file-chip">' + __('fileops.moreFiles', filePaths.length - maxChips) + '</span>';
    }

    var cls = 'fileops-turn-item';
    if (isSelected) cls += ' selected';

    return '<div class="' + cls + '" data-turn-id="' + esc(turn.turnId) + '">' +
      '<div class="fileops-turn-top">' +
        '<span class="fileops-turn-index">#' + (turn.turnIndex + 1) + '</span>' +
        (turn.isSubagent ? '<span class="fileops-subagent-badge">' + esc(turn.subagentName || __('fileops.subagent')) + '</span>' : '') +
        '<span class="fileops-turn-files">' + __('fileops.filesCount', fileCount) + '</span>' +
      '</div>' +
      '<div class="fileops-turn-ops">' + opsHtml + '</div>' +
      '<div class="fileops-turn-chips">' + chipsHtml + '</div>' +
    '</div>';
  }).join('');

  // Attach click handlers
  container.querySelectorAll('.fileops-turn-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var tid = this.getAttribute('data-turn-id');
      fileOpsSelectedTurnId = tid;
      renderFileOpsTimeline();
      renderFileOpsDetail(tid);
    });
  });

  // Auto-select first turn if none selected
  if (!selectedId && filtered.length > 0) {
    fileOpsSelectedTurnId = filtered[0].turnId;
    renderFileOpsTimeline();
    renderFileOpsDetail(filtered[0].turnId);
  }
}

// ── Render Detail (right panel) ──

function renderFileOpsDetail(turnId) {
  var container = document.getElementById('fileopsDetail');
  if (!container || !fileOpsData) return;

  var turn = null;
  for (var i = 0; i < fileOpsData.turns.length; i++) {
    if (fileOpsData.turns[i].turnId === turnId) { turn = fileOpsData.turns[i]; break; }
  }

  if (!turn) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><div>' + __('fileops.selectTurnHint') + '</div></div>';
    return;
  }

  // Group operations by file path
  var grouped = {};
  for (var i = 0; i < turn.operations.length; i++) {
    var op = turn.operations[i];
    var key = op.filePath;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(op);
  }

  var html = '<div class="fileops-detail-inner">';

  // Turn header
  html += '<div class="fileops-detail-header">';
  html += '<span class="fileops-detail-turn">' + __('fileops.turnLabel', turn.turnIndex + 1) + '</span>';

  var roleColor = turn.role === 'assistant' ? 'var(--green)' : 'var(--blue)';
  html += '<span class="fileops-op-badge" style="background:rgba(94,196,158,0.15);color:' + roleColor + '">' + esc(turn.role) + '</span>';

  if (turn.isSubagent) {
    html += '<span class="fileops-op-badge" style="background:rgba(224,154,107,0.15);color:var(--orange)">' + esc(turn.subagentName || __('fileops.subagent')) + '</span>';
  }

  if (turn.agentName && turn.agentName !== 'root') {
    html += '<span class="fileops-op-badge" style="background:rgba(255,255,255,0.05);color:var(--text-dim)">' + esc(turn.agentName) + '</span>';
  }

  // Navigate to turns tab button
  html += '<button class="fileops-nav-btn" data-nav-turn="' + esc(turn.turnId) + '">' + __('fileops.viewTurn') + '</button>';
  html += '</div>';

  // Content summary
  if (turn.contentSummary) {
    var summary = turn.contentSummary;
    if (summary.length > 150) summary = summary.substring(0, 147) + '...';
    html += '<div class="fileops-detail-summary" title="' + esc(turn.contentSummary) + '">&ldquo;' + esc(summary) + '&rdquo;</div>';
  }

  // File groups
  // Section title
  html += '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">' + __('fileops.detailTitle') + '</div>';

  var fileKeys = Object.keys(grouped);
  for (var fi = 0; fi < fileKeys.length; fi++) {
    var filePath = fileKeys[fi];
    var ops = grouped[filePath];
    var displayPath = ops[0].displayPath;

    html += '<div class="fileops-file-group">';
    // File header
    html += '<div class="fileops-file-group-header">';
    html += '<span class="fileops-file-name" title="' + esc(filePath) + '">📄 ' + esc(displayPath) + '</span>';
    var shortPath = filePath.length > 55 ? '...' + filePath.substring(filePath.length - 52) : filePath;
    html += '<span class="fileops-file-path" title="' + esc(filePath) + '">' + esc(shortPath) + '</span>';
    html += '</div>';

    // Operations
    for (var oi = 0; oi < ops.length; oi++) {
      var op = ops[oi];
      html += '<div class="fileops-op-item">';

      // Operation header
      html += '<div class="fileops-op-header">';
      html += '<span class="fileops-op-type" style="color:' + OP_COLORS[op.opType] + '">';
      html += OP_ICONS[op.opType] + ' ';
      if (op.opType === 'read') html += __('fileops.opRead');
      else if (op.opType === 'edit') html += __('fileops.opEdit');
      else html += __('fileops.opWrite');
      html += '</span>';

      var isOk = op.state === 'ok' || op.state === 'completed';
      html += '<span class="fileops-op-badge ' + (isOk ? 'ok' : 'error') + '">' + esc(op.state) + '</span>';

      if (op.range) {
        html += '<span class="fileops-op-range">' + formatRange(op.range) + '</span>';
      }

      if (op.durationMs > 0) {
        html += '<span class="fileops-op-duration">' + fmtMs(op.durationMs) + '</span>';
      }

      html += '</div>';

      // Operation content
      if (op.opType === 'read' && op.content) {
        html += renderExpandableCode(op.content, op.displayPath, 'fileops-read-' + op.toolCallId);
      } else if (op.opType === 'read' && !op.content) {
        html += '<div style="font-size:11px;color:var(--text-dim);font-style:italic;padding:4px 0">' + __('fileops.emptyResult') + '</div>';
      } else if (op.opType === 'edit') {
        html += renderDiffView(op.oldContent, op.newContent);
      } else if (op.opType === 'write') {
        html += '<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:4px">📝 ' + __('fileops.fileContent') + '</div>';
        html += renderExpandableCode(op.newContent, op.displayPath, 'fileops-write-' + op.toolCallId);
      }

      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';

  container.innerHTML = html;

  // Navigation button handler
  container.querySelectorAll('.fileops-nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tid = this.getAttribute('data-nav-turn');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });

  // Expand/collapse handlers
  container.querySelectorAll('[data-fileops-expand]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var blockId = this.getAttribute('data-fileops-expand');
      var codeBlock = document.getElementById('code-' + blockId);
      var fullContent = fileOpsContents[blockId] || '';
      var previewLines = parseInt(this.getAttribute('data-preview-lines'), 10) || 30;
      var isExpanded = this.getAttribute('data-expanded') === '1';

      if (!codeBlock) return;

      if (isExpanded) {
        // Collapse
        var lines = fullContent.split('\\n');
        var preview = lines.slice(0, previewLines);
        renderCodeLines(codeBlock, preview);
        var totalLines = lines.length;
        this.textContent = __('fileops.expandAll', totalLines);
        this.setAttribute('data-expanded', '0');
        codeBlock.style.maxHeight = '400px';
        var footer = this.parentNode.querySelector('[data-fileops-footer]');
        if (footer) footer.style.display = '';
      } else {
        // Expand
        var lines2 = fullContent.split('\\n');
        renderCodeLines(codeBlock, lines2);
        this.textContent = __('fileops.collapse');
        this.setAttribute('data-expanded', '1');
        codeBlock.style.maxHeight = '600px';
        var footer2 = this.parentNode.querySelector('[data-fileops-footer]');
        if (footer2) footer2.style.display = 'none';
      }
    });
  });

  // Copy button handlers — read from map not DOM attr
  container.querySelectorAll('[data-fileops-copy]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var blockId = this.getAttribute('data-fileops-copy');
      var content = fileOpsContents[blockId] || '';
      navigator.clipboard.writeText(content).catch(function() {});
      var origText = this.textContent;
      this.textContent = '✓';
      var self = this;
      setTimeout(function() { self.textContent = origText; }, 1000);
    });
  });
}

// ── Render Expandable Code Block ──

function renderExpandableCode(content, filePath, blockId) {
  if (!content) return '<div style="font-size:11px;color:var(--text-dim);padding:4px 0">' + __('fileops.noContent') + '</div>';

  // Store full content in map for expand/copy (avoids DOM attr encoding issues)
  fileOpsContents[blockId] = content;

  var lines = content.split('\\n');
  var previewLines = 30;
  var isTruncated = lines.length > previewLines;
  var displayLines = isTruncated ? lines.slice(0, previewLines) : lines;
  var totalLines = lines.length;

  var html = '';

  // Toolbar
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
  html += '<span style="font-size:10px;color:var(--text-dim)">' + __('fileops.linesCount', totalLines) + '</span>';
  if (isTruncated) {
    html += '<button class="fileops-expand-btn" data-fileops-expand="' + blockId + '" data-preview-lines="' + previewLines + '" data-expanded="0">' + __('fileops.expandAll', totalLines) + '</button>';
  }
  html += '<button class="fileops-copy-btn" data-fileops-copy="' + blockId + '" title="Copy">📋</button>';
  html += '</div>';

  // Code block
  html += '<pre class="fileops-code-block" id="code-' + blockId + '" style="max-height:400px">';
  html += renderCodeLinesHtml(displayLines);
  html += '</pre>';

  // Truncated footer
  if (isTruncated) {
    html += '<div data-fileops-footer style="font-size:10px;color:var(--text-dim);text-align:center;padding:4px 0;border-top:1px solid var(--border)">' + __('fileops.moreLines', totalLines - previewLines) + '</div>';
  }

  return html;
}

function renderCodeLinesHtml(lines) {
  var html = '';
  for (var i = 0; i < lines.length; i++) {
    html += '<div class="fileops-code-line">' +
      '<span class="fileops-code-ln">' + (i + 1) + '</span>' +
      '<span class="fileops-code-text">' + escContent(lines[i]) + '</span>' +
    '</div>';
  }
  return html;
}

function renderCodeLines(container, lines) {
  container.innerHTML = renderCodeLinesHtml(lines);
}

// ── Render Diff View ──

function renderDiffView(oldContent, newContent) {
  if (!oldContent && !newContent) {
    return '<div style="font-size:11px;color:var(--text-dim);padding:4px 0">' + __('fileops.noDiff') + '</div>';
  }

  // Pure addition
  if (!oldContent) {
    var newLines = newContent.split('\\n');
    var html = '<div>';
    html += '<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:4px">' + __('fileops.newFile') + '</div>';
    html += '<pre class="fileops-code-block" style="max-height:300px;border-color:rgba(94,196,158,0.3)">';
    for (var i = 0; i < Math.min(newLines.length, 500); i++) {
      html += '<div class="fileops-code-line" style="background:rgba(94,196,158,0.03)">' +
        '<span class="fileops-code-ln">' + (i + 1) + '</span>' +
        '<span class="fileops-code-text">' + escContent(newLines[i]) + '</span>' +
      '</div>';
    }
    html += '</pre></div>';
    return html;
  }

  // Pure deletion
  if (!newContent) {
    var oldLines = oldContent.split('\\n');
    var html = '<div>';
    html += '<div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:4px">' + __('fileops.deletedFile') + '</div>';
    html += '<pre class="fileops-code-block" style="max-height:300px;border-color:rgba(232,103,107,0.3)">';
    for (var i = 0; i < Math.min(oldLines.length, 500); i++) {
      html += '<div class="fileops-code-line" style="background:rgba(232,103,107,0.03)">' +
        '<span class="fileops-code-ln">' + (i + 1) + '</span>' +
        '<span class="fileops-code-text">' + escContent(oldLines[i]) + '</span>' +
      '</div>';
    }
    html += '</pre></div>';
    return html;
  }

  // Side-by-side diff
  var oldLines = oldContent.split('\\n');
  var newLines = newContent.split('\\n');
  var maxLines = Math.max(oldLines.length, newLines.length, 500);

  var html = '<div class="fileops-diff-container">';
  html += '<div class="fileops-diff-grid">';

  // Headers
  html += '<div class="fileops-diff-header-old" style="background:rgba(232,103,107,0.08);color:var(--red)">- ' + __('fileops.oldCode') + '</div>';
  html += '<div class="fileops-diff-header-new" style="background:rgba(94,196,158,0.08);color:var(--green)">+ ' + __('fileops.newCode') + '</div>';

  // Lines
  for (var i = 0; i < maxLines; i++) {
    var oldLine = i < oldLines.length ? oldLines[i] : null;
    var newLine = i < newLines.length ? newLines[i] : null;
    var isChanged = oldLine !== newLine;

    // Old line
    var oldCls = 'fileops-diff-cell old';
    var oldStyle = '';
    if (isChanged && oldLine !== null) {
      oldStyle = 'background:rgba(232,103,107,0.08);color:var(--red)';
    } else {
      oldStyle = 'color:var(--text-dim)';
    }
    html += '<div class="' + oldCls + '" style="' + oldStyle + '">' + (oldLine != null ? escContent(oldLine) || '&nbsp;' : '&nbsp;') + '</div>';

    // New line
    var newCls = 'fileops-diff-cell';
    var newStyle = '';
    if (isChanged && newLine !== null) {
      newStyle = 'background:rgba(94,196,158,0.08);color:var(--green)';
    } else {
      newStyle = 'color:var(--text-dim)';
    }
    html += '<div class="' + newCls + '" style="' + newStyle + '">' + (newLine != null ? escContent(newLine) || '&nbsp;' : '&nbsp;') + '</div>';
  }

  html += '</div></div>';
  return html;
}

// ── Main Render Entry Point ──

function renderFileOps() {
  buildFileOpsData();

  if (!fileOpsData || fileOpsData.turns.length === 0) {
    var timeline = document.getElementById('fileopsTimeline');
    if (timeline) timeline.innerHTML = '<div class="empty-state"><div class="icon">📁</div><div>' + __('fileops.noOps') + '</div></div>';
    var detail = document.getElementById('fileopsDetail');
    if (detail) detail.innerHTML = '<div class="empty-state"><div class="icon">📋</div><div>' + __('fileops.noOps') + '</div></div>';
    var cards = document.getElementById('fileopsCards');
    if (cards) cards.innerHTML = '';
    var bar = document.getElementById('fileopsFilterBar');
    if (bar) bar.innerHTML = '';
    return;
  }

  // Reset state
  fileOpsFilter = 'all';
  fileOpsSelectedTurnId = null;

  renderFileOpsSummaryCards();
  renderFileOpsFilterBar();
  renderFileOpsTimeline();
}

// ── Navigation listeners ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:fileops', function(params) {
    renderFileOps();
    if (params && params.filePath) {
      // Find and select turn containing this file
      if (fileOpsData && fileOpsData.turns) {
        for (var i = 0; i < fileOpsData.turns.length; i++) {
          var t = fileOpsData.turns[i];
          if (t.operations.some(function(op) { return op.filePath === params.filePath; })) {
            fileOpsSelectedTurnId = t.turnId;
            renderFileOpsTimeline();
            renderFileOpsDetail(t.turnId);
            break;
          }
        }
      }
    }
  });
}
`;
}
//# sourceMappingURL=fileops.js.map