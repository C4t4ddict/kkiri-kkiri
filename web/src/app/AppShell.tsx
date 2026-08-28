import { Activity, Bell, BookOpen, Home, LogOut, Map, PenTool, Search, UserRound, UsersRound } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

const navItems = [
  ['/', '홈', Home],
  ['/info', '정보', BookOpen],
  ['/curricula', '커리큘럼', Map],
  ['/matching', '매칭', UsersRound],
  ['/activity', '활동', Activity],
  ['/mypage', '마이페이지', UserRound],
] as const;

function NavigationItems({ studio = false }: { studio?: boolean }) {
  const items = studio ? [...navItems, ['/studio/curricula', '커리큘럼 스튜디오', PenTool] as const] : navItems;
  return <>{items.map(([path, label, Icon]) => (
    <NavLink key={path} to={path} end={path === '/'}>
      <Icon size={20} />
      <span>{label}</span>
    </NavLink>
  ))}</>;
}

export function AppShell() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="wordmark" to="/">끼리끼리</Link>
      <nav><NavigationItems studio={Boolean(user.is_admin)} /></nav>
      <div className="sidebar-foot">
        <div className="avatar">{user.name?.slice(0, 1) || 'K'}</div>
        <div><strong>{user.name}</strong><small>{user.department || user.email}</small></div>
        <button aria-label="로그아웃" onClick={logout}><LogOut size={18} /></button>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <Link className="mobile-wordmark" to="/">끼리끼리</Link>
        <div className="top-search"><Search size={18} /><span>활동과 팀을 탐색해보세요</span></div>
        <button className="notification-button" aria-label="알림"><Bell size={20} /></button>
      </header>
      <main className="page"><Outlet /></main>
    </div>
    <nav className="mobile-nav"><NavigationItems /></nav>
  </div>;
}
