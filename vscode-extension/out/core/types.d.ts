export interface SessionListItem {
    id: string;
    createdAt: string;
    firstQuery: string | null;
    turnCount: number;
    modelName: string | null;
    version?: string | null;
}
export interface RawInteraction {
    role: string;
    content: string | null;
    timestamp: string;
    timeInfo: {
        created: number;
        completed?: number;
    } | null;
    agent: string | null;
    subagent_name: string | null;
    subagent_session_id: string | null;
    subagent_type: string | null;
    tool_calls: ToolCallInfo[] | null;
    usage: TokenUsage | null;
    model: string | null;
    modelID: string | null;
    providerID: string | null;
    latency: number | null;
    finish_reason: string | null;
}
export interface ToolCallInfo {
    toolCallId: string;
    toolName: string;
    argsJson: string | null;
    resultJson: string | null;
    state: string;
}
export interface TokenUsage {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    inputMessagesTokens: number;
}
//# sourceMappingURL=types.d.ts.map