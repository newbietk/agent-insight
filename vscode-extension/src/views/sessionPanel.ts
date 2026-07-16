import * as vscode from 'vscode';
import { Storage } from '../storage/db';
import { syncSession } from '../importer';
import { getWebviewContent } from '../media/webviewContent';
import { t } from '../i18n';

export class SessionPanelManager {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private activeTabs: Map<string, string> = new Map();
  private refreshBusy: Set<string> = new Set();

  constructor(private storage: Storage) {}

  async show(context: vscode.ExtensionContext, sessionId: string): Promise<void> {
    const existing = this.panels.get(sessionId);
    if (existing) {
      existing.reveal(vscode.ViewColumn.One);
      return;
    }

    const data = this.storage.getSessionDetail(sessionId);
    if (!data) {
      vscode.window.showErrorMessage(t('session.notFound', sessionId));
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'hismartlite.sessionDetail',
      t('detail.panelTitle', data.session.taskId.substring(0, 30)),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const nonce = getNonce();
    const initialTab = this.activeTabs.get(sessionId) || 'overview';
    panel.webview.html = getWebviewContent(data, panel.webview.cspSource, nonce, sessionId, initialTab);

    // Handle messages from webview: tab tracking and manual/auto refresh
    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'tabChange' && msg.tab) {
        this.activeTabs.set(sessionId, msg.tab);
      }
      if (msg.type === 'requestRefresh') {
        this.handleRefresh(sessionId, panel);
      }
    });

    panel.onDidDispose(() => {
      this.panels.delete(sessionId);
    });

    this.panels.set(sessionId, panel);
  }

  private async handleRefresh(sessionId: string, panel: vscode.WebviewPanel): Promise<void> {
    if (this.refreshBusy.has(sessionId)) return;
    this.refreshBusy.add(sessionId);
    try {
      const result = await syncSession(this.storage, sessionId);
      if (result.newTurnCount > 0) {
        const data = this.storage.getSessionDetail(sessionId);
        if (data) {
          const nonce = getNonce();
          const initialTab = this.activeTabs.get(sessionId) || 'overview';
          panel.webview.html = getWebviewContent(data, panel.webview.cspSource, nonce, sessionId, initialTab, {
            newTurnCount: result.newTurnCount,
            totalTurnCount: result.totalTurnCount,
          });
        }
      }
    } catch {
      // silent in background
    } finally {
      this.refreshBusy.delete(sessionId);
    }
  }

  disposeAll(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
    this.activeTabs.clear();
    this.refreshBusy.clear();
  }
}

function getNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
