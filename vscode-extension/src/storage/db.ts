import { CompatDB } from './compat-db';
import * as pathLib from 'node:path';
import * as fs from 'node:fs';
import type { TurnRow, ToolCallRow, SkillEventRow } from '../core/turn-split';

// ── Domain types ────────────────────────────────────────────

export interface SessionRow {
  id: string;
  taskId: string;
  label: string | null;
  query: string | null;
  framework: string;
  model: string | null;
  startTime: string;
  endTime: string | null;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  totalToolCallCount: number;
  totalLlmCallCount: number;
  totalSkillLoadCount: number;
  totalSubagentCount: number;
  sourcePath: string | null;
  sourceType: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface SessionAggregates {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  totalToolCallCount: number;
  totalLlmCallCount: number;
  totalSkillLoadCount: number;
  totalSubagentCount: number;
  endTime: string | null;
  model: string | null;
}

export interface SessionListItem {
  id: string;
  taskId: string;
  label: string | null;
  query: string | null;
  framework: string;
  model: string | null;
  totalTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  turnCount: number;
  sourcePath: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface TurnDetailRow {
  id: string;
  turnIndex: number;
  role: string;
  content: string | null;
  contentSummary: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextWindowPct: number | null;
  inputMessagesTokens: number;
  agentName: string | null;
  subagentName: string | null;
  subagentSessionId: string | null;
  isSubagent: boolean;
  model: string | null;
  latencyMs: number;
  createdAt_ts: string | null;
}

export interface TurnDetailWithToolCalls extends TurnDetailRow {
  toolCalls: ToolCallDetail[];
  skillEvents: SkillEventDetail[];
}

export interface ToolCallDetail {
  toolCallId: string;
  toolName: string;
  argsJson: string | null;
  resultJson: string | null;
  state: string;
  errorType: string | null;
  isSkillRelated: boolean;
  durationMs: number;
}

export interface SkillEventDetail {
  skillName: string;
  skillVersion: number | null;
  eventType: string;
  success: boolean;
  durationMs: number;
}

export interface SubagentLinkRow {
  id: string;
  sessionId: string;
  dispatchTurnId: string;
  dispatchToolCallId: string;
  subagentSessionId: string;
  subagentType: string | null;
  subagentName: string | null;
  dispatchContent: string | null;
  status: string;
  subagentTokens: number;
  subagentLatencyMs: number;
}

export interface SessionDetailData {
  session: SessionRow;
  turns: TurnDetailWithToolCalls[];
  bridges?: SubagentLinkRow[];
}

const DB_FILENAME = 'kirinai-sessions.db';

function getDbPath(context: { globalStorageUri: { fsPath: string } } | { storageUri: { fsPath: string } }): string {
  if ('globalStorageUri' in context) {
    const dir = context.globalStorageUri.fsPath;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return pathLib.join(dir, DB_FILENAME);
  }
  if ('storageUri' in context) {
    const dir = context.storageUri.fsPath;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return pathLib.join(dir, DB_FILENAME);
  }
  return pathLib.join(process.cwd(), DB_FILENAME);
}

// ── Storage ─────────────────────────────────────────────────

export class Storage {
  private db: CompatDB;

  private constructor(db: CompatDB) {
    this.db = db;
    this.initTables();
    // Persist schema to disk immediately (no-op for :memory:)
    this.db.save();
  }

  /** Create a Storage instance backed by sql.js (Node 20+ compatible). */
  static async create(dbPath?: string): Promise<Storage> {
    const filePath = dbPath || ':memory:';
    const compatDb = await CompatDB.open(filePath);
    const storage = new Storage(compatDb);
    // Persist schema to disk immediately (no-op for :memory:)
    compatDb.save();
    return storage;
  }

  static async forExtension(context: { globalStorageUri: { fsPath: string } }): Promise<Storage> {
    return Storage.create(getDbPath(context));
  }

  private initTables(): void {
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

      CREATE TABLE IF NOT EXISTS subagent_links (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        dispatchTurnId TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        dispatchToolCallId TEXT NOT NULL,
        subagentSessionId TEXT NOT NULL,
        subagentType TEXT,
        subagentName TEXT,
        dispatchContent TEXT,
        status TEXT DEFAULT 'completed',
        subagentTokens INTEGER DEFAULT 0,
        subagentLatencyMs INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(sessionId);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_turn ON tool_calls(turnId);
      CREATE INDEX IF NOT EXISTS idx_skill_events_turn ON skill_events(turnId);
      CREATE INDEX IF NOT EXISTS idx_sessions_taskId ON sessions(taskId);
      CREATE INDEX IF NOT EXISTS idx_subagent_links_session ON subagent_links(sessionId);
      CREATE INDEX IF NOT EXISTS idx_subagent_links_turn ON subagent_links(dispatchTurnId);
    `);

    // ── Migrate existing databases: add columns that may not exist ──
    this.migrateColumns();
  }

  private migrateColumns(): void {
    const cols = this.db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const colNames = new Set(cols.map(c => c.name));
    if (!colNames.has('sourceType')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN sourceType TEXT');
    }
    if (!colNames.has('lastSyncedAt')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN lastSyncedAt TEXT');
    }
  }

  // ── Write ──────────────────────────────────────────────

  insertSession(session: SessionRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, taskId, label, query, framework, model, startTime, endTime,
        totalTokens, totalInputTokens, totalOutputTokens, totalReasoningTokens,
        totalCacheReadTokens, totalCacheWriteTokens, totalCost, totalLatencyMs,
        totalToolCallCount, totalLlmCallCount, totalSkillLoadCount, totalSubagentCount,
        sourcePath, sourceType, lastSyncedAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id, session.taskId, session.label, session.query, session.framework,
      session.model, session.startTime, session.endTime,
      session.totalTokens, session.totalInputTokens, session.totalOutputTokens,
      session.totalReasoningTokens, session.totalCacheReadTokens, session.totalCacheWriteTokens,
      session.totalCost, session.totalLatencyMs,
      session.totalToolCallCount, session.totalLlmCallCount,
      session.totalSkillLoadCount, session.totalSubagentCount,
      session.sourcePath, session.sourceType, session.lastSyncedAt, session.createdAt
    );
    // No auto-save here — called in batches within importSessionData
  }

  insertTurn(turn: TurnRow & { sessionId: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO turns (id, sessionId, turnIndex, role, content, contentSummary,
        totalTokens, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens,
        contextWindowPct, inputMessagesTokens, agentName, subagentName, subagentSessionId,
        isSubagent, model, latencyMs, createdAt_ts, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      turn.id, turn.sessionId, turn.turnIndex, turn.role, turn.content, turn.contentSummary,
      turn.totalTokens, turn.inputTokens, turn.outputTokens, turn.reasoningTokens,
      turn.cacheReadTokens, turn.cacheWriteTokens,
      turn.contextWindowPct ?? null, turn.inputMessagesTokens,
      turn.agentName, turn.subagentName, turn.subagentSessionId,
      turn.isSubagent ? 1 : 0, turn.model, turn.latencyMs,
      turn.createdAt_ts, turn.completedAt
    );
    // No auto-save here — called in batches within importSessionData
  }

  insertToolCall(tc: ToolCallRow & { turnId: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO tool_calls (id, turnId, toolCallId, toolName, argsJson, resultJson,
        state, errorType, errorMessage, durationMs, isSkillRelated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      tc.id, tc.turnId, tc.toolCallId, tc.toolName, tc.argsJson, tc.resultJson,
      tc.state, tc.errorType ?? null, tc.errorMessage ?? null,
      tc.durationMs, tc.isSkillRelated ? 1 : 0
    );
    // No auto-save here — called in batches within importSessionData
  }

  insertSkillEvent(se: SkillEventRow & { turnId: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO skill_events (id, turnId, skillName, skillVersion, eventType, success, durationMs)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(se.id, se.turnId, se.skillName, se.skillVersion ?? null, se.eventType, se.success ? 1 : 0, se.durationMs);
    // No auto-save here — called in batches within importSessionData
  }

  insertSubagentLink(link: SubagentLinkRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO subagent_links (id, sessionId, dispatchTurnId, dispatchToolCallId,
        subagentSessionId, subagentType, subagentName, dispatchContent,
        status, subagentTokens, subagentLatencyMs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      link.id, link.sessionId, link.dispatchTurnId, link.dispatchToolCallId,
      link.subagentSessionId, link.subagentType, link.subagentName, link.dispatchContent,
      link.status, link.subagentTokens, link.subagentLatencyMs
    );
  }

  getSubagentLinks(sessionId: string): SubagentLinkRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM subagent_links WHERE sessionId = ? ORDER BY dispatchTurnId ASC'
    ).all(sessionId) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: r.id as string,
      sessionId: r.sessionId as string,
      dispatchTurnId: r.dispatchTurnId as string,
      dispatchToolCallId: r.dispatchToolCallId as string,
      subagentSessionId: r.subagentSessionId as string,
      subagentType: r.subagentType as string | null,
      subagentName: r.subagentName as string | null,
      dispatchContent: r.dispatchContent as string | null,
      status: r.status as string,
      subagentTokens: r.subagentTokens as number,
      subagentLatencyMs: r.subagentLatencyMs as number,
    }));
  }

  // ── Batch write ───────────────────────────────────────

  importSessionData(
    session: SessionRow,
    turns: TurnRow[],
    toolCalls: ToolCallRow[],
    skillEvents: SkillEventRow[]
  ): void {
    this.db.prepare('BEGIN').run();
    try {
      // Delete old session data if re-importing (CASCADE removes turns, tool_calls, skill_events)
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
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
    } catch (e) {
      this.db.prepare('ROLLBACK').run();
      throw e;
    }
  }

  // ── Query: session list ────────────────────────────────

  listSessions(): SessionListItem[] {
    const rows = this.db.prepare(`
      SELECT s.id, s.taskId, s.label, s.query, s.framework, s.model,
             s.totalTokens, s.totalCost, s.totalLatencyMs, s.sourcePath, s.lastSyncedAt, s.createdAt,
             (SELECT COUNT(*) FROM turns t WHERE t.sessionId = s.id) as turnCount
      FROM sessions s
      ORDER BY s.createdAt DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map(r => ({
      id: r.id as string,
      taskId: r.taskId as string,
      label: r.label as string | null,
      query: r.query as string | null,
      framework: r.framework as string,
      model: r.model as string | null,
      totalTokens: r.totalTokens as number,
      totalCost: r.totalCost as number,
      totalLatencyMs: r.totalLatencyMs as number,
      turnCount: r.turnCount as number,
      sourcePath: r.sourcePath as string | null,
      lastSyncedAt: r.lastSyncedAt as string | null,
      createdAt: r.createdAt as string,
    }));
  }

  // ── Query: session detail ─────────────────────────────

  getSession(id: string): SessionRow | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapSessionRow(row);
  }

  getTurnsWithDetails(sessionId: string): TurnDetailWithToolCalls[] {
    const turns = this.db.prepare(`
      SELECT * FROM turns WHERE sessionId = ? ORDER BY turnIndex ASC
    `).all(sessionId) as Array<Record<string, unknown>>;

    return turns.map(t => {
      const turnId = t.id as string;
      const toolCalls = this.db.prepare(
        'SELECT toolCallId, toolName, argsJson, resultJson, state, errorType, durationMs, isSkillRelated FROM tool_calls WHERE turnId = ?'
      ).all(turnId) as Array<Record<string, unknown>>;

      const skillEvents = this.db.prepare(
        'SELECT skillName, skillVersion, eventType, success, durationMs FROM skill_events WHERE turnId = ?'
      ).all(turnId) as Array<Record<string, unknown>>;

      return {
        ...this.mapTurnRow(t),
        toolCalls: toolCalls.map(tc => ({
          toolCallId: tc.toolCallId as string,
          toolName: tc.toolName as string,
          argsJson: tc.argsJson as string | null,
          resultJson: tc.resultJson as string | null,
          state: tc.state as string,
          errorType: tc.errorType as string | null,
          isSkillRelated: (tc.isSkillRelated as number) === 1,
          durationMs: tc.durationMs as number,
        })),
        skillEvents: skillEvents.map(se => ({
          skillName: se.skillName as string,
          skillVersion: se.skillVersion as number | null,
          eventType: se.eventType as string,
          success: (se.success as number) === 1,
          durationMs: se.durationMs as number,
        })),
      };
    });
  }

  getSessionDetail(id: string): SessionDetailData | null {
    const session = this.getSession(id);
    if (!session) return null;
    const turns = this.getTurnsWithDetails(id);
    const bridges = this.getSubagentLinks(id);
    return { session, turns, bridges: bridges.length > 0 ? bridges : undefined };
  }

  // ── Delete ─────────────────────────────────────────────

  deleteSession(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    this.db.save();
    return result.changes > 0;
  }

  // ── Check existence ───────────────────────────────────

  sessionExists(taskId: string, framework: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM sessions WHERE taskId = ? AND framework = ? LIMIT 1'
    ).get(taskId, framework);
    return row !== undefined;
  }

  // ── Sync ───────────────────────────────────────────────

  getMaxTurnIndex(sessionId: string): number {
    const row = this.db.prepare(
      'SELECT COALESCE(MAX(turnIndex), -1) as maxIdx FROM turns WHERE sessionId = ?'
    ).get(sessionId) as { maxIdx: number } | undefined;
    return row?.maxIdx ?? -1;
  }

  syncSessionData(
    sessionId: string,
    aggregates: SessionAggregates,
    newTurns: TurnRow[],
    newToolCalls: ToolCallRow[],
    newSkillEvents: SkillEventRow[]
  ): void {
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
          endTime = COALESCE(?, endTime), model = COALESCE(?, model),
          lastSyncedAt = ?
        WHERE id = ?
      `);
      updateStmt.run(
        aggregates.totalTokens, aggregates.totalInputTokens, aggregates.totalOutputTokens,
        aggregates.totalReasoningTokens, aggregates.totalCacheReadTokens, aggregates.totalCacheWriteTokens,
        aggregates.totalCost, aggregates.totalLatencyMs,
        aggregates.totalToolCallCount, aggregates.totalLlmCallCount,
        aggregates.totalSkillLoadCount, aggregates.totalSubagentCount,
        aggregates.endTime, aggregates.model,
        now, sessionId
      );

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
    } catch (e) {
      this.db.prepare('ROLLBACK').run();
      throw e;
    }
  }

  updateSyncTimestamp(sessionId: string, timestamp: string): void {
    this.db.prepare('UPDATE sessions SET lastSyncedAt = ? WHERE id = ?').run(timestamp, sessionId);
    this.db.save();
  }

  // ── Lifecycle ──────────────────────────────────────────

  close(): void {
    this.db.save();
    this.db.close();
  }

  // ── Helpers ────────────────────────────────────────────

  private mapSessionRow(r: Record<string, unknown>): SessionRow {
    return {
      id: r.id as string,
      taskId: r.taskId as string,
      label: r.label as string | null,
      query: r.query as string | null,
      framework: r.framework as string,
      model: r.model as string | null,
      startTime: r.startTime as string,
      endTime: r.endTime as string | null,
      totalTokens: r.totalTokens as number,
      totalInputTokens: r.totalInputTokens as number,
      totalOutputTokens: r.totalOutputTokens as number,
      totalReasoningTokens: r.totalReasoningTokens as number,
      totalCacheReadTokens: r.totalCacheReadTokens as number,
      totalCacheWriteTokens: r.totalCacheWriteTokens as number,
      totalCost: r.totalCost as number,
      totalLatencyMs: r.totalLatencyMs as number,
      totalToolCallCount: r.totalToolCallCount as number,
      totalLlmCallCount: r.totalLlmCallCount as number,
      totalSkillLoadCount: r.totalSkillLoadCount as number,
      totalSubagentCount: r.totalSubagentCount as number,
      sourcePath: r.sourcePath as string | null,
      sourceType: r.sourceType as string | null,
      lastSyncedAt: r.lastSyncedAt as string | null,
      createdAt: r.createdAt as string,
    };
  }

  private mapTurnRow(r: Record<string, unknown>): TurnDetailRow {
    return {
      id: r.id as string,
      turnIndex: r.turnIndex as number,
      role: r.role as string,
      content: r.content as string | null,
      contentSummary: r.contentSummary as string | null,
      totalTokens: r.totalTokens as number,
      inputTokens: r.inputTokens as number,
      outputTokens: r.outputTokens as number,
      reasoningTokens: r.reasoningTokens as number,
      cacheReadTokens: r.cacheReadTokens as number,
      cacheWriteTokens: r.cacheWriteTokens as number,
      contextWindowPct: r.contextWindowPct as number | null,
      inputMessagesTokens: r.inputMessagesTokens as number,
      agentName: r.agentName as string | null,
      subagentName: r.subagentName as string | null,
      subagentSessionId: r.subagentSessionId as string | null,
      isSubagent: (r.isSubagent as number) === 1,
      model: r.model as string | null,
      latencyMs: r.latencyMs as number,
      createdAt_ts: r.createdAt_ts as string | null,
    };
  }
}
