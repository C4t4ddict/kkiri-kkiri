import {
  getTutorialPendingStorageKey,
  getTutorialStorageKey,
  shouldShowTutorial,
  TUTORIAL_STEPS,
} from '../src/onboarding/tutorial';

describe('신규 사용자 튜토리얼', () => {
  it('홈, 정보, 활동, 매칭 순서로 구성된다', () => {
    expect(TUTORIAL_STEPS.map(step => step.tab)).toEqual([
      '홈',
      '정보',
      '활동',
      '매칭',
    ]);
  });

  it('사용자별로 완료 상태 키를 분리한다', () => {
    expect(getTutorialStorageKey(1)).not.toBe(getTutorialStorageKey(2));
    expect(getTutorialStorageKey(1)).toContain('/user/1');
    expect(getTutorialPendingStorageKey(1)).toContain('/pending/1');
  });

  it('신규 가입 대기 상태이고 미완료일 때만 노출한다', () => {
    expect(shouldShowTutorial(null, 'pending')).toBe(true);
    expect(shouldShowTutorial('completed', 'pending')).toBe(false);
    expect(shouldShowTutorial(null, null)).toBe(false);
  });
});
