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
exports.SyncScheduler = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs"));
/**
 * Auto-sync scheduler — periodically checks imported sessions' source files
 * for changes and syncs new turns automatically.
 *
 * Design:
 * - Uses setInterval with configurable interval (default 30s)
 * - Compares source file mtime against lastSyncedAt timestamp
 * - Tracks in-flight syncs per session to prevent overlapping runs
 * - Silent on success, logs errors to console; callback fires on any change
 *   so the caller can refresh the TreeView
 */
class SyncScheduler {
    storage;
    onSync;
    timer = null;
    running = new Set();
    disposables = [];
    constructor(storage, onSync) {
        this.storage = storage;
        this.onSync = onSync;
    }
    /** Start polling. Reads interval from config. Safe to call multiple times. */
    start() {
        this.stop();
        // Dispose old config listeners before creating new ones (prevents leak on restart)
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
        const config = vscode.workspace.getConfiguration('hismartlite.autoSync');
        const enabled = config.get('enabled', false);
        if (!enabled)
            return;
        const intervalMs = config.get('intervalMs', 30000);
        // Clamp to reasonable range: 5s – 10min
        const clamped = Math.max(5000, Math.min(600_000, intervalMs));
        this.timer = setInterval(() => this.checkAll(), clamped);
        // Watch for config changes to restart with new interval
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('hismartlite.autoSync')) {
                this.start(); // re-read config and restart
            }
        }));
        console.log(`[KirinAI] Auto-sync started (interval: ${clamped}ms)`);
    }
    /** Stop polling. Safe to call multiple times. */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[KirinAI] Auto-sync stopped');
        }
    }
    /** Release all listeners and stop the timer. */
    dispose() {
        this.stop();
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
    }
    // ── Private ──────────────────────────────────────────────
    async checkAll() {
        // Lazily load syncSession to avoid circular deps at module level
        const { syncSession } = require('../importer');
        const sessions = this.storage.listSessions().filter(s => s.sourcePath);
        if (sessions.length === 0)
            return;
        let changed = false;
        for (const s of sessions) {
            if (this.running.has(s.id))
                continue;
            const sourceMtime = this.getSourceMtime(s.sourcePath);
            if (sourceMtime === null)
                continue; // file gone or unreadable
            const lastSyncMs = s.lastSyncedAt
                ? new Date(s.lastSyncedAt).getTime()
                : 0;
            if (sourceMtime <= lastSyncMs)
                continue;
            // Source newer than last sync → sync now
            this.running.add(s.id);
            try {
                const result = await syncSession(this.storage, s.id);
                if (result.newTurnCount > 0) {
                    changed = true;
                    console.log(`[KirinAI] Auto-synced "${s.taskId}": +${result.newTurnCount} turns (${result.totalTurnCount} total)`);
                }
            }
            catch (err) {
                console.error(`[KirinAI] Auto-sync failed for "${s.taskId}":`, err instanceof Error ? err.message : err);
            }
            finally {
                this.running.delete(s.id);
            }
        }
        if (changed)
            this.onSync();
    }
    /**
     * Get the modification time of a source file in milliseconds.
     * Returns null if the file doesn't exist or can't be stat'd.
     */
    getSourceMtime(sourcePath) {
        try {
            return fs.statSync(sourcePath).mtimeMs;
        }
        catch {
            return null;
        }
    }
}
exports.SyncScheduler = SyncScheduler;
//# sourceMappingURL=scheduler.js.map