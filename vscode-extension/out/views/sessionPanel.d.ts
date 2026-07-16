import * as vscode from 'vscode';
import { Storage } from '../storage/db';
export declare class SessionPanelManager {
    private storage;
    private panels;
    private activeTabs;
    private refreshBusy;
    constructor(storage: Storage);
    show(context: vscode.ExtensionContext, sessionId: string): Promise<void>;
    private handleRefresh;
    disposeAll(): void;
}
//# sourceMappingURL=sessionPanel.d.ts.map