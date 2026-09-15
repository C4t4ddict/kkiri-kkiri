// Run before the app and styles load, so a saved dark theme never flashes white.
(function () {
  'use strict';
  var storageKey = 'kkiri_web_theme';
  var listeners = new Set();
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function normalize(value) {
    return value === 'light' || value === 'dark' ? value : 'system';
  }
  function readPreference() {
    try { return normalize(window.localStorage.getItem(storageKey)); }
    catch (_) { return 'system'; }
  }
  var preference = readPreference();
  var resolved;
  function apply() {
    resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#141821' : '#f7f8fc';
    listeners.forEach(function (listener) { listener(); });
  }
  window.kkiriTheme = {
    getSnapshot: function () { return preference + ':' + resolved; },
    setPreference: function (value) {
      preference = normalize(value);
      try { window.localStorage.setItem(storageKey, preference); } catch (_) { /* In-memory preference still works. */ }
      apply();
    },
    subscribe: function (listener) {
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    },
  };
  media.addEventListener('change', function () { if (preference === 'system') apply(); });
  window.addEventListener('storage', function (event) {
    if (event.key === storageKey || event.key === null) { preference = readPreference(); apply(); }
  });
  apply();
})();
