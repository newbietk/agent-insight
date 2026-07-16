import * as vscode from 'vscode';
import { Storage } from '../storage/db';
import type { SessionListItem } from '../storage/db';
import { t } from '../i18n';

export class SessionTreeDataProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private storage: Storage) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem): vscode.ProviderResult<SessionTreeItem[]> {
    if (element) return [];

    const sessions = this.storage.listSessions();
    if (sessions.length === 0) {
      const empty = new vscode.TreeItem(t('session.empty'), vscode.TreeItemCollapsibleState.None);
      empty.description = t('session.emptyHint');
      empty.command = { command: 'hismartlite.import', title: t('common.import') };
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty as unknown as SessionTreeItem];
    }

    return sessions.map(s => new SessionTreeItem(s));
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: SessionListItem) {
    const label = session.label || session.query || session.taskId || t('common.unknown');
    super(label, vscode.TreeItemCollapsibleState.None);

    // ── Description line: agent badge · model · tokens · cost · time ──
    const fw = session.framework === 'opencode' ? t('agent.opencode') : t('agent.claudeCode');
    const modelShort = (session.model || t('common.unknown')).substring(0, 22);
    const parts = [
      fw,
      modelShort,
      `${fmtNum(session.totalTokens)} tk`,
      `$${session.totalCost.toFixed(3)}`,
      timeAgo(session.createdAt),
    ];
    this.description = parts.join('  ·  ');

    // ── Tooltip: rich Markdown ──
    const md = new vscode.MarkdownString();
    md.supportHtml = true;
    md.isTrusted = true;
    md.appendMarkdown(`### ${escapeMd(label)}\n\n`);
    md.appendMarkdown(`| | |\n|---|---|\n`);
    md.appendMarkdown(`| **${t('common.framework')}** | ${fw} |\n`);
    md.appendMarkdown(`| **${t('common.model')}** | ${session.model || t('common.unknown')} |\n`);
    md.appendMarkdown(`| **${t('common.tokens')}** | ${fmtNum(session.totalTokens)} |\n`);
    md.appendMarkdown(`| **${t('common.cost')}** | $${session.totalCost.toFixed(4)} |\n`);
    md.appendMarkdown(`| **${t('common.turns')}** | ${session.turnCount} |\n`);
    md.appendMarkdown(`| **${t('common.latency')}** | ${fmtMs(session.totalLatencyMs)} |\n`);
    md.appendMarkdown(`| **${t('common.taskId')}** | \`${session.taskId}\` |\n`);
    md.appendMarkdown(`\n${t('tree.tooltip.clickToOpen')}`);
    this.tooltip = md;

    // ── Icon: different per framework ──
    this.iconPath = session.framework === 'opencode'
      ? new vscode.ThemeIcon('database')
      : new vscode.ThemeIcon('json');

    this.contextValue = 'session';

    this.command = {
      command: 'hismartlite.openSession',
      title: t('session.openDetail'),
      arguments: [session.id],
    };
  }
}

// ── Formatters ─────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtMs(ms: number): string {
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + 'min';
  if (ms >= 1_000) return (ms / 1_000).toFixed(1) + 's';
  return ms + 'ms';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}
