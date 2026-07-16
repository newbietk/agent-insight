import * as vscode from 'vscode';
import { Storage } from '../storage/db';
import type { SessionListItem } from '../storage/db';

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 64; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtMs(ms: number): string {
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + 'm';
  if (ms >= 1_000) return (ms / 1_000).toFixed(1) + 's';
  return ms + 'ms';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

export class SessionListPanelProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _activationError: string | null;

  constructor(private storage: Storage | null, activationError: string | null = null) {
    this._activationError = activationError;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(msg => this._handleMessage(msg));

    this._render();
  }

  refresh(): void {
    this._render();
  }

  dispose(): void {
    for (const d of this._disposables) d.dispose();
  }

  private _handleMessage(msg: { type: string; sessionId?: string }): void {
    switch (msg.type) {
      case 'openSession':
        if (msg.sessionId) {
          vscode.commands.executeCommand('hismartlite.openSession', msg.sessionId);
        }
        break;
      case 'deleteSession':
        if (msg.sessionId) {
          vscode.commands.executeCommand('hismartlite.deleteSession', {
            session: { id: msg.sessionId, taskId: '' },
          });
        }
        break;
      case 'import':
        vscode.commands.executeCommand('hismartlite.import');
        break;
    }
  }

  private _render(): void {
    if (!this._view) return;

    try {
      // Show error state if activation failed
      if (this._activationError) {
        this._view.webview.html = this._errorHtml(this._activationError);
        return;
      }

      // Show empty state if storage is null (shouldn't happen, but defensive)
      if (!this.storage) {
        this._view.webview.html = this._errorHtml('Storage not initialized');
        return;
      }

      const sessions = this.storage.listSessions();
      const nonce = getNonce();

      this._view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline' ${this._view.webview.cspSource}; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 8px;
  }

  .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: var(--vscode-descriptionForeground);
  }
  .empty-state .icon { font-size: 32px; margin-bottom: 12px; opacity: 0.5; }
  .empty-state .title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .empty-state .hint { font-size: 11px; opacity: 0.7; margin-bottom: 14px; }
  .empty-state button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .empty-state button:hover { background: var(--vscode-button-hoverBackground); }

  .card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .card:hover {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-hoverBackground);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .card-framework {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 2px 6px;
    border-radius: 3px;
    color: var(--vscode-textLink-foreground);
  }
  .card-framework.claude { background: rgba(212,119,73,0.15); color: #d47749; }
  .card-framework.opencode { background: rgba(100,200,255,0.15); color: #64c8ff; }

  .card-time {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--vscode-foreground);
  }

  .card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 12px;
    font-size: 11px;
    margin-bottom: 8px;
  }
  .card-grid-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .card-grid-label { color: var(--vscode-descriptionForeground); }
  .card-grid-value { color: var(--vscode-foreground); font-weight: 500; }
  .card-grid-value.cost { color: var(--vscode-charts-green); }
  .card-grid-value.tokens { color: var(--vscode-textLink-foreground); }

  .card-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 6px;
  }
  .card-btn {
    background: none;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    color: var(--vscode-foreground);
  }
  .card-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }
  .card-btn.danger:hover {
    background: rgba(255,100,100,0.15);
    border-color: #f44747;
    color: #f44747;
  }
</style>
</head>
<body>
${sessions.length === 0 ? this._emptyHtml(nonce) : this._cardsHtml(sessions)}
<script nonce="${nonce}">
(function() {
  var vscode = acquireVsCodeApi();

  // Card click → open session
  document.querySelectorAll('.card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.card-btn')) return; // Don't open on button clicks
      var sid = card.getAttribute('data-sid');
      if (sid) {
        vscode.postMessage({ type: 'openSession', sessionId: sid });
      }
    });
  });

  // Delete buttons
  document.querySelectorAll('.card-btn.danger').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var sid = btn.getAttribute('data-sid');
      if (sid) {
        vscode.postMessage({ type: 'deleteSession', sessionId: sid });
      }
    });
  });

  // Import button in empty state
  var importBtn = document.getElementById('importBtn');
  if (importBtn) {
    importBtn.addEventListener('click', function() {
      vscode.postMessage({ type: 'import' });
    });
  }
})();
</script>
</body>
</html>`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[KirinAI] Render error:', msg);
      this._view.webview.html = `<html><body><p style="color:var(--vscode-errorForeground);padding:16px;">Render error: ${esc(msg)}</p></body></html>`;
    }
  }

  private _emptyHtml(nonce: string): string {
    return `<div class="empty-state">
  <div class="icon">📋</div>
  <div class="title">No sessions yet</div>
  <div class="hint">Import Claude Code or OpenCode sessions</div>
  <button id="importBtn">Import Sessions</button>
</div>`;
  }

  private _errorHtml(msg: string): string {
    return `<html><body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:16px;">
  <p style="color:var(--vscode-errorForeground);font-weight:600;">CANNBot Insight failed to start</p>
  <p style="color:var(--vscode-descriptionForeground);font-size:12px;margin-top:8px;">${esc(msg)}</p>
</body></html>`;
  }

  private _cardsHtml(sessions: SessionListItem[]): string {
    return sessions.map(s => {
      const fw = s.framework || 'claude-code';
      const fwClass = fw === 'opencode' ? 'opencode' : 'claude';
      const fwLabel = fw === 'opencode' ? 'OpenCode' : 'Claude';
      const modelShort = (s.model || '—').substring(0, 28);

      return `<div class="card" data-sid="${esc(s.id)}">
  <div class="card-header">
    <span class="card-framework ${fwClass}">${fwLabel}</span>
    <span class="card-time">${esc(timeAgo(s.createdAt))}</span>
  </div>
  <div class="card-title">${esc(s.label || s.query || s.taskId)}</div>
  <div class="card-grid">
    <div class="card-grid-item"><span class="card-grid-label">Model</span><span class="card-grid-value" title="${esc(s.model || '')}">${esc(modelShort)}</span></div>
    <div class="card-grid-item"><span class="card-grid-label">Turns</span><span class="card-grid-value">${s.turnCount}</span></div>
    <div class="card-grid-item"><span class="card-grid-label">Tokens</span><span class="card-grid-value tokens">${fmt(s.totalTokens)}</span></div>
    <div class="card-grid-item"><span class="card-grid-label">Cost</span><span class="card-grid-value cost">$${s.totalCost.toFixed(3)}</span></div>
  </div>
  <div class="card-actions">
    <button class="card-btn danger" data-sid="${esc(s.id)}">Delete</button>
  </div>
</div>`;
    }).join('\n');
  }
}
