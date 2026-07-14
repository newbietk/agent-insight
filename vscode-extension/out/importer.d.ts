import type { TurnRow, ToolCallRow, SkillEventRow } from './core/turn-split';
import { Storage } from './storage/db';
import type { SessionAggregates } from './storage/db';
export interface ImportResult {
    sessionId: string;
    taskId: string;
    label: string | null;
    turns: number;
    toolCalls: number;
    skillEvents: number;
    totalTokens: number;
    totalCost: number;
    model: string | null;
}
export interface SyncResult {
    sessionId: string;
    taskId: string;
    newTurnCount: number;
    totalTurnCount: number;
}
/**
 * Import a single Claude Code JSONL file into storage.
 * Returns the import result or null if the file is empty.
 */
export declare function importJsonlFile(storage: Storage, filePath: string): ImportResult | null;
/**
 * Import a single OpenCode session into storage.
 * Returns the import result or null if the session has no messages.
 */
export declare function importOpenCodeSession(storage: Storage, dbPath: string, sessionId: string): Promise<ImportResult | null>;
/**
 * List OpenCode sessions from a database file.
 */
export declare function listOpenCodeSessions(dbPath: string): Promise<Array<{
    id: string;
    label: string | null;
    model: string | null;
}>>;
/**
 * Scan a directory for Claude Code JSONL files and return their session listings.
 */
export declare function scanClaudeSessions(dirPath: string): Array<{
    taskId: string;
    label: string | null;
    model: string | null;
}>;
/** Compute aggregates using the importer's aggregate helper. */
export declare function computeSessionAggregates(turns: TurnRow[], toolCalls: ToolCallRow[], skillEvents: SkillEventRow[]): SessionAggregates;
/**
 * Sync an already-imported session with its original source.
 * Re-reads the full source, runs the pipeline, and appends only new turns.
 */
export declare function syncSession(storage: Storage, sessionId: string): Promise<SyncResult>;
//# sourceMappingURL=importer.d.ts.map