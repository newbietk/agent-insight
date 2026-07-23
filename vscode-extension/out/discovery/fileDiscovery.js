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
                // Skip 'subagents' directories — in Claude Code these store nested
                // agent sessions that are now merged into the parent during import.
                if (entry.name === 'subagents')
                    continue;
                results.push(...findJsonlFiles(full, visited));
            }
            else if (entry.name.endsWith('.jsonl')) {
                results.push(full);
            }
        }
    }
    catch (e) {
        console.error(`[Context] findJsonlFiles error in ${dirPath}: ${e.code || e.message}`);
    }
    return results;
}
/** Extract title + firstQuery + firstAssistant + model from file header in one 8KB pass. */
async function extractSessionMetaAsync(filePath) {
    try {
        const fd = await fs.promises.open(filePath, 'r');
        const buf = Buffer.alloc(8192);
        const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
        await fd.close();
        const content = buf.toString('utf-8', 0, bytesRead);
        if (!content.trim())
            return { title: null, firstQuery: null, firstAssistant: null, model: null };
        let title = null;
        let firstQuery = null;
        let firstAssistant = null;
        let model = null;
        const lines = content.split('\n');
        for (const line of lines) {
            if (title && firstQuery && firstAssistant && model)
                break;
            if (!line.trim())
                continue;
            try {
                const obj = JSON.parse(line);
                if (!title && obj.type === 'ai-title' && obj.message) {
                    const msg = obj.message;
                    if (typeof msg.content === 'string')
                        title = msg.content.substring(0, 500);
                    else if (Array.isArray(msg.content)) {
                        for (const block of msg.content) {
                            if (block.type === 'text' && block.text) {
                                title = block.text.substring(0, 500);
                                break;
                            }
                        }
                    }
                }
                if (!firstQuery && obj.type === 'user' && obj.message) {
                    const msg = obj.message;
                    if (typeof msg.content === 'string')
                        firstQuery = msg.content.substring(0, 120);
                    else if (Array.isArray(msg.content)) {
                        for (const block of msg.content) {
                            if (block.type === 'text' && block.text) {
                                firstQuery = block.text.substring(0, 120);
                                break;
                            }
                        }
                    }
                }
                // First assistant text — fallback label for sessions without title or user text
                if (!firstAssistant && obj.type === 'assistant' && obj.message) {
                    const msg = obj.message;
                    if (typeof msg.content === 'string')
                        firstAssistant = msg.content.substring(0, 120);
                    else if (Array.isArray(msg.content)) {
                        for (const block of msg.content) {
                            if (block.type === 'text' && block.text) {
                                firstAssistant = block.text.substring(0, 120);
                                break;
                            }
                        }
                    }
                }
                if (!model && obj.type === 'assistant' && obj.message?.model) {
                    model = obj.message.model;
                }
            }
            catch { /* skip malformed */ }
        }
        return { title, firstQuery, firstAssistant, model };
    }
    catch {
        return { title: null, firstQuery: null, firstAssistant: null, model: null };
    }
}
async function pickJsonlFiles(filePaths, sourceLabel) {
    if (filePaths.length === 0)
        return [];
    // Sort by mtime descending
    const sorted = filePaths.slice().sort((a, b) => {
        try {
            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
        }
        catch {
            return 0;
        }
    });
    // Load metadata in parallel batches for display labels
    const CONCURRENCY = 12;
    const metas = new Array(sorted.length);
    for (let i = 0; i < sorted.length; i += CONCURRENCY) {
        const batch = sorted.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(fp => extractSessionMetaAsync(fp)));
        for (let j = 0; j < results.length; j++)
            metas[i + j] = results[j];
    }
    // Build items: title as label, no tooltip, simple and reliable
    const items = sorted.map((fp, i) => {
        const meta = metas[i];
        const title = meta.title || meta.firstQuery || meta.firstAssistant || path.basename(fp, '.jsonl');
        return {
            label: title.length > 80 ? title.substring(0, 80) + '…' : title,
            description: meta.model ? `${sourceLabel} · ${meta.model}` : sourceLabel,
            detail: path.dirname(fp),
            filePath: fp,
        };
    });
    // Use the simple showQuickPick API — no createQuickPick complexity
    const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: (0, i18n_1.t)('import.picker.selectFiles', sorted.length),
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!picked || picked.length === 0)
        return undefined;
    return picked.map((p) => p.filePath);
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