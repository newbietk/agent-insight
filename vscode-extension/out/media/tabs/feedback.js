"use strict";
// Feedback tab — inline feedback form replacing the old robot FAB + drawer pattern.
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderFeedbackTab = renderFeedbackTab;
exports.renderFeedbackJS = renderFeedbackJS;
const shared_1 = require("../shared");
const i18n_1 = require("../../i18n");
function renderFeedbackTab() {
    return `
<div id="tab-feedback" class="tab-panel">
  <div style="max-width:min(800px, 90vw);margin:0 auto">
    <div class="chart-container" style="margin-bottom:16px">
      <div class="chart-title">📬 ${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.title'))}</div>

      <div id="fbSessionMeta" class="session-meta" style="font-size:11px;margin-bottom:16px"></div>

      <label style="display:block;font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.4px;margin:14px 0 6px 0">
        ${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueType'))}
      </label>
      <select id="fbIssueType" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:var(--card-bg);color:var(--text);font-size:12px;font-family:inherit;transition:border-color 0.15s;outline:none">
        <option value="context_explosion">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueContextExplosion'))}</option>
        <option value="duplicate_reads">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueDuplicateReads'))}</option>
        <option value="cost_spike">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueCostSpike'))}</option>
        <option value="hallucination">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueHallucination'))}</option>
        <option value="other">${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.issueOther'))}</option>
      </select>

      <label style="display:block;font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.4px;margin:14px 0 6px 0">
        ${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.problemDesc'))} <span style="color:var(--red)">*</span>
      </label>
      <textarea id="fbProblem" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.problemPlaceholder'))}"
        style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:var(--card-bg);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;min-height:100px;transition:border-color 0.15s;outline:none"></textarea>

      <label style="display:block;font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.4px;margin:14px 0 6px 0">
        ${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.helpRequest'))}
      </label>
      <textarea id="fbHelp" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.helpPlaceholder'))}"
        style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:var(--card-bg);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;min-height:80px;transition:border-color 0.15s;outline:none"></textarea>

      <label style="display:block;font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.4px;margin:14px 0 6px 0">
        ${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.contactEmail'))}
      </label>
      <input type="email" id="fbEmail" placeholder="${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.emailPlaceholder'))}"
        style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:var(--card-bg);color:var(--text);font-size:12px;font-family:inherit;transition:border-color 0.15s;outline:none">

      <div style="margin-top:20px;display:flex;gap:10px">
        <button id="fbSubmitBtn"
          style="flex:1;padding:10px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;background:var(--accent);color:#fff;transition:opacity 0.15s">
          ${(0, shared_1.escHtml)((0, i18n_1.t)('feedback.submit'))}
        </button>
      </div>
    </div>
  </div>
</div>`;
}
function renderFeedbackJS() {
    return `
// ── Feedback Tab ──

function initFeedbackTab() {
  var submitBtn = document.getElementById('fbSubmitBtn');
  if (!submitBtn || submitBtn._feedbackWired) return;
  submitBtn._feedbackWired = true;

  // Populate session meta
  var meta = document.getElementById('fbSessionMeta');
  if (meta) {
    meta.innerHTML = [
      '<span style="color:var(--text-dim)">' + __('feedback.task') + ':</span> <span style="color:var(--text);font-weight:500">' + esc(session.taskId.substring(0, 40)) + '</span>',
      '<span style="color:var(--text-dim)">' + __('common.model') + ':</span> <span style="color:var(--text);font-weight:500">' + esc(session.model || 'unknown') + '</span>',
      '<span style="color:var(--text-dim)">' + __('common.tokens') + ':</span> <span style="color:var(--text);font-weight:500">' + fmt(toNumber(session.totalTokens)) + '</span>',
      '<span style="color:var(--text-dim)">' + __('common.cost') + ':</span> <span style="color:var(--text);font-weight:500">' + fmtCost(session.totalCost) + '</span>',
      '<span style="color:var(--text-dim)">' + __('common.turns') + ':</span> <span style="color:var(--text);font-weight:500">' + turns.length + '</span>'
    ].join(' · ');
  }

  function showFeedbackToast(msg, isError) {
    var toast = document.getElementById('feedbackToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'feedback-toast ' + (isError ? 'error' : 'success') + ' show';
    setTimeout(function() { toast.classList.remove('show'); }, 4000);
  }

  submitBtn.addEventListener('click', function() {
    var issueType = document.getElementById('fbIssueType').value;
    var problemDescription = document.getElementById('fbProblem').value.trim();
    var helpRequest = document.getElementById('fbHelp').value.trim();
    var contactEmail = document.getElementById('fbEmail').value.trim();

    if (!problemDescription) {
      showFeedbackToast(__('feedback.pleaseDescribe'), true);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = __('feedback.uploading');
    submitBtn.style.opacity = '0.6';

    vscode.postMessage({
      type: 'submitFeedback',
      issueType: issueType,
      problemDescription: problemDescription,
      helpRequest: helpRequest,
      contactEmail: contactEmail
    });
  });

  // Listen for feedback result
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg && msg.type === 'feedbackResult') {
      submitBtn.disabled = false;
      submitBtn.textContent = __('feedback.submit');
      submitBtn.style.opacity = '1';
      if (msg.success) {
        showFeedbackToast(__('feedback.uploaded', msg.submissionId || 'N/A'), false);
        // Clear form
        var problem = document.getElementById('fbProblem');
        var help = document.getElementById('fbHelp');
        if (problem) problem.value = '';
        if (help) help.value = '';
      } else {
        showFeedbackToast(__('feedback.uploadFailed', msg.error || 'Unknown error'), true);
      }
    }
  });
}
`;
}
//# sourceMappingURL=feedback.js.map