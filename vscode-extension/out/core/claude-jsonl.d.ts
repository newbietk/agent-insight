import type { SessionListItem, RawInteraction } from './types';
export declare function listSessions(dirPath: string): SessionListItem[];
export declare function listSubagentSessions(dirPath: string, sessionId: string): {
    id: string;
    filePath: string;
}[];
export declare function collectSubagentToolUseMappings(dirPath: string, sessionId: string): Map<string, string>;
export declare function extractVersion(filePath: string): string | null;
export declare function readSession(filePath: string, sessionId: string): RawInteraction[];
//# sourceMappingURL=claude-jsonl.d.ts.map