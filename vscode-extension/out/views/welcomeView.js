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
exports.WelcomeViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("node:os"));
class WelcomeViewProvider {
    _extensionUri;
    static viewType = 'hismartlite.welcome';
    _view;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(msg => {
            switch (msg.command) {
                case 'import':
                    vscode.commands.executeCommand('hismartlite.import');
                    break;
                case 'openDocs':
                    vscode.commands.executeCommand('hismartlite.openDocs');
                    break;
                case 'runTerminal': {
                    const cwd = String(msg.cwd || '').replace(/^~/, os.homedir()) || undefined;
                    const terminalOpts = { name: 'Context Insight' };
                    if (cwd) {
                        terminalOpts.cwd = cwd;
                    }
                    const terminal = vscode.window.createTerminal(terminalOpts);
                    terminal.show();
                    if (msg.cmd && !String(msg.cmd).startsWith('cd ')) {
                        terminal.sendText(String(msg.cmd));
                    }
                    break;
                }
            }
        });
    }
    _getHtml(webview) {
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;">
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 24px 20px;
      line-height: 1.6;
    }

    /* ── Brand Header ── */
    .brand {
      text-align: center;
      margin-bottom: 28px;
    }
    .brand-logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: #fff;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.35);
    }
    .brand-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--vscode-foreground);
      letter-spacing: -0.3px;
    }
    .brand-subtitle {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    /* ── Card ── */
    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 16px;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .card-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .card-icon.import { background: rgba(102, 126, 234, 0.15); color: #667eea; }
    .card-icon.info { background: rgba(80, 200, 120, 0.15); color: #50c878; }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .card-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .card-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* ── Buttons ── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      font-family: inherit;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn-primary {
      background: #667eea;
      color: #fff;
    }
    .btn-primary:hover { background: #5a6fd6; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-panel-border);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

    /* ── Divider ── */
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 20px 0;
    }

    /* ── Code block ── */
    .code-block {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 6px;
      padding: 12px 14px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.7;
      overflow-x: auto;
      white-space: pre;
      color: var(--vscode-foreground);
      margin-top: 10px;
    }
    .code-block .comment { color: var(--vscode-editorLineNumber-foreground); }
    .code-block .cmd-line {
      cursor: pointer;
      display: block;
      padding: 3px 8px 3px 8px;
      margin: 1px -6px;
      border-radius: 0 4px 4px 0;
      border-left: 2px solid #667eea;
      background: rgba(102, 126, 234, 0.08);
      transition: background 0.15s, border-color 0.15s;
    }
    .code-block .cmd-line::before {
      content: '▶';
      font-size: 9px;
      color: #667eea;
      margin-right: 7px;
      vertical-align: middle;
    }
    .code-block .cmd-line:hover {
      background: rgba(102, 126, 234, 0.18);
      border-left-color: #8b9cf7;
    }
    .code-block .cmd-line:active {
      background: rgba(102, 126, 234, 0.28);
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      margin-top: 20px;
    }
    .footer-link {
      color: var(--vscode-textLink-foreground);
      font-size: 12px;
      cursor: pointer;
      text-decoration: none;
    }
    .footer-link:hover { text-decoration: underline; }
  </style>
</head>
<body>

  <!-- Brand -->
  <div class="brand">
    <div class="brand-logo">📊</div>
    <div class="brand-title">Context Insight</div>
    <div class="brand-subtitle">LLM Agent 会话可观测工具</div>
  </div>

  <!-- Import Card -->
  <div class="card">
    <div class="card-header">
      <div class="card-icon import">📥</div>
      <div class="card-title">导入会话</div>
    </div>
    <div class="card-desc">
      从 Claude Code、CodeAgent、OpenCode 导入对话记录，在编辑器内直接分析 Token 用量、上下文增长、费用、工具调用和子代理。
    </div>
    <div class="card-actions">
      <button class="btn btn-primary" id="btn-import">📥 导入会话</button>
      <button class="btn btn-secondary" id="btn-docs">📖 功能介绍</button>
    </div>
  </div>

  <hr class="divider" />

  <!-- Info Card -->
  <div class="card">
    <div class="card-header">
      <div class="card-icon info">💡</div>
      <div class="card-title">极速空间已支持双形态</div>
    </div>
    <div class="card-desc">
      当前极速空间已支持 <strong>VSCode 插件</strong> 和 <strong>Web 端</strong> 两种使用方式。启动 Web 端：
    </div>
    <div class="code-block">
<span class="comment"># 进入项目目录</span>
<span class="cmd-line" data-cmd="" data-cwd="~/agent-insight">cd ~/agent-insight</span>

<span class="comment"># 启动（默认端口 30025）</span>
<span class="cmd-line" data-cmd="./start.sh" data-cwd="~/agent-insight">./start.sh</span>

<span class="comment"># 或指定端口启动</span>
<span class="cmd-line" data-cmd="PORT=8080 ./start.sh" data-cwd="~/agent-insight">PORT=8080 ./start.sh</span>
    </div>
  </div>

  <div class="footer">
    <a class="footer-link" id="link-docs">📖 查看完整功能介绍</a>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function post(command) { vscode.postMessage({ command }); }
    document.getElementById('btn-import').addEventListener('click', function() { post('import'); });
    document.getElementById('btn-docs').addEventListener('click', function() { post('openDocs'); });
    document.getElementById('link-docs').addEventListener('click', function() { post('openDocs'); });
    document.querySelectorAll('.cmd-line').forEach(function(el) {
      el.addEventListener('click', function() {
        vscode.postMessage({ command: 'runTerminal', cmd: this.dataset.cmd, cwd: this.dataset.cwd });
      });
    });
  </script>
</body>
</html>`;
    }
}
exports.WelcomeViewProvider = WelcomeViewProvider;
function getNonce() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
//# sourceMappingURL=welcomeView.js.map