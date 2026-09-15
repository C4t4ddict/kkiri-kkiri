import { useEffect } from 'react';
import { Activity, Bell, BookOpen, CalendarDays, Database, Gauge, Home, LogIn, Map, PenTool, UserRound, UsersRound, WifiOff } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import { ThemeToggle } from '../shared/ui/ThemeToggle';

const navItems = [
  ['/', '홈', Home],
  ['/info', '정보', BookOpen],
  ['/activity', '활동', Activity],
  ['/calendar', '캘린더', CalendarDays],
  ['/curriculum', '커리큘럼', Map],
  ['/matching', '매칭', UsersRound],
] as const;

const submenus: Record<string, readonly (readonly [string, string])[]> = {
  '/info': [['/info/favorites', '나의 관심 활동']],
  '/activity': [['/activity/portfolios', '포트폴리오 관리'], ['/activity/archive', '지난 활동']],
  '/matching': [['/matching/mine', '나의 모집'], ['/matching/applications', '나의 지원']],
};

function NavigationItems({ studio = false, nested = false }: { studio?: boolean; nested?: boolean }) {
  const items = [
    ...navItems,
    ...(studio ? [['/studio/curriculum', '커리큘럼 스튜디오', PenTool] as const] : []),
    ['/mypage', '마이페이지', UserRound] as const,
    ...(studio ? [['/admin', '서비스 운영', Gauge] as const] : []),
  ];
  return <>{items.map(([path, label, Icon]) => nested ? <div className="nav-group" key={path}>
    <NavLink to={path} end={path === '/'}><Icon size={20} /><span>{label}</span></NavLink>
    {submenus[path] && <div className="nav-children">{submenus[path].map(([to, text]) => <NavLink key={to} to={to}>{text}</NavLink>)}</div>}
  </div> : (
    <NavLink key={path} to={path} end={path === '/'}>
      <Icon size={20} />
      <span>{label}</span>
    </NavLink>
  ))}</>;
}

export function AppShell() {
  const { user, adminAccess } = useAuth();
  const location = useLocation();
  const currentGroup = navItems.find(([path]) => path !== '/' && (location.pathname === path || location.pathname.startsWith(`${path}/`)));
  const unread = useAsync(() => user ? api<{ count: number }>('/notifications/unread-count') : Promise.resolve({ count: 0 }), [user?.id]);
  const database = useAsync(() => api<{ status: string }>('/api/db-health'), []);
  useEffect(() => {
    const timer = window.setInterval(database.reload, 15_000);
    return () => window.clearInterval(timer);
  }, [database.reload]);
  const databaseConnected = database.data?.status === 'ok' && !database.error;

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="wordmark" to="/">끼리끼리</Link>
      <nav aria-label="주 메뉴"><NavigationItems studio={adminAccess === 'allowed'} nested /></nav>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <Link className="mobile-wordmark" to="/">끼리끼리</Link>
        <div className={`database-status ${databaseConnected ? 'connected' : database.loading ? 'checking' : 'disconnected'}`} title={databaseConnected ? '데이터베이스 연결됨' : database.error || 'DB 연결 확인 중'}>
          {databaseConnected ? <Database /> : <WifiOff />}
          <span>{databaseConnected ? 'DB 연결됨' : database.loading ? 'DB 확인 중' : 'DB 연결 끊김'}</span>
        </div>
        <div className="topbar-actions"><ThemeToggle />{user ? <Link className="notification-button" aria-label="알림" to="/notifications"><Bell size={20} />{Boolean(unread.data?.count) && <span>{unread.data?.count}</span>}</Link> : <Link className="top-login-button" to="/login"><LogIn /> 로그인</Link>}</div>
      </header>
      {!database.loading && !databaseConnected && <div className="database-alert"><WifiOff /> 실제 데이터베이스에 연결할 수 없습니다. 서버와 MySQL 상태를 확인해주세요.</div>}
      {currentGroup && submenus[currentGroup[0]] && <nav className="mobile-subnav" aria-label={`${currentGroup[1]} 하위 메뉴`}><NavLink to={currentGroup[0]} end>{currentGroup[1]}</NavLink>{submenus[currentGroup[0]].map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>}
      <main className="page"><Outlet /></main>
    </div>
    <nav className="mobile-nav"><NavigationItems /></nav>
  </div>;
}
