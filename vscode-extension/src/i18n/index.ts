/**
 * 中文翻译模块（单语言，无国际化检测）。
 */

import zhCN from './zh-cn';

/**
 * 翻译函数。直接从中文 bundle 查找，支持 {0} {1} 占位替换。
 */
export function t(key: string, ...args: (string | number)[]): string {
  let template = zhCN[key];
  if (template === undefined) {
    // key 不存在时返回 key 本身，方便发现遗漏
    return key;
  }
  return template.replace(/\{(\d+)\}/g, (_, idx) => {
    const val = args[Number(idx)];
    return val !== undefined ? String(val) : `{${idx}}`;
  });
}

/**
 * 获取完整翻译 bundle（供 webview 嵌入用）。
 */
export function getBundle(): Record<string, string> {
  return zhCN;
}

/** @deprecated 仅为兼容旧签名保留，内部无操作 */
export function getLocale(): string {
  return 'zh-cn';
}

export default t;
