import * as vscode from 'vscode';
import { Storage } from '../storage/db';
export declare class SessionPanelManager {
    private storage;
    private panels;
    constructor(storage: Storage);
    show(context: vscode.ExtensionContext, sessionId: string): Promise<void>;
    disposeAll(): void;
}
//# sourceMappingURL=sessionPanel.d.ts.map