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
    const cloudUrl = getCloudUrl();
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

        // Re-read cloudUrl inside handler (may differ from panel creation time)
        const currentCloudUrl = getCloudUrl();
        console.log('[cannbot] Feedback upload requested, cloudUrl:', currentCloudUrl || '(not configured)');

        if (!currentCloudUrl) {
          console.log('[cannbot] Feedback upload blocked: no cloud URL configured');
          panel.webview.postMessage({
            type: 'feedbackResult',
            success: false,
            error: t('feedback.uploadDisabled'),
          });
          return;
        }

        try {
          console.log('[cannbot] Starting uploadFeedback...');
          // Belt-and-suspenders: race upload against a hard 5s wall.
          // If exportSessionBlob (sql.js WASM) or fetch hangs, this guarantees a response.
          const result = await Promise.race([
            uploadFeedback(this.storage, sessionId, form, currentCloudUrl),
            timeout(5_000, 'Upload timed out after 5s — server did not respond'),
          ]);
          console.log('[cannbot] Upload result:', JSON.stringify({ success: result.success, error: result.error }));
          panel.webview.postMessage({
            type: 'feedbackResult',
            success: result.success,
            submissionId: result.submissionId,
            error: result.error ? t('feedback.uploadFailed', result.error) : undefined,
          });
        } catch (err) {
          console.log('[cannbot] Upload threw:', err instanceof Error ? err.message : String(err));
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

/** Promise that rejects after `ms` milliseconds with the given message. */
function timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 64; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
