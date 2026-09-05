import { useEffect } from 'react';
import { Activity, Bell, BookOpen, Database, Gauge, Home, LogIn, Map, PenTool, UserRound, UsersRound, WifiOff } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';

const navItems = [
  ['/', '홈', Home],
  ['/info', '정보', BookOpen],
  ['/activity', '활동', Activity],
  ['/curriculum', '커리큘럼', Map],
  ['/matching', '매칭', UsersRound],
] as const;

function NavigationItems({ studio = false }: { studio?: boolean }) {
  const items = [
    ...navItems,
    ...(studio ? [['/studio/curriculum', '커리큘럼 스튜디오', PenTool] as const] : []),
    ['/mypage', '마이페이지', UserRound] as const,
    ...(studio ? [['/admin', '서비스 운영', Gauge] as const] : []),
  ];
  return <>{items.map(([path, label, Icon]) => (
    <NavLink key={path} to={path} end={path === '/'}>
      <Icon size={20} />
      <span>{label}</span>
    </NavLink>
  ))}</>;
}

export function AppShell() {
  const { user } = useAuth();
  const unread = useAsync(() => user ? api<{ count: number }>('/notifications/unread-count') : Promise.resolve({ count: 0 }), [user?.id]);
  const database = useAsync(() => api<{ status: string; database: string }>('/api/db-health'), []);
  useEffect(() => {
    const timer = window.setInterval(database.reload, 15_000);
    return () => window.clearInterval(timer);
  }, [database.reload]);
  const databaseConnected = database.data?.status === 'ok' && !database.error;

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="wordmark" to="/">끼리끼리</Link>
      <nav><NavigationItems studio={Boolean(user?.is_admin)} /></nav>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <Link className="mobile-wordmark" to="/">끼리끼리</Link>
        <div className={`database-status ${databaseConnected ? 'connected' : database.loading ? 'checking' : 'disconnected'}`} title={databaseConnected ? `${database.data?.database} 연결됨` : database.error || 'DB 연결 확인 중'}>
          {databaseConnected ? <Database /> : <WifiOff />}
          <span>{databaseConnected ? 'DB 연결됨' : database.loading ? 'DB 확인 중' : 'DB 연결 끊김'}</span>
        </div>
        {user ? <Link className="notification-button" aria-label="알림" to="/notifications"><Bell size={20} />{Boolean(unread.data?.count) && <span>{unread.data?.count}</span>}</Link> : <Link className="top-login-button" to="/login"><LogIn /> 로그인</Link>}
      </header>
      {!database.loading && !databaseConnected && <div className="database-alert"><WifiOff /> 실제 데이터베이스에 연결할 수 없습니다. 서버와 MySQL 상태를 확인해주세요.</div>}
      <main className="page"><Outlet /></main>
    </div>
    <nav className="mobile-nav"><NavigationItems /></nav>
  </div>;
}
