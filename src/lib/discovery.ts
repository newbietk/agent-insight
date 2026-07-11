// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { SessionListItem } from '@/lib/shared/types';
import { getAdapter } from '@/lib/ingest/adapters/index';

export interface AgentDiscovery {
  id: string;
  name: string;
  found: boolean;
  sourcePath: string | null;
  sessionCount: number;
  latestAt: string | null;
  reason?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  sourceType: string;
  defaultPaths: Record<string, string[]>;
}

const AGENTS: AgentDefinition[] = [
  {
    id: 'opencode',
    name: 'Opencode',
    sourceType: 'opencode-db',
    defaultPaths: {
      linux:  ['~/.local/share/opencode/opencode.db'],
      darwin: ['~/Library/Application Support/opencode/opencode.db'],
      win32:  ['%LOCALAPPDATA%/opencode/opencode.db', '%USERPROFILE%/.local/share/opencode/opencode.db'],
    },
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    sourceType: 'claude-jsonl',
    defaultPaths: {
      linux:  ['~/.claude/projects/'],
      darwin: ['~/Library/Application Support/Claude Code/projects/'],
      win32:  ['%APPDATA%/Claude Code/projects/', '%USERPROFILE%/.claude/projects/'],
    },
  },
];

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    const home = os.homedir();
    return path.join(home, filepath.slice(filepath.startsWith('~/') ? 2 : 1));
  }
  return filepath;
}

function expandEnvVars(filepath: string): string {
  if (process.platform === 'win32') {
    return filepath.replace(/%([^%]+)%/g, (_, name) => {
      const val = process.env[name];
      if (val) return val;
      if (name === 'LOCALAPPDATA') {
        return path.join(os.homedir(), 'AppData', 'Local');
      }
      if (name === 'APPDATA') {
        return path.join(os.homedir(), 'AppData', 'Roaming');
      }
      return `%${name}%`;
    });
  }
  return filepath;
}

export function resolveDefaultPaths(agentId: string): string[] {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return [];

  const platform = process.platform as 'linux' | 'darwin' | 'win32';
  const paths = agent.defaultPaths[platform] ?? [];

  return paths.map(p => expandHome(expandEnvVars(p)))
    .filter(p => {
      if (p.endsWith('.db') || p.endsWith('.jsonl')) {
        return fs.existsSync(p);
      }
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    });
}

export function scanAgent(agentId: string, customPath?: string): AgentDiscovery {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) {
    return { id: agentId, name: agentId, found: false, sourcePath: null, sessionCount: 0, latestAt: null, reason: 'unknown-agent' };
  }

  let sourcePath: string | null = null;

  if (customPath) {
    const expanded = expandHome(expandEnvVars(customPath));
    if (fs.existsSync(expanded)) {
      sourcePath = expanded;
    } else {
      return { id: agent.id, name: agent.name, found: false, sourcePath: null, sessionCount: 0, latestAt: null, reason: 'path-not-found' };
    }
  } else {
    const foundPaths = resolveDefaultPaths(agent.id);
    if (foundPaths.length === 0) {
      return { id: agent.id, name: agent.name, found: false, sourcePath: null, sessionCount: 0, latestAt: null, reason: 'path-not-found' };
    }
    sourcePath = foundPaths[0];
  }

  try {
    const adapter = getAdapter(agent.sourceType);
    const sessions = adapter.listSessions(sourcePath);

    let latestAt: string | null = null;
    if (sessions.length > 0) {
      const sorted = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      latestAt = sorted[0].createdAt;
    }

    return {
      id: agent.id,
      name: agent.name,
      found: sessions.length > 0,
      sourcePath,
      sessionCount: sessions.length,
      latestAt,
    };
  } catch {
    return { id: agent.id, name: agent.name, found: false, sourcePath, sessionCount: 0, latestAt: null, reason: 'scan-error' };
  }
}

export function scanAllAgents(): AgentDiscovery[] {
  return AGENTS.map(a => scanAgent(a.id));
}

export function scanAgentWithCustomPath(agentId: string, customPath: string): AgentDiscovery {
  return scanAgent(agentId, customPath);
}

export function loadAgentSessions(
  agentId: string,
  sourcePath: string,
  page: number = 1,
  pageSize: number = 20,
): { sessions: SessionListItem[]; total: number } {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return { sessions: [], total: 0 };

  const adapter = getAdapter(agent.sourceType);
  if (!adapter) return { sessions: [], total: 0 };

  try {
    const allSessions = adapter.listSessions(sourcePath);

    const start = (page - 1) * pageSize;
    const sessions = allSessions.slice(start, start + pageSize);

    return { sessions, total: allSessions.length };
  } catch {
    return { sessions: [], total: 0 };
  }
}
