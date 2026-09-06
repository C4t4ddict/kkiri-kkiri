import { Archive, Award, Bell, BriefcaseBusiness, ChevronRight, FileHeart, Heart, MessageSquareText, PenLine, Send, Settings, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { UserAvatar } from '../shared/ui/UserAvatar';

const menus = [
  ['나의 지원', '지원 단계와 합류 제안을 확인합니다.', '/mypage/applications', Send],
  ['지원서 관리', '자주 쓰는 지원 내용을 템플릿으로 관리합니다.', '/mypage/templates', FileHeart],
  ['관심 활동', '저장한 활동을 다시 확인합니다.', '/mypage/favorites', Heart],
  ['내 모집글', '작성한 팀 모집과 지원자를 관리합니다.', '/matching/mine', PenLine],
  ['지난 활동', '완료한 활동과 미니포트폴리오를 봅니다.', '/mypage/archive', Archive],
  ['수상 내역', '수상 경험과 상금 기록을 관리합니다.', '/mypage/awards', Award],
  ['팀원·나의 평가', '함께한 팀원을 평가하고 받은 코멘트를 확인합니다.', '/mypage/evaluations', Star],
  ['알림', '팀 합류 제안과 중요한 소식을 확인합니다.', '/notifications', Bell],
  ['개인정보·설정', '프로필과 비밀번호, 알림을 관리합니다.', '/mypage/settings', Settings],
  ['개발자에게 한마디', '오류와 개선 의견을 전달합니다.', '/mypage/feedback', MessageSquareText],
  ['나의 활동', '현재 팀의 목표와 공지를 관리합니다.', '/activity', BriefcaseBusiness],
] as const;

export function MyPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <>
    <section className="profile-card"><UserAvatar user={user} className="profile-avatar" /><div><h1>{user.name}</h1><p>{user.email} · {user.department || '학과 미등록'}</p></div></section>
    <div className="menu-grid">{menus.map(([title, description, path, Icon]) => <Link className="menu-card" to={path} key={title}><div className="menu-icon"><Icon /></div><div><h3>{title}</h3><p>{description}</p></div><ChevronRight /></Link>)}</div>
  </>;
}
