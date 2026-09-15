const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedByRobots } = require('../httpClient');
const { extractContact, mapTopicCategory, parseDateRange } = require('../normalize');
const { parseWevityDetail, parseWevityList } = require('../sources/wevity');
const {
  parseThinkcontestDetail,
  parseThinkcontestList,
  selectThinkcontestImage,
} = require('../sources/thinkcontest');
const {
  buildActivityDedupKey,
  chooseCanonicalActivity,
  normalizeIdentityText,
  normalizeIdentityUrl,
} = require('../deduplicate');

test('위비티 목록과 상세 페이지를 정규화한다', () => {
  const list = parseWevityList(`
    <div class="ms-list"><ul class="list">
      <li class="top"></li>
      <li><div class="tit"><a href="?c=find&s=1&gbn=view&ix=123">AI 공모전 <span>SPECIAL</span></a>
      <div class="sub-tit">분야 : 웹/모바일/IT, 기획/아이디어</div></div><div class="organ">테스트 기관</div></li>
    </ul></div>`);
  assert.equal(list.length, 1);
  assert.equal(list[0].sourceItemId, '123');
  assert.equal(list[0].title, 'AI 공모전');

  const activity = parseWevityDetail(`
    <meta property="og:image" content="/poster.jpg">
    <div class="contest-detail"><div class="tit-area"><h6 class="tit">AI 공모전</h6></div>
    <div class="cd-area"><div class="img"><img src="/poster.jpg"></div></div>
    <ul class="cd-info-list">
      <li><span class="tit">분야</span>웹/모바일/IT, 기획/아이디어</li>
      <li><span class="tit">응모대상</span>대학생</li>
      <li><span class="tit">주최/주관</span>테스트 기관</li>
      <li><span class="tit">접수기간</span>2026-07-01 ~ 2026-08-15</li>
      <li><span class="tit">홈페이지</span><a href="https://example.com/apply">신청</a></li>
    </ul><div id="viewContents"><p>상세 설명</p><p>문의 test@example.com</p></div></div>`, list[0]);
  assert.equal(activity.topicCategory, 'IT·소프트웨어');
  assert.equal(activity.applicationPeriodEnd, '2026-08-15 23:59:59');
  assert.equal(activity.officialUrl, 'https://example.com/apply');
  assert.equal(activity.contact, 'test@example.com');
});

test('씽굿 JSON 목록과 상세 페이지를 정규화한다', () => {
  const list = parseThinkcontestList({
    listJsonData: [{
      contest_pk: 456,
      program_nm: '오픈소스 경진대회',
      host_company: '테스트 부처',
      contest_field_nm: '게임/소프트웨어, 과학',
      receivetime_period: '2026-06-15 00:00 ~ 2026-07-17 23:59',
    }],
  });
  assert.equal(list[0].sourceItemId, '456');

  const activity = parseThinkcontestDetail(`
    <meta property="og:image" content="/thinkgood/poster.png">
    <span class="contest-view__title">오픈소스 경진대회</span>
    <div class="content-detail__top"><div class="img-wrap"><img class="contestimg" src="/poster.png"></div>
    <div class="info">
      <div><div class="tit">주최</div><div class="txt">테스트 부처</div></div>
      <div><div class="tit">응모분야</div><div class="txt"><li>게임/소프트웨어</li><li>과학</li></div></div>
      <div><div class="tit">접수기간</div><div class="txt">2026-06-15 00:00 ~ 2026-07-17 23:59</div></div>
      <div><div class="tit">참가자격</div><div class="txt">누구나</div></div>
    </div></div><div id="contest_content"><p>상세 설명</p></div>`, list[0]);
  assert.equal(activity.title, '오픈소스 경진대회');
  assert.equal(activity.topicCategory, 'IT·소프트웨어');
  assert.equal(activity.applicationPeriodStart, '2026-06-15 00:00:00');
});

test('카테고리와 날짜를 일관된 앱 형식으로 변환한다', () => {
  assert.equal(mapTopicCategory(['영상/UCC/사진']), '디자인·콘텐츠');
  assert.equal(mapTopicCategory(['광고/마케팅', '기타'], '신춘문예 글쓰기 모집'), '문학·시나리오');
  assert.deepEqual(parseDateRange('2026.7.1 ~ 2026.7.9'), {
    start: '2026-07-01 00:00:00',
    end: '2026-07-09 23:59:59',
  });
  assert.equal(extractContact('https://example.com/jobs/RC20250523018319'), null);
  assert.equal(extractContact('문의 02-1234-5678'), '02-1234-5678');
});

test('robots.txt의 최장 일치 규칙을 적용한다', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public';
  assert.equal(isAllowedByRobots(robots, 'https://example.com/private/data'), false);
  assert.equal(isAllowedByRobots(robots, 'https://example.com/private/public/item'), true);
});

test('공백과 기호가 다른 동일 제목을 같은 교차 출처 키로 정규화한다', () => {
  const first = buildActivityDedupKey({
    title: '2026 국립과천과학관 AI 활용 숏폼 공모전',
    applicationPeriodEnd: '2026-10-16 23:59:59',
  });
  const second = buildActivityDedupKey({
    title: '2026 국립과천과학관 AI활용 숏폼-공모전',
    application_period_end: '2026-10-16 18:00:00',
  });
  const nextYear = buildActivityDedupKey({
    title: '2026 국립과천과학관 AI 활용 숏폼 공모전',
    applicationPeriodEnd: '2027-10-16 23:59:59',
  });
  assert.equal(first, second);
  assert.equal(first, buildActivityDedupKey({
    title: '2026 국립과천과학관 AI 활용 숏폼 공모전',
    application_period_end: new Date(2026, 9, 16, 23, 59, 59),
  }));
  assert.notEqual(first, nextYear);
  assert.equal(normalizeIdentityText(' AI · 공모전 '), 'ai공모전');
});

test('공식 URL의 추적 파라미터와 www 차이를 제거한다', () => {
  assert.equal(
    normalizeIdentityUrl('https://www.example.com/contest/?utm_source=wevity&id=3#apply'),
    'example.com/contest?id=3',
  );
});

test('교차 출처 중복에서는 이미지와 상세 정보가 풍부한 활동을 대표로 선택한다', () => {
  const canonical = chooseCanonicalActivity([
    { activity_id: 1, details: '짧은 설명' },
    {
      activity_id: 2,
      details: '상세 정보 '.repeat(200),
      main_image_url: 'https://example.com/poster.jpg',
      official_url: 'https://example.com/contest',
      organizer: '주최기관',
      application_period_end: '2026-10-16 23:59:59',
    },
  ]);
  assert.equal(canonical.activity_id, 2);
});

test('씽굿의 빈 포스터 경로와 공통 배경 이미지를 실제 포스터로 저장하지 않는다', () => {
  assert.equal(selectThinkcontestImage(
    '/thinkgood/common/display.do?filepath=&filename=&filegubun=poster',
    '/_custom/thinkgood/resource/image/common/sub_bg03.png',
  ), null);
  assert.equal(selectThinkcontestImage(
    '/thinkgood/common/display.do?filepath=/contest/&filename=poster.png&filegubun=poster',
    null,
  ), 'https://thinkcontest.com/thinkgood/common/display.do?filepath=/contest/&filename=poster.png&filegubun=poster');
});
