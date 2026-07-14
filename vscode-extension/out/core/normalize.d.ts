import type { RawInteraction, TokenUsage } from './types';
export interface NormalizedInteraction {
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
    tool_calls: RawInteraction['tool_calls'];
    usage: TokenUsage | null;
    model: string | null;
    modelID: string | null;
    providerID: string | null;
    latency: number | null;
    finish_reason: string | null;
}
export declare function normalize(interactions: RawInteraction[], sourceType: string): NormalizedInteraction[];
//# sourceMappingURL=normalize.d.ts.map