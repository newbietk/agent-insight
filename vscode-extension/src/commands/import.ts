/**
 * Import command handlers for Claude Code, CodeAgent 3.0, and OpenCode.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { t } from '../i18n';
import { findJsonlFiles, pickJsonlFiles, getClaudeProjectsDir, tryAutoFindOpenCodeDb, browseForDbPath } from '../discovery/fileDiscovery';
import type { Storage } from '../storage/db';
import { importJsonlFile, listOpenCodeSessions, importOpenCodeSession } from '../importer';

// ── Agent config for parameterized JSONL import ──────────────

interface JsonlImportConfig {
  /** I18n key prefix for user messages (e.g., 'import.claude' or 'import.codeagent'). */
  i18nPrefix: string;
  /** Auto-detect directory path. */
  autoDir: string;
  /** File names to exclude from auto-detect (e.g., 'obs.jsonl'). */
  fileExclude?: string;
  /** i18n key for the picker source label. */
  pickerLabelKey: string;
  /** i18n key prefix for manual mode sub-choice. Use '' to fall back to generic Claude keys. */
  manualI18nPrefix: string;
  /** Whether the progress dialog is cancellable. */
  cancellable: boolean;
  /** Whether importJsonlFile returns a Promise (true for CodeAgent which awaits). */
  importIsAsync: boolean;
}

// ── Shared parameterized JSONL import ────────────────────────

async function handleJsonlImport(
  storage: Storage,
  mode: 'auto' | 'manual',
  config: JsonlImportConfig,
): Promise<void> {
  const { i18nPrefix, autoDir, fileExclude, pickerLabelKey, manualI18nPrefix, cancellable, importIsAsync } = config;
  let filePaths: string[] = [];

  if (mode === 'auto') {
    if (!fs.existsSync(autoDir)) {
      vscode.window.showInformationMessage(t(`${i18nPrefix}.dirNotFound`, autoDir));
      return;
    }
    filePaths = findJsonlFiles(autoDir);
    if (fileExclude) {
      filePaths = filePaths.filter(f => path.basename(f) !== fileExclude);
    }
    if (filePaths.length === 0) {
      vscode.window.showInformationMessage(t(`${i18nPrefix}.noFiles`, autoDir));
      return;
    }
  } else {
    // Manual: file or dir sub-choice
    const subI18n = manualI18nPrefix || 'import.claude';
    const subChoice = await vscode.window.showQuickPick(
      [
        { label: t(`${subI18n}.fileOption`), value: 'file', description: t(`${subI18n}.fileDesc`) },
        { label: t(`${subI18n}.dirOption`), value: 'dir', description: t(`${subI18n}.dirDesc`) },
      ],
      { placeHolder: t(`${subI18n}.importMethod`) },
    );
    if (!subChoice) return;

    if (subChoice.value === 'file') {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: { [t(`${subI18n}.fileFilter`)]: ['jsonl'], [t('import.claude.allFiles')]: ['*'] },
        title: t(`${subI18n}.selectFile`),
      });
      if (!uris || uris.length === 0) return;
      filePaths = uris.map(u => u.fsPath);
    } else {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: t(`${subI18n}.selectDir`),
      });
      if (!uris || uris.length === 0) return;
      filePaths = findJsonlFiles(uris[0].fsPath);
      if (fileExclude) {
        filePaths = filePaths.filter(f => path.basename(f) !== fileExclude);
      }
      if (filePaths.length === 0) {
        vscode.window.showInformationMessage(t('import.claude.noFilesSelected'));
        return;
      }
    }
  }

  // Shared picker
  const picked = await pickJsonlFiles(filePaths, t(pickerLabelKey));
  if (picked === undefined) return;
  if (!picked || picked.length === 0) return;

  // Shared import loop
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t(`${i18nPrefix}.progress`),
      cancellable,
    },
    async (progress, token) => {
      for (let i = 0; i < picked.length; i++) {
        if (cancellable && token.isCancellationRequested) break;

        const filePath = picked[i];
        const fileName = path.basename(filePath);
        if (cancellable) {
          progress.report({ message: fileName, increment: 100 / picked.length });
        }

        try {
          // Large file gate: warn user before importing files >50MB
          const stat = await fs.promises.stat(filePath);
          const sizeMB = stat.size / 1024 / 1024;
          if (sizeMB > 50) {
            const choice = await vscode.window.showWarningMessage(
              `文件 "${fileName}" 大小为 ${sizeMB.toFixed(1)} MB（超过 50MB），导入可能导致内存占用过高、VS Code 卡顿甚至崩溃。是否继续导入？`,
              { modal: true },
              '继续导入',
              '跳过',
            );
            if (choice !== '继续导入') {
              skipped++;
              continue;
            }
          }

          const result = importIsAsync
            ? await importJsonlFile(storage, filePath)
            : importJsonlFile(storage, filePath);
          if (result) imported++;
          else skipped++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${fileName}: ${message}`);
          skipped++;
        }
      }
    },
  );

  reportImportResult(imported, skipped, errors, i18nPrefix);
}

// ── Shared result reporting ──────────────────────────────────

function reportImportResult(
  imported: number,
  skipped: number,
  errors: string[],
  agentI18nPrefix: string,
): void {
  // Tree provider refresh is handled by the caller via the extension-level reference.
  // We trigger via a global callback set in extension.ts.
  if (_onRefresh) _onRefresh();

  if (imported > 0) {
    vscode.window.showInformationMessage(
      t(`${agentI18nPrefix}.imported`, imported,
        skipped > 0 ? t('import.claude.skipped', skipped) : ''),
    );
  } else if (skipped > 0 || errors.length > 0) {
    const specificEmptyKey = `${agentI18nPrefix}.allEmpty`;
    const emptyMsg = t(specificEmptyKey);
    const fallback = emptyMsg !== specificEmptyKey ? emptyMsg : t('import.claude.allEmpty');
    vscode.window.showWarningMessage(
      t('import.claude.noneImported', errors.length > 0 ? errors[0] : fallback),
    );
  }
}

// ── Tree refresh callback (set by extension.ts) ──────────────

let _onRefresh: (() => void) | null = null;
export function setRefreshCallback(cb: () => void): void { _onRefresh = cb; }

// ── Agent-specific handlers (thin wrappers) ──────────────────

export async function handleCodeAgentImport(
  storage: Storage,
  mode: 'auto' | 'manual',
): Promise<void> {
  await handleJsonlImport(storage, mode, {
    i18nPrefix: 'import.codeagent',
    autoDir: path.join(os.homedir(), '.cac', 'projects'),
    fileExclude: 'obs.jsonl',
    pickerLabelKey: 'agent.codeAgent',
    manualI18nPrefix: 'import.codeagent',
    cancellable: false,
    importIsAsync: true,
  });
}

export async function handleClaudeImport(
  storage: Storage,
  mode: 'auto' | 'manual',
): Promise<void> {
  await handleJsonlImport(storage, mode, {
    i18nPrefix: 'import.claude',
    autoDir: getClaudeProjectsDir(),
    pickerLabelKey: 'import.claude.codeLabel',
    manualI18nPrefix: 'import.claude',
    cancellable: true,
    importIsAsync: false,
  });
}

export async function handleOpenCodeImport(
  storage: Storage,
  mode: 'auto' | 'manual',
): Promise<void> {

  let dbPath: string | null;

  if (mode === 'auto') {
    dbPath = tryAutoFindOpenCodeDb();
    if (!dbPath) {
      vscode.window.showInformationMessage(t('import.opencode.dbNotFound'));
      return;
    }
  } else {
    dbPath = await browseForDbPath();
    if (!dbPath) return;
  }

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
          const result = await importOpenCodeSession(storage, dbPath!, session.id);
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

  reportImportResult(imported, skipped, errors, 'import.opencode');
}
