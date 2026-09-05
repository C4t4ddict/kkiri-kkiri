const activityCategoryLabels: Record<string, string> = {
  '공모전': '도전 프로젝트',
  '대외활동': '성장 프로그램',
  '교육·강연': '배움 클래스',
  '봉사활동': '나눔 활동',
  '기획·아이디어': '아이디어·기획',
  '광고·마케팅': '브랜드·마케팅',
  '디자인·콘텐츠': '디자인·크리에이티브',
  'IT·소프트웨어': '개발·디지털',
  '과학·공학': '기술·연구',
  '취업·창업': '커리어·창업',
  '건축·인테리어': '공간·건축',
  '논문·리포트': '리서치·논문',
  '문학·시나리오': '스토리·글쓰기',
  '예체능': '문화·예술·체육',
  '기타': '새로운 분야',
};

export const getActivityCategoryLabel = (value?: string) => value
  ? activityCategoryLabels[value] || value
  : '새로운 분야';
