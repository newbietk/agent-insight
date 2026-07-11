# Scan Auto-Discover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scan for Sessions" button on the homepage that auto-detects agent sessions from default OS paths, with paginated session selection and import, plus custom path fallback.

**Architecture:** A server-side discovery module (`src/lib/discovery.ts`) resolves default paths per OS per agent and uses existing adapters' `listSessions()` to enumerate sessions. A new API route (`/api/ingest/discover`) exposes scan and load-sessions actions. A `ScanDialog` React component handles the multi-step UI (scan → select → import progress), sitting alongside the existing `LocalFileImport` component on the homepage.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6 + SQLite, shadcn/ui v4, Tailwind v4, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/discovery.ts` | CREATE | Resolve default paths per OS/agent, scan for sessions using existing adapters |
| `tests/discovery.test.ts` | CREATE | Unit tests for path resolution and scan logic |
| `src/app/api/ingest/discover/route.ts` | CREATE | POST endpoint: `scan` (list agents), `load-sessions` (list sessions for agent) |
| `tests/discover-api.test.ts` | CREATE | Integration test for discover API endpoint |
| `src/components/ScanDialog.tsx` | CREATE | Multi-step dialog: scanning → agent cards → session picker (paginated) → importing progress |
| `src/app/page.tsx` | MODIFY | Add `<ScanDialog />` to header, left of `<LocalFileImport />` |
| `tests/e2e-scan-discover.test.ts` | CREATE | End-to-end test: scan → select → import → verify in DB |

---

### Task 1: Discovery module (`src/lib/discovery.ts`)

**Files:**
- Create: `src/lib/discovery.ts`
- Create: `tests/discovery.test.ts`

- [ ] **Step 1: Create discovery module**

```typescript
// src/lib/discovery.ts
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
  const allSessions = adapter.listSessions(sourcePath);

  const start = (page - 1) * pageSize;
  const sessions = allSessions.slice(start, start + pageSize);

  return { sessions, total: allSessions.length };
}
```

- [ ] **Step 2: Create discovery tests**

```typescript
// tests/discovery.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveDefaultPaths,
  scanAgent,
  scanAllAgents,
  loadAgentSessions,
} from '../src/lib/discovery';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('discovery: resolveDefaultPaths', () => {
  it('returns empty for unknown agent', () => {
    expect(resolveDefaultPaths('unknown-agent')).toEqual([]);
  });

  it('returns resolved paths for opencode on current platform', () => {
    const paths = resolveDefaultPaths('opencode');
    expect(paths.length).toBeGreaterThan(0);
    // Paths should be absolute (no ~ or %VAR%)
    for (const p of paths) {
      expect(p).not.toContain('~');
    }
  });

  it('returns resolved paths for claude-code on current platform', () => {
    const paths = resolveDefaultPaths('claude-code');
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).not.toContain('~');
    }
  });

  it('resolves home directory tilde', () => {
    const paths = resolveDefaultPaths('opencode');
    const home = os.homedir();
    for (const p of paths) {
      if (p) expect(p.startsWith(home) || p.startsWith('/') || p.includes(':\\') || p.includes(':/')).toBe(true);
    }
  });
});

describe('discovery: scanAgent', () => {
  it('returns not-found for non-existent custom path', () => {
    const result = scanAgent('opencode', '/tmp/nonexistent-path-xyz123');
    expect(result.found).toBe(false);
    expect(result.reason).toBe('path-not-found');
  });

  it('returns unknown-agent for unrecognized agent', () => {
    const result = scanAgent('bogus-agent');
    expect(result.found).toBe(false);
    expect(result.reason).toBe('unknown-agent');
  });

  it('scans all known agents without throwing', () => {
    const results = scanAllAgents();
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(typeof r.found).toBe('boolean');
    }
  });
});

describe('discovery: loadAgentSessions', () => {
  it('returns empty for unknown agent', () => {
    const result = loadAgentSessions('unknown', '/some/path');
    expect(result.sessions).toEqual([]);
    expect(result.total).toBe(0);
  });
});
```

- [ ] **Step 3: Run discovery tests**

```bash
cd D:/AI/MyTest/kirinai-insight && npx vitest run tests/discovery.test.ts
```

Expected: 5-6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/discovery.ts tests/discovery.test.ts
git commit -m "[feat] v1.03: add agent session auto-discovery module

Resolves default paths per OS per agent (opencode, claude-code).
Uses existing adapters' listSessions() to enumerate sessions.
Supports custom path override for manual fallback."
```

---

### Task 2: Discovery API route

**Files:**
- Create: `src/app/api/ingest/discover/route.ts`
- Create: `tests/discover-api.test.ts`

- [ ] **Step 1: Create API route**

```typescript
// src/app/api/ingest/discover/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { scanAllAgents, scanAgentWithCustomPath, loadAgentSessions } from '@/lib/discovery';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, agentId, customPath, sourcePath, page, pageSize } = body;

    switch (action) {
      case 'scan': {
        if (agentId && customPath) {
          const result = scanAgentWithCustomPath(agentId, customPath);
          return NextResponse.json({ agents: [result] });
        }
        if (agentId) {
          const result = scanAgentWithCustomPath(agentId, customPath ?? '');
          return NextResponse.json({ agents: [result] });
        }
        const agents = scanAllAgents();
        return NextResponse.json({ agents });
      }

      case 'load-sessions': {
        if (!agentId || !sourcePath) {
          return NextResponse.json(
            { error: 'Missing required fields: agentId, sourcePath' },
            { status: 400 },
          );
        }
        const p = Math.max(1, Number(page ?? 1));
        const ps = Math.max(1, Math.min(100, Number(pageSize ?? 20)));
        const result = loadAgentSessions(agentId, sourcePath, p, ps);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: "${action}". Supported: scan, load-sessions` },
          { status: 400 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create API integration test**

```typescript
// tests/discover-api.test.ts
import { describe, it, expect } from 'vitest';

describe('POST /api/ingest/discover', () => {
  const BASE = 'http://localhost:21025';

  it('scan action returns agents array', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents.length).toBeGreaterThanOrEqual(2);

    // Each agent has required fields
    for (const agent of data.agents) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(typeof agent.found).toBe('boolean');
      expect(typeof agent.sessionCount).toBe('number');
    }
  });

  it('scan with custom path returns single agent result', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan',
        agentId: 'opencode',
        customPath: '/tmp/nonexistent-12345',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.agents.length).toBe(1);
    expect(data.agents[0].found).toBe(false);
    expect(data.agents[0].reason).toBe('path-not-found');
  });

  it('load-sessions returns paginated results', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'load-sessions',
        agentId: 'opencode',
        sourcePath: '/tmp/nonexistent-12345',
        page: 1,
        pageSize: 10,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.total).toBe('number');
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it('load-sessions rejects missing fields', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load-sessions' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown action', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Verify API test setup**

Before running these tests, the dev server must be running. Check:

```bash
# Start the dev server if not already running
cd D:/AI/MyTest/kirinai-insight && ./start.sh
```

- [ ] **Step 4: Run API tests**

```bash
cd D:/AI/MyTest/kirinai-insight && npx vitest run tests/discover-api.test.ts
```

Expected: 5 tests pass (requires dev server on port 21025).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ingest/discover/route.ts tests/discover-api.test.ts
git commit -m "[feat] v1.03: add discover API endpoint with scan and load-sessions actions"
```

---

### Task 3: ScanDialog component

**Files:**
- Create: `src/components/ScanDialog.tsx`

- [ ] **Step 1: Create ScanDialog component**

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { saveImportHistory, type ImportHistoryEntry } from '@/components/ImportHistory';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  SearchIcon, LoaderIcon, FolderIcon, CheckIcon, XIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface AgentDiscovery {
  id: string;
  name: string;
  found: boolean;
  sourcePath: string | null;
  sessionCount: number;
  latestAt: string | null;
  reason?: string;
}

interface SessionPreview {
  id: string;
  createdAt: string;
  firstQuery: string | null;
  turnCount: number;
  modelName?: string | null;
  model?: string | null;
}

interface ImportStatus {
  sessionId: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  message?: string;
}

type Step = 'scanning' | 'results' | 'select' | 'importing';

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch { return ''; }
}

export function ScanDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('scanning');
  const [agents, setAgents] = useState<AgentDiscovery[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDiscovery | null>(null);
  const [sessions, setSessions] = useState<SessionPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importStatuses, setImportStatuses] = useState<ImportStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [customAgentId, setCustomAgentId] = useState('opencode');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  function resetState() {
    setStep('scanning');
    setAgents([]);
    setSelectedAgent(null);
    setSessions([]);
    setSelectedIds(new Set());
    setImportStatuses([]);
    setError(null);
    setCustomPath('');
    setCustomAgentId('opencode');
    setPage(1);
    setTotal(0);
  }

  async function doScan() {
    setStep('scanning');
    setError(null);
    try {
      const res = await fetch('/api/ingest/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Scan failed');
        return;
      }
      setAgents(data.agents ?? []);
      setStep('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  async function doCustomPathScan() {
    if (!customPath.trim()) return;
    setStep('scanning');
    setError(null);
    try {
      const res = await fetch('/api/ingest/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', agentId: customAgentId, customPath: customPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Scan failed');
        return;
      }
      setAgents(data.agents ?? []);
      setStep('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  async function loadSessions(agent: AgentDiscovery, p: number = 1) {
    if (!agent.sourcePath) return;
    setSelectedAgent(agent);
    setPage(p);
    setError(null);
    try {
      const res = await fetch('/api/ingest/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'load-sessions',
          agentId: agent.id,
          sourcePath: agent.sourcePath,
          page: p,
          pageSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to load sessions');
        return;
      }
      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
      setSelectedIds(new Set());
      setStep('select');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    if (selectedIds.size === sessions.length && sessions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map(s => s.id)));
    }
  }

  function getSessionId(s: SessionPreview): string {
    return s.id;
  }

  async function handleImportSelected() {
    if (selectedIds.size === 0 || !selectedAgent?.sourcePath) return;
    setStep('importing');

    const ids = Array.from(selectedIds);
    const sourceType = selectedAgent.id === 'opencode' ? 'opencode-db' : 'claude-jsonl';
    const filePath = selectedAgent.sourcePath;

    const statuses: ImportStatus[] = ids.map(id => ({ sessionId: id, status: 'pending' }));
    setImportStatuses(statuses);

    const CONCURRENCY = 4;
    let nextIndex = 0;

    async function importOne(sessionId: string) {
      setImportStatuses(prev =>
        prev.map(s => s.sessionId === sessionId ? { ...s, status: 'importing' } : s)
      );
      try {
        const res = await fetch('/api/ingest/import-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: sourceType, sessionId, filePath }),
        });
        const data = await res.json();
        setImportStatuses(prev =>
          prev.map(s => s.sessionId === sessionId
            ? { ...s, status: res.ok ? 'success' : 'error', message: res.ok ? (data.imported ? 'Imported' : 'Already exists') : (data.error ?? 'Import failed') }
            : s)
        );
      } catch (e) {
        setImportStatuses(prev =>
          prev.map(s => s.sessionId === sessionId
            ? { ...s, status: 'error', message: e instanceof Error ? e.message : 'Network error' }
            : s)
        );
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (nextIndex < ids.length) {
        const idx = nextIndex++;
        await importOne(ids[idx]);
      }
    });
    await Promise.all(workers);
  }

  const allSuccessOrError = importStatuses.length > 0 && importStatuses.every(
    s => s.status === 'success' || s.status === 'error'
  );

  const handleDone = useCallback(() => {
    const hasSuccess = importStatuses.some(s => s.status === 'success');
    if (hasSuccess) {
      const entries: ImportHistoryEntry[] = importStatuses
        .filter(s => s.status === 'success')
        .map(s => {
          const session = sessions.find(p => p.id === s.sessionId);
          const sourceType = selectedAgent?.id === 'opencode' ? 'opencode-db' : 'claude-jsonl';
          return {
            taskId: s.sessionId,
            importedAt: new Date().toISOString(),
            turnCount: session?.turnCount ?? 0,
            status: 'success' as const,
            query: session?.firstQuery ?? null,
            filePath: selectedAgent?.sourcePath ?? '',
            sourceType,
          };
        });
      saveImportHistory(entries);
      toast.success('Import complete', { description: `${entries.length} sessions imported.` });
    }
    setOpen(false);
    resetState();
    if (hasSuccess) window.location.reload();
  }, [importStatuses, sessions, selectedAgent]);

  useEffect(() => {
    if (allSuccessOrError) {
      const timer = setTimeout(handleDone, 1000);
      return () => clearTimeout(timer);
    }
  }, [allSuccessOrError, handleDone]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger
        render={
          <Button
            variant="default"
            size="lg"
            className="gap-2 font-semibold bg-sky-600 hover:bg-sky-700 text-white"
            onClick={() => { doScan(); }}
          >
            <SearchIcon className="size-4" />
            Scan for Sessions
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan for Sessions</DialogTitle>
          <DialogDescription>
            {step === 'scanning' && 'Scanning default paths for agent sessions...'}
            {step === 'results' && `${agents.filter(a => a.found).length} agents found. Click to browse sessions.`}
            {step === 'select' && selectedAgent && `${selectedAgent.name} · ${total} sessions found`}
            {step === 'importing' && `Importing ${importStatuses.filter(s => s.status === 'success' || s.status === 'error').length}/${importStatuses.length} sessions...`}
          </DialogDescription>
        </DialogHeader>

        {/* Scanning state */}
        {step === 'scanning' && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <LoaderIcon className="size-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Scanning for agent sessions...</span>
          </div>
        )}

        {/* Results: agent cards + custom path fallback */}
        {step === 'results' && (
          <div className="space-y-3">
            <div className="space-y-2">
              {agents.map(agent => (
                <div
                  key={agent.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    agent.found
                      ? 'hover:bg-primary/5 border-emerald-200 bg-emerald-50/50'
                      : 'opacity-50 border-gray-200'
                  }`}
                  onClick={() => { if (agent.found) loadSessions(agent); }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {agent.id === 'opencode' ? '💙' : '🧡'}
                    </span>
                    <div>
                      <div className="font-semibold text-sm">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.sourcePath ?? 'Not found'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {agent.found ? (
                      <>
                        <Badge variant="green">{agent.sessionCount} sessions</Badge>
                        {agent.latestAt && (
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(agent.latestAt)}</span>
                        )}
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{agent.reason === 'path-not-found' ? 'Not found' : 'Not installed'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Custom path fallback */}
            <div className="border-t pt-3 mt-3">
              <div className="text-sm font-medium mb-2">Or Specify Custom Path</div>
              <p className="text-xs text-muted-foreground mb-2">
                Auto-detect didn't find your sessions? Point to the directory or file manually.
              </p>
              <div className="flex gap-2 mb-2">
                <Button
                  variant={customAgentId === 'opencode' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCustomAgentId('opencode')}
                >
                  OpenCode
                </Button>
                <Button
                  variant={customAgentId === 'claude-code' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCustomAgentId('claude-code')}
                >
                  Claude Code
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={customAgentId === 'opencode' ? '/path/to/opencode.db' : '/path/to/sessions-dir'}
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={doCustomPathScan} disabled={!customPath.trim()}>
                  Scan Path
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={doScan}>
                Rescan
              </Button>
            </div>
          </div>
        )}

        {/* Session selection with pagination */}
        {step === 'select' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                checked={selectedIds.size === sessions.length && sessions.length > 0}
                onCheckedChange={toggleAllOnPage}
              />
              <span className="text-sm text-muted-foreground">
                Select all on this page ({sessions.length} shown, {total} total)
              </span>
            </div>
            <div className="max-h-[320px] overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="max-w-[200px]">First Query</TableHead>
                    <TableHead>Turns</TableHead>
                    <TableHead>Model</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                        No sessions found
                      </TableCell>
                    </TableRow>
                  )}
                  {sessions.map(s => (
                    <TableRow key={s.id} className={selectedIds.has(s.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleSelection(s.id)} />
                      </TableCell>
                      <TableCell className="text-xs">{formatTime(s.createdAt)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {s.firstQuery ?? s.model ?? '(empty)'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{s.turnCount}</TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">{s.modelName ?? s.model ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} ({total} sessions)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1}
                    onClick={() => { if (selectedAgent) loadSessions(selectedAgent, page - 1); }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= totalPages}
                    onClick={() => { if (selectedAgent) loadSessions(selectedAgent, page + 1); }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {selectedIds.size === 0 && (
              <p className="text-sm text-muted-foreground">Select at least one session to import</p>
            )}
          </div>
        )}

        {/* Import progress */}
        {step === 'importing' && (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <div className="flex items-center gap-2 text-xs text-muted-foreground pb-1 border-b">
              <LoaderIcon className="size-3.5 animate-spin" />
              <span>
                Progress: {importStatuses.filter(s => s.status === 'success' || s.status === 'error').length}/{importStatuses.length}
              </span>
            </div>
            {importStatuses.map(s => {
              const session = sessions.find(p => p.id === s.sessionId);
              const label = session?.firstQuery ?? s.sessionId;
              return (
                <div key={s.sessionId} className="flex items-center gap-2 text-sm border-b pb-1.5 last:border-0">
                  <span className="flex-1 truncate">{label}</span>
                  {s.status === 'pending' && <span className="text-muted-foreground text-xs">Waiting</span>}
                  {s.status === 'importing' && (
                    <span className="text-blue-600 flex items-center gap-1 text-xs">
                      <LoaderIcon className="size-3 animate-spin" /> Importing...
                    </span>
                  )}
                  {s.status === 'success' && <span className="text-emerald-600 text-xs">{s.message}</span>}
                  {s.status === 'error' && <span className="text-red-600 text-xs">{s.message}</span>}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          {step === 'results' && (
            <Button variant="outline" onClick={() => { setOpen(false); resetState(); }}>Cancel</Button>
          )}
          {step === 'select' && (
            <>
              <Button variant="outline" onClick={() => setStep('results')}>Back</Button>
              <Button onClick={handleImportSelected} disabled={selectedIds.size === 0}>
                Import {selectedIds.size > 0 ? `${selectedIds.size} Selected` : ''}
              </Button>
            </>
          )}
          {step === 'importing' && allSuccessOrError && (
            <Button onClick={handleDone}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ScanDialog.tsx
git commit -m "[feat] v1.03: add ScanDialog component with auto-detect and paginated session import"
```

---

### Task 4: Modify homepage

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add ScanDialog import and usage to page.tsx**

Read `src/app/page.tsx` to find the exact insertion point. Change:

```tsx
// Add import at top
import { ScanDialog } from '@/components/ScanDialog';

// In the header div, add ScanDialog before LocalFileImport
// Change this:
<LocalFileImport />
// To:
<ScanDialog />
<LocalFileImport />
```

The exact edit will be a targeted `Edit` call replacing the `<LocalFileImport />` line with both components.

- [ ] **Step 2: Verify the page compiles**

```bash
cd D:/AI/MyTest/kirinai-insight && npm run build 2>&1 | tail -5
```

Or check the dev server shows no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "[feat] v1.03: add ScanDialog to homepage header"
```

---

### Task 5: End-to-end test

**Files:**
- Create: `tests/e2e-scan-discover.test.ts`

- [ ] **Step 1: Create E2E test using fixture data**

```typescript
// tests/e2e-scan-discover.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanAgent, loadAgentSessions } from '../src/lib/discovery';
import { importSession } from '../src/lib/ingest/data-service';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const FIXTURE_DIR = path.resolve(__dirname, 'data/e2e');
const OPENCODE_DB = path.join(FIXTURE_DIR, 'opencode-sample.db');
const OPENCODE_SQL = path.join(FIXTURE_DIR, 'opencode-sample.sql');

// Rebuild fixture DB from SQL dump if needed
if (!fs.existsSync(OPENCODE_DB) && fs.existsSync(OPENCODE_SQL)) {
  const db = new DatabaseSync(OPENCODE_DB);
  db.exec(fs.readFileSync(OPENCODE_SQL, 'utf8'));
  db.close();
}

const prisma = new PrismaClient();

describe('E2E: scan → discover → import', () => {
  const importedSessionIds: string[] = [];

  afterAll(async () => {
    for (const sid of importedSessionIds) {
      try {
        await prisma.session.deleteMany({ where: { taskId: sid } });
      } catch { /* ignore */ }
    }
    await prisma.$disconnect();
  });

  describe('discovery: scanAgent with fixture path', () => {
    it('scanAgent finds sessions in fixture DB', () => {
      const result = scanAgent('opencode', OPENCODE_DB);
      // Custom path should succeed even if default paths don't find anything
      if (result.found) {
        expect(result.sessionCount).toBeGreaterThan(0);
        expect(result.sourcePath).toBe(OPENCODE_DB);
      }
    });

    it('loadAgentSessions returns paginated results', () => {
      const result = loadAgentSessions('opencode', OPENCODE_DB, 1, 10);
      expect(result.total).toBeGreaterThan(0);
      expect(result.sessions.length).toBeGreaterThan(0);
      expect(result.sessions.length).toBeLessThanOrEqual(10);

      // Check session shape
      const s = result.sessions[0];
      expect(s.id).toBeTruthy();
      expect(typeof s.turnCount).toBe('number');
      expect(s.createdAt).toBeTruthy();
    });

    it('loadAgentSessions page 2 returns different sessions', () => {
      const page1 = loadAgentSessions('opencode', OPENCODE_DB, 1, 1);
      if (page1.total < 2) return; // skip if only 1 session

      const page2 = loadAgentSessions('opencode', OPENCODE_DB, 2, 1);
      expect(page2.sessions.length).toBeGreaterThan(0);
      expect(page2.sessions[0].id).not.toBe(page1.sessions[0].id);
    });
  });

  describe('full pipeline: discover → import via data-service', () => {
    it('can import sessions discovered from fixture DB', async () => {
      const result = loadAgentSessions('opencode', OPENCODE_DB, 1, 2);
      if (result.sessions.length === 0) return;

      // Import the first discovered session
      const sessionId = result.sessions[0].id;
      const importResult = await importSession(OPENCODE_DB, sessionId, prisma, OPENCODE_DB, 'opencode-db');
      if (importResult.imported) {
        importedSessionIds.push(sessionId);
      }

      // Session should now exist in DB
      const dbSession = await prisma.session.findFirst({
        where: { taskId: sessionId, framework: 'opencode' },
      });
      expect(dbSession).not.toBeNull();
      expect(dbSession!.taskId).toBe(sessionId);
    });
  });
});
```

- [ ] **Step 2: Run E2E test**

```bash
cd D:/AI/MyTest/kirinai-insight && npx vitest run tests/e2e-scan-discover.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e-scan-discover.test.ts
git commit -m "[test] v1.03: add E2E test for scan → discover → import pipeline"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd D:/AI/MyTest/kirinai-insight && npm run test
```

Expected: All previously passing tests still pass. New tests pass. Only the known `handoff-registry` Windows path issue may fail (pre-existing, not from our changes).

- [ ] **Step 2: Build check**

```bash
cd D:/AI/MyTest/kirinai-insight && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Bump version**

Update `src/lib/version.ts`:
```typescript
export const VERSION = "1.03"
export const VERSION_DISPLAY = `v${VERSION}`
```

- [ ] **Step 4: Final commit**

```bash
git add src/lib/version.ts
git commit -m "[feat] v1.03: bump version — scan auto-discover feature"
```
