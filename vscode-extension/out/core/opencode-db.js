"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSessions = listSessions;
exports.listChildSessionIds = listChildSessionIds;
exports.getSessionTitle = getSessionTitle;
exports.readSession = readSession;
const compat_db_1 = require("../storage/compat-db");
// ── SQLite parameter limit safe-guard ───────────────────────
/** Maximum number of host parameters per prepared statement (SQLite default). */
const SQLITE_MAX_VARIABLE_NUMBER = 999;
/**
 * Execute a query with an IN clause that may exceed SQLite's parameter limit.
 * Chunks the IDs array into batches of 999 and merges results.
 *
 * @param db      The CompatDB connection
 * @param prefix  SQL before the IN parentheses, e.g. `SELECT * FROM t WHERE col IN (`
 * @param suffix  SQL after the IN parentheses, e.g. `) ORDER BY time_created`
 * @param ids     The array of values to bind into the IN clause
 * @returns       Merged result array from all batches
 */
function batchInQuery(db, prefix, suffix, ids) {
    const results = [];
    for (let offset = 0; offset < ids.length; offset += SQLITE_MAX_VARIABLE_NUMBER) {
        const chunk = ids.slice(offset, offset + SQLITE_MAX_VARIABLE_NUMBER);
        const placeholders = chunk.map(() => '?').join(',');
        const sql = `${prefix}${placeholders}${suffix}`;
        results.push(...db.prepare(sql).all(...chunk));
    }
    return results;
}
// ── Session listing ────────────────────────────────────────
async function listSessions(dbPath) {
    let db;
    try {
        db = await compat_db_1.CompatDB.open(dbPath, { readOnly: true });
    }
    catch {
        return [];
    }
    try {
        const allSessions = db.prepare('SELECT id, title, version, time_created FROM session WHERE parent_id IS NULL OR parent_id = \'\' ORDER BY time_created DESC').all();
        // Filter out subagent sessions whose titles match known OpenCode subagent patterns.
        // In some OpenCode versions parent_id may not be reliably set, so we also filter
        // by title as a safety net. Subagent titles typically look like "@(Explore) subagent",
        // "@(Plan) subagent", etc. — they should never appear as standalone importable sessions.
        const sessions = allSessions.filter(s => {
            if (!s.title)
                return true;
            return !/\bsubagent\b/i.test(s.title);
        });
        if (sessions.length === 0)
            return [];
        const sessionIds = sessions.map(s => s.id);
        const msgCounts = batchInQuery(db, 'SELECT session_id, COUNT(*) as cnt FROM message WHERE session_id IN (', ') GROUP BY session_id', sessionIds);
        const countBySession = new Map();
        for (const c of msgCounts) {
            countBySession.set(c.session_id, c.cnt);
        }
        // Load all messages for these sessions, filter by role in JS (avoid sql.js json_extract compat)
        const allMsgs = batchInQuery(db, 'SELECT session_id, id, data FROM message WHERE session_id IN (', ') ORDER BY time_created', sessionIds);
        const firstUserMsgBySession = new Map();
        const userMsgDataBySession = new Map();
        const assistantMsgBySession = new Map();
        for (const m of allMsgs) {
            try {
                const md = JSON.parse(m.data);
                if (md.role === 'user') {
                    if (!firstUserMsgBySession.has(m.session_id)) {
                        firstUserMsgBySession.set(m.session_id, m.id);
                    }
                    if (!userMsgDataBySession.has(m.session_id)) {
                        userMsgDataBySession.set(m.session_id, { id: m.id, data: m.data });
                    }
                }
                else if (md.role === 'assistant' && !assistantMsgBySession.has(m.session_id)) {
                    assistantMsgBySession.set(m.session_id, { data: m.data });
                }
            }
            catch { /* skip */ }
        }
        // Get text parts for first user messages (filter in JS to avoid sql.js json_extract compat)
        const firstUserMsgIds = [...firstUserMsgBySession.values()];
        const textByMsgId = new Map();
        if (firstUserMsgIds.length > 0) {
            const allParts = batchInQuery(db, 'SELECT message_id, data FROM part WHERE message_id IN (', ') ORDER BY time_created', firstUserMsgIds);
            for (const p of allParts) {
                try {
                    const pd = JSON.parse(p.data);
                    if (pd.type !== 'text')
                        continue;
                    const text = pd.text || '';
                    if (!textByMsgId.has(p.message_id))
                        textByMsgId.set(p.message_id, []);
                    textByMsgId.get(p.message_id).push(text);
                }
                catch { /* skip */ }
            }
        }
        const result = [];
        for (const session of sessions) {
            let firstQuery = null;
            const userMsgData = userMsgDataBySession.get(session.id);
            if (userMsgData) {
                try {
                    const msgData = JSON.parse(userMsgData.data);
                    if (msgData.content && typeof msgData.content === 'string') {
                        firstQuery = msgData.content;
                    }
                    else {
                        const texts = textByMsgId.get(userMsgData.id) ?? [];
                        firstQuery = texts.join('\n').trim() || null;
                    }
                }
                catch { /* skip */ }
            }
            const turnCount = countBySession.get(session.id) ?? 0;
            let modelName = null;
            const assistantMsgData = assistantMsgBySession.get(session.id);
            if (assistantMsgData) {
                try {
                    const msgData = JSON.parse(assistantMsgData.data);
                    if (msgData.modelID) {
                        modelName = msgData.providerID && msgData.modelID
                            ? `${msgData.providerID}/${msgData.modelID}`
                            : msgData.modelID;
                    }
                    else if (msgData.model) {
                        modelName = msgData.model.providerID && msgData.model.modelID
                            ? `${msgData.model.providerID}/${msgData.model.modelID}`
                            : msgData.model.modelID || null;
                    }
                }
                catch { /* skip */ }
            }
            result.push({
                id: session.id,
                createdAt: new Date(session.time_created).toISOString(),
                firstQuery,
                title: session.title || null,
                turnCount,
                modelName,
                version: session.version,
            });
        }
        return result;
    }
    finally {
        db.close();
    }
}
// ── Subagent child discovery ────────────────────────────────
/** Return the session IDs of all direct child (subagent) sessions for a parent. */
async function listChildSessionIds(dbPath, parentSessionId) {
    let db;
    try {
        db = await compat_db_1.CompatDB.open(dbPath, { readOnly: true });
    }
    catch {
        return [];
    }
    try {
        const rows = db.prepare('SELECT id FROM session WHERE parent_id = ?').all(parentSessionId);
        return rows.map(r => r.id);
    }
    finally {
        db.close();
    }
}
// ── Session reading ────────────────────────────────────────
/** Get the session title from an OpenCode database. */
async function getSessionTitle(dbPath, sessionId) {
    let db;
    try {
        db = await compat_db_1.CompatDB.open(dbPath, { readOnly: true });
    }
    catch {
        return null;
    }
    try {
        const row = db.prepare('SELECT title FROM session WHERE id = ?').get(sessionId);
        return row?.title || null;
    }
    catch {
        return null;
    }
    finally {
        db.close();
    }
}
async function readSession(dbPath, sessionId) {
    let db;
    try {
        db = await compat_db_1.CompatDB.open(dbPath, { readOnly: true });
    }
    catch {
        return [];
    }
    try {
        return _readSession(db, sessionId);
    }
    finally {
        db.close();
    }
}
function _readSession(db, sessionId) {
    const sessionRow = db.prepare('SELECT id, parent_id FROM session WHERE id = ?').get(sessionId);
    if (!sessionRow)
        return [];
    const isSubagent = sessionRow.parent_id && sessionRow.parent_id !== '';
    const subagentInfo = isSubagent ? db.prepare('SELECT id, title, parent_id FROM session WHERE id = ?').get(sessionId) : null;
    let subagent_name = null;
    if (subagentInfo) {
        const titleMatch = subagentInfo.title.match(/@\(\w+\)\s+subagent/);
        if (titleMatch) {
            subagent_name = titleMatch[1];
        }
        else {
            const agentFromTitle = subagentInfo.title.match(/@(\w+)/);
            if (agentFromTitle)
                subagent_name = agentFromTitle[1];
        }
    }
    const messages = db.prepare('SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created').all(sessionId);
    const msgIds = messages.map(m => m.id);
    if (msgIds.length === 0)
        return [];
    // Load all parts for these messages, filter by type in JS (avoid sql.js json_extract compat)
    const allPartRows = msgIds.length > 0 ? batchInQuery(db, 'SELECT message_id, data FROM part WHERE message_id IN (', ') ORDER BY time_created', msgIds) : [];
    const allTextParts = [];
    const allReasoningParts = [];
    const allToolParts = [];
    for (const p of allPartRows) {
        try {
            const pd = JSON.parse(p.data);
            if (pd.type === 'text')
                allTextParts.push(p);
            else if (pd.type === 'reasoning')
                allReasoningParts.push(p);
            else if (pd.type === 'tool')
                allToolParts.push(p);
        }
        catch { /* skip */ }
    }
    const textByMsg = new Map();
    for (const p of allTextParts) {
        try {
            const pd = JSON.parse(p.data);
            if (pd.text) {
                if (!textByMsg.has(p.message_id))
                    textByMsg.set(p.message_id, []);
                textByMsg.get(p.message_id).push(pd.text);
            }
        }
        catch { /* skip */ }
    }
    const reasoningByMsg = new Map();
    for (const p of allReasoningParts) {
        try {
            const pd = JSON.parse(p.data);
            if (pd.text) {
                if (!reasoningByMsg.has(p.message_id))
                    reasoningByMsg.set(p.message_id, []);
                reasoningByMsg.get(p.message_id).push(pd.text);
            }
        }
        catch { /* skip */ }
    }
    const toolCallsByMsg = new Map();
    for (const p of allToolParts) {
        try {
            const pd = JSON.parse(p.data);
            const callID = pd.callID || '';
            const toolName = pd.tool || '';
            const state = pd.state?.status || 'unknown';
            let argsJson = null;
            if (pd.input) {
                argsJson = JSON.stringify(pd.input);
            }
            else if (pd.state?.input) {
                const stateInput = pd.state.input;
                const mergedArgs = { ...stateInput };
                if (pd.state.metadata?.sessionId) {
                    mergedArgs.subagent_session_id = pd.state.metadata.sessionId;
                }
                if (pd.state.metadata?.model) {
                    mergedArgs.subagent_model = pd.state.metadata.model;
                }
                if (pd.state.title) {
                    mergedArgs.summary = pd.state.title;
                }
                argsJson = JSON.stringify(mergedArgs);
            }
            let resultJson = null;
            if (pd.output) {
                resultJson = typeof pd.output === 'string' ? pd.output : JSON.stringify(pd.output);
            }
            else if (pd.state?.output) {
                resultJson = typeof pd.state.output === 'string' ? pd.state.output : JSON.stringify(pd.state.output);
            }
            const tc = { toolCallId: callID, toolName, argsJson, resultJson, state };
            if (!toolCallsByMsg.has(p.message_id))
                toolCallsByMsg.set(p.message_id, []);
            toolCallsByMsg.get(p.message_id).push(tc);
        }
        catch { /* skip */ }
    }
    const result = [];
    for (const msg of messages) {
        try {
            const msgData = JSON.parse(msg.data);
            const role = msgData.role || 'unknown';
            const content = extractMessageContentBulk(msg.id, msgData, textByMsg, reasoningByMsg);
            const agent = msgData.agent || null;
            const timeInfo = msgData.time
                ? {
                    created: msgData.time.created ?? msg.time_created,
                    completed: msgData.time.completed ?? undefined,
                }
                : { created: msg.time_created };
            let latency = null;
            if (timeInfo.completed && timeInfo.created) {
                latency = timeInfo.completed - timeInfo.created;
            }
            let usage = null;
            if (msgData.tokens) {
                const input = msgData.tokens.input ?? 0;
                const cacheRead = msgData.tokens.cache?.read ?? 0;
                const cacheWrite = msgData.tokens.cache?.write ?? 0;
                usage = {
                    total: msgData.tokens.total ?? 0,
                    input,
                    output: msgData.tokens.output ?? 0,
                    reasoning: msgData.tokens.reasoning ?? 0,
                    cacheRead,
                    cacheWrite,
                    cost: msgData.cost ?? 0,
                    inputMessagesTokens: input + cacheRead + cacheWrite,
                };
            }
            let model = null;
            let modelID = null;
            let providerID = null;
            if (msgData.modelID) {
                modelID = msgData.modelID;
                providerID = msgData.providerID;
                model = providerID && modelID ? `${providerID}/${modelID}` : modelID;
            }
            else if (msgData.model) {
                providerID = msgData.model.providerID;
                modelID = msgData.model.modelID;
                model = providerID && modelID ? `${providerID}/${modelID}` : modelID;
            }
            const finish_reason = msgData.finish || null;
            const tool_calls = toolCallsByMsg.has(msg.id)
                ? toolCallsByMsg.get(msg.id)
                : null;
            result.push({
                role,
                content,
                timestamp: new Date(msg.time_created).toISOString(),
                timeInfo,
                agent,
                subagent_name: isSubagent ? subagent_name : null,
                subagent_session_id: isSubagent ? sessionId : null,
                subagent_type: null,
                tool_calls,
                usage,
                model,
                modelID,
                providerID,
                latency,
                finish_reason,
            });
        }
        catch {
            result.push({
                role: 'unknown',
                content: null,
                timestamp: new Date(msg.time_created).toISOString(),
                timeInfo: { created: msg.time_created },
                agent: null,
                subagent_name: null,
                subagent_session_id: null,
                subagent_type: null,
                tool_calls: null,
                usage: null,
                model: null,
                modelID: null,
                providerID: null,
                latency: null,
                finish_reason: null,
            });
        }
    }
    return result;
}
// ── Helpers ────────────────────────────────────────────────
function extractMessageContentBulk(messageId, msgData, textByMsg, reasoningByMsg) {
    // Handle plain string content (Claude Code style)
    if (msgData.content && typeof msgData.content === 'string') {
        return msgData.content;
    }
    // Handle structured content blocks array (OpenCode style)
    // e.g. [{type: "text", text: "..."}, {type: "tool_use", ...}, {type: "reasoning", text: "..."}]
    if (Array.isArray(msgData.content)) {
        const parts = [];
        const contentBlocks = msgData.content;
        for (const block of contentBlocks) {
            if (block.type === 'text' && block.text && typeof block.text === 'string') {
                parts.push(block.text);
            }
            else if (block.type === 'reasoning' && block.text && typeof block.text === 'string') {
                parts.push(`<thinking>${block.text}</thinking>`);
            }
        }
        if (parts.length > 0)
            return parts.join('\n\n');
    }
    const textContent = textByMsg.get(messageId) ?? [];
    const reasoningContent = reasoningByMsg.get(messageId) ?? [];
    const parts = [];
    if (reasoningContent.length > 0) {
        parts.push(`<thinking>${reasoningContent.join('\n')}</thinking>`);
    }
    if (textContent.length > 0) {
        parts.push(textContent.join('\n'));
    }
    return parts.length > 0 ? parts.join('\n\n') : null;
}
//# sourceMappingURL=opencode-db.js.map