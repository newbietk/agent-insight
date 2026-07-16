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
      '--bg': '#fafafc', '--card-bg': '#ffffff',
      '--text': '#2c3040', '--text-dim': '#828ba0',
      '--border': '#e0e3eb', '--accent': '#4d7cde',
      '--green': '#2d9f6d', '--orange': '#c8712a',
      '--blue': '#4d7cde', '--purple': '#7849b8',
      '--red': '#d9434a', '--yellow': '#9d8200',
      '--theme-bar-bg': 'rgba(0,0,0,0.03)', '--theme-btn-ring': 'rgba(77,124,222,0.5)'
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