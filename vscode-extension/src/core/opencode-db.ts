import { CompatDB } from '../storage/compat-db';
import type { SessionListItem, RawInteraction, ToolCallInfo, TokenUsage } from './types';

// ── Session listing ────────────────────────────────────────

export async function listSessions(dbPath: string): Promise<SessionListItem[]> {
  let db: CompatDB;
  try {
    db = await CompatDB.open(dbPath, { readOnly: true });
  } catch {
    return [];
  }

  try {
    const sessions = db.prepare(
      'SELECT id, title, version, time_created FROM session WHERE parent_id IS NULL OR parent_id = \'\' ORDER BY time_created DESC'
    ).all() as { id: string; title: string; version: string; time_created: number }[];

    if (sessions.length === 0) return [];

    const sessionIds = sessions.map(s => s.id);

    const msgCounts = db.prepare(
      `SELECT session_id, COUNT(*) as cnt FROM message WHERE session_id IN (${sessionIds.map(() => '?').join(',')}) GROUP BY session_id`
    ).all(...sessionIds) as { session_id: string; cnt: number }[];

    const countBySession = new Map<string, number>();
    for (const c of msgCounts) {
      countBySession.set(c.session_id, c.cnt);
    }

    // Load all messages for these sessions, filter by role in JS (avoid sql.js json_extract compat)
    const allMsgs = db.prepare(
      `SELECT session_id, id, data FROM message WHERE session_id IN (${sessionIds.map(() => '?').join(',')}) ORDER BY time_created`
    ).all(...sessionIds) as { session_id: string; id: string; data: string }[];

    const firstUserMsgBySession = new Map<string, string>();
    const userMsgDataBySession = new Map<string, { id: string; data: string }>();
    const assistantMsgBySession = new Map<string, { data: string }>();
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
        } else if (md.role === 'assistant' && !assistantMsgBySession.has(m.session_id)) {
          assistantMsgBySession.set(m.session_id, { data: m.data });
        }
      } catch { /* skip */ }
    }

    // Get text parts for first user messages (filter in JS to avoid sql.js json_extract compat)
    const firstUserMsgIds = [...firstUserMsgBySession.values()];
    const textByMsgId = new Map<string, string[]>();
    if (firstUserMsgIds.length > 0) {
      const allParts = db.prepare(
        `SELECT message_id, data FROM part WHERE message_id IN (${firstUserMsgIds.map(() => '?').join(',')}) ORDER BY time_created`
      ).all(...firstUserMsgIds) as { message_id: string; data: string }[];

      for (const p of allParts) {
        try {
          const pd = JSON.parse(p.data);
          if (pd.type !== 'text') continue;
          const text = pd.text || '';
          if (!textByMsgId.has(p.message_id)) textByMsgId.set(p.message_id, []);
          textByMsgId.get(p.message_id)!.push(text);
        } catch { /* skip */ }
      }
    }

    const result: SessionListItem[] = [];
    for (const session of sessions) {
      let firstQuery: string | null = null;
      const userMsgData = userMsgDataBySession.get(session.id);
      if (userMsgData) {
        try {
          const msgData = JSON.parse(userMsgData.data);
          if (msgData.content && typeof msgData.content === 'string') {
            firstQuery = msgData.content;
          } else {
            const texts = textByMsgId.get(userMsgData.id) ?? [];
            firstQuery = texts.join('\n').trim() || null;
          }
        } catch { /* skip */ }
      }

      const turnCount = countBySession.get(session.id) ?? 0;

      let modelName: string | null = null;
      const assistantMsgData = assistantMsgBySession.get(session.id);
      if (assistantMsgData) {
        try {
          const msgData = JSON.parse(assistantMsgData.data);
          if (msgData.modelID) {
            modelName = msgData.providerID && msgData.modelID
              ? `${msgData.providerID}/${msgData.modelID}`
              : msgData.modelID;
          } else if (msgData.model) {
            modelName = msgData.model.providerID && msgData.model.modelID
              ? `${msgData.model.providerID}/${msgData.model.modelID}`
              : msgData.model.modelID || null;
          }
        } catch { /* skip */ }
      }

      result.push({
        id: session.id,
        createdAt: new Date(session.time_created).toISOString(),
        firstQuery,
        turnCount,
        modelName,
        version: session.version,
      });
    }

    return result;
  } finally {
    db.close();
  }
}

// ── Session reading ────────────────────────────────────────

export async function readSession(dbPath: string, sessionId: string): Promise<RawInteraction[]> {
  let db: CompatDB;
  try {
    db = await CompatDB.open(dbPath, { readOnly: true });
  } catch {
    return [];
  }

  try {
    return _readSession(db, sessionId);
  } finally {
    db.close();
  }
}

function _readSession(db: CompatDB, sessionId: string): RawInteraction[] {
  const sessionRow = db.prepare(
    'SELECT id, parent_id FROM session WHERE id = ?'
  ).get(sessionId) as { id: string; parent_id: string | null } | undefined;

  if (!sessionRow) return [];

  const isSubagent = sessionRow.parent_id && sessionRow.parent_id !== '';

  const subagentInfo = isSubagent ? db.prepare(
    'SELECT id, title, parent_id FROM session WHERE id = ?'
  ).get(sessionId) as { id: string; title: string; parent_id: string } : null;

  let subagent_name: string | null = null;
  if (subagentInfo) {
    const titleMatch = subagentInfo.title.match(/@\(\w+\)\s+subagent/);
    if (titleMatch) {
      subagent_name = titleMatch[1];
    } else {
      const agentFromTitle = subagentInfo.title.match(/@(\w+)/);
      if (agentFromTitle) subagent_name = agentFromTitle[1];
    }
  }

  const messages = db.prepare(
    'SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created'
  ).all(sessionId) as { id: string; time_created: number; data: string }[];

  const msgIds = messages.map(m => m.id);
  if (msgIds.length === 0) return [];

  // Load all parts for these messages, filter by type in JS (avoid sql.js json_extract compat)
  const allPartRows = msgIds.length > 0 ? db.prepare(
    `SELECT message_id, data FROM part WHERE message_id IN (${msgIds.map(() => '?').join(',')}) ORDER BY time_created`
  ).all(...msgIds) as { message_id: string; data: string }[] : [];

  const allTextParts: { message_id: string; data: string }[] = [];
  const allReasoningParts: { message_id: string; data: string }[] = [];
  const allToolParts: { message_id: string; data: string }[] = [];
  for (const p of allPartRows) {
    try {
      const pd = JSON.parse(p.data);
      if (pd.type === 'text') allTextParts.push(p);
      else if (pd.type === 'reasoning') allReasoningParts.push(p);
      else if (pd.type === 'tool') allToolParts.push(p);
    } catch { /* skip */ }
  }

  const textByMsg = new Map<string, string[]>();
  for (const p of allTextParts) {
    try {
      const pd = JSON.parse(p.data);
      if (pd.text) {
        if (!textByMsg.has(p.message_id)) textByMsg.set(p.message_id, []);
        textByMsg.get(p.message_id)!.push(pd.text);
      }
    } catch { /* skip */ }
  }

  const reasoningByMsg = new Map<string, string[]>();
  for (const p of allReasoningParts) {
    try {
      const pd = JSON.parse(p.data);
      if (pd.text) {
        if (!reasoningByMsg.has(p.message_id)) reasoningByMsg.set(p.message_id, []);
        reasoningByMsg.get(p.message_id)!.push(pd.text);
      }
    } catch { /* skip */ }
  }

  const toolCallsByMsg = new Map<string, ToolCallInfo[]>();
  for (const p of allToolParts) {
    try {
      const pd = JSON.parse(p.data);
      const callID = pd.callID || '';
      const toolName = pd.tool || '';
      const state = pd.state?.status || 'unknown';

      let argsJson: string | null = null;
      if (pd.input) {
        argsJson = JSON.stringify(pd.input);
      } else if (pd.state?.input) {
        const stateInput = pd.state.input;
        const mergedArgs: Record<string, unknown> = { ...stateInput };
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

      let resultJson: string | null = null;
      if (pd.output) {
        resultJson = typeof pd.output === 'string' ? pd.output : JSON.stringify(pd.output);
      } else if (pd.state?.output) {
        resultJson = typeof pd.state.output === 'string' ? pd.state.output : JSON.stringify(pd.state.output);
      }

      const tc: ToolCallInfo = { toolCallId: callID, toolName, argsJson, resultJson, state };
      if (!toolCallsByMsg.has(p.message_id)) toolCallsByMsg.set(p.message_id, []);
      toolCallsByMsg.get(p.message_id)!.push(tc);
    } catch { /* skip */ }
  }

  const result: RawInteraction[] = [];

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

      let latency: number | null = null;
      if (timeInfo.completed && timeInfo.created) {
        latency = timeInfo.completed - timeInfo.created;
      }

      let usage: TokenUsage | null = null;
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

      let model: string | null = null;
      let modelID: string | null = null;
      let providerID: string | null = null;
      if (msgData.modelID) {
        modelID = msgData.modelID;
        providerID = msgData.providerID;
        model = providerID && modelID ? `${providerID}/${modelID}` : modelID;
      } else if (msgData.model) {
        providerID = msgData.model.providerID;
        modelID = msgData.model.modelID;
        model = providerID && modelID ? `${providerID}/${modelID}` : modelID;
      }

      const finish_reason = msgData.finish || null;

      const tool_calls = toolCallsByMsg.has(msg.id)
        ? toolCallsByMsg.get(msg.id)!
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
    } catch {
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

function extractMessageContentBulk(
  messageId: string,
  msgData: Record<string, unknown>,
  textByMsg: Map<string, string[]>,
  reasoningByMsg: Map<string, string[]>,
): string | null {
  // Handle plain string content (Claude Code style)
  if (msgData.content && typeof msgData.content === 'string') {
    return msgData.content;
  }

  // Handle structured content blocks array (OpenCode style)
  // e.g. [{type: "text", text: "..."}, {type: "tool_use", ...}, {type: "reasoning", text: "..."}]
  if (Array.isArray(msgData.content)) {
    const parts: string[] = [];
    const contentBlocks = msgData.content as Array<Record<string, unknown>>;
    for (const block of contentBlocks) {
      if (block.type === 'text' && block.text && typeof block.text === 'string') {
        parts.push(block.text);
      } else if (block.type === 'reasoning' && block.text && typeof block.text === 'string') {
        parts.push(`<thinking>${block.text}</thinking>`);
      }
    }
    if (parts.length > 0) return parts.join('\n\n');
  }

  const textContent = textByMsg.get(messageId) ?? [];
  const reasoningContent = reasoningByMsg.get(messageId) ?? [];

  const parts: string[] = [];
  if (reasoningContent.length > 0) {
    parts.push(`<thinking>${reasoningContent.join('\n')}</thinking>`);
  }
  if (textContent.length > 0) {
    parts.push(textContent.join('\n'));
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}
