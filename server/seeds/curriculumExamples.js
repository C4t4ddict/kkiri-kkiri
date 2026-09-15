// Original practice courses, not curricula endorsed by real companies.
const courses = [
  {
    slug: 'react-interface-practice', title: 'React로 만드는 첫 서비스 화면', role: '프론트엔드 개발', difficulty: 'BEGINNER',
    summary: '목록, 검색, 입력 폼을 만들고 접근성과 테스트까지 챙기는 4주 실습.',
    outcome: '반응형 활동 목록과 상세 화면, 입력 폼, 컴포넌트 테스트를 담은 저장소를 완성합니다.',
    weeks: [
      ['화면 구조와 컴포넌트', ['화면 요구사항을 사용자 흐름으로 정리', '목록과 상세 컴포넌트 구현', '모바일 레이아웃 점검']],
      ['상태와 사용자 입력', ['검색과 필터 상태 연결', '폼 검증과 오류 메시지 구현', '키보드만으로 화면 사용해보기']],
      ['실제 데이터 연결', ['API 요청과 로딩 상태 구현', '빈 결과와 실패 시 재시도 처리', '중복 요청과 불필요한 렌더 점검']],
      ['테스트와 마무리', ['핵심 컴포넌트 테스트 작성', '사용성 점검 후 수정', '실행 안내와 개발 회고 작성']],
    ],
  },
  {
    slug: 'sql-product-analysis', title: 'SQL로 읽는 서비스 데이터', role: '데이터 분석', difficulty: 'BEGINNER',
    summary: '질문부터 쿼리, 검증, 해석까지. 가입·활동 데이터를 직접 분석합니다.',
    outcome: '직접 만든 연습 데이터와 재실행 가능한 SQL, 지표 정의서와 분석 요약을 남깁니다.',
    weeks: [
      ['질문과 데이터 구조', ['분석 질문 3개와 지표 정의', '가상 사용자·활동 테이블 설계', 'NULL과 중복 데이터 점검']],
      ['기본 집계와 조인', ['기간별 가입 수 집계', '사용자와 활동 테이블 조인', '조인 전후 행 수 대조']],
      ['활동과 재방문', ['활성 사용자 기준 정하기', '코호트별 재방문 SQL 작성', '작은 표본으로 계산 검산']],
      ['결과 전달', ['분석 결과를 표로 정리', '가설과 한계를 분리해 기록', '다음 실험 제안서 작성']],
    ],
  },
  {
    slug: 'product-discovery-practice', title: '아이디어를 검증하는 서비스 기획', role: '서비스 기획 · PM', difficulty: 'BEGINNER',
    summary: '막연한 아이디어를 인터뷰와 작은 실험으로 좁혀 실행 가능한 기획으로 만듭니다.',
    outcome: '문제 정의서, 인터뷰 기록, 우선순위가 있는 요구사항과 검증 계획을 완성합니다.',
    weeks: [
      ['문제 정의', ['대상 사용자와 문제 상황 기록', '기존 해결 방법 비교', '검증할 가설 3개 작성']],
      ['사용자 이해', ['유도 질문 없는 인터뷰 문항 작성', '동의받은 인터뷰 1건 진행', '관찰 사실과 해석 분리']],
      ['범위와 요구사항', ['핵심 사용자 여정 정리', '필수 기능과 제외 범위 결정', '화면별 수용 기준 작성']],
      ['작은 검증 실험', ['클릭 가능한 흐름 초안 제작', '테스트 관찰 결과 정리', '진행·수정·중단 판단 기록']],
    ],
  },
  {
    slug: 'content-marketing-practice', title: '작게 시작하는 콘텐츠 마케팅', role: '콘텐츠 · 마케팅', difficulty: 'BEGINNER',
    summary: '한 채널과 한 메시지에 집중해 콘텐츠 기획, 제작, 회고를 경험합니다.',
    outcome: '타깃 정의, 2주 콘텐츠 편성표, 시안 3개와 측정 계획을 만듭니다. 광고비 지출은 필요 없습니다.',
    weeks: [
      ['타깃과 메시지', ['독자의 질문과 관심사 수집', '핵심 메시지와 말투 정하기', '콘텐츠 주제 10개 정리']],
      ['편성과 초안', ['목적별 콘텐츠 편성표 작성', '제목과 도입부 3종 작성', '게시물 초안과 이미지 설명 작성']],
      ['제작과 검수', ['콘텐츠 시안 3개 완성', '인용 출처와 사용 권한 점검', '모바일 가독성과 대체 텍스트 점검']],
      ['측정과 회고', ['조회·반응 지표 정의', '연습 결과표와 기록 양식 만들기', '후속 콘텐츠 개선안 작성']],
    ],
  },
  {
    slug: 'api-reliability-practice', title: '테스트로 다지는 API 서버', role: '백엔드 개발', difficulty: 'INTERMEDIATE',
    summary: '작은 API를 설계하고 인증, 예외, 데이터 정합성을 테스트로 확인합니다.',
    outcome: '로컬에서 실행하는 API 서버와 통합 테스트, 오류 응답 명세를 완성합니다.',
    weeks: [
      ['API와 데이터 계약', ['리소스와 응답 명세 작성', '스키마와 제약 조건 설계', '조회·생성 엔드포인트 구현']],
      ['인증과 권한', ['로그인 토큰 검증 연결', '작성자 권한 검사 구현', '다른 사용자 접근 거절 테스트']],
      ['실패와 정합성', ['입력 검증과 오류 코드 통일', '트랜잭션 실패 복구 테스트', '중복 요청 처리 방식 설계']],
      ['운영 준비', ['로그에서 민감 정보 제외', '느린 쿼리와 인덱스 점검', '실행 가이드와 장애 대응 메모 작성']],
    ],
  },
];

module.exports = courses.map(course => ({
  organization_name: '끼리끼리 연습실', organization_slug: 'demo-kkiri-practice',
  organization_description: '끼리끼리에서 만든 학습용 예시입니다. 실제 기업의 인증·채용 연계 과정이 아닙니다.',
  organization_verified: false, brand_color: '#7A5AF8',
  title: course.title, slug: course.slug, role_title: course.role, summary: course.summary,
  description: `${course.outcome}\n\n학습용 예시 과정입니다. 결과물은 활동의 문서 도구에 기록해보세요.`,
  difficulty: course.difficulty, duration_weeks: 4, weekly_hours: 3,
  nodes: [
    { stable_key: 'outcome', level: 'MONTHLY', title: course.outcome, relative_start_day: 0, relative_end_day: 27, estimated_minutes: 720 },
    ...course.weeks.flatMap(([title, tasks], week) => [
      { stable_key: `week-${week + 1}`, parent_stable_key: 'outcome', level: 'WEEKLY', title, relative_start_day: week * 7, relative_end_day: week * 7 + 6, estimated_minutes: 180 },
      ...tasks.map((task, day) => ({ stable_key: `task-${week + 1}-${day + 1}`, parent_stable_key: `week-${week + 1}`, level: 'DAILY', title: task,
        description: '진행 내용과 결과물을 활동 문서에 남기고, 완료 기준을 스스로 확인해주세요.',
        relative_start_day: week * 7 + day * 2, estimated_minutes: 60 })),
    ]),
  ],
}));
