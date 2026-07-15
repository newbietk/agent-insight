import initSqlJs from 'sql.js';
type SqlJs = Awaited<ReturnType<typeof initSqlJs>>;
type SqlDatabase = InstanceType<SqlJs['Database']>;
type SqlStatement = InstanceType<SqlJs['Statement']>;
export declare class CompatStmt {
    private sqlDb;
    private stmt;
    constructor(sqlDb: SqlDatabase, stmt: SqlStatement);
    run(...params: any[]): {
        changes: number;
    };
    all(...params: any[]): Array<Record<string, unknown>>;
    get(...params: any[]): Record<string, unknown> | undefined;
}
export declare class CompatDB {
    private sqlDb;
    private filePath;
    constructor(sqlDb: SqlDatabase, filePath: string);
    /** Create a CompatDB from a file path (auto-loads or creates). */
    static open(dbPath: string, options?: {
        readOnly?: boolean;
    }): Promise<CompatDB>;
    exec(sql: string): void;
    prepare(sql: string): CompatStmt;
    /** Persist in-memory database to disk. No-op for ':memory:' databases. */
    save(): void;
    close(): void;
}
export {};
//# sourceMappingURL=compat-db.d.ts.map