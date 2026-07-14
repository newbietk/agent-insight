import type { RawInteraction } from './types';
export interface TurnRow {
    id: string;
    sessionId: string;
    turnIndex: number;
    role: string;
    content: string | null;
    contentJson: string | null;
    contentSummary: string | null;
    inputMessagesJson: string | null;
    inputMessagesCount: number;
    inputMessagesTokens: number;
    contextWindowPct: number | null;
    agentName: string | null;
    subagentName: string | null;
    subagentSessionId: string | null;
    subagentType: string | null;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cost: number;
    createdAt_ts: string | null;
    completedAt: string | null;
    latencyMs: number;
    ttftMs: number | null;
    model: string | null;
    modelId: string | null;
    providerId: string | null;
    temperature: number | null;
    maxTokens: number | null;
    finishReason: string | null;
    isSubagent: boolean;
    parentExecutionId: string | null;
}
export interface ToolCallRow {
    id: string;
    turnId: string;
    toolCallId: string;
    toolName: string;
    argsJson: string | null;
    resultJson: string | null;
    state: string;
    errorType: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number;
    dispatchBridgeId: string | null;
    isSkillRelated: boolean;
}
export interface SkillEventRow {
    id: string;
    turnId: string;
    skillName: string;
    skillVersion: number | null;
    eventType: string;
    success: boolean;
    errorMessage: string | null;
    argsJson: string | null;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number;
}
export declare function resetIdCounter(): void;
export declare function extractErrorMessage(resultJson: string | null): string | null;
export declare function splitIntoTurns(interactions: RawInteraction[], sessionId: string, _parentSessionId?: string): {
    turns: TurnRow[];
    toolCalls: ToolCallRow[];
    skillEvents: SkillEventRow[];
};
//# sourceMappingURL=turn-split.d.ts.map