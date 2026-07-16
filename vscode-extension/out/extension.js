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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const i18n_1 = require("./i18n");
const import_1 = require("./commands/import");
// ── Lazy references (initialized on first use, not at module load) ──
let _storage = null;
let _treeProvider = null;
let _panelManager = null;
let _activationError = null;
function getStorage() {
    if (!_storage)
        throw new Error('Storage not initialized');
    return _storage;
}
function getTreeProvider() {
    if (!_treeProvider)
        throw new Error('Tree provider not initialized');
    return _treeProvider;
}
function getPanelManager() {
    if (!_panelManager)
        throw new Error('Panel manager not initialized');
    return _panelManager;
}
async function activate(context) {
    // ── Initialize Storage ──
    try {
        const { Storage } = require('./storage/db');
        _storage = await Storage.forExtension(context);
    }
    catch (err) {
        _activationError = err instanceof Error ? err.message : String(err);
        console.error('[KirinAI] Activation error:', _activationError);
        vscode.window.showErrorMessage((0, i18n_1.t)('activation.failed', _activationError));
    }
    // ── Session list: TreeView ──
    if (_storage) {
        const { SessionTreeDataProvider } = require('./views/sessionTree');
        const treeProvider = new SessionTreeDataProvider(_storage);
        _treeProvider = treeProvider;
        context.subscriptions.push(vscode.window.createTreeView('hismartlite.sessions', {
            treeDataProvider: treeProvider,
            showCollapseAll: false,
        }));
        // Panel manager for detail view
        try {
            const { SessionPanelManager } = require('./views/sessionPanel');
            _panelManager = new SessionPanelManager(_storage);
        }
        catch (err) {
            console.error('[KirinAI] Panel manager init error:', err);
        }
        // Wire refresh callback for import commands
        (0, import_1.setRefreshCallback)(() => { if (_treeProvider)
            _treeProvider.refresh(); });
    }
    // ── Register commands ──
    context.subscriptions.push(vscode.commands.registerCommand('hismartlite.import', () => handleImport()), vscode.commands.registerCommand('hismartlite.refreshSessions', () => {
        if (_treeProvider)
            _treeProvider.refresh();
    }), vscode.commands.registerCommand('hismartlite.openSession', (sessionId) => {
        const pm = _panelManager;
        if (pm)
            pm.show(context, sessionId);
    }), vscode.commands.registerCommand('hismartlite.deleteSession', (item) => handleDelete(item)), vscode.commands.registerCommand('hismartlite.syncSession', (item) => handleSyncSession(item)));
    // ── Status bar ──
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'hismartlite.import';
    statusBarItem.text = '$(graph) KirinAI';
    statusBarItem.tooltip = (0, i18n_1.t)('statusbar.tooltip');
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    if (!_activationError) {
        vscode.window.showInformationMessage((0, i18n_1.t)('activation.ready'));
    }
}
function deactivate() {
    if (_panelManager)
        _panelManager.disposeAll();
    if (_storage)
        _storage.close();
}
// ── Shared helpers ───────────────────────────────────────────
function ensureReady() {
    if (_activationError) {
        vscode.window.showErrorMessage((0, i18n_1.t)('activation.errorPrefix', _activationError));
        return false;
    }
    return true;
}
// ── Main import orchestrator ─────────────────────────────────
async function handleImport() {
    if (!ensureReady())
        return;
    const storage = getStorage();
    // Step 1: pick mode
    const modeChoice = await vscode.window.showQuickPick([
        { label: (0, i18n_1.t)('import.mode.autoLabel'), value: 'auto', description: (0, i18n_1.t)('import.mode.autoDesc') },
        { label: (0, i18n_1.t)('import.mode.manualLabel'), value: 'manual', description: (0, i18n_1.t)('import.mode.manualDesc') },
    ], { placeHolder: (0, i18n_1.t)('import.mode.selectMode') });
    if (!modeChoice)
        return;
    const mode = modeChoice.value;
    // Step 2: pick agent
    const agentChoice = await vscode.window.showQuickPick([
        { label: `$(json) ${(0, i18n_1.t)('agent.claudeCode')}`, value: 'claude', description: (0, i18n_1.t)('agent.claudeDesc') },
        { label: `$(rocket) ${(0, i18n_1.t)('agent.codeAgent')}`, value: 'codeagent', description: (0, i18n_1.t)('agent.codeAgentDesc') },
        { label: `$(database) ${(0, i18n_1.t)('agent.opencode')}`, value: 'opencode', description: (0, i18n_1.t)('agent.opencodeDesc') },
    ], { placeHolder: (0, i18n_1.t)('import.selectAgent') });
    if (!agentChoice)
        return;
    if (agentChoice.value === 'opencode') {
        await (0, import_1.handleOpenCodeImport)(storage, mode);
    }
    else if (agentChoice.value === 'codeagent') {
        await (0, import_1.handleCodeAgentImport)(storage, mode);
    }
    else {
        await (0, import_1.handleClaudeImport)(storage, mode);
    }
}
// ── Delete ───────────────────────────────────────────────────
async function handleDelete(item) {
    if (!ensureReady())
        return;
    if (!item?.session)
        return;
    const session = item.session;
    const confirm = await vscode.window.showWarningMessage((0, i18n_1.t)('delete.confirm', session.taskId), { modal: true }, (0, i18n_1.t)('common.delete'));
    if (confirm !== (0, i18n_1.t)('common.delete'))
        return;
    getStorage().deleteSession(session.id);
    const pm = _panelManager;
    if (pm)
        pm.disposeAll();
    const tp = _treeProvider;
    if (tp)
        tp.refresh();
    vscode.window.showInformationMessage((0, i18n_1.t)('delete.deleted', session.taskId));
}
// ── Sync ─────────────────────────────────────────────────────
async function handleSyncSession(item) {
    if (!ensureReady())
        return;
    const storage = getStorage();
    const { syncSession } = require('./importer');
    let sessionId;
    if (item?.session?.id) {
        sessionId = item.session.id;
    }
    else {
        const sessions = storage.listSessions().filter(s => s.sourcePath);
        if (sessions.length === 0) {
            vscode.window.showInformationMessage((0, i18n_1.t)('sync.noSourceSessions'));
            return;
        }
        const pick = await vscode.window.showQuickPick(sessions.map(s => ({
            label: s.label || s.query || s.taskId || 'Unknown',
            description: s.framework,
            detail: `${s.turnCount} turns · ${s.totalTokens} tokens`,
            sessionId: s.id,
        })), { placeHolder: (0, i18n_1.t)('sync.selectSession') });
        if (!pick)
            return;
        sessionId = pick.sessionId;
    }
    // Large file gate: warn before syncing oversized source files
    const session = storage.getSession(sessionId);
    if (session?.sourcePath) {
        const fs = require('node:fs');
        let stat = null;
        try {
            stat = fs.statSync(session.sourcePath);
        }
        catch { /* file gone, proceed */ }
        if (stat) {
            const sizeMB = stat.size / (1024 * 1024);
            if (sizeMB > 50) {
                const choice = await vscode.window.showWarningMessage(`源文件大小为 ${sizeMB.toFixed(1)} MB（超过 50MB），同步可能导致内存占用过高、VS Code 卡顿甚至崩溃。是否继续？`, { modal: true }, '继续同步', '取消');
                if (choice !== '继续同步')
                    return;
            }
        }
    }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: (0, i18n_1.t)('sync.syncing'), cancellable: false }, async () => {
        try {
            const result = await syncSession(storage, sessionId);
            if (result.newTurnCount > 0) {
                vscode.window.showInformationMessage((0, i18n_1.t)('sync.done', result.newTurnCount, result.totalTurnCount));
            }
            else {
                vscode.window.showInformationMessage((0, i18n_1.t)('sync.upToDate'));
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage((0, i18n_1.t)('sync.failed', message));
        }
    });
    if (_treeProvider)
        _treeProvider.refresh();
    if (_panelManager)
        _panelManager.disposeAll();
}
//# sourceMappingURL=extension.js.map