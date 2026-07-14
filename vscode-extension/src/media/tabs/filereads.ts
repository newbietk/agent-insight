// File Reads tab — file read/write operation analysis with redundancy detection.

import { escHtml } from '../shared';
import { t } from '../../i18n';

export function renderFileReadsTab(): string {
  return `
<div id="tab-filereads" class="tab-panel">
  <div class="cards" id="filereadsCards"></div>
  <div class="table-wrap" style="margin-top:12px">
    <div class="table-header">
      ${escHtml(t('filereads.title'))}
      <span style="font-size:11px;color:var(--text-dim);font-weight:400;margin-left:8px">${escHtml(t('filereads.clickHint'))}</span>
    </div>
    <div style="max-height: 600px; overflow-y: auto;">
      <table>
        <thead><tr>
          <th>${escHtml(t('filereads.colFile'))}</th>
          <th>${escHtml(t('filereads.colReads'))}</th>
          <th>${escHtml(t('filereads.colWrites'))}</th>
          <th>${escHtml(t('filereads.colUniqueLines'))}</th>
          <th>${escHtml(t('filereads.colRedundancy'))}</th>
          <th>${escHtml(t('filereads.colLatestTurn'))}</th>
        </tr></thead>
        <tbody id="filereadsTableBody"></tbody>
      </table>
    </div>
  </div>
  <div id="filereadsDetail" style="margin-top:12px"></div>
</div>`;
}

export function renderFileReadsJS(): string {
  return `
// ── File Reads Tab ──
var fileOpsData = {}; // { filePath: { reads: [], writes: [] } }

function renderFileReads() {
  // Collect all file read/write tool calls from turns
  fileOpsData = {};
  var readTools = ['read_file', 'read', 'view', 'view_file', 'Read'];
  var writeTools = ['write_file', 'write', 'Edit', 'Write', 'create_file'];

  for (var i = 0; i < turns.length; i++) {
    var t = turns[i];
    if (!t.toolCalls || t.toolCalls.length === 0) continue;
    for (var j = 0; j < t.toolCalls.length; j++) {
      var tc = t.toolCalls[j];
      var isRead = false;
      var isWrite = false;
      for (var r = 0; r < readTools.length; r++) {
        if ((tc.toolName || '').toLowerCase() === readTools[r].toLowerCase()) { isRead = true; break; }
      }
      if (!isRead) {
        for (var w = 0; w < writeTools.length; w++) {
          if ((tc.toolName || '').toLowerCase() === writeTools[w].toLowerCase()) { isWrite = true; break; }
        }
      }
      if (!isRead && !isWrite) continue;

      // Extract file path from args
      var filePath = 'unknown';
      if (tc.argsJson) {
        try {
          var args = JSON.parse(tc.argsJson);
          filePath = args.file_path || args.filePath || args.path || args.file || 'unknown';
        } catch(e) {}
      }

      if (!fileOpsData[filePath]) {
        fileOpsData[filePath] = { reads: [], writes: [] };
      }

      var entry = {
        turnIndex: t.turnIndex != null ? t.turnIndex : i,
        turnId: t.id,
        toolName: tc.toolName,
        state: tc.state,
        durationMs: tc.durationMs || 0,
        agentName: t.agentName || 'root',
        argsJson: tc.argsJson
      };

      if (isWrite) {
        fileOpsData[filePath].writes.push(entry);
      } else {
        fileOpsData[filePath].reads.push(entry);
      }
    }
  }

  // Summary cards
  var cards = document.getElementById('filereadsCards');
  if (cards) {
    var totalFiles = Object.keys(fileOpsData).length;
    var totalReads = 0, totalWrites = 0;
    Object.values(fileOpsData).forEach(function(v) {
      totalReads += v.reads.length;
      totalWrites += v.writes.length;
    });

    // Count files with multiple reads (potential redundancy)
    var redundantFiles = 0;
    Object.values(fileOpsData).forEach(function(v) {
      if (v.reads.length > 1) redundantFiles++;
    });

    cards.innerHTML = [
      {label:__('filereads.cardFilesAccessed'), val:String(totalFiles), cls:'', sub:''},
      {label:__('filereads.cardTotalReads'), val:String(totalReads), cls:'tokens', sub:''},
      {label:__('filereads.cardTotalWrites'), val:String(totalWrites), cls:'', sub:''},
      {label:__('filereads.cardRedundant'), val:String(redundantFiles), cls:redundantFiles > 0 ? 'cost' : '', sub:redundantFiles > 0 ? __('filereads.potentialRedundancy') : __('filereads.allUnique')},
    ].map(function(c) {
      return '<div class="card"><div class="card-label">'+c.label+'</div><div class="card-value '+c.cls+'" style="font-size:20px">'+c.val+'</div><div class="card-sub">'+c.sub+'</div></div>';
    }).join('');
  }

  // Table
  renderFileReadsTable();
}

function renderFileReadsTable() {
  var tbody = document.getElementById('filereadsTableBody');
  if (!tbody) return;

  var files = Object.keys(fileOpsData).sort(function(a, b) {
    var totalA = fileOpsData[a].reads.length + fileOpsData[a].writes.length;
    var totalB = fileOpsData[b].reads.length + fileOpsData[b].writes.length;
    return totalB - totalA;
  });

  if (files.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px">' + __('filereads.noOps') + '</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < files.length; i++) {
    var fp = files[i];
    var ops = fileOpsData[fp];
    var reads = ops.reads.length;
    var writes = ops.writes.length;
    var latestIdx = 0;
    var allOps = ops.reads.concat(ops.writes);
    for (var j = 0; j < allOps.length; j++) {
      latestIdx = Math.max(latestIdx, allOps[j].turnIndex);
    }

    // Redundancy calculation
    var redundancy = reads > 1 ? ((reads - 1) / reads * 100).toFixed(0) + '%' : '0%';
    var redundancyColor = reads > 3 ? 'var(--red)' : reads > 1 ? 'var(--orange)' : 'var(--green)';
    var fileName = fp.split(/[\\/\\\\]/).pop() || fp;
    var displayPath = fp.length > 60 ? '...' + fp.substring(fp.length - 57) : fp;

    html += '<tr class="turn-row" data-file="' + esc(fp) + '" style="cursor:pointer">' +
      '<td title="' + esc(fp) + '" style="max-width:300px;overflow:hidden;text-overflow:ellipsis">' +
        '<span style="font-weight:600">' + esc(fileName) + '</span>' +
        '<div style="font-size:10px;color:var(--text-dim)">' + esc(displayPath) + '</div>' +
      '</td>' +
      '<td style="font-weight:500">' + reads + '</td>' +
      '<td>' + writes + '</td>' +
      '<td>' + (reads > 0 ? '—' : '—') + '</td>' +
      '<td style="color:' + redundancyColor + ';font-weight:500">' + redundancy + '</td>' +
      '<td style="color:var(--text-dim)">#' + (latestIdx + 1) + '</td>' +
    '</tr>';
  }
  tbody.innerHTML = html;

  // Click → show detail
  tbody.querySelectorAll('.turn-row[data-file]').forEach(function(row) {
    row.addEventListener('click', function() {
      var fp = this.getAttribute('data-file');
      showFileReadDetail(fp);
    });
  });
}

function showFileReadDetail(filePath) {
  var detail = document.getElementById('filereadsDetail');
  if (!detail) return;
  var ops = fileOpsData[filePath];
  if (!ops) return;

  var html = '<div class="turn-detail" style="margin-top:0">';
  html += '<h4>' + esc(filePath) + '</h4>';
  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px">' +
    __('filereads.opsDetail', ops.reads.length, ops.writes.length) + '</div>';

  // Show reads
  var allOps = [];
  for (var r = 0; r < ops.reads.length; r++) {
    allOps.push({ type: '📖 ' + __('filereads.opRead'), entry: ops.reads[r] });
  }
  for (var w = 0; w < ops.writes.length; w++) {
    allOps.push({ type: '✏️ ' + __('filereads.opWrite'), entry: ops.writes[w] });
  }
  allOps.sort(function(a, b) { return a.entry.turnIndex - b.entry.turnIndex; });

  for (var i = 0; i < allOps.length; i++) {
    var op = allOps[i];
    html += '<div class="tool-call-item" data-turn-id="' + esc(op.entry.turnId) + '" style="cursor:pointer;margin-bottom:4px">' +
      op.type + ' · Turn #' + (op.entry.turnIndex + 1) +
      ' <span style="color:var(--text-dim)">' + esc(op.entry.toolName) + '</span>' +
      (op.entry.durationMs > 0 ? ' <span style="color:var(--text-dim)">' + fmtMs(op.entry.durationMs) + '</span>' : '') +
      '</div>';
  }
  html += '</div>';
  detail.innerHTML = html;

  // Click → navigate to turns
  detail.querySelectorAll('[data-turn-id]').forEach(function(item) {
    item.addEventListener('click', function() {
      var tid = this.getAttribute('data-turn-id');
      if (tid && window.__kirinai) {
        window.__kirinai.navigate('turns', { turnId: tid });
      }
    });
  });
}

// ── Navigation listeners ──
if (window.__kirinai) {
  window.__kirinai.on('navigate:filereads', function(params) {
    if (params && params.filePath) {
      showFileReadDetail(params.filePath);
    }
  });
}
`;
}
