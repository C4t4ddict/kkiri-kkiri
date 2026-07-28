import { Activity, Bell, BookOpen, Home, LogOut, Search, UserRound, UsersRound } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

const navItems = [
  ['/', '홈', Home],
  ['/info', '정보', BookOpen],
  ['/matching', '매칭', UsersRound],
  ['/activity', '활동', Activity],
  ['/mypage', '마이페이지', UserRound],
] as const;

function NavigationItems() {
  return <>{navItems.map(([path, label, Icon]) => (
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
      <nav><NavigationItems /></nav>
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
