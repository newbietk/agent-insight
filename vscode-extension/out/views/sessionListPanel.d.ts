import * as vscode from 'vscode';
import { Storage } from '../storage/db';
export declare class SessionListPanelProvider implements vscode.WebviewViewProvider {
    private storage;
    private _view?;
    private _disposables;
    private _activationError;
    constructor(storage: Storage | null, activationError?: string | null);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    refresh(): void;
    dispose(): void;
    private _handleMessage;
    private _render;
    private _emptyHtml;
    private _errorHtml;
    private _cardsHtml;
}
//# sourceMappingURL=sessionListPanel.d.ts.map