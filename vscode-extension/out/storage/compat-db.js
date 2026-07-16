"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompatDB = exports.CompatStmt = void 0;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("node:fs"));
const pathLib = __importStar(require("node:path"));
// Module-level SQL.js singleton (WASM loaded once)
let _sqlJs = null;
async function getSqlJs() {
    if (!_sqlJs)
        _sqlJs = await (0, sql_js_1.default)();
    return _sqlJs;
}
// ── Compatibility wrappers (sql.js → node:sqlite API) ──────
class CompatStmt {
    sqlDb;
    stmt;
    constructor(sqlDb, stmt) {
        this.sqlDb = sqlDb;
        this.stmt = stmt;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run(...params) {
        this.stmt.bind(params);
        this.stmt.step();
        const changes = this.sqlDb.getRowsModified();
        this.stmt.free();
        return { changes };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all(...params) {
        if (params.length > 0)
            this.stmt.bind(params);
        const rows = [];
        while (this.stmt.step()) {
            const obj = this.stmt.getAsObject();
            rows.push(obj);
        }
        this.stmt.free();
        return rows;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(...params) {
        this.stmt.bind(params);
        const hasRow = this.stmt.step();
        let row;
        if (hasRow) {
            const obj = this.stmt.getAsObject();
            row = obj;
        }
        this.stmt.free();
        return row;
    }
}
exports.CompatStmt = CompatStmt;
class CompatDB {
    sqlDb;
    filePath;
    readOnly;
    constructor(sqlDb, filePath, readOnly = false) {
        this.sqlDb = sqlDb;
        this.filePath = filePath;
        this.readOnly = readOnly;
    }
    /** Create a CompatDB from a file path (auto-loads or creates). */
    static async open(dbPath, options) {
        const sql = await getSqlJs();
        let sqlDb;
        if (dbPath === ':memory:') {
            sqlDb = new sql.Database();
            return new CompatDB(sqlDb, ':memory:');
        }
        const dir = pathLib.dirname(dbPath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(dbPath)) {
            sqlDb = new sql.Database(fs.readFileSync(dbPath));
        }
        else {
            if (options?.readOnly)
                throw new Error(`Database not found: ${dbPath}`);
            sqlDb = new sql.Database();
        }
        return new CompatDB(sqlDb, dbPath, options?.readOnly ?? false);
    }
    exec(sql) {
        this.sqlDb.exec(sql);
    }
    prepare(sql) {
        return new CompatStmt(this.sqlDb, this.sqlDb.prepare(sql));
    }
    /** Persist in-memory database to disk. No-op for ':memory:' databases and read-only connections. */
    save() {
        if (this.readOnly)
            return;
        if (this.filePath !== ':memory:') {
            const data = this.sqlDb.export();
            fs.writeFileSync(this.filePath, Buffer.from(data));
        }
    }
    close() {
        this.sqlDb.close();
    }
}
exports.CompatDB = CompatDB;
//# sourceMappingURL=compat-db.js.map