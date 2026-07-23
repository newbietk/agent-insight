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
exports.SessionTreeItem = exports.SessionTreeDataProvider = void 0;
const vscode = __importStar(require("vscode"));
const i18n_1 = require("../i18n");
class SessionTreeDataProvider {
    storage;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(storage) {
        this.storage = storage;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element)
            return [];
        const sessions = this.storage.listSessions();
        if (sessions.length === 0) {
            // Return empty to trigger viewsWelcome display
            return [];
        }
        return sessions.map(s => new SessionTreeItem(s));
    }
}
exports.SessionTreeDataProvider = SessionTreeDataProvider;
class SessionTreeItem extends vscode.TreeItem {
    session;
    constructor(session) {
        const label = session.label || session.query || session.taskId || (0, i18n_1.t)('common.unknown');
        super(label, vscode.TreeItemCollapsibleState.None);
        this.session = session;
        // ── Description line: agent badge · model · tokens · cost · time ──
        const fw = session.framework === 'opencode' ? (0, i18n_1.t)('agent.opencode') : (0, i18n_1.t)('agent.claudeCode');
        const modelShort = (session.model || (0, i18n_1.t)('common.unknown')).substring(0, 22);
        const parts = [
            fw,
            modelShort,
            `${fmtNum(session.totalTokens)} tk`,
            `$${session.totalCost.toFixed(3)}`,
            timeAgo(session.createdAt),
        ];
        this.description = parts.join('  ·  ');
        // ── Tooltip: rich Markdown ──
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.isTrusted = true;
        md.appendMarkdown(`### ${escapeMd(label)}\n\n`);
        md.appendMarkdown(`| | |\n|---|---|\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.framework')}** | ${fw} |\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.model')}** | ${session.model || (0, i18n_1.t)('common.unknown')} |\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.tokens')}** | ${fmtNum(session.totalTokens)} |\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.cost')}** | $${session.totalCost.toFixed(4)} |\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.turns')}** | ${session.turnCount} |\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.latency')}** | ${fmtMs(session.totalLatencyMs)} |\n`);
        md.appendMarkdown(`| **${(0, i18n_1.t)('common.taskId')}** | \`${session.taskId}\` |\n`);
        md.appendMarkdown(`\n${(0, i18n_1.t)('tree.tooltip.clickToOpen')}`);
        this.tooltip = md;
        // ── Icon: different per framework ──
        this.iconPath = session.framework === 'opencode'
            ? new vscode.ThemeIcon('database')
            : new vscode.ThemeIcon('json');
        this.contextValue = 'session';
        this.command = {
            command: 'hismartlite.openSession',
            title: (0, i18n_1.t)('session.openDetail'),
            arguments: [session.id],
        };
    }
}
exports.SessionTreeItem = SessionTreeItem;
// ── Formatters ─────────────────────────────────────────────
function fmtNum(n) {
    if (n >= 1_000_000)
        return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)
        return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}
function fmtMs(ms) {
    if (ms >= 60_000)
        return (ms / 60_000).toFixed(1) + 'min';
    if (ms >= 1_000)
        return (ms / 1_000).toFixed(1) + 's';
    return ms + 'ms';
}
function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)
        return 'now';
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
function escapeMd(s) {
    return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}
//# sourceMappingURL=sessionTree.js.map