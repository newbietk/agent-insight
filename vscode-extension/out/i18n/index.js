"use strict";
/**
 * 中文翻译模块（单语言，无国际化检测）。
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.t = t;
exports.getBundle = getBundle;
exports.getLocale = getLocale;
const zh_cn_1 = __importDefault(require("./zh-cn"));
/**
 * 翻译函数。直接从中文 bundle 查找，支持 {0} {1} 占位替换。
 */
function t(key, ...args) {
    let template = zh_cn_1.default[key];
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
function getBundle() {
    return zh_cn_1.default;
}
/** @deprecated 仅为兼容旧签名保留，内部无操作 */
function getLocale() {
    return 'zh-cn';
}
exports.default = t;
//# sourceMappingURL=index.js.map