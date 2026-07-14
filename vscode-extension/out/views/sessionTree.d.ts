import * as vscode from 'vscode';
import { Storage } from '../storage/db';
import type { SessionListItem } from '../storage/db';
export declare class SessionTreeDataProvider implements vscode.TreeDataProvider<SessionTreeItem> {
    private storage;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | SessionTreeItem | undefined>;
    constructor(storage: Storage);
    refresh(): void;
    getTreeItem(element: SessionTreeItem): vscode.TreeItem;
    getChildren(element?: SessionTreeItem): vscode.ProviderResult<SessionTreeItem[]>;
}
export declare class SessionTreeItem extends vscode.TreeItem {
    readonly session: SessionListItem;
    constructor(session: SessionListItem);
}
//# sourceMappingURL=sessionTree.d.ts.map