import { BriefcaseBusiness, ChevronRight, FileHeart, Heart, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';

const menus = [
  ['나의 지원', '지원 단계와 합류 제안을 확인합니다.', '/mypage/applications', Send],
  ['지원서 관리', '자주 쓰는 지원 내용을 템플릿으로 관리합니다.', '/mypage/templates', FileHeart],
  ['관심 활동', '저장한 활동을 다시 확인합니다.', '/info', Heart],
  ['미니포트폴리오', '지난 활동과 성과를 정리합니다.', '/activity', BriefcaseBusiness],
] as const;

export function MyPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <>
    <section className="profile-card"><div className="profile-avatar">{user.name.slice(0, 1)}</div><div><span className="eyebrow">MY PROFILE</span><h1>{user.name}</h1><p>{user.email} · {user.department || '학과 미등록'}</p></div></section>
    <div className="menu-grid">{menus.map(([title, description, path, Icon]) => <Link className="menu-card" to={path} key={title}><div className="menu-icon"><Icon /></div><div><h3>{title}</h3><p>{description}</p></div><ChevronRight /></Link>)}</div>
  </>;
}
