"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFeedback = uploadFeedback;
const VERSION = '0.1.0';
/**
 * Export session data to an in-memory SQLite .db blob (portable format).
 */
async function exportSessionBlob(data) {
    // sql.js v1.x returns a Promise from initSqlJs(), must await
    const initSql = require('sql.js');
    const SQL = await initSql();
    const db = new SQL.Database();
    db.run(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY, taskId TEXT, label TEXT, query TEXT,
      framework TEXT, model TEXT, startTime TEXT, endTime TEXT,
      totalTokens INTEGER, totalInputTokens INTEGER, totalOutputTokens INTEGER,
      totalReasoningTokens INTEGER, totalCacheReadTokens INTEGER, totalCacheWriteTokens INTEGER,
      totalCost REAL, totalLatencyMs INTEGER,
      totalToolCallCount INTEGER, totalLlmCallCount INTEGER,
      totalSkillLoadCount INTEGER, totalSubagentCount INTEGER,
      sourcePath TEXT, createdAt TEXT
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS turn (
      id TEXT PRIMARY KEY, turnIndex INTEGER, role TEXT,
      content TEXT, contentSummary TEXT,
      totalTokens INTEGER, inputTokens INTEGER, outputTokens INTEGER,
      reasoningTokens INTEGER, cacheReadTokens INTEGER, cacheWriteTokens INTEGER,
      contextWindowPct REAL, inputMessagesTokens INTEGER,
      agentName TEXT, subagentName TEXT, isSubagent INTEGER,
      model TEXT, latencyMs INTEGER, createdAt_ts TEXT
    )
  `);
    const s = data.session;
    db.run(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        s.id, s.taskId, s.label, s.query, s.framework, s.model,
        s.startTime, s.endTime,
        s.totalTokens, s.totalInputTokens, s.totalOutputTokens,
        s.totalReasoningTokens, s.totalCacheReadTokens, s.totalCacheWriteTokens,
        s.totalCost, s.totalLatencyMs,
        s.totalToolCallCount, s.totalLlmCallCount,
        s.totalSkillLoadCount, s.totalSubagentCount,
        s.sourcePath, s.createdAt,
    ]);
    const insertTurn = db.prepare(`INSERT INTO turn VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const t of data.turns) {
        insertTurn.run([
            t.id, t.turnIndex, t.role,
            t.content, t.contentSummary,
            t.totalTokens, t.inputTokens, t.outputTokens,
            t.reasoningTokens, t.cacheReadTokens, t.cacheWriteTokens,
            t.contextWindowPct, t.inputMessagesTokens,
            t.agentName, t.subagentName, t.isSubagent ? 1 : 0,
            t.model, t.latencyMs, t.createdAt_ts,
        ]);
    }
    insertTurn.free();
    const buf = db.export();
    db.close();
    return buf;
}
/**
 * Upload session feedback to KirinAI Cloud.
 */
async function uploadFeedback(storage, sessionId, form, cloudUrl) {
    // 1. Get session detail from Storage
    const data = storage.getSessionDetail(sessionId);
    if (!data) {
        return { success: false, error: `Session not found: ${sessionId}` };
    }
    // 2. Export session to SQLite blob
    let sessionBlob;
    try {
        sessionBlob = await exportSessionBlob(data);
    }
    catch (err) {
        return { success: false, error: `Export failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    // 3. Build multipart form data (Web API FormData, available in Node.js 20+/VS Code 1.92+)
    const s = data.session;
    const formData = new FormData();
    formData.append('taskId', s.taskId);
    formData.append('issueType', form.issueType);
    formData.append('problemDescription', form.problemDescription);
    formData.append('helpRequest', form.helpRequest || '');
    if (form.contactEmail)
        formData.append('contactEmail', form.contactEmail);
    formData.append('framework', s.framework ?? 'unknown');
    formData.append('model', s.model ?? '');
    formData.append('totalTokens', String(s.totalTokens ?? 0));
    formData.append('totalCost', String(s.totalCost ?? 0));
    formData.append('turnCount', String(s.totalLlmCallCount ?? data.turns.length));
    formData.append('kirinaiVersion', VERSION);
    // Append session .db as Blob (Node.js 20+ built-in)
    const safeName = s.taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const blob = new Blob([sessionBlob], { type: 'application/octet-stream' });
    formData.append('sessionData', blob, `${safeName}.db`);
    // 4. POST to cloud — fetch auto-sets Content-Type for FormData body
    const url = cloudUrl.replace(/\/+$/, '') + '/api/submissions';
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(url, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { success: false, error: `${url} returned ${res.status}: ${text.substring(0, 200)}` };
        }
        const json = await res.json();
        // Cloud returns { id, status } — map to UploadResult format
        return {
            success: true,
            submissionId: json.id || json.submissionId,
            status: json.status,
        };
    }
    catch (err) {
        if (err?.name === 'AbortError') {
            return { success: false, error: `Request timed out after 15s — cloud server unreachable at ${url}` };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
    }
}
//# sourceMappingURL=upload.js.map