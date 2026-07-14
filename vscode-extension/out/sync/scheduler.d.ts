import type { Storage } from '../storage/db';
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
export declare class SyncScheduler {
    private storage;
    private onSync;
    private timer;
    private running;
    private disposables;
    constructor(storage: Storage, onSync: () => void);
    /** Start polling. Reads interval from config. Safe to call multiple times. */
    start(): void;
    /** Stop polling. Safe to call multiple times. */
    stop(): void;
    /** Release all listeners and stop the timer. */
    dispose(): void;
    private checkAll;
    /**
     * Get the modification time of a source file in milliseconds.
     * Returns null if the file doesn't exist or can't be stat'd.
     */
    private getSourceMtime;
}
//# sourceMappingURL=scheduler.d.ts.map