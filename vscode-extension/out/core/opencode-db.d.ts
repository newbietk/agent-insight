import type { SessionListItem, RawInteraction } from './types';
export declare function listSessions(dbPath: string): Promise<SessionListItem[]>;
export declare function readSession(dbPath: string, sessionId: string): Promise<RawInteraction[]>;
//# sourceMappingURL=opencode-db.d.ts.map