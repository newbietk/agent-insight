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
exports.setRefreshCallback = setRefreshCallback;
exports.handleCodeAgentImport = handleCodeAgentImport;
exports.handleClaudeImport = handleClaudeImport;
exports.handleOpenCodeImport = handleOpenCodeImport;
/**
 * Import command handlers for Claude Code, CodeAgent 3.0, and OpenCode.
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const fs = __importStar(require("node:fs"));
const i18n_1 = require("../i18n");
const fileDiscovery_1 = require("../discovery/fileDiscovery");
const importer_1 = require("../importer");
// ── Shared parameterized JSONL import ────────────────────────
async function handleJsonlImport(storage, mode, config) {
    const { i18nPrefix, autoDir, fileExclude, pickerLabelKey, manualI18nPrefix, cancellable, importIsAsync } = config;
    let filePaths = [];
    if (mode === 'auto') {
        if (!fs.existsSync(autoDir)) {
            vscode.window.showInformationMessage((0, i18n_1.t)(`${i18nPrefix}.dirNotFound`, autoDir));
            return;
        }
        filePaths = (0, fileDiscovery_1.findJsonlFiles)(autoDir);
        if (fileExclude && fileExclude.length > 0) {
            filePaths = filePaths.filter(f => !fileExclude.includes(path.basename(f)));
        }
        if (filePaths.length === 0) {
            vscode.window.showInformationMessage((0, i18n_1.t)(`${i18nPrefix}.noFiles`, autoDir));
            return;
        }
    }
    else {
        // Manual: file or dir sub-choice
        const subI18n = manualI18nPrefix || 'import.claude';
        const subChoice = await vscode.window.showQuickPick([
            { label: (0, i18n_1.t)(`${subI18n}.fileOption`), value: 'file', description: (0, i18n_1.t)(`${subI18n}.fileDesc`) },
            { label: (0, i18n_1.t)(`${subI18n}.dirOption`), value: 'dir', description: (0, i18n_1.t)(`${subI18n}.dirDesc`) },
        ], { placeHolder: (0, i18n_1.t)(`${subI18n}.importMethod`) });
        if (!subChoice)
            return;
        if (subChoice.value === 'file') {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                filters: { [(0, i18n_1.t)(`${subI18n}.fileFilter`)]: ['jsonl'], [(0, i18n_1.t)('import.claude.allFiles')]: ['*'] },
                title: (0, i18n_1.t)(`${subI18n}.selectFile`),
            });
            if (!uris || uris.length === 0)
                return;
            filePaths = uris.map(u => u.fsPath);
        }
        else {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: (0, i18n_1.t)(`${subI18n}.selectDir`),
            });
            if (!uris || uris.length === 0)
                return;
            filePaths = (0, fileDiscovery_1.findJsonlFiles)(uris[0].fsPath);
            if (fileExclude && fileExclude.length > 0) {
                filePaths = filePaths.filter(f => !fileExclude.includes(path.basename(f)));
            }
            if (filePaths.length === 0) {
                vscode.window.showInformationMessage((0, i18n_1.t)('import.claude.noFilesSelected'));
                return;
            }
        }
    }
    // Shared picker
    const picked = await (0, fileDiscovery_1.pickJsonlFiles)(filePaths, (0, i18n_1.t)(pickerLabelKey));
    if (picked === undefined)
        return;
    if (!picked || picked.length === 0)
        return;
    // Shared import loop
    let imported = 0;
    let skipped = 0;
    const errors = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: (0, i18n_1.t)(`${i18nPrefix}.progress`),
        cancellable,
    }, async (progress, token) => {
        for (let i = 0; i < picked.length; i++) {
            if (cancellable && token.isCancellationRequested)
                break;
            const filePath = picked[i];
            const fileName = path.basename(filePath);
            if (cancellable) {
                progress.report({ message: fileName, increment: 100 / picked.length });
            }
            try {
                // Large file gate: warn user before importing files >50MB
                const stat = await fs.promises.stat(filePath);
                const sizeMB = stat.size / 1024 / 1024;
                if (sizeMB > 50) {
                    const choice = await vscode.window.showWarningMessage(`文件 "${fileName}" 大小为 ${sizeMB.toFixed(1)} MB（超过 50MB），导入可能导致内存占用过高、VS Code 卡顿甚至崩溃。是否继续导入？`, { modal: true }, '继续导入', '跳过');
                    if (choice !== '继续导入') {
                        skipped++;
                        continue;
                    }
                }
                const result = importIsAsync
                    ? await (0, importer_1.importJsonlFile)(storage, filePath)
                    : (0, importer_1.importJsonlFile)(storage, filePath);
                if (result)
                    imported++;
                else
                    skipped++;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${fileName}: ${message}`);
                skipped++;
            }
        }
    });
    reportImportResult(imported, skipped, errors, i18nPrefix);
}
// ── Shared result reporting ──────────────────────────────────
function reportImportResult(imported, skipped, errors, agentI18nPrefix) {
    // Tree provider refresh is handled by the caller via the extension-level reference.
    // We trigger via a global callback set in extension.ts.
    if (_onRefresh)
        _onRefresh();
    if (imported > 0) {
        vscode.window.showInformationMessage((0, i18n_1.t)(`${agentI18nPrefix}.imported`, imported, skipped > 0 ? (0, i18n_1.t)('import.claude.skipped', skipped) : ''));
    }
    else if (skipped > 0 || errors.length > 0) {
        const specificEmptyKey = `${agentI18nPrefix}.allEmpty`;
        const emptyMsg = (0, i18n_1.t)(specificEmptyKey);
        const fallback = emptyMsg !== specificEmptyKey ? emptyMsg : (0, i18n_1.t)('import.claude.allEmpty');
        vscode.window.showWarningMessage((0, i18n_1.t)('import.claude.noneImported', errors.length > 0 ? errors[0] : fallback));
    }
}
// ── Tree refresh callback (set by extension.ts) ──────────────
let _onRefresh = null;
function setRefreshCallback(cb) { _onRefresh = cb; }
// ── Agent-specific handlers (thin wrappers) ──────────────────
async function handleCodeAgentImport(storage, mode) {
    await handleJsonlImport(storage, mode, {
        i18nPrefix: 'import.codeagent',
        autoDir: path.join(os.homedir(), '.cac', 'projects'),
        fileExclude: ['obs.jsonl', 'observable-cac.jsonl'],
        pickerLabelKey: 'agent.codeAgent',
        manualI18nPrefix: 'import.codeagent',
        cancellable: false,
        importIsAsync: true,
    });
}
async function handleClaudeImport(storage, mode) {
    await handleJsonlImport(storage, mode, {
        i18nPrefix: 'import.claude',
        autoDir: (0, fileDiscovery_1.getClaudeProjectsDir)(),
        pickerLabelKey: 'import.claude.codeLabel',
        manualI18nPrefix: 'import.claude',
        cancellable: true,
        importIsAsync: false,
    });
}
async function handleOpenCodeImport(storage, mode) {
    let dbPath;
    if (mode === 'auto') {
        dbPath = (0, fileDiscovery_1.tryAutoFindOpenCodeDb)();
        if (!dbPath) {
            vscode.window.showInformationMessage((0, i18n_1.t)('import.opencode.dbNotFound'));
            return;
        }
    }
    else {
        dbPath = await (0, fileDiscovery_1.browseForDbPath)();
        if (!dbPath)
            return;
    }
    let sessions;
    try {
        sessions = await (0, importer_1.listOpenCodeSessions)(dbPath);
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
                const result = await (0, importer_1.importOpenCodeSession)(storage, dbPath, session.id);
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
    reportImportResult(imported, skipped, errors, 'import.opencode');
}
//# sourceMappingURL=import.js.map