export declare function findJsonlFiles(dirPath: string, visited?: Set<string>): string[];
export declare function pickJsonlFiles(filePaths: string[], sourceLabel: string): Promise<string[] | undefined>;
export declare function getClaudeProjectsDir(): string;
export declare function getOpenCodeDbPaths(): string[];
export declare function tryAutoFindOpenCodeDb(): string | null;
export declare function browseForDbPath(): Promise<string | null>;
//# sourceMappingURL=fileDiscovery.d.ts.map