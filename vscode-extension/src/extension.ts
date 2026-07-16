import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { t } from './i18n';
import { SyncScheduler } from './sync/scheduler';

// ── Lazy references (initialized on first use, not at module load) ──
let _storage: import('./storage/db').Storage | null = null;
let _treeProvider: import('./views/sessionTree').SessionTreeDataProvider | null = null;
let _panelManager: import('./views/sessionPanel').SessionPanelManager | null = null;
let _scheduler: SyncScheduler | null = null;
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

  // ── Session list: TreeView (reliable, always works) ──
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

    // Auto-sync scheduler
    _scheduler = new SyncScheduler(_storage, () => {
      if (_treeProvider) _treeProvider.refresh();
    });
    _scheduler.start();
  }

  // ── Register commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('hismartlite.import', () => handleImport()),
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
    vscode.commands.registerCommand('hismartlite.syncAll', () =>
      handleSyncAll()
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
  if (_scheduler) _scheduler.dispose();
  if (_panelManager) _panelManager.disposeAll();
  if (_storage) _storage.close();
}

// ── Command Handlers ────────────────────────────────────────

function ensureReady(): boolean {
  if (_activationError) {
    vscode.window.showErrorMessage(t('activation.errorPrefix', _activationError));
    return false;
  }
  return true;
}

async function handleImport(): Promise<void> {
  if (!ensureReady()) return;

  const storage = getStorage();

  // ── Step 1: pick agent ──
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
    await handleOpenCodeImport(storage);
  } else if (agentChoice.value === 'codeagent') {
    await handleCodeAgentImport(storage);
  } else {
    await handleClaudeImport(storage);
  }
}

// ── CodeAgent 3.0 import ───────────────────────────────────

async function handleCodeAgentImport(storage: import('./storage/db').Storage): Promise<void> {
  const cacDir = path.join(os.homedir(), '.cac', 'projects');
  if (!fs.existsSync(cacDir)) {
    vscode.window.showInformationMessage(t('import.codeagent.dirNotFound', cacDir));
    return;
  }

  const filePaths = findJsonlFiles(cacDir);
  if (filePaths.length === 0) {
    vscode.window.showInformationMessage(t('import.codeagent.noFiles', cacDir));
    return;
  }

  const picked = await pickJsonlFiles(filePaths, t('agent.codeAgent'));
  if (picked === undefined) return; // User canceled the picker
  if (!picked || picked.length === 0) return;

  const { importJsonlFile } = require('./importer');
  const treeProvider = getTreeProvider();

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('import.codeagent.progress'),
      cancellable: false,
    },
    async () => {
      for (const p of picked) {
        try {
          const result = await importJsonlFile(p, storage);
          if (result === 'ok') imported++;
          else if (result === 'skip') skipped++;
          else errors.push(path.basename(p) + ': ' + result);
        } catch (e: any) {
          errors.push(path.basename(p) + ': ' + e.message);
        }
      }
    }
  );

  treeProvider.refresh();

  if (imported > 0) {
    vscode.window.showInformationMessage(
      t('import.codeagent.imported', imported, skipped > 0 ? t('import.claude.skipped', skipped) : '')
    );
  } else {
    vscode.window.showWarningMessage(
      t('import.claude.noneImported', errors.length > 0 ? errors[0] : t('import.claude.allEmpty'))
    );
  }
}

// ── Claude Code import ─────────────────────────────────────

async function handleClaudeImport(storage: import('./storage/db').Storage): Promise<void> {
  const choices = [
    { label: t('import.fileOption'), value: 'file', description: t('import.fileDesc') },
    { label: t('import.dirOption'), value: 'dir', description: t('import.dirDesc') },
    { label: t('import.autoOption'), value: 'auto', description: t('import.autoDesc') },
  ];

  const choice = await vscode.window.showQuickPick(choices, {
    placeHolder: t('import.claudeImportMethod'),
  });
  if (!choice) return;

  let filePaths: string[] = [];

  if (choice.value === 'auto') {
    const claudeDir = getClaudeProjectsDir();
    const claudeFiles = fs.existsSync(claudeDir) ? findJsonlFiles(claudeDir) : [];
    if (claudeFiles.length > 0) {
      const picked = await pickJsonlFiles(claudeFiles, t('import.claude.codeLabel'));
      if (picked === undefined) return; // User canceled the picker
      if (picked) filePaths.push(...picked);
    }

    if (filePaths.length === 0) {
      vscode.window.showInformationMessage(
        t('import.claude.noFilesInDir', claudeDir)
      );
      return;
    }
  } else if (choice.value === 'file') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: { [t('import.claude.fileFilter')]: ['jsonl'], [t('import.claude.allFiles')]: ['*'] },
      title: t('import.claude.selectFile'),
    });
    if (!uris || uris.length === 0) return;
    filePaths = uris.map(u => u.fsPath);
  } else if (choice.value === 'dir') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: t('import.claude.selectDir'),
    });
    if (!uris || uris.length === 0) return;
    filePaths = findJsonlFiles(uris[0].fsPath);
    if (filePaths.length === 0) {
      vscode.window.showInformationMessage(t('import.claude.noFilesSelected'));
      return;
    }
    const picked = await pickJsonlFiles(filePaths, 'Directory');
    if (!picked || picked.length === 0) return;
    filePaths = picked;
  }

  const { importJsonlFile } = require('./importer');
  const treeProvider = getTreeProvider();

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('import.claude.progress'),
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < filePaths.length; i++) {
        if (token.isCancellationRequested) break;

        const filePath = filePaths[i];
        const fileName = path.basename(filePath);
        progress.report({ message: fileName, increment: 100 / filePaths.length });

        try {
          const result = importJsonlFile(storage, filePath);
          if (result) {
            imported++;
          } else {
            skipped++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${fileName}: ${message}`);
          skipped++;
        }
      }
    }
  );

  treeProvider.refresh();

  if (imported > 0) {
    vscode.window.showInformationMessage(
      t('import.claude.imported', imported, skipped > 0 ? t('import.claude.skipped', skipped) : '')
    );
  } else if (skipped > 0 && imported === 0) {
    vscode.window.showWarningMessage(
      t('import.claude.noneImported', errors.length > 0 ? errors[0] : t('import.claude.allEmpty'))
    );
  }
}

// ── OpenCode import ────────────────────────────────────────

async function handleOpenCodeImport(storage: import('./storage/db').Storage): Promise<void> {
  const dbPath = await findOpenCodeDb();
  if (!dbPath) return;

  const { listOpenCodeSessions, importOpenCodeSession } = require('./importer');

  let sessions: Array<{ id: string; label: string | null; model: string | null }>;
  try {
    sessions = await listOpenCodeSessions(dbPath);
  } catch (err) {
    vscode.window.showErrorMessage(t('import.opencode.readFailed', err instanceof Error ? err.message : String(err)));
    return;
  }

  if (sessions.length === 0) {
    vscode.window.showInformationMessage(t('import.opencode.noSessions'));
    return;
  }

  const items = sessions.map(s => ({
    label: s.label?.substring(0, 60) || s.id.substring(0, 8),
    description: s.model ? `${s.model}` : t('import.opencode.unknownModel'),
    detail: t('import.opencode.sessionId', s.id.substring(0, 12)),
    id: s.id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: t('import.opencode.selectSessions', sessions.length),
  });
  if (!selected || selected.length === 0) return;

  const treeProvider = getTreeProvider();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('import.opencode.progress'),
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < selected.length; i++) {
        if (token.isCancellationRequested) break;

        const session = selected[i];
        progress.report({
          message: session.label?.substring(0, 40) || session.id.substring(0, 8),
          increment: 100 / selected.length,
        });

        try {
          const result = await importOpenCodeSession(storage, dbPath, session.id);
          if (result) {
            imported++;
          } else {
            skipped++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${session.id}: ${message}`);
          skipped++;
        }
      }
    }
  );

  treeProvider.refresh();

  if (imported > 0) {
    vscode.window.showInformationMessage(
      t('import.opencode.imported', imported, skipped > 0 ? t('import.claude.skipped', skipped) : '')
    );
  } else if (skipped > 0 && imported === 0) {
    vscode.window.showWarningMessage(
      t('import.claude.noneImported', errors.length > 0 ? errors[0] : t('import.opencode.allEmpty'))
    );
  }
}

async function findOpenCodeDb(): Promise<string | null> {
  const autoPaths = getOpenCodeDbPaths();
  for (const p of autoPaths) {
    if (fs.existsSync(p)) return p;
  }

  const action = await vscode.window.showQuickPick(
    [
      { label: t('import.opencode.browseDb'), value: 'browse' },
      { label: `$(close) ${t('common.cancel')}`, value: 'cancel' },
    ],
    { placeHolder: t('import.opencode.dbNotFound') }
  );
  if (!action || action.value === 'cancel') return null;

  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { [t('import.opencode.sqliteFilter')]: ['db'], [t('import.claude.allFiles')]: ['*'] },
    title: t('import.opencode.selectDb'),
  });
  if (!uris || uris.length === 0) return null;
  return uris[0].fsPath;
}

function getOpenCodeDbPaths(): string[] {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

  if (process.platform === 'win32') {
    return [
      path.join(localAppData, 'opencode', 'opencode.db'),
      path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
    ];
  }
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db')];
  }
  return [path.join(home, '.local', 'share', 'opencode', 'opencode.db')];
}

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

// ── Sync ───────────────────────────────────────────────────

async function handleSyncSession(item?: { session: { id: string; taskId: string } }): Promise<void> {
  if (!ensureReady()) return;

  const storage = getStorage();
  const { syncSession } = require('./importer');

  let sessionId: string | undefined;

  if (item?.session?.id) {
    sessionId = item.session.id;
  } else {
    // Pick from sessions that have a sourcePath
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

  const tp = _treeProvider;
  if (tp) tp.refresh();
  const pm = _panelManager;
  if (pm) pm.disposeAll();
}

async function handleSyncAll(): Promise<void> {
  if (!ensureReady()) return;

  const storage = getStorage();
  const { syncSession } = require('./importer');

  const sessions = storage.listSessions().filter(s => s.sourcePath);
  if (sessions.length === 0) {
    vscode.window.showInformationMessage(t('sync.noSourceSessions'));
    return;
  }

  let synced = 0;
  let newTurns = 0;
  const errors: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('sync.syncingAll', sessions.length),
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < sessions.length; i++) {
        if (token.isCancellationRequested) break;
        const s = sessions[i];
        progress.report({ message: s.taskId, increment: 100 / sessions.length });
        try {
          const result = await syncSession(storage, s.id);
          synced++;
          newTurns += result.newTurnCount;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${s.taskId}: ${message}`);
        }
      }
    }
  );

  const tp = _treeProvider;
  if (tp) tp.refresh();

  if (newTurns > 0) {
    vscode.window.showInformationMessage(
      t('sync.allDone', newTurns, synced, sessions.length)
    );
  } else if (synced > 0) {
    vscode.window.showInformationMessage(t('sync.allUpToDate'));
  }

  if (errors.length > 0) {
    const detail = errors.length <= 3 ? errors.join('\n') : `${errors.slice(0, 3).join('\n')}\n... +${errors.length - 3} more`;
    vscode.window.showWarningMessage(t('sync.partialErrors', errors.length, detail));
  }
}

// ── File Discovery Helpers ──────────────────────────────────

function getClaudeProjectsDir(): string {
  const configPath = vscode.workspace.getConfiguration('hismartlite').get<string>('claudeProjectsPath');
  if (configPath) {
    return configPath.replace(/^~/, os.homedir());
  }
  return path.join(os.homedir(), '.claude', 'projects');
}

function findJsonlFiles(dirPath: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'subagents') continue;
        results.push(...findJsonlFiles(full));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(full);
      }
    }
  } catch (e: any) {
    console.error(`[cannbot] findJsonlFiles error in ${dirPath}: ${e.code || e.message}`);
  }
  return results;
}

async function pickJsonlFiles(filePaths: string[], sourceLabel: string): Promise<string[] | undefined> {
  // Extract first user query from each file for display
  const items = filePaths.map(f => {
    const query = extractFirstUserQuery(f);
    return {
      label: query || path.basename(f),
      description: `${sourceLabel} · ${path.basename(f)}`,
      detail: path.dirname(f),
      filePath: f,
      picked: true,
    };
  });

  if (filePaths.length === 0) return [];

  const MAX_DIRECT_PICK = 20;
  if (filePaths.length <= MAX_DIRECT_PICK) {
    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: t('import.picker.selectFiles', filePaths.length),
    });
    if (!selected) return undefined;
    return selected.map(s => s.filePath);
  }

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder: t('import.picker.selectFilesEsc', filePaths.length),
  });
  if (!selected) return undefined;
  return selected.map(s => s.filePath);
}

// ── JSONL first-query extraction ──────────────────────────

function extractFirstUserQuery(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) return null;
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'user' && obj.message) {
          const msg = obj.message;
          if (typeof msg.content === 'string') {
            return msg.content.substring(0, 120);
          }
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                return block.text.substring(0, 120);
              }
            }
          }
        }
      } catch { /* skip malformed line */ }
    }
    return null;
  } catch {
    return null;
  }
}
