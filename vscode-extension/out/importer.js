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
exports.importJsonlFile = importJsonlFile;
exports.importOpenCodeSession = importOpenCodeSession;
exports.listOpenCodeSessions = listOpenCodeSessions;
exports.scanClaudeSessions = scanClaudeSessions;
exports.computeSessionAggregates = computeSessionAggregates;
exports.syncSession = syncSession;
const claude_jsonl_1 = require("./core/claude-jsonl");
const opencode_db_1 = require("./core/opencode-db");
const normalize_1 = require("./core/normalize");
const turn_split_1 = require("./core/turn-split");
const i18n_1 = require("./i18n");
const path = __importStar(require("node:path"));
function generateId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `s${ts}${rand}`;
}
function formatCost(cost) {
    return Math.round(cost * 10000) / 10000;
}
/** Compute session-level aggregates from parsed turns. */
function computeAggregates(turns, toolCalls, skillEvents) {
    let totalTokens = 0, totalInputTokens = 0, totalOutputTokens = 0;
    let totalReasoningTokens = 0, totalCacheReadTokens = 0, totalCacheWriteTokens = 0;
    let totalCost = 0, totalLatencyMs = 0, totalLlmCallCount = 0;
    const startTime = turns.length > 0 && turns[0].createdAt_ts
        ? turns[0].createdAt_ts : new Date().toISOString();
    let endTime = null;
    let model = null;
    for (const turn of turns) {
        totalTokens += turn.totalTokens;
        totalInputTokens += turn.inputTokens;
        totalOutputTokens += turn.outputTokens;
        totalReasoningTokens += turn.reasoningTokens;
        totalCacheReadTokens += turn.cacheReadTokens;
        totalCacheWriteTokens += turn.cacheWriteTokens;
        if (turn.role === 'assistant') {
            totalLatencyMs += turn.latencyMs;
            totalCost += turn.cost;
        }
        if (turn.role === 'assistant' && turn.totalTokens > 0) {
            totalLlmCallCount++;
        }
        if (turn.completedAt) {
            if (!endTime || turn.completedAt > endTime)
                endTime = turn.completedAt;
        }
        if (!model && turn.model)
            model = turn.model;
    }
    const uniqueSubIds = new Set(turns.filter(t => t.subagentSessionId).map(t => t.subagentSessionId));
    return {
        model,
        startTime,
        endTime,
        totalTokens, totalInputTokens, totalOutputTokens,
        totalReasoningTokens, totalCacheReadTokens, totalCacheWriteTokens,
        totalCost: formatCost(totalCost),
        totalLatencyMs,
        totalToolCallCount: toolCalls.length,
        totalLlmCallCount,
        totalSkillLoadCount: skillEvents.length,
        totalSubagentCount: uniqueSubIds.size,
    };
}
/** Shared pipeline: raw interactions → normalize → turn-split → storage write. */
function pipelineImport(storage, rawInteractions, sourceType, framework, taskId, sourcePath) {
    if (rawInteractions.length === 0)
        return null;
    const normalized = (0, normalize_1.normalize)(rawInteractions, sourceType);
    (0, turn_split_1.resetIdCounter)();
    const { turns, toolCalls, skillEvents } = (0, turn_split_1.splitIntoTurns)(normalized, taskId);
    const agg = computeAggregates(turns, toolCalls, skillEvents);
    const sessionId = generateId();
    const firstUserTurn = turns.find(t => t.role === 'user');
    const session = {
        ...agg,
        id: sessionId,
        taskId,
        label: firstUserTurn?.contentSummary ?? null,
        query: firstUserTurn?.content?.substring(0, 200) ?? null,
        framework,
        sourcePath,
        sourceType,
        lastSyncedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
    };
    storage.importSessionData(session, turns, toolCalls, skillEvents);
    // Build subagent links (bridges between dispatching turns and subagent sessions)
    buildSubagentLinks(storage, rawInteractions, sourceType, sessionId, sourcePath, turns, toolCalls);
    return {
        sessionId,
        taskId,
        label: session.label,
        turns: turns.length,
        toolCalls: toolCalls.length,
        skillEvents: skillEvents.length,
        totalTokens: agg.totalTokens,
        totalCost: agg.totalCost,
        model: agg.model,
    };
}
/** Agent/Task tool names that dispatch subagents. */
const SUBAGENT_DISPATCH_TOOLS = new Set(['Agent', 'Task', 'agent', 'task']);
/** Build subagent_links bridges from raw interactions and insert them into storage. */
function buildSubagentLinks(storage, rawInteractions, sourceType, sessionId, sourcePath, turns, toolCalls) {
    if (sourceType !== 'claude-jsonl')
        return; // OpenCode subagent handling TBD
    // Build a map: toolCallId → turnId
    const tcIdToTurnId = new Map();
    for (const tc of toolCalls) {
        tcIdToTurnId.set(tc.toolCallId, tc.turnId);
    }
    // Build a map: turnId → TurnRow
    const turnMap = new Map();
    for (const t of turns) {
        turnMap.set(t.id, t);
    }
    // Get subagent mappings for this session (toolUseId → subagentSessionId)
    const parentDir = path.dirname(sourcePath);
    const taskId = path.basename(sourcePath, '.jsonl');
    const subagentMappings = (0, claude_jsonl_1.collectSubagentToolUseMappings)(parentDir, taskId);
    if (subagentMappings.size === 0)
        return;
    // Iterate raw interactions to find Agent/Task dispatches
    for (const interaction of rawInteractions) {
        if (interaction.role !== 'assistant' || !interaction.tool_calls)
            continue;
        for (const tc of interaction.tool_calls) {
            if (!SUBAGENT_DISPATCH_TOOLS.has(tc.toolName))
                continue;
            const subagentSessionId = subagentMappings.get(tc.toolCallId);
            if (!subagentSessionId)
                continue;
            const turnId = tcIdToTurnId.get(tc.toolCallId);
            if (!turnId)
                continue;
            // Extract subagent type and name from args
            let subagentType = null;
            let subagentName = null;
            let dispatchContent = null;
            try {
                if (tc.argsJson) {
                    const args = JSON.parse(tc.argsJson);
                    subagentType = args.subagent_type || args.agent_type || args.type || null;
                    subagentName = args.subagent_name || args.agent_name || args.name || args.description || null;
                    dispatchContent = args.prompt || args.description || args.instruction || null;
                }
            }
            catch { /* ignore parse errors */ }
            // Compute aggregate tokens from subagent turns
            const subTurns = turns.filter(t => t.subagentSessionId === subagentSessionId);
            let subagentTokens = 0;
            let subagentLatencyMs = 0;
            for (const st of subTurns) {
                subagentTokens += st.totalTokens;
                subagentLatencyMs += st.latencyMs;
            }
            const link = {
                id: `sl_${sessionId}_${tc.toolCallId}`,
                sessionId,
                dispatchTurnId: turnId,
                dispatchToolCallId: tc.toolCallId,
                subagentSessionId,
                subagentType,
                subagentName,
                dispatchContent: dispatchContent?.substring(0, 500) ?? null,
                status: 'completed',
                subagentTokens,
                subagentLatencyMs,
            };
            storage.insertSubagentLink(link);
        }
    }
}
/**
 * Import a single Claude Code JSONL file into storage.
 * Returns the import result or null if the file is empty.
 */
function importJsonlFile(storage, filePath) {
    const taskId = filePath.replace(/\\/g, '/').split('/').pop()?.replace('.jsonl', '') ?? 'unknown';
    if (storage.sessionExists(taskId, 'claude-code')) {
        throw new Error((0, i18n_1.t)('import.error.alreadyImported', taskId));
    }
    const rawInteractions = (0, claude_jsonl_1.readSession)(filePath, taskId);
    return pipelineImport(storage, rawInteractions, 'claude-jsonl', 'claude-code', taskId, filePath);
}
/**
 * Import a single OpenCode session into storage.
 * Returns the import result or null if the session has no messages.
 */
async function importOpenCodeSession(storage, dbPath, sessionId) {
    if (storage.sessionExists(sessionId, 'opencode')) {
        throw new Error((0, i18n_1.t)('import.error.alreadyImported', sessionId));
    }
    const rawInteractions = await (0, opencode_db_1.readSession)(dbPath, sessionId);
    return pipelineImport(storage, rawInteractions, 'opencode-db', 'opencode', sessionId, dbPath);
}
/**
 * List OpenCode sessions from a database file.
 */
async function listOpenCodeSessions(dbPath) {
    const sessions = await (0, opencode_db_1.listSessions)(dbPath);
    return sessions.map(s => ({
        id: s.id,
        label: s.firstQuery?.substring(0, 100) ?? null,
        model: s.modelName,
    }));
}
/**
 * Scan a directory for Claude Code JSONL files and return their session listings.
 */
function scanClaudeSessions(dirPath) {
    const sessions = (0, claude_jsonl_1.listSessions)(dirPath);
    return sessions.map(s => ({
        taskId: s.id,
        label: s.firstQuery?.substring(0, 100) ?? null,
        model: s.modelName,
    }));
}
/** Compute aggregates using the importer's aggregate helper. */
function computeSessionAggregates(turns, toolCalls, skillEvents) {
    const agg = computeAggregates(turns, toolCalls, skillEvents);
    return {
        totalTokens: agg.totalTokens,
        totalInputTokens: agg.totalInputTokens,
        totalOutputTokens: agg.totalOutputTokens,
        totalReasoningTokens: agg.totalReasoningTokens,
        totalCacheReadTokens: agg.totalCacheReadTokens,
        totalCacheWriteTokens: agg.totalCacheWriteTokens,
        totalCost: agg.totalCost,
        totalLatencyMs: agg.totalLatencyMs,
        totalToolCallCount: agg.totalToolCallCount,
        totalLlmCallCount: agg.totalLlmCallCount,
        totalSkillLoadCount: agg.totalSkillLoadCount,
        totalSubagentCount: agg.totalSubagentCount,
        endTime: agg.endTime,
        model: agg.model,
    };
}
/**
 * Sync an already-imported session with its original source.
 * Re-reads the full source, runs the pipeline, and appends only new turns.
 */
async function syncSession(storage, sessionId) {
    const session = storage.getSession(sessionId);
    if (!session)
        throw new Error(`Session not found: ${sessionId}`);
    if (!session.sourcePath)
        throw new Error('No source path stored for this session — cannot sync');
    const sourceType = session.sourceType ?? (session.framework === 'opencode' ? 'opencode-db'
        : session.framework === 'claude-code' ? 'claude-jsonl'
            : session.framework);
    // 1. Full re-read from source
    let rawInteractions;
    if (sourceType === 'opencode-db') {
        rawInteractions = await (0, opencode_db_1.readSession)(session.sourcePath, session.taskId);
    }
    else {
        rawInteractions = (0, claude_jsonl_1.readSession)(session.sourcePath, session.taskId);
    }
    if (rawInteractions.length === 0) {
        storage.updateSyncTimestamp(sessionId, new Date().toISOString());
        return { sessionId, taskId: session.taskId, newTurnCount: 0, totalTurnCount: 0 };
    }
    // 2. Full pipeline
    const normalized = (0, normalize_1.normalize)(rawInteractions, sourceType);
    (0, turn_split_1.resetIdCounter)();
    const { turns, toolCalls, skillEvents } = (0, turn_split_1.splitIntoTurns)(normalized, session.taskId);
    // 3. Diff by turnIndex
    const maxIdx = storage.getMaxTurnIndex(sessionId);
    const newTurns = turns.filter(t => t.turnIndex > maxIdx);
    if (newTurns.length === 0) {
        storage.updateSyncTimestamp(sessionId, new Date().toISOString());
        return { sessionId, taskId: session.taskId, newTurnCount: 0, totalTurnCount: turns.length };
    }
    // 4. Compute aggregates from ALL turns
    const aggregates = computeSessionAggregates(turns, toolCalls, skillEvents);
    // 5. Filter toolCalls & skillEvents to only those belonging to new turns
    const newTurnIds = new Set(newTurns.map(t => t.id));
    const newToolCalls = toolCalls.filter(tc => newTurnIds.has(tc.turnId));
    const newSkillEvents = skillEvents.filter(se => newTurnIds.has(se.turnId));
    // 6. Write
    storage.syncSessionData(sessionId, aggregates, newTurns, newToolCalls, newSkillEvents);
    return { sessionId, taskId: session.taskId, newTurnCount: newTurns.length, totalTurnCount: turns.length };
}
//# sourceMappingURL=importer.js.map