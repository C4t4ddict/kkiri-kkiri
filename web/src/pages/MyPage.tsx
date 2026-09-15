import { Award, Bell, ChevronRight, MessageSquareText, Settings, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { UserAvatar } from '../shared/ui/UserAvatar';

const menus = [
  ['수상 내역', '수상 경험과 상금 기록을 관리합니다.', '/mypage/awards', Award],
  ['팀원·나의 평가', '함께한 팀원을 평가하고 받은 코멘트를 확인합니다.', '/mypage/evaluations', Star],
  ['알림', '팀 합류 제안과 중요한 소식을 확인합니다.', '/notifications', Bell],
  ['개인정보·설정', '프로필과 비밀번호, 알림을 관리합니다.', '/mypage/settings', Settings],
  ['개발자에게 한마디', '오류와 개선 의견을 전달합니다.', '/mypage/feedback', MessageSquareText],
] as const;

export function MyPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <>
    <section className="profile-card"><UserAvatar user={user} className="profile-avatar" /><div><h1>{user.name}</h1><p>{user.email} · {user.department || '학과 미등록'}</p>{user.self_intro && <blockquote>{user.self_intro}</blockquote>}<div className="profile-badges"><span>{user.account_type === 'STUDENT' ? '학교 인증 회원' : '일반 회원'}</span>{user.school_name && <span>{user.school_name}</span>}</div></div><Link className="profile-edit-link" to="/mypage/settings">프로필 수정</Link></section>
    <div className="menu-grid">{menus.map(([title, description, path, Icon]) => <Link className="menu-card" to={path} key={title}><div className="menu-icon"><Icon /></div><div><h3>{title}</h3><p>{description}</p></div><ChevronRight /></Link>)}</div>
  </>;
}
