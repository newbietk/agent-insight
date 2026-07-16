import * as vscode from 'vscode';
import { t } from './i18n';
import { setRefreshCallback, handleClaudeImport, handleCodeAgentImport, handleOpenCodeImport } from './commands/import';

// ── Lazy references (initialized on first use, not at module load) ──
let _storage: import('./storage/db').Storage | null = null;
let _treeProvider: import('./views/sessionTree').SessionTreeDataProvider | null = null;
let _panelManager: import('./views/sessionPanel').SessionPanelManager | null = null;
let _activationError: string | null = null;

function getStorage(): import('./storage/db').Storage {
  if (!_storage) throw new Error('Storage not initialized');
  return _storage;
}
function getTreeProvider(): import('./views/sessionTree').SessionTreeDataProvider {
  if (!_treeProvider) throw new Error('Tree provider not initialized');
  return _treeProvider;
}
function getPanelManager(): import('./views/sessionPanel').SessionPanelManager {
  if (!_panelManager) throw new Error('Panel manager not initialized');
  return _panelManager;
}

export async function activate(context: vscode.ExtensionContext) {
  // ── Initialize Storage ──
  try {
    const { Storage } = require('./storage/db');
    _storage = await Storage.forExtension(context);
  } catch (err) {
    _activationError = err instanceof Error ? err.message : String(err);
    console.error('[KirinAI] Activation error:', _activationError);
    vscode.window.showErrorMessage(t('activation.failed', _activationError));
  }

  // ── Session list: TreeView ──
  if (_storage) {
    const { SessionTreeDataProvider } = require('./views/sessionTree');
    const treeProvider = new SessionTreeDataProvider(_storage);
    _treeProvider = treeProvider;
    context.subscriptions.push(
      vscode.window.createTreeView('hismartlite.sessions', {
        treeDataProvider: treeProvider,
        showCollapseAll: false,
      })
    );

    // Panel manager for detail view
    try {
      const { SessionPanelManager } = require('./views/sessionPanel');
      _panelManager = new SessionPanelManager(_storage);
    } catch (err) {
      console.error('[KirinAI] Panel manager init error:', err);
    }

    // Wire refresh callback for import commands
    setRefreshCallback(() => { if (_treeProvider) _treeProvider.refresh(); });
  }

  // ── Register commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('hismartlite.import', async () => {
      try { await handleImport(); }
      catch (err) { vscode.window.showErrorMessage(t('import.failed', String(err))); }
    }),
    vscode.commands.registerCommand('hismartlite.refreshSessions', () => {
      if (_treeProvider) _treeProvider.refresh();
    }),
    vscode.commands.registerCommand('hismartlite.openSession', (sessionId: string) => {
      const pm = _panelManager;
      if (pm) pm.show(context, sessionId);
    }),
    vscode.commands.registerCommand('hismartlite.deleteSession', (item: { session: { id: string; taskId: string } }) =>
      handleDelete(item)
    ),
    vscode.commands.registerCommand('hismartlite.syncSession', (item?: { session: { id: string; taskId: string } }) =>
      handleSyncSession(item)
    ),
  );

  // ── Status bar ──
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'hismartlite.import';
  statusBarItem.text = '$(graph) KirinAI';
  statusBarItem.tooltip = t('statusbar.tooltip');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  if (!_activationError) {
    vscode.window.showInformationMessage(t('activation.ready'));
  }
}

export function deactivate() {
  if (_panelManager) _panelManager.disposeAll();
  if (_storage) _storage.close();
}

// ── Shared helpers ───────────────────────────────────────────

function ensureReady(): boolean {
  if (_activationError) {
    vscode.window.showErrorMessage(t('activation.errorPrefix', _activationError));
    return false;
  }
  return true;
}

// ── Main import orchestrator ─────────────────────────────────

async function handleImport(): Promise<void> {
  if (!ensureReady()) return;

  const storage = getStorage();

  // Step 1: pick mode
  const modeChoice = await vscode.window.showQuickPick(
    [
      { label: t('import.mode.autoLabel'), value: 'auto', description: t('import.mode.autoDesc') },
      { label: t('import.mode.manualLabel'), value: 'manual', description: t('import.mode.manualDesc') },
    ],
    { placeHolder: t('import.mode.selectMode') },
  );
  if (!modeChoice) return;
  const mode = modeChoice.value as 'auto' | 'manual';

  // Step 2: pick agent
  const agentChoice = await vscode.window.showQuickPick(
    [
      { label: `$(json) ${t('agent.claudeCode')}`, value: 'claude', description: t('agent.claudeDesc') },
      { label: `$(rocket) ${t('agent.codeAgent')}`, value: 'codeagent', description: t('agent.codeAgentDesc') },
      { label: `$(database) ${t('agent.opencode')}`, value: 'opencode', description: t('agent.opencodeDesc') },
    ],
    { placeHolder: t('import.selectAgent') }
  );
  if (!agentChoice) return;

  if (agentChoice.value === 'opencode') {
    await handleOpenCodeImport(storage, mode);
  } else if (agentChoice.value === 'codeagent') {
    await handleCodeAgentImport(storage, mode);
  } else {
    await handleClaudeImport(storage, mode);
  }
}

// ── Delete ───────────────────────────────────────────────────

async function handleDelete(item: { session: { id: string; taskId: string } }): Promise<void> {
  if (!ensureReady()) return;
  if (!item?.session) return;

  const session = item.session;
  const confirm = await vscode.window.showWarningMessage(
    t('delete.confirm', session.taskId),
    { modal: true },
    t('common.delete')
  );
  if (confirm !== t('common.delete')) return;

  getStorage().deleteSession(session.id);
  const pm = _panelManager;
  if (pm) pm.disposeAll();
  const tp = _treeProvider;
  if (tp) tp.refresh();
  vscode.window.showInformationMessage(t('delete.deleted', session.taskId));
}

// ── Sync ─────────────────────────────────────────────────────

async function handleSyncSession(item?: { session: { id: string; taskId: string } }): Promise<void> {
  if (!ensureReady()) return;

  const storage = getStorage();
  const { syncSession } = require('./importer');

  let sessionId: string | undefined;

  if (item?.session?.id) {
    sessionId = item.session.id;
  } else {
    const sessions = storage.listSessions().filter(s => s.sourcePath);
    if (sessions.length === 0) {
      vscode.window.showInformationMessage(t('sync.noSourceSessions'));
      return;
    }
    const pick = await vscode.window.showQuickPick(
      sessions.map(s => ({
        label: s.label || s.query || s.taskId || 'Unknown',
        description: s.framework,
        detail: `${s.turnCount} turns · ${s.totalTokens} tokens`,
        sessionId: s.id,
      })),
      { placeHolder: t('sync.selectSession') }
    );
    if (!pick) return;
    sessionId = pick.sessionId;
  }

  // Large file gate: warn before syncing oversized source files
  const session = storage.getSession(sessionId!);
  if (session?.sourcePath) {
    const fs = require('node:fs');
    let stat: { size: number } | null = null;
    try { stat = fs.statSync(session.sourcePath); } catch { /* file gone, proceed */ }
    if (stat) {
      const sizeMB = stat.size / (1024 * 1024);
      if (sizeMB > 50) {
        const choice = await vscode.window.showWarningMessage(
          `源文件大小为 ${sizeMB.toFixed(1)} MB（超过 50MB），同步可能导致内存占用过高、VS Code 卡顿甚至崩溃。是否继续？`,
          { modal: true },
          '继续同步',
          '取消',
        );
        if (choice !== '继续同步') return;
      }
    }
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('sync.syncing'), cancellable: false },
    async () => {
      try {
        const result = await syncSession(storage, sessionId);
        if (result.newTurnCount > 0) {
          vscode.window.showInformationMessage(
            t('sync.done', result.newTurnCount, result.totalTurnCount)
          );
        } else {
          vscode.window.showInformationMessage(t('sync.upToDate'));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(t('sync.failed', message));
      }
    }
  );

  if (_treeProvider) _treeProvider.refresh();
  if (_panelManager) _panelManager.disposeAll();
}


