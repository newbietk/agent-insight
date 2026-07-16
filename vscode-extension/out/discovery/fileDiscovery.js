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
exports.findJsonlFiles = findJsonlFiles;
exports.pickJsonlFiles = pickJsonlFiles;
exports.getClaudeProjectsDir = getClaudeProjectsDir;
exports.getOpenCodeDbPaths = getOpenCodeDbPaths;
exports.tryAutoFindOpenCodeDb = tryAutoFindOpenCodeDb;
exports.browseForDbPath = browseForDbPath;
/**
 * File discovery utilities for session import.
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const fs = __importStar(require("node:fs"));
const i18n_1 = require("../i18n");
// ── JSONL file discovery ─────────────────────────────────────
/** Check whether a directory directly contains any .jsonl files (non-recursive). */
function dirHasJsonl(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.some(e => e.isFile() && e.name.endsWith('.jsonl'));
    }
    catch {
        return false;
    }
}
function findJsonlFiles(dirPath, visited) {
    const results = [];
    try {
        // Symlink cycle guard
        const real = fs.realpathSync(dirPath);
        if (!visited)
            visited = new Set();
        if (visited.has(real))
            return results;
        visited.add(real);
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                // Only skip 'subagents' directories that are direct children of a
                // Claude Code project root (a directory containing .jsonl files).
                // In Claude Code, .claude/projects/<name>/subagents/ stores nested
                // agent sessions that re-use the same JSONL as the parent — skipping
                // them avoids double-counting. Legitimate user directories named
                // 'subagents' elsewhere are still traversed.
                if (entry.name === 'subagents' && dirHasJsonl(dirPath))
                    continue;
                results.push(...findJsonlFiles(full, visited));
            }
            else if (entry.name.endsWith('.jsonl')) {
                results.push(full);
            }
        }
    }
    catch (e) {
        console.error(`[KirinAI] findJsonlFiles error in ${dirPath}: ${e.code || e.message}`);
    }
    return results;
}
// ── JSONL file picker ────────────────────────────────────────
function extractFirstUserQuery(filePath) {
    try {
        // Read only the first ~8KB to avoid loading entire large files
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(8192);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        const content = buf.toString('utf-8', 0, bytesRead);
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
async function pickJsonlFiles(filePaths, sourceLabel) {
    const items = filePaths.map(f => {
        const query = extractFirstUserQuery(f);
        return {
            label: query || path.basename(f),
            description: `${sourceLabel} · ${path.basename(f)}`,
            detail: path.dirname(f),
            filePath: f,
            picked: false,
        };
    });
    if (filePaths.length === 0)
        return [];
    const MAX_DIRECT_PICK = 20;
    const placeHolder = filePaths.length <= MAX_DIRECT_PICK
        ? (0, i18n_1.t)('import.picker.selectFiles', filePaths.length)
        : (0, i18n_1.t)('import.picker.selectFilesEsc', filePaths.length);
    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder,
    });
    if (!selected)
        return undefined;
    return selected.map(s => s.filePath);
}
// ── Claude Code project dir ──────────────────────────────────
function getClaudeProjectsDir() {
    const configPath = vscode.workspace.getConfiguration('hismartlite').get('claudeProjectsPath');
    if (configPath) {
        return configPath.replace(/^~/, os.homedir());
    }
    return path.join(os.homedir(), '.claude', 'projects');
}
// ── OpenCode DB discovery ────────────────────────────────────
function getOpenCodeDbPaths() {
    const home = os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    if (process.platform === 'win32') {
        return [
            path.join(appData, 'opencode', 'opencode.db'),
            path.join(localAppData, 'opencode', 'opencode.db'),
            path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
        ];
    }
    if (process.platform === 'darwin') {
        return [path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db')];
    }
    return [path.join(home, '.local', 'share', 'opencode', 'opencode.db')];
}
function tryAutoFindOpenCodeDb() {
    const autoPaths = getOpenCodeDbPaths();
    for (const p of autoPaths) {
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
async function browseForDbPath() {
    // Loop until user picks a valid .db file or cancels
    while (true) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { [(0, i18n_1.t)('import.opencode.sqliteFilter')]: ['db'], [(0, i18n_1.t)('import.claude.allFiles')]: ['*'] },
            title: (0, i18n_1.t)('import.opencode.selectDb'),
        });
        if (!uris || uris.length === 0)
            return null;
        const filePath = uris[0].fsPath;
        if (filePath.endsWith('.db'))
            return filePath;
        // Invalid file type: warn and re-prompt
        const ext = path.extname(filePath) || path.basename(filePath);
        void vscode.window.showErrorMessage((0, i18n_1.t)('import.opencode.invalidFileType', ext));
    }
}
//# sourceMappingURL=fileDiscovery.js.map