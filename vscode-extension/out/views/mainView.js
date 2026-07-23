"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("node:os"));
class MainViewProvider {
    _extensionUri;
    static viewType = 'hismartlite.main';
    _view;
    _mode = 'welcome';
    _sessions = [];
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    /** Push current state into the webview. Safe to call before view is resolved. */
    setState(mode, sessions) {
        this._mode = mode;
        this._sessions = sessions;
        if (this._view) {
            this._view.webview.postMessage({
                command: 'setState',
                mode,
                sessions,
            });
        }
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtml();
        // Apply pending state
        webviewView.webview.postMessage({
            command: 'setState',
            mode: this._mode,
            sessions: this._sessions,
        });
        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(msg => {
            switch (msg.command) {
                case 'import':
                    vscode.commands.executeCommand('hismartlite.import');
                    break;
                case 'openDocs':
                    vscode.commands.executeCommand('hismartlite.openDocs');
                    break;
                case 'openSession':
                    vscode.commands.executeCommand('hismartlite.openSession', msg.id);
                    break;
                case 'deleteSession':
                    vscode.commands.executeCommand('hismartlite.deleteSession', {
                        session: { id: msg.id, taskId: msg.taskId },
                    });
                    break;
                case 'showWelcome':
                    vscode.commands.executeCommand('hismartlite.showWelcome');
                    break;
                case 'hideWelcome':
                    vscode.commands.executeCommand('hismartlite.hideWelcome');
                    break;
                case 'runTerminal': {
                    const cwd = String(msg.cwd || '').replace(/^~/, os.homedir()) || undefined;
                    const opts = { name: 'Context Insight' };
                    if (cwd) {
                        opts.cwd = cwd;
                    }
                    const term = vscode.window.createTerminal(opts);
                    term.show();
                    if (msg.cmd && !String(msg.cmd).startsWith('cd ')) {
                        term.sendText(String(msg.cmd));
                    }
                    break;
                }
                case 'runPreinstall': {
                    const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'scripts', 'pre-install.sh').fsPath;
                    const output = vscode.window.createOutputChannel('Context Insight Pre-install');
                    output.show(true); // reveal but don't steal focus
                    const cp = require('child_process');
                    output.appendLine('=========================================');
                    output.appendLine(' Context Insight Pre-install');
                    output.appendLine('=========================================');
                    output.appendLine('');
                    const child = cp.spawn('bash', [scriptPath], { cwd: os.homedir() });
                    child.stdout.on('data', (data) => output.append(data.toString()));
                    child.stderr.on('data', (data) => output.append(data.toString()));
                    child.on('error', (err) => {
                        output.appendLine(`\n✗ 无法执行脚本: ${err.message}`);
                        output.appendLine('环境可能不具备 bash 执行能力，请检查是否在 Linux/macOS 环境中。');
                    });
                    child.on('close', (code) => {
                        if (code === 0) {
                            output.appendLine('\n✓ Pre-install 执行完成');
                        }
                        else {
                            output.appendLine(`\n✗ Pre-install 执行失败 (exit code: ${code})`);
                            output.appendLine('请检查上方输出排查问题，或联系管理员补充 Web 包拉取逻辑。');
                        }
                    });
                    break;
                }
            }
        });
    }
    // ═══════════════════════════════════════════════════════════
    //  HTML / CSS / JS
    // ═══════════════════════════════════════════════════════════
    _getHtml() {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Welcome content (scrollable area) ── */
    .welcome-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 24px 20px;
      display: none;
    }
    .welcome-scroll.active { display: block; }

    /* ── Sessions content (scrollable area) ── */
    .sessions-scroll {
      flex: 1;
      overflow-y: auto;
      display: none;
    }
    .sessions-scroll.active { display: block; }

    /* ── Sticky banner ── */
    .sticky-banner {
      display: none;
      flex-shrink: 0;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      cursor: pointer;
      transition: background 0.2s, box-shadow 0.2s;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.14) 0%, rgba(118, 75, 162, 0.10) 100%);
      border-top: 1px solid rgba(102, 126, 234, 0.2);
    }
    .sticky-banner.active { display: flex; }
    .sticky-banner:hover {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.24) 0%, rgba(118, 75, 162, 0.17) 100%);
      box-shadow: inset 0 0 20px rgba(102, 126, 234, 0.08);
    }
    .sticky-banner .banner-icon {
      width: 30px; height: 30px; border-radius: 7px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0; color: #fff;
      box-shadow: 0 2px 5px rgba(102, 126, 234, 0.35);
    }
    .sticky-banner .banner-content { flex: 1; min-width: 0; }
    .sticky-banner .banner-title { font-size: 12.5px; font-weight: 600; color: #667eea; }
    .sticky-banner .banner-hint { font-size: 10.5px; color: var(--vscode-descriptionForeground); margin-top: 1px; }
    .sticky-banner .banner-arrow { font-size: 15px; color: #667eea; flex-shrink: 0; transition: transform 0.2s; }
    .sticky-banner:hover .banner-arrow { transform: translateX(3px); }

    /* ── Welcome styles ── */
    .brand { text-align: center; margin-bottom: 24px; }
    .brand-logo {
      width: 60px; height: 60px; margin: 0 auto 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 14px; display: flex; align-items: center; justify-content: center;
      font-size: 28px; color: #fff;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
    }
    .brand-title { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; }
    .brand-subtitle { font-size: 11.5px; color: var(--vscode-descriptionForeground); margin-top: 3px; }

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px; padding: 16px; margin-bottom: 14px;
    }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .card-icon {
      width: 30px; height: 30px; border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
    }
    .card-icon.import { background: rgba(102, 126, 234, 0.15); color: #667eea; }
    .card-icon.info { background: rgba(80, 200, 120, 0.15); color: #50c878; }
    .card-title { font-size: 13px; font-weight: 600; }
    .card-desc { font-size: 11.5px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
    .card-actions { display: flex; gap: 7px; flex-wrap: wrap; }

    .btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 12px; border-radius: 5px; font-size: 11.5px;
      font-weight: 500; cursor: pointer; border: none;
      font-family: inherit; transition: background 0.15s;
    }
    .btn-primary { background: #667eea; color: #fff; }
    .btn-primary:hover { background: #5a6fd6; }
    .btn-secondary {
      background: transparent;
      color: #667eea;
      border: 1px solid #667eea;
    }
    .btn-secondary:hover { background: rgba(102, 126, 234, 0.10); }

    .divider { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 18px 0; }

    .code-block {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 6px; padding: 10px 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11.5px; line-height: 1.7; overflow-x: auto;
      white-space: pre; color: var(--vscode-foreground); margin-top: 8px;
    }
    .code-block .comment { color: var(--vscode-editorLineNumber-foreground); }
    .code-block .cmd-line {
      cursor: pointer; display: block; padding: 3px 8px; margin: 1px -6px;
      border-radius: 0 4px 4px 0; border-left: 2px solid #667eea;
      background: rgba(102, 126, 234, 0.08);
      transition: background 0.15s, border-color 0.15s;
    }
    .code-block .cmd-line::before {
      content: '▶'; font-size: 8px; color: #667eea; margin-right: 6px; vertical-align: middle;
    }
    .code-block .cmd-line:hover { background: rgba(102, 126, 234, 0.18); border-left-color: #8b9cf7; }
    .code-block .cmd-line:active { background: rgba(102, 126, 234, 0.28); }

    .footer { text-align: center; margin-top: 16px; }
    .footer-link { color: var(--vscode-textLink-foreground); font-size: 11.5px; cursor: pointer; }
    .footer-link:hover { text-decoration: underline; }

    /* ── Overlay back bar (welcome-expanded mode) ── */
    .overlay-bar {
      display: none; align-items: center; gap: 8px;
      padding: 6px 12px; margin: -24px -20px 16px -20px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
    }
    .overlay-bar.active { display: flex; }
    .overlay-bar .back-btn {
      background: none; border: none; color: var(--vscode-textLink-foreground);
      cursor: pointer; font-size: 12px; font-family: inherit;
      padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; gap: 3px;
      transition: background 0.15s;
    }
    .overlay-bar .back-btn:hover { background: var(--vscode-list-hoverBackground); }
    .overlay-bar .overlay-title { margin-left: auto; font-weight: 600; color: var(--vscode-descriptionForeground); }

    /* ── Session list items ── */
    .session-list-header {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    /* ── Session row with framework accent ── */
    .session-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px; cursor: pointer;
      border-bottom: 1px solid var(--vscode-panel-border);
      border-left: 3px solid transparent;
      transition: background 0.12s, border-left-color 0.2s;
    }
    .session-row:hover { background: var(--vscode-list-hoverBackground); }
    .session-row.fw-claude   { border-left-color: #667eea; }
    .session-row.fw-opencode { border-left-color: #2eaadc; }
    .session-row.fw-codeagent { border-left-color: #d4a72c; }

    /* ── Session icon: colored circle with framework initial ── */
    .session-row .sess-icon {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0; color: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .session-row .sess-icon.claude    { background: #667eea; }
    .session-row .sess-icon.opencode  { background: #2eaadc; }
    .session-row .sess-icon.codeagent { background: #d4a72c; }

    .session-row .sess-info { flex: 1; min-width: 0; }
    .session-row .sess-name {
      font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .session-row .sess-meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 1px; }

    /* ── Framework badge pill ── */
    .sess-fw-badge {
      display: inline-block; font-size: 9.5px; font-weight: 600;
      padding: 1px 6px; border-radius: 3px;
    }
    .sess-fw-badge.claude    { background: rgba(102, 126, 234, 0.15); color: #667eea; }
    .sess-fw-badge.opencode  { background: rgba(46,  170, 220, 0.15); color: #2eaadc; }
    .sess-fw-badge.codeagent { background: rgba(212, 167, 44,  0.15); color: #b8931e; }

    .session-row .sess-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .session-row .sess-btn {
      background: none; border: none; color: var(--vscode-descriptionForeground);
      cursor: pointer; padding: 3px 5px; border-radius: 4px; font-size: 14px;
      transition: background 0.12s, color 0.12s;
    }
    .session-row .sess-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
    .session-row .sess-btn.danger:hover { color: #e05555; }
    .empty-sessions {
      text-align: center; padding: 32px 16px; color: var(--vscode-descriptionForeground); font-size: 12px;
    }
  </style>
</head>
<body>

  <!-- ═══ Welcome Content ═══ -->
  <div class="welcome-scroll" id="welcome-scroll">
    <div class="overlay-bar" id="overlay-bar">
      <button class="back-btn" id="btn-back">← 返回会话列表</button>
      <span class="overlay-title">Context Insight</span>
    </div>

    <div class="brand">
      <div class="brand-logo">📊</div>
      <div class="brand-title">Context Insight</div>
      <div class="brand-subtitle">LLM Agent 会话可观测工具</div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-icon import">📥</div>
        <div class="card-title">导入会话</div>
      </div>
      <div class="card-desc">
        从 Claude Code、CodeAgent、OpenCode 导入对话记录，分析 Token 用量、上下文增长、费用、工具调用和子代理。
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" id="btn-import">📥 导入会话</button>
        <button class="btn btn-secondary" id="btn-docs">📖 功能介绍</button>
      </div>
    </div>

    <hr class="divider" />

    <div class="card">
      <div class="card-header">
        <div class="card-icon info">💡</div>
        <div class="card-title">极速空间已支持双形态</div>
      </div>
      <div class="card-desc">
        当前极速空间已支持 <strong>VSCode 插件</strong> 和 <strong>Web 端</strong> 两种使用方式。启动 Web 端：
      </div>
      <div class="code-block">
<span class="comment"># 启动（自动探测可用映射端口） — 在 ~/context-insight 下运行</span>
<span class="cmd-line" data-cmd="./start.sh" data-cwd="~/context-insight">./start.sh</span>

<span class="comment"># 停止 — 在 ~/context-insight 下运行</span>
<span class="cmd-line" data-cmd="./stop.sh" data-cwd="~/context-insight">./stop.sh</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-icon info">🔧</div>
        <div class="card-title">环境提示</div>
      </div>
      <div class="card-desc">
        如果极速空间没有 <code>context-insight</code> 目录，可能存在环境不具备 Web 端使用条件，您仍然可以手动执行 <span class="footer-link" id="link-preinstall">pre-install</span> 脚本完成检测和 Web 包拉取。
      </div>
    </div>
  </div>

  <!-- ═══ Session List ═══ -->
  <div class="sessions-scroll" id="sessions-scroll">
    <div class="session-list-header">
      <span>📋</span> 会话列表
    </div>
    <div id="session-list"></div>
  </div>

  <!-- ═══ Sticky Banner ═══ -->
  <div class="sticky-banner" id="sticky-banner">
    <div class="banner-icon">💡</div>
    <div class="banner-content">
      <div class="banner-title">查看 WEB 端使用指导</div>
      <div class="banner-hint">启动命令 · 功能介绍 · 操作指引</div>
    </div>
    <span class="banner-arrow">→</span>
  </div>

  <script nonce="${nonce}">
    const v = acquireVsCodeApi();
    function post(cmd, data) { v.postMessage(Object.assign({ command: cmd }, data || {})); }

    // ── Welcome buttons ──
    document.getElementById('btn-import').addEventListener('click', function() { post('import'); });
    document.getElementById('btn-docs').addEventListener('click', function() { post('openDocs'); });
    document.getElementById('link-preinstall').addEventListener('click', function() { post('runPreinstall'); });
    document.getElementById('btn-back').addEventListener('click', function() { post('hideWelcome'); });

    // ── Terminal commands ──
    document.querySelectorAll('.cmd-line').forEach(function(el) {
      el.addEventListener('click', function() {
        post('runTerminal', { cmd: this.dataset.cmd, cwd: this.dataset.cwd });
      });
    });

    // ── Sticky banner ──
    document.getElementById('sticky-banner').addEventListener('click', function() { post('showWelcome'); });

    // ── Helpers ──
    function fmtNum(n) {
      if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n/1000).toFixed(1) + 'K';
      return String(n);
    }
    function timeAgo(iso) {
      var diff = Date.now() - new Date(iso).getTime();
      var m = Math.floor(diff/60000);
      if (m<1) return 'now';
      if (m<60) return m+'m';
      var h = Math.floor(m/60);
      if (h<24) return h+'h';
      return Math.floor(h/24)+'d';
    }

    // ── Framework metadata ──
    function fwInfo(fw) {
      if (fw === 'opencode')  return { cls: 'opencode',  label: 'OpenCode',     initial: 'O' };
      if (fw === 'codeagent') return { cls: 'codeagent', label: 'CodeAgent 3.0', initial: 'A' };
      return { cls: 'claude', label: 'Claude Code', initial: 'C' };
    }

    function renderSessions(sessions) {
      var list = document.getElementById('session-list');
      if (!sessions || sessions.length === 0) {
        list.innerHTML = '<div class="empty-sessions">暂无会话，点击上方按钮导入</div>';
        return;
      }
      var html = '';
      sessions.forEach(function(s) {
        var name = s.label || s.query || s.taskId || 'Unknown';
        var fi = fwInfo(s.framework);
        html += '<div class="session-row fw-' + fi.cls + '" data-id="' + s.id + '">' +
          '<span class="sess-icon ' + fi.cls + '">' + fi.initial + '</span>' +
          '<div class="sess-info">' +
            '<div class="sess-name">' + escHtml(name) + '</div>' +
            '<div class="sess-meta">' +
              '<span class="sess-fw-badge ' + fi.cls + '">' + fi.label + '</span>' +
              ' · ' + (s.model||'?').substring(0,20) +
              ' · ' + fmtNum(s.totalTokens) + ' tk' +
              ' · $' + s.totalCost.toFixed(3) +
              ' · ' + timeAgo(s.createdAt) +
            '</div>' +
          '</div>' +
          '<div class="sess-actions">' +
            '<button class="sess-btn" data-action="open" data-id="' + s.id + '" title="打开详情">👁</button>' +
            '<button class="sess-btn danger" data-action="delete" data-id="' + s.id + '" data-taskid="' + escAttr(s.taskId) + '" title="删除">🗑</button>' +
          '</div>' +
        '</div>';
      });
      list.innerHTML = html;

      // Wire session row clicks → open detail
      list.querySelectorAll('.session-row').forEach(function(row) {
        row.addEventListener('click', function(e) {
          if (e.target.closest('.sess-btn')) return; // action button handled separately
          post('openSession', { id: row.dataset.id });
        });
      });

      // Wire action buttons
      list.querySelectorAll('.sess-btn[data-action="open"]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          post('openSession', { id: btn.dataset.id });
        });
      });
      list.querySelectorAll('.sess-btn[data-action="delete"]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          post('deleteSession', { id: btn.dataset.id, taskId: btn.dataset.taskid });
        });
      });
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

    // ── State handler ──
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.command !== 'setState') return;

      var welcome = document.getElementById('welcome-scroll');
      var sessions = document.getElementById('sessions-scroll');
      var banner = document.getElementById('sticky-banner');
      var overlay = document.getElementById('overlay-bar');

      if (msg.mode === 'welcome') {
        welcome.classList.add('active');
        sessions.classList.remove('active');
        banner.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
      } else if (msg.mode === 'sessions') {
        welcome.classList.remove('active');
        sessions.classList.add('active');
        banner.classList.add('active');
        overlay.classList.remove('active');
        document.body.style.overflow = 'hidden';
        renderSessions(msg.sessions);
      } else if (msg.mode === 'welcome-expanded') {
        welcome.classList.add('active');
        sessions.classList.remove('active');
        banner.classList.remove('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'auto';
      }
    });
  </script>
</body>
</html>`;
    }
}
exports.MainViewProvider = MainViewProvider;
function getNonce() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
//# sourceMappingURL=mainView.js.map