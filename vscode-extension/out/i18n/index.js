"use strict";
/**
 * Internationalization module for KirinAI Insight.
 *
 * Detects VSCode locale and provides a `t(key, ...args)` function for string
 * lookup with positional interpolation.
 *
 * Default language: Chinese Simplified (zh-cn).
 * Falls back to zh-cn for any unrecognized locale.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocale = getLocale;
exports.t = t;
exports.getBundle = getBundle;
const zh_cn_1 = __importDefault(require("./zh-cn"));
const en_1 = __importDefault(require("./en"));
const bundles = {
    'zh-cn': zh_cn_1.default,
    'zh-tw': zh_cn_1.default, // Traditional Chinese falls back to Simplified for now
    en: // Traditional Chinese falls back to Simplified for now
    en_1.default,
};
/** Current locale, set once on first access. */
let _locale = null;
/** Get the effective locale. Uses vscode.env.language when available. */
function getLocale() {
    if (_locale)
        return _locale;
    try {
        // Dynamic import to avoid module-level dependency on vscode
        const vscode = require('vscode');
        const lang = vscode.env.language?.toLowerCase() || 'zh-cn';
        // Map VSCode locale to our bundle: zh-cn, zh-tw → zh-cn; everything else → en
        if (lang.startsWith('zh')) {
            _locale = 'zh-cn';
        }
        else {
            _locale = 'en';
        }
    }
    catch {
        // Outside VSCode (e.g. tests): default to zh-cn
        _locale = 'zh-cn';
    }
    return _locale;
}
/**
 * Translate a key. Supports positional arguments `{0}`, `{1}`, etc.
 *
 * @example
 *   t('import.claude.imported', 3, ', 1 skipped')
 *   // zh-cn → '已导入 3 个 Claude Code 会话，跳过 1 个'
 *   // en    → 'Imported 3 Claude Code session(s), 1 skipped'
 */
function t(key, ...args) {
    const locale = getLocale();
    const bundle = bundles[locale] || bundles['zh-cn'];
    let template = bundle[key];
    if (template === undefined) {
        // Fallback to English, then key itself
        template = bundles['en']?.[key] ?? key;
    }
    // Replace positional placeholders
    return template.replace(/\{(\d+)\}/g, (_, idx) => {
        const val = args[Number(idx)];
        return val !== undefined ? String(val) : `{${idx}}`;
    });
}
/**
 * Get the full translation bundle for the current locale.
 * Used to embed i18n data into webviews.
 */
function getBundle() {
    const locale = getLocale();
    return bundles[locale] || bundles['zh-cn'];
}
exports.default = t;
//# sourceMappingURL=index.js.map