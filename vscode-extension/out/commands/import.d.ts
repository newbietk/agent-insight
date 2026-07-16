import type { Storage } from '../storage/db';
export declare function setRefreshCallback(cb: () => void): void;
export declare function handleCodeAgentImport(storage: Storage, mode: 'auto' | 'manual'): Promise<void>;
export declare function handleClaudeImport(storage: Storage, mode: 'auto' | 'manual'): Promise<void>;
export declare function handleOpenCodeImport(storage: Storage, mode: 'auto' | 'manual'): Promise<void>;
//# sourceMappingURL=import.d.ts.map