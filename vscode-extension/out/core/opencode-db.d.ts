import type { SessionListItem, RawInteraction } from './types';
export declare function listSessions(dbPath: string): Promise<SessionListItem[]>;
/** Return the session IDs of all direct child (subagent) sessions for a parent. */
export declare function listChildSessionIds(dbPath: string, parentSessionId: string): Promise<string[]>;
/** Get the session title from an OpenCode database. */
export declare function getSessionTitle(dbPath: string, sessionId: string): Promise<string | null>;
export declare function readSession(dbPath: string, sessionId: string): Promise<RawInteraction[]>;
//# sourceMappingURL=opencode-db.d.ts.map