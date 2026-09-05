const DAY_MS = 24 * 60 * 60 * 1000;

const HISTORY_SEED_MARKERS = [
  '[past-activity-seed:v1:slot-1]',
  '[past-activity-seed:v1:slot-2]',
];

const REAL_SOURCES = new Set(['위비티', '씽굿']);

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const addDays = (value, days) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const hasVerifiedCommendationPrize = (activity) => {
  const prize = String(activity?.prize_details || '').replace(/\s/g, '');
  return /장려상?/.test(prize) && /(100만원|1,?000,?000원)/.test(prize);
};

const isRealCollectedActivity = (activity) =>
  REAL_SOURCES.has(activity?.source_name) && !Number(activity?.is_hidden || 0);

const selectHistoryActivities = (activities = []) => {
  const realActivities = activities.filter(isRealCollectedActivity);
  const awardActivity = realActivities.find((activity) =>
    /LH\s*국토기술대전/i.test(String(activity.title || ''))
      && hasVerifiedCommendationPrize(activity));

  const technicalActivity = realActivities.find((activity) =>
    Number(activity.activity_id) !== Number(awardActivity?.activity_id)
      && (/임베디드\s*SW/i.test(String(activity.title || ''))
        || /IT|소프트웨어/i.test(String(activity.topic_category || ''))));

  return [awardActivity, technicalActivity].filter(Boolean);
};

const buildHistoryPeriod = (activity, today = new Date(), slotIndex = 0) => {
  const todayKey = toDateKey(today);
  const todayDate = new Date(`${todayKey}T12:00:00`);
  const preferredEnd = activity?.application_period_end || activity?.operation_period_end;
  const parsedEnd = preferredEnd ? new Date(preferredEnd) : null;
  const fallbackEnd = addDays(todayDate, slotIndex === 0 ? -3 : -7);
  const endDate = parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd <= todayDate
    ? parsedEnd
    : fallbackEnd;
  const preferredStart = activity?.application_period_start || activity?.operation_period_start;
  const parsedStart = preferredStart ? new Date(preferredStart) : null;
  const startDate = parsedStart && !Number.isNaN(parsedStart.getTime()) && parsedStart <= endDate
    ? parsedStart
    : new Date(endDate.getTime() - (42 * DAY_MS));

  return { start: toDateKey(startDate), end: toDateKey(endDate) };
};

const createHistoryFixture = (slotIndex, activity, today = new Date()) => {
  const period = buildHistoryPeriod(activity, today, slotIndex);
  const common = {
    marker: HISTORY_SEED_MARKERS[slotIndex],
    activity,
    period,
    activityType: String(activity.topic_category || activity.category || '공모전').slice(0, 100),
    sourceLink: activity.official_url || activity.source_url,
  };

  if (slotIndex === 0) {
    return {
      ...common,
      meetingType: '혼합',
      memberParts: new Map([
        [1, ['LEADER', '서비스 기획·발표']],
        [2, ['MEMBER', '사용자 리서치·UX']],
        [3, ['MEMBER', '데이터 분석·기술 검증']],
      ]),
      todos: [
        [1, '월간', '국토·도시 기술 문제 정의와 심사 기준 분석'],
        [1, '월간', '서비스 콘셉트와 핵심 가치 제안 확정'],
        [1, '주간', '현장 사용자 인터뷰와 사례 조사 정리'],
        [1, '주간', '제안서 구조와 기대효과 수치화'],
        [1, '일일', '최종 제출 규격과 증빙자료 점검'],
        [1, '일일', 'PT 발표 자료와 질의응답 리허설'],
        [2, '주간', '현장 사용자 여정과 문제 상황 시각화'],
        [2, '일일', '제안서 정보 구조와 발표 화면 검수'],
        [3, '주간', '공공 데이터 근거와 효과 측정 지표 검증'],
        [3, '일일', '기술 구현 가능성과 운영 비용 산정'],
      ],
      portfolio: {
        role: '팀장 · 서비스 기획 및 발표',
        summary: '국토·도시 분야의 실제 사용자 문제를 정의하고 공공 데이터와 인터뷰를 근거로 해결안을 설계했습니다. 심사 기준에 맞춰 제안서, 효과 지표, 발표 자료를 통합 관리했습니다.',
        achievements: [
          '사용자 인터뷰와 공공 데이터 근거를 결합한 문제 정의 완성',
          '제안서·발표 자료·질의응답 시나리오를 제출 규격에 맞춰 완성',
          '공식 장려상 수상 및 상금 100만 원 기록',
        ],
        reflection: '아이디어의 참신함만큼 문제의 근거와 효과를 수치로 설명하는 일이 중요했습니다. 다음 활동에서는 초기 인터뷰 단계부터 측정 지표를 함께 설계하겠습니다.',
      },
      award: {
        is_awarded: true,
        award_title: '장려상',
        has_prize: true,
        prize_amount: 1000000,
        tax_applied: true,
      },
    };
  }

  return {
    ...common,
    meetingType: '비대면',
    memberParts: new Map([
      [1, ['LEADER', '제품 기획·프론트엔드']],
      [2, ['MEMBER', '사용자 시나리오·UI']],
      [3, ['MEMBER', '펌웨어·API 연동']],
    ]),
    todos: [
      [1, '월간', '임베디드SW 요구사항과 시스템 아키텍처 확정'],
      [1, '월간', '센서 데이터 수집·제어 MVP 완성'],
      [1, '주간', '사용자 시나리오와 인터페이스 프로토타입 구현'],
      [1, '주간', '펌웨어·API 연동 및 예외 상황 테스트'],
      [1, '일일', '데모 시나리오 통합 테스트'],
      [1, '일일', '기술 문서와 발표 자료 최종 검수'],
      [2, '주간', '사용자 조작 흐름과 화면 상태 정의'],
      [2, '일일', '데모 화면 접근성과 오류 메시지 점검'],
      [3, '주간', '센서 통신 규격과 API 응답 구조 구현'],
      [3, '일일', '네트워크 단절과 센서 오류 복구 테스트'],
    ],
    portfolio: {
      role: '팀장 · 제품 기획 및 프론트엔드',
      summary: '임베디드SW 요구사항을 사용자 시나리오로 구체화하고 센서·API·인터페이스를 연결한 MVP를 완성했습니다. 오류 상황을 포함한 데모 시나리오와 기술 문서를 팀 단위로 검수했습니다.',
      achievements: [
        '센서 데이터 수집부터 화면 제어까지 이어지는 MVP 흐름 완성',
        '네트워크 단절·센서 오류를 포함한 통합 테스트 시나리오 정리',
        '기술 문서와 최종 데모 발표 자료 제출',
      ],
      reflection: '하드웨어와 소프트웨어의 경계에서는 정상 흐름보다 오류 복구 기준을 먼저 합의해야 일정 지연을 줄일 수 있었습니다. 이후에는 인터페이스 계약 테스트를 초기 단계부터 운영하겠습니다.',
    },
    award: { is_awarded: false },
  };
};

module.exports = {
  HISTORY_SEED_MARKERS,
  buildHistoryPeriod,
  createHistoryFixture,
  hasVerifiedCommendationPrize,
  isRealCollectedActivity,
  selectHistoryActivities,
  toDateKey,
};
