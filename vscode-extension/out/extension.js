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
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const fs = __importStar(require("node:fs"));
const i18n_1 = require("./i18n");
const scheduler_1 = require("./sync/scheduler");
// ── Lazy references (initialized on first use, not at module load) ──
let _storage = null;
let _treeProvider = null;
let _panelManager = null;
let _scheduler = null;
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
    // ── Session list: TreeView (reliable, always works) ──
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
        // Auto-sync scheduler
        _scheduler = new scheduler_1.SyncScheduler(_storage, () => {
            if (_treeProvider)
                _treeProvider.refresh();
        });
        _scheduler.start();
    }
    // ── Register commands ──
    context.subscriptions.push(vscode.commands.registerCommand('hismartlite.import', () => handleImport()), vscode.commands.registerCommand('hismartlite.refreshSessions', () => {
        if (_treeProvider)
            _treeProvider.refresh();
    }), vscode.commands.registerCommand('hismartlite.openSession', (sessionId) => {
        const pm = _panelManager;
        if (pm)
            pm.show(context, sessionId);
    }), vscode.commands.registerCommand('hismartlite.deleteSession', (item) => handleDelete(item)), vscode.commands.registerCommand('hismartlite.syncSession', (item) => handleSyncSession(item)), vscode.commands.registerCommand('hismartlite.syncAll', () => handleSyncAll()));
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
    if (_scheduler)
        _scheduler.dispose();
    if (_panelManager)
        _panelManager.disposeAll();
    if (_storage)
        _storage.close();
}
// ── Command Handlers ────────────────────────────────────────
function ensureReady() {
    if (_activationError) {
        vscode.window.showErrorMessage((0, i18n_1.t)('activation.errorPrefix', _activationError));
        return false;
    }
    return true;
}
async function handleImport() {
    if (!ensureReady())
        return;
    const storage = getStorage();
    // ── Step 1: pick agent ──
    const agentChoice = await vscode.window.showQuickPick([
        { label: `$(json) ${(0, i18n_1.t)('agent.claudeCode')}`, value: 'claude', description: (0, i18n_1.t)('agent.claudeDesc') },
        { label: `$(rocket) ${(0, i18n_1.t)('agent.codeAgent')}`, value: 'codeagent', description: (0, i18n_1.t)('agent.codeAgentDesc') },
        { label: `$(database) ${(0, i18n_1.t)('agent.opencode')}`, value: 'opencode', description: (0, i18n_1.t)('agent.opencodeDesc') },
    ], { placeHolder: (0, i18n_1.t)('import.selectAgent') });
    if (!agentChoice)
        return;
    if (agentChoice.value === 'opencode') {
        await handleOpenCodeImport(storage);
    }
    else if (agentChoice.value === 'codeagent') {
        await handleCodeAgentImport(storage);
    }
    else {
        await handleClaudeImport(storage);
    }
}
// ── CodeAgent 3.0 import ───────────────────────────────────
async function handleCodeAgentImport(storage) {
    const cacDir = path.join(os.homedir(), '.cac', 'projects');
    if (!fs.existsSync(cacDir)) {
        vscode.window.showInformationMessage((0, i18n_1.t)('import.codeagent.dirNotFound', cacDir));
        return;
    }
    const filePaths = findJsonlFiles(cacDir);
    if (filePaths.length === 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('import.codeagent.noFiles', cacDir));
        return;
    }
    const picked = await pickJsonlFiles(filePaths, (0, i18n_1.t)('agent.codeAgent'));
    if (picked === undefined)
        return; // User canceled the picker
    if (!picked || picked.length === 0)
        return;
    const { importJsonlFile } = require('./importer');
    const treeProvider = getTreeProvider();
    let imported = 0;
    let skipped = 0;
    const errors = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)('import.codeagent.progress'),
        cancellable: false,
    }, async () => {
        for (const p of picked) {
            try {
                const result = await importJsonlFile(p, storage);
                if (result === 'ok')
                    imported++;
                else if (result === 'skip')
                    skipped++;
                else
                    errors.push(path.basename(p) + ': ' + result);
            }
            catch (e) {
                errors.push(path.basename(p) + ': ' + e.message);
            }
        }
    });
    treeProvider.refresh();
    if (imported > 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('import.codeagent.imported', imported, skipped > 0 ? (0, i18n_1.t)('import.claude.skipped', skipped) : ''));
    }
    else {
        vscode.window.showWarningMessage((0, i18n_1.t)('import.claude.noneImported', errors.length > 0 ? errors[0] : (0, i18n_1.t)('import.claude.allEmpty')));
    }
}
// ── Claude Code import ─────────────────────────────────────
async function handleClaudeImport(storage) {
    const choices = [
        { label: (0, i18n_1.t)('import.fileOption'), value: 'file', description: (0, i18n_1.t)('import.fileDesc') },
        { label: (0, i18n_1.t)('import.dirOption'), value: 'dir', description: (0, i18n_1.t)('import.dirDesc') },
        { label: (0, i18n_1.t)('import.autoOption'), value: 'auto', description: (0, i18n_1.t)('import.autoDesc') },
    ];
    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: (0, i18n_1.t)('import.claudeImportMethod'),
    });
    if (!choice)
        return;
    let filePaths = [];
    if (choice.value === 'auto') {
        const claudeDir = getClaudeProjectsDir();
        const claudeFiles = fs.existsSync(claudeDir) ? findJsonlFiles(claudeDir) : [];
        if (claudeFiles.length > 0) {
            const picked = await pickJsonlFiles(claudeFiles, (0, i18n_1.t)('import.claude.codeLabel'));
            if (picked === undefined)
                return; // User canceled the picker
            if (picked)
                filePaths.push(...picked);
        }
        if (filePaths.length === 0) {
            vscode.window.showInformationMessage((0, i18n_1.t)('import.claude.noFilesInDir', claudeDir));
            return;
        }
    }
    else if (choice.value === 'file') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: { [(0, i18n_1.t)('import.claude.fileFilter')]: ['jsonl'], [(0, i18n_1.t)('import.claude.allFiles')]: ['*'] },
            title: (0, i18n_1.t)('import.claude.selectFile'),
        });
        if (!uris || uris.length === 0)
            return;
        filePaths = uris.map(u => u.fsPath);
    }
    else if (choice.value === 'dir') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: (0, i18n_1.t)('import.claude.selectDir'),
        });
        if (!uris || uris.length === 0)
            return;
        filePaths = findJsonlFiles(uris[0].fsPath);
        if (filePaths.length === 0) {
            vscode.window.showInformationMessage((0, i18n_1.t)('import.claude.noFilesSelected'));
            return;
        }
        const picked = await pickJsonlFiles(filePaths, 'Directory');
        if (!picked || picked.length === 0)
            return;
        filePaths = picked;
    }
    const { importJsonlFile } = require('./importer');
    const treeProvider = getTreeProvider();
    let imported = 0;
    let skipped = 0;
    const errors = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)('import.claude.progress'),
        cancellable: true,
    }, async (progress, token) => {
        for (let i = 0; i < filePaths.length; i++) {
            if (token.isCancellationRequested)
                break;
            const filePath = filePaths[i];
            const fileName = path.basename(filePath);
            progress.report({ message: fileName, increment: 100 / filePaths.length });
            try {
                const result = importJsonlFile(storage, filePath);
                if (result) {
                    imported++;
                }
                else {
                    skipped++;
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${fileName}: ${message}`);
                skipped++;
            }
        }
    });
    treeProvider.refresh();
    if (imported > 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('import.claude.imported', imported, skipped > 0 ? (0, i18n_1.t)('import.claude.skipped', skipped) : ''));
    }
    else if (skipped > 0 && imported === 0) {
        vscode.window.showWarningMessage((0, i18n_1.t)('import.claude.noneImported', errors.length > 0 ? errors[0] : (0, i18n_1.t)('import.claude.allEmpty')));
    }
}
// ── OpenCode import ────────────────────────────────────────
async function handleOpenCodeImport(storage) {
    const dbPath = await findOpenCodeDb();
    if (!dbPath)
        return;
    const { listOpenCodeSessions, importOpenCodeSession } = require('./importer');
    let sessions;
    try {
        sessions = await listOpenCodeSessions(dbPath);
    }
    catch (err) {
        vscode.window.showErrorMessage((0, i18n_1.t)('import.opencode.readFailed', err instanceof Error ? err.message : String(err)));
        return;
    }
    if (sessions.length === 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('import.opencode.noSessions'));
        return;
    }
    const items = sessions.map(s => ({
        label: s.label?.substring(0, 60) || s.id.substring(0, 8),
        description: s.model ? `${s.model}` : (0, i18n_1.t)('import.opencode.unknownModel'),
        detail: (0, i18n_1.t)('import.opencode.sessionId', s.id.substring(0, 12)),
        id: s.id,
    }));
    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: (0, i18n_1.t)('import.opencode.selectSessions', sessions.length),
    });
    if (!selected || selected.length === 0)
        return;
    const treeProvider = getTreeProvider();
    let imported = 0;
    let skipped = 0;
    const errors = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)('import.opencode.progress'),
        cancellable: true,
    }, async (progress, token) => {
        for (let i = 0; i < selected.length; i++) {
            if (token.isCancellationRequested)
                break;
            const session = selected[i];
            progress.report({
                message: session.label?.substring(0, 40) || session.id.substring(0, 8),
                increment: 100 / selected.length,
            });
            try {
                const result = await importOpenCodeSession(storage, dbPath, session.id);
                if (result) {
                    imported++;
                }
                else {
                    skipped++;
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${session.id}: ${message}`);
                skipped++;
            }
        }
    });
    treeProvider.refresh();
    if (imported > 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('import.opencode.imported', imported, skipped > 0 ? (0, i18n_1.t)('import.claude.skipped', skipped) : ''));
    }
    else if (skipped > 0 && imported === 0) {
        vscode.window.showWarningMessage((0, i18n_1.t)('import.claude.noneImported', errors.length > 0 ? errors[0] : (0, i18n_1.t)('import.opencode.allEmpty')));
    }
}
async function findOpenCodeDb() {
    const autoPaths = getOpenCodeDbPaths();
    for (const p of autoPaths) {
        if (fs.existsSync(p))
            return p;
    }
    const action = await vscode.window.showQuickPick([
        { label: (0, i18n_1.t)('import.opencode.browseDb'), value: 'browse' },
        { label: `$(close) ${(0, i18n_1.t)('common.cancel')}`, value: 'cancel' },
    ], { placeHolder: (0, i18n_1.t)('import.opencode.dbNotFound') });
    if (!action || action.value === 'cancel')
        return null;
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { [(0, i18n_1.t)('import.opencode.sqliteFilter')]: ['db'], [(0, i18n_1.t)('import.claude.allFiles')]: ['*'] },
        title: (0, i18n_1.t)('import.opencode.selectDb'),
    });
    if (!uris || uris.length === 0)
        return null;
    return uris[0].fsPath;
}
function getOpenCodeDbPaths() {
    const home = os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    if (process.platform === 'win32') {
        return [
            path.join(localAppData, 'opencode', 'opencode.db'),
            path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
        ];
    }
    if (process.platform === 'darwin') {
        return [path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db')];
    }
    return [path.join(home, '.local', 'share', 'opencode', 'opencode.db')];
}
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
// ── Sync ───────────────────────────────────────────────────
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
        // Pick from sessions that have a sourcePath
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
    const tp = _treeProvider;
    if (tp)
        tp.refresh();
    const pm = _panelManager;
    if (pm)
        pm.disposeAll();
}
async function handleSyncAll() {
    if (!ensureReady())
        return;
    const storage = getStorage();
    const { syncSession } = require('./importer');
    const sessions = storage.listSessions().filter(s => s.sourcePath);
    if (sessions.length === 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('sync.noSourceSessions'));
        return;
    }
    let synced = 0;
    let newTurns = 0;
    const errors = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)('sync.syncingAll', sessions.length),
        cancellable: true,
    }, async (progress, token) => {
        for (let i = 0; i < sessions.length; i++) {
            if (token.isCancellationRequested)
                break;
            const s = sessions[i];
            progress.report({ message: s.taskId, increment: 100 / sessions.length });
            try {
                const result = await syncSession(storage, s.id);
                synced++;
                newTurns += result.newTurnCount;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${s.taskId}: ${message}`);
            }
        }
    });
    const tp = _treeProvider;
    if (tp)
        tp.refresh();
    if (newTurns > 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('sync.allDone', newTurns, synced, sessions.length));
    }
    else if (synced > 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)('sync.allUpToDate'));
    }
    if (errors.length > 0) {
        const detail = errors.length <= 3 ? errors.join('\n') : `${errors.slice(0, 3).join('\n')}\n... +${errors.length - 3} more`;
        vscode.window.showWarningMessage((0, i18n_1.t)('sync.partialErrors', errors.length, detail));
    }
}
// ── File Discovery Helpers ──────────────────────────────────
function getClaudeProjectsDir() {
    const configPath = vscode.workspace.getConfiguration('hismartlite').get('claudeProjectsPath');
    if (configPath) {
        return configPath.replace(/^~/, os.homedir());
    }
    return path.join(os.homedir(), '.claude', 'projects');
}
function findJsonlFiles(dirPath) {
    const results = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'subagents')
                    continue;
                results.push(...findJsonlFiles(full));
            }
            else if (entry.name.endsWith('.jsonl')) {
                results.push(full);
            }
        }
    }
    catch (e) {
        console.error(`[cannbot] findJsonlFiles error in ${dirPath}: ${e.code || e.message}`);
    }
    return results;
}
async function pickJsonlFiles(filePaths, sourceLabel) {
    // Extract first user query from each file for display
    const items = filePaths.map(f => {
        const query = extractFirstUserQuery(f);
        return {
            label: query || path.basename(f),
            description: `${sourceLabel} · ${path.basename(f)}`,
            detail: path.dirname(f),
            filePath: f,
            picked: true,
        };
    });
    if (filePaths.length === 0)
        return [];
    const MAX_DIRECT_PICK = 20;
    if (filePaths.length <= MAX_DIRECT_PICK) {
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: (0, i18n_1.t)('import.picker.selectFiles', filePaths.length),
        });
        if (!selected)
            return undefined;
        return selected.map(s => s.filePath);
    }
    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: (0, i18n_1.t)('import.picker.selectFilesEsc', filePaths.length),
    });
    if (!selected)
        return undefined;
    return selected.map(s => s.filePath);
}
// ── JSONL first-query extraction ──────────────────────────
function extractFirstUserQuery(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.trim())
            return null;
        const lines = content.split('\n');
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const obj = JSON.parse(line);
                if (obj.type === 'user' && obj.message) {
                    const msg = obj.message;
                    if (typeof msg.content === 'string') {
                        return msg.content.substring(0, 120);
                    }
                    if (Array.isArray(msg.content)) {
                        for (const block of msg.content) {
                            if (block.type === 'text' && block.text) {
                                return block.text.substring(0, 120);
                            }
                        }
                    }
                }
            }
            catch { /* skip malformed line */ }
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=extension.js.map