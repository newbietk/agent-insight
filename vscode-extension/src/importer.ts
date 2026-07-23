import { readSession, listSessions as listClaudeSessions, listSubagentSessions, collectSubagentToolUseMappings, extractSessionTitle } from './core/claude-jsonl';
import { readSession as opencodeReadSession, listSessions as opencodeListSessions, getSessionTitle, listChildSessionIds } from './core/opencode-db';
import { normalize } from './core/normalize';
import { splitIntoTurns } from './core/turn-split';
import type { TurnRow, ToolCallRow, SkillEventRow } from './core/turn-split';
import type { RawInteraction } from './core/types';
import { Storage } from './storage/db';
import type { SessionRow, SessionAggregates, SubagentLinkRow } from './storage/db';
import { t } from './i18n';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface ImportResult {
  sessionId: string;
  taskId: string;
  label: string | null;
  turns: number;
  toolCalls: number;
  skillEvents: number;
  totalTokens: number;
  totalCost: number;
  model: string | null;
}

export interface SyncResult {
  sessionId: string;
  taskId: string;
  newTurnCount: number;
  totalTurnCount: number;
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `s${ts}${rand}`;
}

function formatCost(cost: number): number {
  return Math.round(cost * 10000) / 10000;
}

/** Compute session-level aggregates from parsed turns. */
function computeAggregates(turns: TurnRow[], toolCalls: ToolCallRow[], skillEvents: SkillEventRow[]) {
  let totalTokens = 0, totalInputTokens = 0, totalOutputTokens = 0;
  let totalReasoningTokens = 0, totalCacheReadTokens = 0, totalCacheWriteTokens = 0;
  let totalCost = 0, totalLatencyMs = 0, totalLlmCallCount = 0;

  const startTime = turns.length > 0 && turns[0].createdAt_ts
    ? turns[0].createdAt_ts : new Date().toISOString();
  let endTime: string | null = null;

  let model: string | null = null;

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
      if (!endTime || turn.completedAt > endTime) endTime = turn.completedAt;
    }
    if (!model && turn.model) model = turn.model;
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

/**
 * Merge subagent JSONL interactions into the parent session's interaction stream.
 * Mirrors the parent project's data-service.ts subagent merge logic.
 * Subagent interactions are annotated with subagent_session_id/subagent_name/subagent_type
 * so they flow through normalize→turn-split as part of the parent session.
 */
function mergeSubagentInteractions(
  rawInteractions: RawInteraction[],
  sourcePath: string,
  taskId: string,
): RawInteraction[] {
  const merged = [...rawInteractions];

  const subagentFiles = listSubagentSessions(sourcePath, taskId);
  if (subagentFiles.length === 0) return merged;

  for (const sub of subagentFiles) {
    // Read .meta.json for subagent metadata (name, type)
    const metaPath = sub.filePath.replace('.jsonl', '.meta.json');
    let subName: string | null = null;
    let subType: string | null = null;
    try {
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        subName = meta.name || meta.agentType || meta.description || null;
        subType = meta.agentType || null;
      }
    } catch { /* ignore */ }

    // Read subagent JSONL and annotate interactions
    const subInteractions = readSession(sub.filePath, sub.id);
    for (const interaction of subInteractions) {
      interaction.subagent_session_id = sub.id;
      if (subName) interaction.subagent_name = subName;
      if (subType) interaction.subagent_type = subType;
    }

    merged.push(...subInteractions);
  }

  return merged;
}

/** Shared pipeline: raw interactions → normalize → turn-split → storage write. */
function pipelineImport(
  storage: Storage,
  rawInteractions: RawInteraction[],
  sourceType: string,
  framework: string,
  taskId: string,
  sourcePath: string,
  title?: string | null,
): ImportResult | null {
  if (rawInteractions.length === 0) return null;

  const normalized = normalize(rawInteractions, sourceType);
  const { turns, toolCalls, skillEvents } = splitIntoTurns(normalized, taskId);

  const agg = computeAggregates(turns, toolCalls, skillEvents);

  const sessionId = generateId();
  const firstUserTurn = turns.find(t => t.role === 'user');
  const firstQuery = firstUserTurn?.content?.substring(0, 200) ?? null;
  const session: SessionRow = {
    ...agg,
    id: sessionId,
    taskId,
    // Prefer agent-generated title over first user query for display label
    label: title || (firstUserTurn?.contentSummary ?? null),
    query: firstQuery,
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
function buildSubagentLinks(
  storage: Storage,
  rawInteractions: RawInteraction[],
  sourceType: string,
  sessionId: string,
  sourcePath: string,
  turns: TurnRow[],
  toolCalls: ToolCallRow[],
): void {
  // Build a map: toolCallId → turnId
  const tcIdToTurnId = new Map<string, string>();
  for (const tc of toolCalls) {
    tcIdToTurnId.set(tc.toolCallId, tc.turnId);
  }

  // Build a map: turnId → TurnRow
  const turnMap = new Map<string, TurnRow>();
  for (const t of turns) {
    turnMap.set(t.id, t);
  }

  // Build subagent mappings: toolCallId → subagentSessionId
  // For Claude Code JSONL: read from .meta.json files in the subagents directory
  // For OpenCode DB: extract from raw interaction tool call args (metadata.sessionId)
  const subagentMappings = new Map<string, string>();

  if (sourceType === 'claude-jsonl') {
    const parentDir = path.dirname(sourcePath);
    const taskId = path.basename(sourcePath, '.jsonl');
    for (const [k, v] of collectSubagentToolUseMappings(parentDir, taskId)) {
      subagentMappings.set(k, v);
    }
  } else if (sourceType === 'opencode-db') {
    // OpenCode stores subagent dispatch metadata in tool part state.
    // _readSession extracts this as subagent_session_id in the merged args.
    for (const interaction of rawInteractions) {
      if (interaction.role !== 'assistant' || !interaction.tool_calls) continue;
      for (const tc of interaction.tool_calls) {
        if (!SUBAGENT_DISPATCH_TOOLS.has(tc.toolName)) continue;
        try {
          if (tc.argsJson) {
            const args = JSON.parse(tc.argsJson);
            if (args.subagent_session_id) {
              subagentMappings.set(tc.toolCallId, args.subagent_session_id as string);
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }

  if (subagentMappings.size === 0) return;

  // Iterate raw interactions to find Agent/Task dispatches
  for (const interaction of rawInteractions) {
    if (interaction.role !== 'assistant' || !interaction.tool_calls) continue;

    for (const tc of interaction.tool_calls) {
      if (!SUBAGENT_DISPATCH_TOOLS.has(tc.toolName)) continue;

      const subagentSessionId = subagentMappings.get(tc.toolCallId);
      if (!subagentSessionId) continue;

      const turnId = tcIdToTurnId.get(tc.toolCallId);
      if (!turnId) continue;

      // Extract subagent type and name from args
      let subagentType: string | null = null;
      let subagentName: string | null = null;
      let dispatchContent: string | null = null;
      try {
        if (tc.argsJson) {
          const args = JSON.parse(tc.argsJson);
          subagentType = args.subagent_type || args.agent_type || args.type || null;
          subagentName = args.subagent_name || args.agent_name || args.name || args.description || null;
          dispatchContent = args.prompt || args.description || args.instruction || null;
        }
      } catch { /* ignore parse errors */ }

      // Compute aggregate tokens from subagent turns
      const subTurns = turns.filter(t => t.subagentSessionId === subagentSessionId);
      let subagentTokens = 0;
      let subagentLatencyMs = 0;
      for (const st of subTurns) {
        subagentTokens += st.totalTokens;
        subagentLatencyMs += st.latencyMs;
      }

      const link: SubagentLinkRow = {
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
export function importJsonlFile(
  storage: Storage,
  filePath: string,
): ImportResult | null {
  const taskId = filePath.replace(/\\/g, '/').split('/').pop()?.replace('.jsonl', '') ?? 'unknown';

  if (storage.sessionExists(taskId, 'claude-code')) {
    throw new Error(t('import.error.alreadyImported', taskId));
  }

  const rawInteractions = readSession(filePath, taskId);
  // Merge subagent interactions into the parent stream
  const mergedInteractions = mergeSubagentInteractions(rawInteractions, filePath, taskId);
  const title = extractSessionTitle(filePath);
  return pipelineImport(storage, mergedInteractions, 'claude-jsonl', 'claude-code', taskId, filePath, title);
}

/**
 * Import a single OpenCode session into storage.
 * Returns the import result or null if the session has no messages.
 *
 * Subagent sessions are NOT imported independently — they are discovered
 * via parent_id and their interactions are merged into the parent session.
 */
export async function importOpenCodeSession(
  storage: Storage,
  dbPath: string,
  sessionId: string,
): Promise<ImportResult | null> {
  if (storage.sessionExists(sessionId, 'opencode')) {
    throw new Error(t('import.error.alreadyImported', sessionId));
  }

  const rawInteractions = await opencodeReadSession(dbPath, sessionId);

  // Merge subagent interactions for OpenCode: find child sessions
  // (WHERE parent_id = sessionId) and merge their interactions into the
  // parent stream with subagent annotations already set by readSession.
  const childIds = await listChildSessionIds(dbPath, sessionId);
  if (childIds.length > 0) {
    for (const childId of childIds) {
      const childInteractions = await opencodeReadSession(dbPath, childId);
      // readSession already annotates child interactions with
      // subagent_session_id / subagent_name / subagent_type
      rawInteractions.push(...childInteractions);
    }
  }

  const title = await getSessionTitle(dbPath, sessionId);
  return pipelineImport(storage, rawInteractions, 'opencode-db', 'opencode', sessionId, dbPath, title);
}

/**
 * List OpenCode sessions from a database file.
 */
export async function listOpenCodeSessions(dbPath: string): Promise<Array<{ id: string; label: string | null; model: string | null }>> {
  const sessions = await opencodeListSessions(dbPath);
  return sessions.map(s => ({
    id: s.id,
    label: (s.title || s.firstQuery)?.substring(0, 100) ?? null,
    model: s.modelName,
  }));
}

/**
 * Scan a directory for Claude Code JSONL files and return their session listings.
 */
export function scanClaudeSessions(dirPath: string): Array<{ taskId: string; label: string | null; model: string | null }> {
  const sessions = listClaudeSessions(dirPath);
  return sessions.map(s => ({
    taskId: s.id,
    label: (s.title || s.firstQuery)?.substring(0, 100) ?? null,
    model: s.modelName,
  }));
}

/** Compute aggregates using the importer's aggregate helper. */
export function computeSessionAggregates(
  turns: TurnRow[],
  toolCalls: ToolCallRow[],
  skillEvents: SkillEventRow[],
): SessionAggregates {
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
export async function syncSession(storage: Storage, sessionId: string): Promise<SyncResult> {
  const session = storage.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (!session.sourcePath) throw new Error('No source path stored for this session — cannot sync');

  const sourceType = session.sourceType ?? (
    session.framework === 'opencode' ? 'opencode-db'
    : session.framework === 'claude-code' ? 'claude-jsonl'
    : session.framework
  );

  // 1. Full re-read from source
  let rawInteractions: RawInteraction[];
  if (sourceType === 'opencode-db') {
    rawInteractions = await opencodeReadSession(session.sourcePath, session.taskId);
    // Merge subagent interactions for OpenCode sessions
    const childIds = await listChildSessionIds(session.sourcePath, session.taskId);
    if (childIds.length > 0) {
      for (const childId of childIds) {
        const childInteractions = await opencodeReadSession(session.sourcePath, childId);
        rawInteractions.push(...childInteractions);
      }
    }
  } else {
    rawInteractions = readSession(session.sourcePath, session.taskId);
    // Merge subagent interactions for Claude Code sessions
    if (sourceType === 'claude-jsonl') {
      rawInteractions = mergeSubagentInteractions(rawInteractions, session.sourcePath, session.taskId);
    }
  }

  if (rawInteractions.length === 0) {
    storage.updateSyncTimestamp(sessionId, new Date().toISOString());
    return { sessionId, taskId: session.taskId, newTurnCount: 0, totalTurnCount: 0 };
  }

  // 2. Full pipeline
  const normalized = normalize(rawInteractions, sourceType);
  const { turns, toolCalls, skillEvents } = splitIntoTurns(normalized, session.taskId);

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
