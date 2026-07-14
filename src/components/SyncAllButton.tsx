'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon, CheckCircleIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

interface SyncableSession {
  sessionId: string;
  taskId: string;
  framework: string | null;
}

interface SyncAllButtonProps {
  sessions: SyncableSession[];
}

type Status = 'idle' | 'syncing' | 'done' | 'error';

export function SyncAllButton({ sessions }: SyncAllButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  if (sessions.length === 0) return null;

  async function handleSyncAll() {
    setStatus('syncing');
    setProgress({ done: 0, total: sessions.length });

    let synced = 0;
    let failed = 0;

    for (const session of sessions) {
      try {
        const res = await fetch('/api/ingest/refresh-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: session.taskId,
            framework: session.framework ?? 'unknown',
          }),
        });
        if (res.ok) {
          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setProgress({ done: synced + failed, total: sessions.length });
    }

    if (failed > 0) {
      setStatus('error');
      toast.error(`Sync complete with errors`, {
        description: `${synced} synced, ${failed} failed`,
      });
    } else {
      setStatus('done');
      toast.success('All sessions synced', {
        description: `${synced} session(s) refreshed`,
        icon: <CheckCircleIcon className="size-4" />,
      });
      setTimeout(() => window.location.reload(), 800);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleSyncAll}
      disabled={status === 'syncing'}
      title="Sync all sessions from their source files"
    >
      {status === 'idle' && <RefreshCwIcon className="size-4" />}
      {status === 'syncing' && <RefreshCwIcon className="size-4 animate-spin" />}
      {status === 'done' && <CheckCircleIcon className="size-4 text-green-600" />}
      {status === 'error' && <XIcon className="size-4 text-red-500" />}
      {status === 'syncing'
        ? `Syncing ${progress.done}/${progress.total}...`
        : 'Sync All'}
    </Button>
  );
}
