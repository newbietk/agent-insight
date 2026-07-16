"use strict";
// Theme engine for the webview.
// Provides CSS custom properties for dark/light themes and the JS runtime.
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeRuntimeJS = themeRuntimeJS;
function themeRuntimeJS() {
    return `
// ── Theme Engine ────────────────────────────────────────────
var THEMES = {
  dark: {
    label: 'Dark',
    css: {
      '--bg': '#1b1e2b', '--card-bg': '#212433',
      '--text': '#cdd6e0', '--text-dim': '#7c8496',
      '--border': '#353a4e', '--accent': '#629af0',
      '--green': '#5ec49e', '--orange': '#e09a6b',
      '--blue': '#73abed', '--purple': '#b898e8',
      '--red': '#e8676b', '--yellow': '#dcc87a',
      '--theme-bar-bg': 'rgba(255,255,255,0.03)', '--theme-btn-ring': 'rgba(98,154,240,0.5)'
    }
  },
  light: {
    label: 'Light',
    css: {
      '--bg': '#f3f4f7', '--card-bg': '#ffffff',
      '--text': '#1a1d2b', '--text-dim': '#4e5569',
      '--border': '#d8dbe3', '--accent': '#3b6fd4',
      '--green': '#23805a', '--orange': '#b05a1e',
      '--blue': '#3b6fd4', '--purple': '#6942b8',
      '--red': '#c8383f', '--yellow': '#8a7300',
      '--theme-bar-bg': 'rgba(0,0,0,0.025)', '--theme-btn-ring': 'rgba(59,111,212,0.5)'
    }
  }
};

var THEME_KEY = 'kirinai-theme';
var currentTheme = 'light';

function applyTheme(name) {
  name = name || 'dark';
  var th = THEMES[name];
  if (!th) return;
  currentTheme = name;
  var root = document.documentElement;
  var css = th.css;
  for (var k in css) {
    if (css.hasOwnProperty(k)) {
      root.style.setProperty(k, css[k]);
    }
  }
  document.querySelectorAll('.theme-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-theme') === name);
  });
  try { localStorage.setItem(THEME_KEY, name); } catch(e) {}
}

function buildThemeBar() {
  var bar = document.getElementById('themeBar');
  if (!bar) return;

  var toggle = document.createElement('div');
  toggle.className = 'theme-toggle';

  var keys = ['dark', 'light'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.setAttribute('data-theme', k);
    btn.textContent = THEMES[k].label;
    btn.addEventListener('click', function() {
      var name = this.getAttribute('data-theme');
      if (name) applyTheme(name);
    });
    toggle.appendChild(btn);
  }
  bar.appendChild(toggle);
}

function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch(e) {}
  var name = saved && THEMES[saved] ? saved : 'light';
  applyTheme(name);
  buildThemeBar();
}
`;
}
//# sourceMappingURL=theme.js.map