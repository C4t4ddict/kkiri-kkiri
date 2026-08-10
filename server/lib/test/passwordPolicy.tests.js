const test = require('node:test');
const assert = require('node:assert/strict');
const { getPasswordValidationError } = require('../passwordPolicy');

test('비밀번호는 8자 이상이며 두 종류 이상의 문자를 사용한다', () => {
  assert.equal(getPasswordValidationError('safePass1'), null);
  assert.equal(getPasswordValidationError('안전한암호123'), null);
  assert.match(getPasswordValidationError('0000'), /8자 이상/);
  assert.match(getPasswordValidationError('abcdefgh'), /2종류/);
  assert.match(getPasswordValidationError('safe pass1'), /공백/);
});
