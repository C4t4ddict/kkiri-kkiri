const assert = require('node:assert/strict');
const test = require('node:test');
const { detectImageFormat, inspectImageName } = require('../secureImageUpload');

test('허용된 단일 이미지 확장자와 MIME만 통과한다', () => {
  assert.deepEqual(inspectImageName('activity.jpg', 'image/jpeg'), { extension: '.jpg', format: 'jpeg' });
  assert.deepEqual(inspectImageName('activity.webp', 'image/webp'), { extension: '.webp', format: 'webp' });
  assert.equal(inspectImageName('activity.php.jpg', 'image/jpeg'), null);
  assert.equal(inspectImageName('activity.jpg', 'application/octet-stream'), null);
  assert.equal(inspectImageName('../activity.png', 'image/png')?.format, 'png');
});

test('파일 시그니처로 실제 이미지 형식을 판별한다', () => {
  assert.equal(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
  assert.equal(detectImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'png');
  assert.equal(detectImageFormat(Buffer.from('RIFF1234WEBP')), 'webp');
  assert.equal(detectImageFormat(Buffer.from('not-an-image')), null);
});
