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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Storage = void 0;
const compat_db_1 = require("./compat-db");
const pathLib = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const DB_FILENAME = 'kirinai-sessions.db';
function getDbPath(context) {
    if ('globalStorageUri' in context) {
        const dir = context.globalStorageUri.fsPath;
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        return pathLib.join(dir, DB_FILENAME);
    }
    if ('storageUri' in context) {
        const dir = context.storageUri.fsPath;
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        return pathLib.join(dir, DB_FILENAME);
    }
    return pathLib.join(process.cwd(), DB_FILENAME);
}
// ── Storage ─────────────────────────────────────────────────
class Storage {
    db;
    constructor(db) {
        this.db = db;
        this.initTables();
        // Persist schema to disk immediately (no-op for :memory:)
        this.db.save();
    }
    /** Create a Storage instance backed by sql.js (Node 20+ compatible). */
    static async create(dbPath) {
        const filePath = dbPath || ':memory:';
        const compatDb = await compat_db_1.CompatDB.open(filePath);
        const storage = new Storage(compatDb);
        // Persist schema to disk immediately (no-op for :memory:)
        compatDb.save();
        return storage;
    }
    static async forExtension(context) {
        return Storage.create(getDbPath(context));
    }
    initTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        label TEXT,
        query TEXT,
        framework TEXT NOT NULL DEFAULT 'claude-code',
        model TEXT,
        startTime TEXT NOT NULL,
        endTime TEXT,
        totalTokens INTEGER DEFAULT 0,
        totalInputTokens INTEGER DEFAULT 0,
        totalOutputTokens INTEGER DEFAULT 0,
        totalReasoningTokens INTEGER DEFAULT 0,
        totalCacheReadTokens INTEGER DEFAULT 0,
        totalCacheWriteTokens INTEGER DEFAULT 0,
        totalCost REAL DEFAULT 0,
        totalLatencyMs INTEGER DEFAULT 0,
        totalToolCallCount INTEGER DEFAULT 0,
        totalLlmCallCount INTEGER DEFAULT 0,
        totalSkillLoadCount INTEGER DEFAULT 0,
        totalSubagentCount INTEGER DEFAULT 0,
        sourcePath TEXT,
        sourceType TEXT,
        lastSyncedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        turnIndex INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        contentSummary TEXT,
        totalTokens INTEGER DEFAULT 0,
        inputTokens INTEGER DEFAULT 0,
        outputTokens INTEGER DEFAULT 0,
        reasoningTokens INTEGER DEFAULT 0,
        cacheReadTokens INTEGER DEFAULT 0,
        cacheWriteTokens INTEGER DEFAULT 0,
        contextWindowPct REAL,
        inputMessagesTokens INTEGER DEFAULT 0,
        agentName TEXT,
        subagentName TEXT,
        subagentSessionId TEXT,
        isSubagent INTEGER DEFAULT 0,
        model TEXT,
        latencyMs INTEGER DEFAULT 0,
        createdAt_ts TEXT,
        completedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        turnId TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        toolCallId TEXT NOT NULL,
        toolName TEXT NOT NULL,
        argsJson TEXT,
        resultJson TEXT,
        state TEXT DEFAULT 'ok',
        errorType TEXT,
        errorMessage TEXT,
        durationMs INTEGER DEFAULT 0,
        isSkillRelated INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS skill_events (
        id TEXT PRIMARY KEY,
        turnId TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        skillName TEXT NOT NULL,
        skillVersion INTEGER,
        eventType TEXT NOT NULL,
        success INTEGER DEFAULT 1,
        durationMs INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(sessionId);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_turn ON tool_calls(turnId);
      CREATE INDEX IF NOT EXISTS idx_skill_events_turn ON skill_events(turnId);
      CREATE INDEX IF NOT EXISTS idx_sessions_taskId ON sessions(taskId);
    `);
        // ── Migrate existing databases: add columns that may not exist ──
        this.migrateColumns();
    }
    migrateColumns() {
        const cols = this.db.prepare("PRAGMA table_info(sessions)").all();
        const colNames = new Set(cols.map(c => c.name));
        if (!colNames.has('sourceType')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN sourceType TEXT');
        }
        if (!colNames.has('lastSyncedAt')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN lastSyncedAt TEXT');
        }
    }
    // ── Write ──────────────────────────────────────────────
    insertSession(session) {
        const stmt = this.db.prepare(`
      INSERT INTO sessions (id, taskId, label, query, framework, model, startTime, endTime,
        totalTokens, totalInputTokens, totalOutputTokens, totalReasoningTokens,
        totalCacheReadTokens, totalCacheWriteTokens, totalCost, totalLatencyMs,
        totalToolCallCount, totalLlmCallCount, totalSkillLoadCount, totalSubagentCount,
        sourcePath, sourceType, lastSyncedAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(session.id, session.taskId, session.label, session.query, session.framework, session.model, session.startTime, session.endTime, session.totalTokens, session.totalInputTokens, session.totalOutputTokens, session.totalReasoningTokens, session.totalCacheReadTokens, session.totalCacheWriteTokens, session.totalCost, session.totalLatencyMs, session.totalToolCallCount, session.totalLlmCallCount, session.totalSkillLoadCount, session.totalSubagentCount, session.sourcePath, session.sourceType, session.lastSyncedAt, session.createdAt);
        // No auto-save here — called in batches within importSessionData
    }
    insertTurn(turn) {
        const stmt = this.db.prepare(`
      INSERT INTO turns (id, sessionId, turnIndex, role, content, contentSummary,
        totalTokens, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens,
        contextWindowPct, inputMessagesTokens, agentName, subagentName, subagentSessionId,
        isSubagent, model, latencyMs, createdAt_ts, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(turn.id, turn.sessionId, turn.turnIndex, turn.role, turn.content, turn.contentSummary, turn.totalTokens, turn.inputTokens, turn.outputTokens, turn.reasoningTokens, turn.cacheReadTokens, turn.cacheWriteTokens, turn.contextWindowPct ?? null, turn.inputMessagesTokens, turn.agentName, turn.subagentName, turn.subagentSessionId, turn.isSubagent ? 1 : 0, turn.model, turn.latencyMs, turn.createdAt_ts, turn.completedAt);
        // No auto-save here — called in batches within importSessionData
    }
    insertToolCall(tc) {
        const stmt = this.db.prepare(`
      INSERT INTO tool_calls (id, turnId, toolCallId, toolName, argsJson, resultJson,
        state, errorType, errorMessage, durationMs, isSkillRelated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(tc.id, tc.turnId, tc.toolCallId, tc.toolName, tc.argsJson, tc.resultJson, tc.state, tc.errorType ?? null, tc.errorMessage ?? null, tc.durationMs, tc.isSkillRelated ? 1 : 0);
        // No auto-save here — called in batches within importSessionData
    }
    insertSkillEvent(se) {
        const stmt = this.db.prepare(`
      INSERT INTO skill_events (id, turnId, skillName, skillVersion, eventType, success, durationMs)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(se.id, se.turnId, se.skillName, se.skillVersion ?? null, se.eventType, se.success ? 1 : 0, se.durationMs);
        // No auto-save here — called in batches within importSessionData
    }
    // ── Batch write ───────────────────────────────────────
    importSessionData(session, turns, toolCalls, skillEvents) {
        this.db.prepare('BEGIN').run();
        try {
            this.insertSession(session);
            for (const turn of turns) {
                this.insertTurn({ ...turn, sessionId: session.id });
            }
            for (const tc of toolCalls) {
                this.insertToolCall(tc);
            }
            for (const se of skillEvents) {
                this.insertSkillEvent(se);
            }
            this.db.prepare('COMMIT').run();
            this.db.save();
        }
        catch (e) {
            this.db.prepare('ROLLBACK').run();
            throw e;
        }
    }
    // ── Query: session list ────────────────────────────────
    listSessions() {
        const rows = this.db.prepare(`
      SELECT s.id, s.taskId, s.label, s.query, s.framework, s.model,
             s.totalTokens, s.totalCost, s.totalLatencyMs, s.sourcePath, s.lastSyncedAt, s.createdAt,
             (SELECT COUNT(*) FROM turns t WHERE t.sessionId = s.id) as turnCount
      FROM sessions s
      ORDER BY s.createdAt DESC
    `).all();
        return rows.map(r => ({
            id: r.id,
            taskId: r.taskId,
            label: r.label,
            query: r.query,
            framework: r.framework,
            model: r.model,
            totalTokens: r.totalTokens,
            totalCost: r.totalCost,
            totalLatencyMs: r.totalLatencyMs,
            turnCount: r.turnCount,
            sourcePath: r.sourcePath,
            lastSyncedAt: r.lastSyncedAt,
            createdAt: r.createdAt,
        }));
    }
    // ── Query: session detail ─────────────────────────────
    getSession(id) {
        const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
        if (!row)
            return null;
        return this.mapSessionRow(row);
    }
    getTurnsWithDetails(sessionId) {
        const turns = this.db.prepare(`
      SELECT * FROM turns WHERE sessionId = ? ORDER BY turnIndex ASC
    `).all(sessionId);
        return turns.map(t => {
            const turnId = t.id;
            const toolCalls = this.db.prepare('SELECT toolCallId, toolName, argsJson, resultJson, state, errorType, durationMs, isSkillRelated FROM tool_calls WHERE turnId = ?').all(turnId);
            const skillEvents = this.db.prepare('SELECT skillName, skillVersion, eventType, success, durationMs FROM skill_events WHERE turnId = ?').all(turnId);
            return {
                ...this.mapTurnRow(t),
                toolCalls: toolCalls.map(tc => ({
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                    argsJson: tc.argsJson,
                    resultJson: tc.resultJson,
                    state: tc.state,
                    errorType: tc.errorType,
                    isSkillRelated: tc.isSkillRelated === 1,
                    durationMs: tc.durationMs,
                })),
                skillEvents: skillEvents.map(se => ({
                    skillName: se.skillName,
                    skillVersion: se.skillVersion,
                    eventType: se.eventType,
                    success: se.success === 1,
                    durationMs: se.durationMs,
                })),
            };
        });
    }
    getSessionDetail(id) {
        const session = this.getSession(id);
        if (!session)
            return null;
        const turns = this.getTurnsWithDetails(id);
        return { session, turns };
    }
    // ── Delete ─────────────────────────────────────────────
    deleteSession(id) {
        const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
        this.db.save();
        return result.changes > 0;
    }
    // ── Check existence ───────────────────────────────────
    sessionExists(taskId, framework) {
        const row = this.db.prepare('SELECT 1 FROM sessions WHERE taskId = ? AND framework = ? LIMIT 1').get(taskId, framework);
        return row !== undefined;
    }
    // ── Sync ───────────────────────────────────────────────
    getMaxTurnIndex(sessionId) {
        const row = this.db.prepare('SELECT COALESCE(MAX(turnIndex), -1) as maxIdx FROM turns WHERE sessionId = ?').get(sessionId);
        return row?.maxIdx ?? -1;
    }
    syncSessionData(sessionId, aggregates, newTurns, newToolCalls, newSkillEvents) {
        const now = new Date().toISOString();
        this.db.prepare('BEGIN').run();
        try {
            // Update session aggregates
            const updateStmt = this.db.prepare(`
        UPDATE sessions SET
          totalTokens = ?, totalInputTokens = ?, totalOutputTokens = ?,
          totalReasoningTokens = ?, totalCacheReadTokens = ?, totalCacheWriteTokens = ?,
          totalCost = ?, totalLatencyMs = ?,
          totalToolCallCount = ?, totalLlmCallCount = ?,
          totalSkillLoadCount = ?, totalSubagentCount = ?,
          endTime = ?, model = COALESCE(?, model),
          lastSyncedAt = ?
        WHERE id = ?
      `);
            updateStmt.run(aggregates.totalTokens, aggregates.totalInputTokens, aggregates.totalOutputTokens, aggregates.totalReasoningTokens, aggregates.totalCacheReadTokens, aggregates.totalCacheWriteTokens, aggregates.totalCost, aggregates.totalLatencyMs, aggregates.totalToolCallCount, aggregates.totalLlmCallCount, aggregates.totalSkillLoadCount, aggregates.totalSubagentCount, aggregates.endTime, aggregates.model, now, sessionId);
            // Insert new turns, tool calls, skill events
            for (const turn of newTurns) {
                this.insertTurn({ ...turn, sessionId });
            }
            for (const tc of newToolCalls) {
                this.insertToolCall(tc);
            }
            for (const se of newSkillEvents) {
                this.insertSkillEvent(se);
            }
            this.db.prepare('COMMIT').run();
            this.db.save();
        }
        catch (e) {
            this.db.prepare('ROLLBACK').run();
            throw e;
        }
    }
    updateSyncTimestamp(sessionId, timestamp) {
        this.db.prepare('UPDATE sessions SET lastSyncedAt = ? WHERE id = ?').run(timestamp, sessionId);
        this.db.save();
    }
    // ── Lifecycle ──────────────────────────────────────────
    close() {
        this.db.save();
        this.db.close();
    }
    // ── Helpers ────────────────────────────────────────────
    mapSessionRow(r) {
        return {
            id: r.id,
            taskId: r.taskId,
            label: r.label,
            query: r.query,
            framework: r.framework,
            model: r.model,
            startTime: r.startTime,
            endTime: r.endTime,
            totalTokens: r.totalTokens,
            totalInputTokens: r.totalInputTokens,
            totalOutputTokens: r.totalOutputTokens,
            totalReasoningTokens: r.totalReasoningTokens,
            totalCacheReadTokens: r.totalCacheReadTokens,
            totalCacheWriteTokens: r.totalCacheWriteTokens,
            totalCost: r.totalCost,
            totalLatencyMs: r.totalLatencyMs,
            totalToolCallCount: r.totalToolCallCount,
            totalLlmCallCount: r.totalLlmCallCount,
            totalSkillLoadCount: r.totalSkillLoadCount,
            totalSubagentCount: r.totalSubagentCount,
            sourcePath: r.sourcePath,
            sourceType: r.sourceType,
            lastSyncedAt: r.lastSyncedAt,
            createdAt: r.createdAt,
        };
    }
    mapTurnRow(r) {
        return {
            id: r.id,
            turnIndex: r.turnIndex,
            role: r.role,
            content: r.content,
            contentSummary: r.contentSummary,
            totalTokens: r.totalTokens,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            reasoningTokens: r.reasoningTokens,
            cacheReadTokens: r.cacheReadTokens,
            cacheWriteTokens: r.cacheWriteTokens,
            contextWindowPct: r.contextWindowPct,
            inputMessagesTokens: r.inputMessagesTokens,
            agentName: r.agentName,
            subagentName: r.subagentName,
            subagentSessionId: r.subagentSessionId,
            isSubagent: r.isSubagent === 1,
            model: r.model,
            latencyMs: r.latencyMs,
            createdAt_ts: r.createdAt_ts,
        };
    }
}
exports.Storage = Storage;
//# sourceMappingURL=db.js.map