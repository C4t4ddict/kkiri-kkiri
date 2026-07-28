const assert = require('node:assert/strict');
const test = require('node:test');
const { buildApplicationTimeline, sanitizeTemplate } = require('../service');

test('지원서 템플릿의 공백과 길이를 정규화한다', () => {
  const template = sanitizeTemplate({
    title: `  ${'가'.repeat(100)}  `,
    content: `  ${'나'.repeat(2100)}  `,
    is_default: 1,
  });

  assert.equal(template.title.length, 80);
  assert.equal(template.content.length, 2000);
  assert.equal(template.isDefault, true);
});

test('비어 있는 지원서 템플릿을 감지할 수 있다', () => {
  const template = sanitizeTemplate({ title: '   ', content: '' });
  assert.equal(template.title, '');
  assert.equal(template.content, '');
});

test('지원 상태를 합류 제안과 최종 확정 타임라인으로 변환한다', () => {
  const timeline = buildApplicationTimeline({
    application_status: 'APPROVED',
    offer_status: 'ACCEPTED',
    applied_at: '2026-07-20T10:00:00.000Z',
    offer_created_at: '2026-07-21T10:00:00.000Z',
    offer_responded_at: '2026-07-22T10:00:00.000Z',
  }, []);

  assert.deepEqual(timeline.map((step) => step.state), ['completed', 'completed', 'completed', 'completed']);
  assert.equal(timeline.at(-1).label, '팀 합류 확정');
});
