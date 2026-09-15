const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const bootstrap = readFileSync(path.join(__dirname, '../web/public/theme-init.js'), 'utf8');
const css = readFileSync(path.join(__dirname, '../web/src/styles/theme.css'), 'utf8');
function createBrowser(saved, dark = false, blocked = false) {
  const events = {};
  const media = { matches: dark, addEventListener: (name, callback) => { events.media = callback; } };
  const storage = new Map(saved ? [['kkiri_web_theme', saved]] : []);
  const document = { documentElement: { dataset: {}, style: {} }, querySelector: () => meta };
  const meta = {};
  const window = {
    matchMedia: () => media,
    localStorage: {
      getItem: key => { if (blocked) throw Error('Storage denied'); return storage.get(key); },
      setItem: (key, value) => { if (blocked) throw Error('Storage denied'); storage.set(key, value); },
    },
    addEventListener: (name, callback) => { events[name] = callback; },
  };
  runInNewContext(bootstrap, { window, document, Set });
  return { runtime: window.kkiriTheme, document, storage, media, events, meta };
}
test('saved dark mode is applied before React loads', () => {
  const browser = createBrowser('dark');
  assert.equal(browser.document.documentElement.dataset.theme, 'dark');
  assert.equal(browser.document.documentElement.style.colorScheme, 'dark');
  assert.equal(browser.meta.content, '#141821');
});
test('switch toggles both ways, notifies subscribers, and survives a reload', () => {
  const browser = createBrowser('light');
  let calls = 0;
  const unsubscribe = browser.runtime.subscribe(() => calls++);
  browser.runtime.setPreference('dark');
  assert.equal(browser.runtime.getSnapshot(), 'dark:dark');
  assert.equal(createBrowser(browser.storage.get('kkiri_web_theme')).runtime.getSnapshot(), 'dark:dark');
  browser.runtime.setPreference('light');
  assert.equal(browser.document.documentElement.dataset.theme, 'light');
  assert.equal(browser.meta.content, '#f7f8fc');
  assert.equal(calls, 2);
  unsubscribe();
  browser.runtime.setPreference('dark');
  assert.equal(calls, 2);
});
test('an explicit on/off choice does not follow subsequent system changes', () => {
  const browser = createBrowser(null, true);
  assert.equal(browser.runtime.getSnapshot(), 'system:dark');
  browser.runtime.setPreference('light');
  browser.events.media();
  assert.equal(browser.runtime.getSnapshot(), 'light:light');
});
test('other tabs update, including clearing stored settings', () => {
  const browser = createBrowser('light');
  browser.storage.set('kkiri_web_theme', 'dark');
  browser.events.storage({ key: 'kkiri_web_theme' });
  assert.equal(browser.runtime.getSnapshot(), 'dark:dark');
  browser.storage.clear();
  browser.events.storage({ key: null });
  assert.equal(browser.runtime.getSnapshot(), 'system:light');
});
test('blocked storage does not prevent theme switching', () => {
  const browser = createBrowser(null, false, true);
  browser.runtime.setPreference('dark');
  assert.equal(browser.runtime.getSnapshot(), 'dark:dark');
  browser.runtime.setPreference('light');
  assert.equal(browser.runtime.getSnapshot(), 'light:light');
});
test('invalid stored values never become CSS theme attributes', () => {
  const browser = createBrowser('unknown-theme');
  assert.equal(browser.document.documentElement.dataset.theme, 'light');
});
function luminance(hex) {
  const values = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
const token = name => css.match(new RegExp(`--theme-${name}:\\s*(#[a-f\\d]{6})`, 'i'))[1];
test('dark text tokens meet 4.5:1 contrast on each reading surface', () => {
  for (const foreground of ['text', 'text-sub', 'text-muted', 'accent']) {
    for (const background of ['canvas', 'surface', 'surface-subtle', 'surface-muted']) {
      const contrast = (luminance(token(foreground)) + .05) / (luminance(token(background)) + .05);
      assert.ok(contrast >= 4.5, `${foreground} on ${background}: ${contrast}`);
    }
  }
});
test('semantic warnings and errors have readable text on their tinted surfaces', () => {
  for (const family of ['danger', 'warning', 'success', 'info', 'accent']) {
    assert.ok((luminance(token(family)) + .05) / (luminance(token(family + '-soft')) + .05) >= 4.5, family);
  }
});
