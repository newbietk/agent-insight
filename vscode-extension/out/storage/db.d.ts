import type { TurnRow, ToolCallRow, SkillEventRow } from '../core/turn-split';
export interface SessionRow {
    id: string;
    taskId: string;
    label: string | null;
    query: string | null;
    framework: string;
    model: string | null;
    startTime: string;
    endTime: string | null;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    totalCost: number;
    totalLatencyMs: number;
    totalToolCallCount: number;
    totalLlmCallCount: number;
    totalSkillLoadCount: number;
    totalSubagentCount: number;
    sourcePath: string | null;
    sourceType: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
}
export interface SessionAggregates {
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    totalCost: number;
    totalLatencyMs: number;
    totalToolCallCount: number;
    totalLlmCallCount: number;
    totalSkillLoadCount: number;
    totalSubagentCount: number;
    endTime: string | null;
    model: string | null;
}
export interface SessionListItem {
    id: string;
    taskId: string;
    label: string | null;
    query: string | null;
    framework: string;
    model: string | null;
    totalTokens: number;
    totalCost: number;
    totalLatencyMs: number;
    turnCount: number;
    sourcePath: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
}
export interface TurnDetailRow {
    id: string;
    turnIndex: number;
    role: string;
    content: string | null;
    contentSummary: string | null;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    contextWindowPct: number | null;
    inputMessagesTokens: number;
    agentName: string | null;
    subagentName: string | null;
    subagentSessionId: string | null;
    isSubagent: boolean;
    model: string | null;
    latencyMs: number;
    createdAt_ts: string | null;
}
export interface TurnDetailWithToolCalls extends TurnDetailRow {
    toolCalls: ToolCallDetail[];
    skillEvents: SkillEventDetail[];
}
export interface ToolCallDetail {
    toolCallId: string;
    toolName: string;
    argsJson: string | null;
    resultJson: string | null;
    state: string;
    errorType: string | null;
    isSkillRelated: boolean;
    durationMs: number;
}
export interface SkillEventDetail {
    skillName: string;
    skillVersion: number | null;
    eventType: string;
    success: boolean;
    durationMs: number;
}
export interface SessionDetailData {
    session: SessionRow;
    turns: TurnDetailWithToolCalls[];
}
export declare class Storage {
    private db;
    private constructor();
    /** Create a Storage instance backed by sql.js (Node 20+ compatible). */
    static create(dbPath?: string): Promise<Storage>;
    static forExtension(context: {
        globalStorageUri: {
            fsPath: string;
        };
    }): Promise<Storage>;
    private initTables;
    private migrateColumns;
    insertSession(session: SessionRow): void;
    insertTurn(turn: TurnRow & {
        sessionId: string;
    }): void;
    insertToolCall(tc: ToolCallRow & {
        turnId: string;
    }): void;
    insertSkillEvent(se: SkillEventRow & {
        turnId: string;
    }): void;
    importSessionData(session: SessionRow, turns: TurnRow[], toolCalls: ToolCallRow[], skillEvents: SkillEventRow[]): void;
    listSessions(): SessionListItem[];
    getSession(id: string): SessionRow | null;
    getTurnsWithDetails(sessionId: string): TurnDetailWithToolCalls[];
    getSessionDetail(id: string): SessionDetailData | null;
    deleteSession(id: string): boolean;
    sessionExists(taskId: string, framework: string): boolean;
    getMaxTurnIndex(sessionId: string): number;
    syncSessionData(sessionId: string, aggregates: SessionAggregates, newTurns: TurnRow[], newToolCalls: ToolCallRow[], newSkillEvents: SkillEventRow[]): void;
    updateSyncTimestamp(sessionId: string, timestamp: string): void;
    close(): void;
    private mapSessionRow;
    private mapTurnRow;
}
//# sourceMappingURL=db.d.ts.map