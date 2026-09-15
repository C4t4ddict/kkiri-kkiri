const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { runInNewContext } = require('node:vm');
const scope = { exports: {} };
runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../web/src/features/home/shortcutPreferences.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, scope);
const { defaultShortcuts, normalizeShortcuts, moveShortcut } = scope.exports;
assert.ok(defaultShortcuts.includes('friends'));
assert.ok(!defaultShortcuts.includes('archive'));
assert.equal(JSON.stringify(normalizeShortcuts(['portfolio', 'portfolio', 'unknown', 'curriculum'])), '["portfolio","curriculum"]');
for (const value of [null, {}, [], ['bad']]) assert.equal(JSON.stringify(normalizeShortcuts(value)), JSON.stringify(defaultShortcuts));
assert.equal(JSON.stringify(moveShortcut(['friends', 'portfolio'], 1, -1)), '["portfolio","friends"]');
assert.equal(JSON.stringify(moveShortcut(['friends', 'portfolio'], 0, -1)), '["friends","portfolio"]');
console.log('PASS shortcut defaults, sanitization, fallback, ordering and bounds');
