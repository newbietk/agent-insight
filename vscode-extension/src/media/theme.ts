// 浅色主题引擎（仅浅色，无切换）。
// 提供 CSS 自定义属性（运行时注入到 webview）。

export function themeRuntimeJS(): string {
  return `
// ── 浅色主题 ────────────────────────────────────────────
(function() {
  var css = {
    '--bg': '#f3f4f7', '--card-bg': '#ffffff',
    '--text': '#1a1d2b', '--text-dim': '#4e5569',
    '--border': '#d8dbe3', '--accent': '#3b6fd4',
    '--green': '#23805a', '--orange': '#b05a1e',
    '--blue': '#3b6fd4', '--purple': '#6942b8',
    '--red': '#c8383f', '--yellow': '#8a7300',
    '--theme-bar-bg': 'rgba(0,0,0,0.025)', '--theme-btn-ring': 'rgba(59,111,212,0.5)'
  };
  var root = document.documentElement;
  for (var k in css) {
    if (css.hasOwnProperty(k)) {
      root.style.setProperty(k, css[k]);
    }
  }
})();
`;
}
