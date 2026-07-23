import * as vscode from 'vscode';
export declare class WelcomeViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    static readonly viewType = "hismartlite.welcome";
    private _view?;
    constructor(_extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private _getHtml;
}
//# sourceMappingURL=welcomeView.d.ts.map