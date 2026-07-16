import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { Storage } from '../storage/db';
import type { SyncResult } from '../importer';

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
export class SyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private storage: Storage,
    private onSync: () => void,
  ) {}

  /** Start polling. Reads interval from config. Safe to call multiple times. */
  start(): void {
    this.stop();

    // Dispose old config listeners before creating new ones (prevents leak on restart)
    for (const d of this.disposables) d.dispose();
    this.disposables = [];

    const config = vscode.workspace.getConfiguration('hismartlite.autoSync');
    const enabled = config.get<boolean>('enabled', false);
    if (!enabled) return;

    const intervalMs = config.get<number>('intervalMs', 30000);
    // Clamp to reasonable range: 5s – 10min
    const clamped = Math.max(5000, Math.min(600_000, intervalMs));

    this.timer = setInterval(() => this.checkAll(), clamped);

    // Watch for config changes to restart with new interval
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('hismartlite.autoSync')) {
          this.start(); // re-read config and restart
        }
      }),
    );

    console.log(`[KirinAI] Auto-sync started (interval: ${clamped}ms)`);
  }

  /** Stop polling. Safe to call multiple times. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[KirinAI] Auto-sync stopped');
    }
  }

  /** Release all listeners and stop the timer. */
  dispose(): void {
    this.stop();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  // ── Private ──────────────────────────────────────────────

  private async checkAll(): Promise<void> {
    // Lazily load syncSession to avoid circular deps at module level
    const { syncSession } = require('../importer');

    const sessions = this.storage.listSessions().filter(s => s.sourcePath);
    if (sessions.length === 0) return;

    let changed = false;

    for (const s of sessions) {
      if (this.running.has(s.id)) continue;

      const sourceMtime = this.getSourceMtime(s.sourcePath!);
      if (sourceMtime === null) continue; // file gone or unreadable

      const lastSyncMs = s.lastSyncedAt
        ? new Date(s.lastSyncedAt).getTime()
        : 0;

      if (sourceMtime <= lastSyncMs) continue;

      // Source newer than last sync → sync now
      this.running.add(s.id);
      try {
        const result: SyncResult = await syncSession(this.storage, s.id);
        if (result.newTurnCount > 0) {
          changed = true;
          console.log(
            `[KirinAI] Auto-synced "${s.taskId}": +${result.newTurnCount} turns (${result.totalTurnCount} total)`,
          );
        }
      } catch (err) {
        console.error(
          `[KirinAI] Auto-sync failed for "${s.taskId}":`,
          err instanceof Error ? err.message : err,
        );
      } finally {
        this.running.delete(s.id);
      }
    }

    if (changed) this.onSync();
  }

  /**
   * Get the modification time of a source file in milliseconds.
   * Returns null if the file doesn't exist or can't be stat'd.
   */
  private getSourceMtime(sourcePath: string): number | null {
    try {
      return fs.statSync(sourcePath).mtimeMs;
    } catch {
      return null;
    }
  }
}
