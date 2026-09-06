const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createCurriculum, ensureCurriculumSchema } = require('../curricula/service');

const curricula = [
  {
    organization_name: 'Orbit Cloud',
    organization_slug: 'demo-orbit-cloud',
    organization_description: '클라우드 네이티브 기술을 만드는 가상 기업 예시입니다.',
    organization_website_url: 'https://example.com/orbit-cloud',
    organization_verified: true,
    brand_color: '#6C5CE7',
    title: '쿠버네티스 플랫폼 엔지니어 8주 과정',
    slug: 'kubernetes-platform-engineer-demo',
    role_title: 'Platform Engineer',
    summary: '컨테이너 기초부터 운영 관측성, 장애 대응까지 실무 흐름으로 완주합니다.',
    description: '기업이 원하는 역량을 월간·주간·일일 목표로 나누고, 개인 또는 팀 활동으로 일정에 적용하는 예시 커리큘럼입니다.',
    difficulty: 'INTERMEDIATE',
    duration_weeks: 8,
    weekly_hours: 7,
    nodes: [
      { stable_key: 'month-foundation', level: 'MONTHLY', title: '클러스터 기초와 배포 흐름 완성', description: '컨테이너, 오브젝트, 배포 전략을 연결해 설명합니다.', relative_start_day: 0, relative_end_day: 27, estimated_minutes: 1680 },
      { stable_key: 'week-container', parent_stable_key: 'month-foundation', level: 'WEEKLY', title: '컨테이너와 이미지 구조 이해', relative_start_day: 0, relative_end_day: 6, estimated_minutes: 420 },
      { stable_key: 'day-dockerfile', parent_stable_key: 'week-container', level: 'DAILY', title: '멀티 스테이지 Dockerfile 작성', relative_start_day: 1, estimated_minutes: 90 },
      { stable_key: 'day-registry', parent_stable_key: 'week-container', level: 'DAILY', title: '이미지 레지스트리 배포 실습', relative_start_day: 3, estimated_minutes: 90 },
      { stable_key: 'week-workload', parent_stable_key: 'month-foundation', level: 'WEEKLY', title: '워크로드와 네트워크 설계', relative_start_day: 7, relative_end_day: 13, estimated_minutes: 420 },
      { stable_key: 'day-deployment', parent_stable_key: 'week-workload', level: 'DAILY', title: 'Deployment 롤링 업데이트', relative_start_day: 8, estimated_minutes: 90 },
      { stable_key: 'day-service', parent_stable_key: 'week-workload', level: 'DAILY', title: 'Service와 Ingress 연결', relative_start_day: 10, estimated_minutes: 120 },
      { stable_key: 'month-operation', level: 'MONTHLY', title: '운영 자동화와 장애 대응 완성', description: '관측성 지표를 읽고 장애 대응 과정을 기록합니다.', relative_start_day: 28, relative_end_day: 55, estimated_minutes: 1680 },
      { stable_key: 'week-observability', parent_stable_key: 'month-operation', level: 'WEEKLY', title: '로그·메트릭·알림 구성', relative_start_day: 28, relative_end_day: 34, estimated_minutes: 420 },
      { stable_key: 'day-dashboard', parent_stable_key: 'week-observability', level: 'DAILY', title: '서비스 관측 대시보드 만들기', relative_start_day: 30, estimated_minutes: 120 },
      { stable_key: 'week-incident', parent_stable_key: 'month-operation', level: 'WEEKLY', title: '장애 시나리오와 회고', relative_start_day: 49, relative_end_day: 55, estimated_minutes: 420 },
      { stable_key: 'day-postmortem', parent_stable_key: 'week-incident', level: 'DAILY', title: '장애 회고 문서 작성', relative_start_day: 53, estimated_minutes: 90 },
    ],
  },
  {
    organization_name: 'Morrow Commerce',
    organization_slug: 'demo-morrow-commerce',
    organization_description: '고객 경험을 연구하는 가상 커머스 기업 예시입니다.',
    organization_website_url: 'https://example.com/morrow-commerce',
    organization_verified: true,
    brand_color: '#F04438',
    title: '데이터 기반 프로덕트 디자이너 6주 과정',
    slug: 'data-product-designer-demo',
    role_title: 'Product Designer',
    summary: '문제 정의부터 실험 설계, 지표 분석, 포트폴리오 정리까지 연결합니다.',
    description: '긴 공고를 읽는 데서 끝나지 않고 실제 산출물과 회고를 활동 탭에 쌓는 예시 과정입니다.',
    difficulty: 'BEGINNER',
    duration_weeks: 6,
    weekly_hours: 5,
    nodes: [
      { stable_key: 'month-discovery', level: 'MONTHLY', title: '사용자 문제와 핵심 지표 정의', relative_start_day: 0, relative_end_day: 20, estimated_minutes: 900 },
      { stable_key: 'week-research', parent_stable_key: 'month-discovery', level: 'WEEKLY', title: '리서치 질문과 인터뷰 설계', relative_start_day: 0, relative_end_day: 6, estimated_minutes: 300 },
      { stable_key: 'day-interview', parent_stable_key: 'week-research', level: 'DAILY', title: '사용자 인터뷰 2건 진행', relative_start_day: 3, estimated_minutes: 120 },
      { stable_key: 'week-metric', parent_stable_key: 'month-discovery', level: 'WEEKLY', title: '퍼널과 성공 지표 설계', relative_start_day: 14, relative_end_day: 20, estimated_minutes: 300 },
      { stable_key: 'day-funnel', parent_stable_key: 'week-metric', level: 'DAILY', title: '핵심 퍼널 시각화', relative_start_day: 17, estimated_minutes: 90 },
      { stable_key: 'month-delivery', level: 'MONTHLY', title: '실험 결과를 포트폴리오로 전달', relative_start_day: 21, relative_end_day: 41, estimated_minutes: 900 },
      { stable_key: 'week-prototype', parent_stable_key: 'month-delivery', level: 'WEEKLY', title: '가설 기반 프로토타입 제작', relative_start_day: 21, relative_end_day: 27, estimated_minutes: 300 },
      { stable_key: 'day-test', parent_stable_key: 'week-prototype', level: 'DAILY', title: '사용성 테스트와 결과 기록', relative_start_day: 25, estimated_minutes: 120 },
      { stable_key: 'week-case-study', parent_stable_key: 'month-delivery', level: 'WEEKLY', title: '케이스 스터디 문서 완성', relative_start_day: 35, relative_end_day: 41, estimated_minutes: 300 },
    ],
  },
  {
    organization_name: 'Layer Data',
    organization_slug: 'demo-layer-data',
    organization_description: '데이터 제품을 만드는 가상 B2B 기업 예시입니다.',
    organization_website_url: 'https://example.com/layer-data',
    organization_verified: true,
    brand_color: '#1570EF',
    title: '분석 가능한 백엔드 서비스 4주 과정',
    slug: 'observable-backend-demo',
    role_title: 'Backend Engineer',
    summary: 'API 설계와 테스트, 로그, 핵심 지표를 함께 구현하는 압축 실습입니다.',
    description: '작은 팀이 같은 목표를 나누고 활동 탭에서 진행률을 공유하는 예시 커리큘럼입니다.',
    difficulty: 'ADVANCED',
    duration_weeks: 4,
    weekly_hours: 8,
    nodes: [
      { stable_key: 'month-backend', level: 'MONTHLY', title: '운영 가능한 API 서비스 완성', relative_start_day: 0, relative_end_day: 27, estimated_minutes: 1920 },
      { stable_key: 'week-contract', parent_stable_key: 'month-backend', level: 'WEEKLY', title: 'API 계약과 데이터 모델 정의', relative_start_day: 0, relative_end_day: 6, estimated_minutes: 480 },
      { stable_key: 'day-schema', parent_stable_key: 'week-contract', level: 'DAILY', title: '스키마와 예외 응답 설계', relative_start_day: 2, estimated_minutes: 120 },
      { stable_key: 'week-test', parent_stable_key: 'month-backend', level: 'WEEKLY', title: '통합 테스트와 배포 자동화', relative_start_day: 7, relative_end_day: 13, estimated_minutes: 480 },
      { stable_key: 'day-ci', parent_stable_key: 'week-test', level: 'DAILY', title: 'CI 검증 단계 구성', relative_start_day: 10, estimated_minutes: 120 },
      { stable_key: 'week-observe', parent_stable_key: 'month-backend', level: 'WEEKLY', title: '로그와 핵심 지표 연결', relative_start_day: 14, relative_end_day: 20, estimated_minutes: 480 },
      { stable_key: 'day-slo', parent_stable_key: 'week-observe', level: 'DAILY', title: '서비스 수준 목표 초안 작성', relative_start_day: 17, estimated_minutes: 90 },
      { stable_key: 'week-review', parent_stable_key: 'month-backend', level: 'WEEKLY', title: '부하 테스트와 기술 회고', relative_start_day: 21, relative_end_day: 27, estimated_minutes: 480 },
    ],
  },
];

const run = async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'myappdb',
    port: Number(process.env.DB_PORT || 3306),
    connectionLimit: 2,
    charset: 'utf8mb4',
  });

  try {
    await ensureCurriculumSchema(pool);
    const results = [];
    for (const curriculum of curricula) {
      const [existing] = await pool.query(
        `SELECT c.curriculum_id
         FROM enterprise_curricula c
         JOIN enterprise_organizations o ON o.organization_id = c.organization_id
         WHERE o.slug = ? AND c.slug = ?
         LIMIT 1`,
        [curriculum.organization_slug, curriculum.slug],
      );
      if (existing.length) {
        results.push({ title: curriculum.title, status: 'skipped', curriculum_id: Number(existing[0].curriculum_id) });
        continue;
      }
      const created = await createCurriculum(pool, null, curriculum);
      results.push({ title: created.title, status: 'created', curriculum_id: created.curriculum_id });
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error('기업 커리큘럼 예시 생성 실패:', error.message);
  process.exitCode = 1;
});
