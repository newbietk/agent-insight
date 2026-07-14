/**
 * Internationalization module for KirinAI Insight.
 *
 * Detects VSCode locale and provides a `t(key, ...args)` function for string
 * lookup with positional interpolation.
 *
 * Default language: Chinese Simplified (zh-cn).
 * Falls back to zh-cn for any unrecognized locale.
 */
/** Get the effective locale. Uses vscode.env.language when available. */
export declare function getLocale(): string;
/**
 * Translate a key. Supports positional arguments `{0}`, `{1}`, etc.
 *
 * @example
 *   t('import.claude.imported', 3, ', 1 skipped')
 *   // zh-cn → '已导入 3 个 Claude Code 会话，跳过 1 个'
 *   // en    → 'Imported 3 Claude Code session(s), 1 skipped'
 */
export declare function t(key: string, ...args: (string | number)[]): string;
/**
 * Get the full translation bundle for the current locale.
 * Used to embed i18n data into webviews.
 */
export declare function getBundle(): Record<string, string>;
export default t;
//# sourceMappingURL=index.d.ts.map