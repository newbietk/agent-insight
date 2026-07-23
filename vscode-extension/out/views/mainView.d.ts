import * as vscode from 'vscode';
interface SessionItem {
    id: string;
    taskId: string;
    label: string | null;
    framework: string;
    model: string | null;
    totalTokens: number;
    totalCost: number;
    totalLatencyMs: number;
    turnCount: number;
    createdAt: string;
}
export declare class MainViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    static readonly viewType = "hismartlite.main";
    private _view?;
    private _mode;
    private _sessions;
    constructor(_extensionUri: vscode.Uri);
    /** Push current state into the webview. Safe to call before view is resolved. */
    setState(mode: 'welcome' | 'sessions' | 'welcome-expanded', sessions: SessionItem[]): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private _getHtml;
}
export {};
//# sourceMappingURL=mainView.d.ts.map