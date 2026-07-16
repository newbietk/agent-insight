"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPanelManager = void 0;
const vscode = __importStar(require("vscode"));
const webviewContent_1 = require("../media/webviewContent");
const i18n_1 = require("../i18n");
class SessionPanelManager {
    storage;
    panels = new Map();
    constructor(storage) {
        this.storage = storage;
    }
    async show(context, sessionId) {
        const existing = this.panels.get(sessionId);
        if (existing) {
            existing.reveal(vscode.ViewColumn.One);
            return;
        }
        const data = this.storage.getSessionDetail(sessionId);
        if (!data) {
            vscode.window.showErrorMessage((0, i18n_1.t)('session.notFound', sessionId));
            return;
        }
        const panel = vscode.window.createWebviewPanel('hismartlite.sessionDetail', (0, i18n_1.t)('detail.panelTitle', data.session.taskId.substring(0, 30)), vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        const nonce = getNonce();
        panel.webview.html = (0, webviewContent_1.getWebviewContent)(data, panel.webview.cspSource, nonce, sessionId);
        panel.onDidDispose(() => {
            this.panels.delete(sessionId);
        });
        this.panels.set(sessionId, panel);
    }
    disposeAll() {
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
        this.panels.clear();
    }
}
exports.SessionPanelManager = SessionPanelManager;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=sessionPanel.js.map