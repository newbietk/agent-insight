import initSqlJs from 'sql.js';
import * as fs from 'node:fs';
import * as pathLib from 'node:path';

// ── Type helpers for sql.js ────────────────────────────────
type SqlJs = Awaited<ReturnType<typeof initSqlJs>>;
type SqlDatabase = InstanceType<SqlJs['Database']>;
type SqlStatement = InstanceType<SqlJs['Statement']>;

// Module-level SQL.js singleton (WASM loaded once)
let _sqlJs: SqlJs | null = null;

async function getSqlJs(): Promise<SqlJs> {
  if (!_sqlJs) _sqlJs = await initSqlJs();
  return _sqlJs;
}

// ── Compatibility wrappers (sql.js → node:sqlite API) ──────

export class CompatStmt {
  constructor(
    private sqlDb: SqlDatabase,
    private stmt: SqlStatement,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(...params: any[]): { changes: number } {
    this.stmt.bind(params);
    this.stmt.step();
    const changes = this.sqlDb.getRowsModified();
    this.stmt.free();
    return { changes };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all(...params: any[]): Array<Record<string, unknown>> {
    if (params.length > 0) this.stmt.bind(params);
    const rows: Array<Record<string, unknown>> = [];
    while (this.stmt.step()) {
      const obj = this.stmt.getAsObject();
      rows.push(obj as unknown as Record<string, unknown>);
    }
    this.stmt.free();
    return rows;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(...params: any[]): Record<string, unknown> | undefined {
    this.stmt.bind(params);
    const hasRow = this.stmt.step();
    let row: Record<string, unknown> | undefined;
    if (hasRow) {
      const obj = this.stmt.getAsObject();
      row = obj as unknown as Record<string, unknown>;
    }
    this.stmt.free();
    return row;
  }
}

export class CompatDB {
  private sqlDb: SqlDatabase;
  private filePath: string;

  constructor(sqlDb: SqlDatabase, filePath: string) {
    this.sqlDb = sqlDb;
    this.filePath = filePath;
  }

  /** Create a CompatDB from a file path (auto-loads or creates). */
  static async open(dbPath: string, options?: { readOnly?: boolean }): Promise<CompatDB> {
    const sql = await getSqlJs();
    let sqlDb: SqlDatabase;

    if (dbPath === ':memory:') {
      sqlDb = new sql.Database();
      return new CompatDB(sqlDb, ':memory:');
    }

    const dir = pathLib.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(dbPath)) {
      sqlDb = new sql.Database(fs.readFileSync(dbPath));
    } else {
      if (options?.readOnly) throw new Error(`Database not found: ${dbPath}`);
      sqlDb = new sql.Database();
    }

    return new CompatDB(sqlDb, dbPath);
  }

  exec(sql: string): void {
    this.sqlDb.exec(sql);
  }

  prepare(sql: string): CompatStmt {
    return new CompatStmt(this.sqlDb, this.sqlDb.prepare(sql));
  }

  /** Persist in-memory database to disk. No-op for ':memory:' databases. */
  save(): void {
    if (this.filePath !== ':memory:') {
      const data = this.sqlDb.export();
      fs.writeFileSync(this.filePath, Buffer.from(data));
    }
  }

  close(): void {
    this.sqlDb.close();
  }
}
