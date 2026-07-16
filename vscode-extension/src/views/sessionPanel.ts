import * as vscode from 'vscode';
import { Storage } from '../storage/db';
import { getWebviewContent } from '../media/webviewContent';
import { t } from '../i18n';

export class SessionPanelManager {
  private panels: Map<string, vscode.WebviewPanel> = new Map();

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
    panel.webview.html = getWebviewContent(data, panel.webview.cspSource, nonce, sessionId);

    panel.onDidDispose(() => {
      this.panels.delete(sessionId);
    });

    this.panels.set(sessionId, panel);
  }

  disposeAll(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 64; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
