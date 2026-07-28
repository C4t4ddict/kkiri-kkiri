export const HOME_ACTIVITY_CATEGORIES = [
  '기획·아이디어',
  '광고·마케팅',
  '디자인·콘텐츠',
  'IT·소프트웨어',
  '논문·리포트',
  '과학·공학',
  '문학·시나리오',
  '건축·인테리어',
  '예체능',
  '교육·강연',
  '대외활동',
  '봉사활동',
  '취업·창업',
  '해외',
  '기타',
] as const;

export type ActivityCategorySource = {
  category?: string | null;
  topic_category?: string | null;
};

export const getActivityCategory = (activity: ActivityCategorySource) =>
  String(activity.topic_category || activity.category || '').trim();

export const getVisibleActivityCategories = (activities: ActivityCategorySource[]) => {
  const available = Array.from(new Set(activities.map(getActivityCategory).filter(Boolean)));
  const ordered = HOME_ACTIVITY_CATEGORIES.filter((category) => available.includes(category));
  const orderedSet = new Set<string>(ordered);
  return [...ordered, ...available.filter((category) => !orderedSet.has(category))];
};

export const ACTIVITY_TYPE_CATEGORIES = [
  '공모전',
  '대외활동',
  '교육·강연',
  '세미나',
  '워크숍',
  '특강',
  '튜터링',
  '봉사활동',
  '취업·창업',
  '다드림포인트',
] as const;

export const ACTIVITY_TOPIC_CATEGORIES = [
  '기획·아이디어',
  '광고·마케팅',
  '디자인·콘텐츠',
  'IT·소프트웨어',
  '논문·리포트',
  '과학·공학',
  '문학·시나리오',
  '건축·인테리어',
  '예체능',
  '해외',
  '기타',
] as const;

export const ACTIVITY_FILTER_CATEGORIES = HOME_ACTIVITY_CATEGORIES;

export const MATCHING_ACTIVITY_CATEGORIES = [
  '공모전',
  '대외활동',
  '경진대회',
  '비교과',
  '스터디',
  '동아리',
  '소모임',
  '봉사활동',
  '취업·창업',
  '기타',
] as const;
