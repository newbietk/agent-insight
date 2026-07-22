/**
 * File discovery utilities for session import.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { t } from '../i18n';

// ── JSONL file discovery ─────────────────────────────────────

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
        // Skip 'subagents' directories — in Claude Code these store nested
        // agent sessions that are now merged into the parent during import.
        if (entry.name === 'subagents') continue;
        results.push(...findJsonlFiles(full, visited));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(full);
      }
    }
  } catch (e: any) {
    console.error(`[Context] findJsonlFiles error in ${dirPath}: ${e.code || e.message}`);
  }
  return results;
}

// ── JSONL file picker ─────────────────────────────────────────

interface SessionMeta {
  title: string | null;
  /** First user message text. */
  firstQuery: string | null;
  /** First assistant response text — fallback when no title/query. */
  firstAssistant: string | null;
  model: string | null;
}

/** Extract title + firstQuery + firstAssistant + model from file header in one 8KB pass. */
async function extractSessionMetaAsync(filePath: string): Promise<SessionMeta> {
  try {
    const fd = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    await fd.close();
    const content = buf.toString('utf-8', 0, bytesRead);
    if (!content.trim()) return { title: null, firstQuery: null, firstAssistant: null, model: null };

    let title: string | null = null;
    let firstQuery: string | null = null;
    let firstAssistant: string | null = null;
    let model: string | null = null;

    const lines = content.split('\n');
    for (const line of lines) {
      if (title && firstQuery && firstAssistant && model) break;
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (!title && obj.type === 'ai-title' && obj.message) {
          const msg = obj.message;
          if (typeof msg.content === 'string') title = msg.content.substring(0, 500);
          else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) { title = block.text.substring(0, 500); break; }
            }
          }
        }
        if (!firstQuery && obj.type === 'user' && obj.message) {
          const msg = obj.message;
          if (typeof msg.content === 'string') firstQuery = msg.content.substring(0, 120);
          else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) { firstQuery = block.text.substring(0, 120); break; }
            }
          }
        }
        // First assistant text — fallback label for sessions without title or user text
        if (!firstAssistant && obj.type === 'assistant' && obj.message) {
          const msg = obj.message;
          if (typeof msg.content === 'string') firstAssistant = msg.content.substring(0, 120);
          else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) { firstAssistant = block.text.substring(0, 120); break; }
            }
          }
        }
        if (!model && obj.type === 'assistant' && obj.message?.model) {
          model = obj.message.model;
        }
      } catch { /* skip malformed */ }
    }
    return { title, firstQuery, firstAssistant, model };
  } catch {
    return { title: null, firstQuery: null, firstAssistant: null, model: null };
  }
}

export async function pickJsonlFiles(
  filePaths: string[],
  sourceLabel: string,
): Promise<string[] | undefined> {
  if (filePaths.length === 0) return [];

  // Sort by mtime descending
  const sorted = filePaths.slice().sort((a, b) => {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
  });

  // Load metadata in parallel batches for display labels
  const CONCURRENCY = 12;
  const metas: SessionMeta[] = new Array(sorted.length);
  for (let i = 0; i < sorted.length; i += CONCURRENCY) {
    const batch = sorted.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fp => extractSessionMetaAsync(fp)));
    for (let j = 0; j < results.length; j++) metas[i + j] = results[j];
  }

  // Build items: title as label, no tooltip, simple and reliable
  const items = sorted.map((fp, i) => {
    const meta = metas[i];
    const title = meta.title || meta.firstQuery || meta.firstAssistant || path.basename(fp, '.jsonl');
    return {
      label: title.length > 80 ? title.substring(0, 80) + '…' : title,
      description: meta.model ? `${sourceLabel} · ${meta.model}` : sourceLabel,
      detail: path.dirname(fp),
      filePath: fp,
    };
  });

  // Use the simple showQuickPick API — no createQuickPick complexity
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: t('import.picker.selectFiles', sorted.length),
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked || picked.length === 0) return undefined;
  return picked.map((p: any) => p.filePath);
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
