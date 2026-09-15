const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLearningRoadmap,
  calculateProgress,
  toDateKey,
} = require('../learningRoadmap');

test('진행중 목표를 절반으로 반영해 진행률을 계산한다', () => {
  const percent = calculateProgress([
    { status: '완료' },
    { status: '진행중' },
    { status: '미진행' },
    { status: '완료' },
  ]);

  assert.equal(percent, 63);
});

test('주간 목표를 구간으로 만들고 같은 기간의 일일 목표를 연결한다', () => {
  const roadmap = buildLearningRoadmap({
    teamId: 7,
    teamName: '데이터 분석 공모전',
    today: '2026-08-12',
    todos: [
      {
        todo_id: 1,
        title: '분석 파이프라인 완성',
        status: '진행중',
        scope_type: '월간',
        scope_start_date: '2026-08-01',
        scope_end_date: '2026-08-31',
      },
      {
        todo_id: 2,
        title: '데이터 전처리',
        status: '진행중',
        scope_type: '주간',
        scope_start_date: '2026-08-10',
        scope_end_date: '2026-08-16',
      },
      {
        todo_id: 3,
        title: '결측치 처리',
        status: '완료',
        scope_type: '일일',
        scope_start_date: '2026-08-11',
        scope_end_date: '2026-08-11',
      },
      {
        todo_id: 4,
        title: '이상치 기준 정리',
        status: '미진행',
        scope_type: '일일',
        scope_start_date: '2026-08-13',
        scope_end_date: '2026-08-13',
      },
    ],
  });

  assert.equal(roadmap.title, '분석 파이프라인 완성');
  assert.equal(roadmap.segments.length, 1);
  assert.equal(roadmap.segments[0].title, '데이터 전처리');
  assert.deepEqual(roadmap.segments[0].todos.map((todo) => todo.todo_id), [2, 3, 4]);
  assert.equal(roadmap.segments[0].summary.percent, 50);
  assert.equal(roadmap.current_segment_id, 'weekly:2026-08-10:2026-08-16');
  assert.equal(roadmap.today_remaining_count, 2);
});

test('주간과 월간 목표가 없으면 일일 목표를 주차별로 묶는다', () => {
  const roadmap = buildLearningRoadmap({
    teamName: '알고리즘 스터디',
    today: '2026-08-12',
    todos: [
      {
        todo_id: 11,
        title: '그래프 문제 풀이',
        status: '완료',
        scope_type: '일일',
        scope_start_date: '2026-08-10',
        scope_end_date: '2026-08-10',
      },
      {
        todo_id: 12,
        title: 'DP 문제 풀이',
        status: '미진행',
        scope_type: '일일',
        scope_start_date: '2026-08-17',
        scope_end_date: '2026-08-17',
      },
    ],
  });

  assert.equal(roadmap.segments.length, 2);
  assert.equal(roadmap.segments[0].title, '8월 3주차');
  assert.equal(roadmap.segments[0].start_date, '2026-08-10');
  assert.equal(roadmap.segments[0].end_date, '2026-08-16');
  assert.equal(roadmap.segments[1].title, '8월 4주차');
  assert.equal(roadmap.segments[1].start_date, '2026-08-17');
  assert.equal(roadmap.current_segment_id, 'derived:2026-08-17:2026-08-23');
});

test('사용자가 설정한 구간명과 기간을 기본 주차명보다 우선한다', () => {
  const roadmap = buildLearningRoadmap({
    today: '2026-08-12',
    todos: [
      {
        todo_id: 15,
        title: '핵심 기능 설계 기간',
        status: '진행중',
        scope_type: '주간',
        scope_start_date: '2026-08-11',
        scope_end_date: '2026-08-20',
      },
      {
        todo_id: 16,
        title: '화면 흐름 정리',
        status: '미진행',
        scope_type: '일일',
        scope_start_date: '2026-08-13',
        scope_end_date: '2026-08-13',
      },
    ],
  });

  assert.equal(roadmap.segments[0].title, '핵심 기능 설계 기간');
  assert.equal(roadmap.segments[0].start_date, '2026-08-11');
  assert.equal(roadmap.segments[0].end_date, '2026-08-20');
});

test('같은 기간의 주간 목표는 하나의 구간으로 합친다', () => {
  const roadmap = buildLearningRoadmap({
    today: '2026-08-05',
    todos: [
      {
        todo_id: 21,
        title: '기획안 작성',
        status: '미진행',
        scope_type: '주간',
        scope_start_date: '2026-08-03',
        scope_end_date: '2026-08-09',
      },
      {
        todo_id: 22,
        title: '자료 조사',
        status: '완료',
        scope_type: '주간',
        scope_start_date: '2026-08-03',
        scope_end_date: '2026-08-09',
      },
    ],
  });

  assert.equal(roadmap.segments.length, 1);
  assert.equal(roadmap.segments[0].title, '기획안 작성 외 1개');
  assert.equal(roadmap.segments[0].summary.percent, 50);
});

test('완료되지 않은 미래 구간을 현재 구간으로 선택한다', () => {
  const roadmap = buildLearningRoadmap({
    today: '2026-08-15',
    todos: [
      {
        todo_id: 31,
        title: '1주차',
        status: '완료',
        scope_type: '주간',
        scope_start_date: '2026-08-03',
        scope_end_date: '2026-08-09',
      },
      {
        todo_id: 32,
        title: '3주차',
        status: '미진행',
        scope_type: '주간',
        scope_start_date: '2026-08-17',
        scope_end_date: '2026-08-23',
      },
    ],
  });

  assert.equal(roadmap.current_segment.title, '3주차');
  assert.equal(roadmap.current_segment.status, '예정');
});

test('잘못된 날짜와 빈 목표 목록을 안전하게 처리한다', () => {
  assert.equal(toDateKey('2026-02-31'), null);
  assert.equal(toDateKey('not-a-date'), null);

  const roadmap = buildLearningRoadmap({
    teamName: '선형대수학 학습 공동체',
    activityStartDate: '2026-08-01',
    activityEndDate: '2026-10-31',
    todos: [],
  });

  assert.equal(roadmap.title, '선형대수학 학습 공동체 학습 로드맵');
  assert.equal(roadmap.summary.total_count, 0);
  assert.deepEqual(roadmap.segments, []);
  assert.deepEqual(roadmap.period, {
    start_date: '2026-08-01',
    end_date: '2026-10-31',
  });
});
