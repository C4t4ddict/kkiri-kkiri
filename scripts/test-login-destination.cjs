const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { runInNewContext } = require('node:vm');
const scope = { exports: {} };
runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../web/src/shared/auth/loginDestination.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, scope);
const { loginDestination } = scope.exports;
for (const value of [undefined, null, {}, 42, 'https://example.com', '//example.com', '/\\example.com', '/\n/evil', '/login', '/login?next=/login', '/register', '/forgot-password']) {
  assert.equal(loginDestination(value), '/');
}
for (const value of ['/', '/activity?team=12#goals', '/matching/applications', '/activity/portfolios/1']) {
  assert.equal(loginDestination(value), value);
}
console.log('PASS login internal destinations, query/hash preservation, external URLs and auth loop rejection');
