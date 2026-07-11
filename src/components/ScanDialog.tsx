'use client';
// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

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
  SearchIcon, LoaderIcon, ChevronRightIcon,
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

        {step === 'scanning' && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <LoaderIcon className="size-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Scanning for agent sessions...</span>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-3">
            <div className="space-y-2">
              {agents.map(agent => (
                <div
                  key={agent.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    agent.found
                      ? 'hover:bg-primary/5 border-emerald-200 bg-emerald-50/50'
                      : 'opacity-50 border-gray-200 cursor-default'
                  }`}
                  onClick={() => { if (agent.found) loadSessions(agent); }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {agent.id === 'opencode' ? '\u{1F499}' : '\u{1F9E1}'}
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
