import * as vscode from 'vscode';
import { Storage } from '../storage/db';
import { getWebviewContent } from '../media/webviewContent';
import { uploadFeedback, FeedbackForm } from '../feedback/upload';
import { t } from '../i18n';

/** Environment variable used to configure the cloud submission endpoint at install time. */
const ENV_CLOUD_URL = 'CANNBOT_CLOUD_URL';

/**
 * Resolve the cloud upload URL:
 * 1. `CANNBOT_CLOUD_URL` env var (set during VSIX install)
 * 2. VS Code `hismartlite.cloudUrl` config setting
 * 3. Returns empty string if neither is meaningfully configured.
 */
function getCloudUrl(): string {
  const envUrl = process.env[ENV_CLOUD_URL];
  if (envUrl && envUrl.trim()) return envUrl.trim();

  const configUrl = vscode.workspace.getConfiguration('hismartlite').get<string>('cloudUrl');
  if (configUrl && configUrl.trim()) return configUrl.trim();

  return '';
}

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

    const cloudUrl = getCloudUrl();

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
    panel.webview.html = getWebviewContent(data, panel.webview.cspSource, nonce, cloudUrl, sessionId);

    panel.onDidDispose(() => {
      this.panels.delete(sessionId);
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'submitFeedback') {
        const form: FeedbackForm = {
          issueType: msg.issueType || 'other',
          problemDescription: msg.problemDescription || '',
          helpRequest: msg.helpRequest || '',
          contactEmail: msg.contactEmail || '',
        };

        // Guard: cloud URL not configured (no env var, no config)
        if (!cloudUrl) {
          panel.webview.postMessage({
            type: 'feedbackResult',
            success: false,
            error: t('feedback.uploadDisabled'),
          });
          return;
        }

        try {
          const result = await uploadFeedback(this.storage, sessionId, form, cloudUrl);
          panel.webview.postMessage({
            type: 'feedbackResult',
            success: result.success,
            submissionId: result.submissionId,
            error: result.error ? t('feedback.uploadFailed', result.error) : undefined,
          });
        } catch (err) {
          panel.webview.postMessage({
            type: 'feedbackResult',
            success: false,
            error: t('feedback.uploadFailed', err instanceof Error ? err.message : String(err)),
          });
        }
      }
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
