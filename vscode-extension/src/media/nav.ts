// Navigation bus for cross-tab interaction in the webview.
// Provides the __kirinai global that each tab can call to navigate/highlight/scroll.

export interface NavParams {
  turnId?: string;
  turnIndex?: number;
  toolCallId?: string;
  skillName?: string;
  subagentSessionId?: string;
  filePath?: string;
  searchQuery?: string;
  highlight?: string;
}

/** Returns the JS runtime code for the navigation bus. */
export function navRuntimeJS(): string {
  return `
// ── Navigation Bus ──────────────────────────────────────────
window.__kirinai = (function() {
  var listeners = {};

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(function(f) { return f !== fn; });
  }

  function emit(event, params) {
    if (!listeners[event]) return;
    listeners[event].forEach(function(fn) {
      try { fn(params); } catch(e) { console.error('[Context nav]', event, e); }
    });
  }

  /**
   * Navigate to a tab with optional params.
   * Usage: __kirinai.navigate('trace', { turnId: 'abc123' })
   * The target tab listens via __kirinai.on('navigate:trace', fn)
   */
  function navigate(tabName, params) {
    // 1. Switch the visual tab
    switchTab(tabName);
    // 2. Notify the target tab
    setTimeout(function() {
      emit('navigate:' + tabName, params || {});
    }, 50);
  }

  /**
   * Programmatically switch tabs without triggering navigation events.
   * Used internally by the shell tab click handler.
   */
  function switchTo(tabName) {
    switchTab(tabName);
  }

  /**
   * Highlight a turn in the turns tab (without switching).
   */
  function highlightTurn(turnId) {
    emit('highlight:turn', { turnId: turnId });
  }

  /**
   * Scroll to a turn in the turns tab.
   */
  function scrollToTurn(turnId) {
    emit('scroll:turn', { turnId: turnId });
  }

  return {
    on: on,
    off: off,
    emit: emit,
    navigate: navigate,
    switchTo: switchTo,
    highlightTurn: highlightTurn,
    scrollToTurn: scrollToTurn
  };
})();
`;
}
