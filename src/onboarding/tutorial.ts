export const TUTORIAL_VERSION = 1;

export type TutorialTabName = '홈' | '정보' | '활동' | '매칭';

export type TutorialStep = {
  tab: TutorialTabName;
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    tab: '홈',
    icon: 'home-outline',
    eyebrow: '나에게 필요한 활동을 한눈에',
    title: '홈에서 오늘의 흐름을 확인해요',
    description:
      '추천 활동과 모집 현황을 빠르게 살펴보고 관심 있는 활동으로 이동할 수 있어요.',
    points: [
      '추천 활동 둘러보기',
      '모집 중인 팀 수 확인',
      '주요 기능으로 빠르게 이동',
    ],
  },
  {
    tab: '정보',
    icon: 'book-outline',
    eyebrow: '공모전·대외활동 탐색',
    title: '정보 탭에서 기회를 찾아요',
    description:
      '카테고리와 모집 상태를 기준으로 활동을 찾고 상세 정보와 신청 기간을 확인해요.',
    points: ['카테고리별 필터링', '접수 상태와 마감일 확인', '관심 활동 저장'],
  },
  {
    tab: '활동',
    icon: 'pencil-outline',
    eyebrow: '목표와 팀 활동 관리',
    title: '활동 탭에서 계획을 실행해요',
    description:
      '참여 중인 활동을 선택하고 일일·주간·월간 목표와 진행률을 관리할 수 있어요.',
    points: [
      '활동과 역할 확인',
      '목표 추가 및 상태 변경',
      '캘린더와 진행률 확인',
    ],
  },
  {
    tab: '매칭',
    icon: 'school-outline',
    eyebrow: '함께할 팀과 팀원 찾기',
    title: '매칭 탭에서 팀을 완성해요',
    description:
      '관심 활동의 모집글을 찾거나 직접 팀을 만들어 조건에 맞는 팀원을 모집해요.',
    points: [
      '활동별 모집글 검색',
      '학교·전국 범위 확인',
      '팀 만들기와 지원하기',
    ],
  },
];

export const getTutorialStorageKey = (userId: number | string) =>
  `@kkiri/tutorial/v${TUTORIAL_VERSION}/user/${userId}`;

export const getTutorialPendingStorageKey = (userId: number | string) =>
  `@kkiri/tutorial/v${TUTORIAL_VERSION}/pending/${userId}`;

export const shouldShowTutorial = (
  completed: string | null,
  pending: string | null,
) => !completed && pending === 'pending';
