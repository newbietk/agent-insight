/**
 * File discovery utilities for session import.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { t } from '../i18n';

// ── JSONL file discovery ─────────────────────────────────────

/** Check whether a directory directly contains any .jsonl files (non-recursive). */
function dirHasJsonl(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.some(e => e.isFile() && e.name.endsWith('.jsonl'));
  } catch {
    return false;
  }
}

export function findJsonlFiles(dirPath: string, visited?: Set<string>): string[] {
  const results: string[] = [];
  try {
    // Symlink cycle guard
    const real = fs.realpathSync(dirPath);
    if (!visited) visited = new Set();
    if (visited.has(real)) return results;
    visited.add(real);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Only skip 'subagents' directories that are direct children of a
        // Claude Code project root (a directory containing .jsonl files).
        // In Claude Code, .claude/projects/<name>/subagents/ stores nested
        // agent sessions that re-use the same JSONL as the parent — skipping
        // them avoids double-counting. Legitimate user directories named
        // 'subagents' elsewhere are still traversed.
        if (entry.name === 'subagents' && dirHasJsonl(dirPath)) continue;
        results.push(...findJsonlFiles(full, visited));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(full);
      }
    }
  } catch (e: any) {
    console.error(`[KirinAI] findJsonlFiles error in ${dirPath}: ${e.code || e.message}`);
  }
  return results;
}

// ── JSONL file picker ────────────────────────────────────────

function extractFirstUserQuery(filePath: string): string | null {
  try {
    // Read only the first ~8KB to avoid loading entire large files
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.toString('utf-8', 0, bytesRead);
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

export async function pickJsonlFiles(
  filePaths: string[],
  sourceLabel: string,
): Promise<string[] | undefined> {
  const items = filePaths.map(f => {
    const query = extractFirstUserQuery(f);
    return {
      label: query || path.basename(f),
      description: `${sourceLabel} · ${path.basename(f)}`,
      detail: path.dirname(f),
      filePath: f,
      picked: false,
    };
  });

  if (filePaths.length === 0) return [];

  const MAX_DIRECT_PICK = 20;
  const placeHolder = filePaths.length <= MAX_DIRECT_PICK
    ? t('import.picker.selectFiles', filePaths.length)
    : t('import.picker.selectFilesEsc', filePaths.length);

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder,
  });
  if (!selected) return undefined;
  return selected.map(s => s.filePath);
}

// ── Claude Code project dir ──────────────────────────────────

export function getClaudeProjectsDir(): string {
  const configPath = vscode.workspace.getConfiguration('hismartlite').get<string>('claudeProjectsPath');
  if (configPath) {
    return configPath.replace(/^~/, os.homedir());
  }
  return path.join(os.homedir(), '.claude', 'projects');
}

// ── OpenCode DB discovery ────────────────────────────────────

export function getOpenCodeDbPaths(): string[] {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

  if (process.platform === 'win32') {
    return [
      path.join(appData, 'opencode', 'opencode.db'),
      path.join(localAppData, 'opencode', 'opencode.db'),
      path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
    ];
  }
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db')];
  }
  return [path.join(home, '.local', 'share', 'opencode', 'opencode.db')];
}

export function tryAutoFindOpenCodeDb(): string | null {
  const autoPaths = getOpenCodeDbPaths();
  for (const p of autoPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function browseForDbPath(): Promise<string | null> {
  // Loop until user picks a valid .db file or cancels
  while (true) {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { [t('import.opencode.sqliteFilter')]: ['db'], [t('import.claude.allFiles')]: ['*'] },
      title: t('import.opencode.selectDb'),
    });
    if (!uris || uris.length === 0) return null;

    const filePath = uris[0].fsPath;
    if (filePath.endsWith('.db')) return filePath;

    // Invalid file type: warn and re-prompt
    const ext = path.extname(filePath) || path.basename(filePath);
    void vscode.window.showErrorMessage(t('import.opencode.invalidFileType', ext));
  }
}
