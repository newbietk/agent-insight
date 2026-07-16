/**
 * 中文翻译模块（单语言，无国际化检测）。
 */
/**
 * 翻译函数。直接从中文 bundle 查找，支持 {0} {1} 占位替换。
 */
export declare function t(key: string, ...args: (string | number)[]): string;
/**
 * 获取完整翻译 bundle（供 webview 嵌入用）。
 */
export declare function getBundle(): Record<string, string>;
/** @deprecated 仅为兼容旧签名保留，内部无操作 */
export declare function getLocale(): string;
export default t;
//# sourceMappingURL=index.d.ts.map