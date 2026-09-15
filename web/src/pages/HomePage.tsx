import { BookOpen, BriefcaseBusiness, ChevronRight, Eye, LogIn, Map, Search, Send, TriangleAlert, UserRound, UsersRound } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { ActivityPosterImage } from '../features/activities/ActivityPosterImage';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, Application, Curriculum, Recruitment } from '../shared/types/domain';
import { UserAvatar } from '../shared/ui/UserAvatar';
import { getApplicationStatusLabel } from '../features/applications/StatusPill';
import { HomeShortcuts } from '../features/home/HomeShortcuts';
import { PageState } from '../shared/ui/PageState';
import { calendarDaysUntil } from '../shared/date/calendarDaysUntil';

type Row = { id: string | number; title: string; meta?: string; badge?: string; to: string };

const wordmarkPrefixes = ['끼리', '우리', '친구', '동기', '선후배', '동료', '코'] as const;

function RotatingHomeWordmark() {
  const [index, setIndex] = useState(0);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setRolling(true), 4_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!rolling) return;
    const timeout = window.setTimeout(() => {
      setIndex((current) => (current + 1) % wordmarkPrefixes.length);
      setRolling(false);
    }, 520);
    return () => window.clearTimeout(timeout);
  }, [rolling]);

  const nextIndex = (index + 1) % wordmarkPrefixes.length;

  return <Link className="home-rotating-wordmark" to="/" aria-label="끼리끼리 홈">
    <span className={`home-wordmark-slot ${rolling ? 'rolling' : ''}`} aria-hidden="true">
      <span className="home-wordmark-current">{wordmarkPrefixes[index]}</span>
      <span className="home-wordmark-next">{wordmarkPrefixes[nextIndex]}</span>
    </span>
    <span aria-hidden="true">끼리</span>
  </Link>;
}

const dday = (end?: string) => {
  const days = calendarDaysUntil(end);
  if (days === null) return '일정 확인';
  return days < 0 ? '마감' : days === 0 ? '오늘 마감' : `D-${days}`;
};

function PreviewBoard({ title, icon, rows, more, empty }: { title: string; icon: ReactNode; rows: Row[]; more: string; empty: string }) {
  return <section className="home-preview-board"><header><div><span>{icon}</span><h2>{title}</h2></div><Link to={more}>더보기 <ChevronRight /></Link></header><div className="home-preview-list">{rows.length ? rows.slice(0, 5).map((row) => <Link to={row.to} key={row.id}><strong>{row.title}</strong><div>{row.meta && <span>{row.meta}</span>}{row.badge && <em>{row.badge}</em>}</div></Link>) : <p>{empty}</p>}</div></section>;
}

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const activities = useAsync(() => api<{ items: ActivityItem[] }>('/api/activities/open?page=1&limit=20'), []);
  const trending = useAsync(() => api<ActivityItem[]>('/api/activities/trending?limit=12'), []);
  const applications = useAsync(() => user ? api<Application[]>('/api/my-applications') : Promise.resolve<Application[]>([]), [user?.id]);
  const curricula = useAsync(() => api<Curriculum[]>('/api/curricula'), []);
  const recruitments = useAsync(() => api<Recruitment[]>('/api/team-recruitments'), []);
  const unread = useAsync(() => user ? api<{ count: number }>('/notifications/unread-count') : Promise.resolve({ count: 0 }), [user?.id]);
  const unreadMessages = useAsync(() => user ? api<{ count: number }>('/api/messages/unread-count') : Promise.resolve({ count: 0 }), [user?.id]);
  const favorites = useAsync(() => user ? api<number[]>('/api/favorite-activities/ids') : Promise.resolve<number[]>([]), [user?.id]);
  const items = activities.data?.items || [];
  const dataError = activities.error || trending.error || curricula.error || recruitments.error || (user && (applications.error || unread.error || unreadMessages.error || favorites.error));
  const activityRows: Row[] = items.map((item) => ({ id: item.activity_id, title: item.title, meta: item.organizer || '주최기관 확인', badge: dday(item.application_period_end), to: `/info/${item.activity_id}` }));
  const recruitmentRows: Row[] = (recruitments.data || []).map((item) => ({ id: item.recruitment_id, title: item.post_name, meta: `${item.meeting_type || '방식 협의'} · ${item.required_members || '-'}명`, badge: item.activity_type || '팀', to: `/matching/${item.recruitment_id}` }));
  const curriculumRows: Row[] = (curricula.data || []).map((item) => ({ id: item.curriculum_id, title: item.title, meta: item.organization_name, badge: `${item.duration_weeks}주`, to: `/curriculum/${item.curriculum_id}` }));
  const applicationRows: Row[] = (applications.data || []).map((item) => ({ id: item.application_id, title: item.post_name, meta: item.activity_name, badge: getApplicationStatusLabel(item), to: `/matching/applications/${item.application_id}` }));
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return <div className="home-dashboard">
    <section className="home-search-hero">
      <RotatingHomeWordmark />
      <form className="home-global-search" onSubmit={submitSearch}>
        <Search />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="활동, 기업 커리큘럼, 팀 모집을 검색해보세요" aria-label="통합 검색어" />
        <button type="submit">검색</button>
      </form>
    </section>

    {dataError && <div className="home-data-error"><TriangleAlert /> <div><strong>실제 데이터를 불러오지 못했습니다.</strong><span>{dataError}</span></div></div>}

    <section className="home-poster-section home-featured-activities" aria-label="요즘 많이 찾는 활동"><header><div><span className="home-recommend-label">끼리끼리가 추천하는</span><h2>요즘 많이 찾는 활동</h2></div><Link to="/info">전체 보기 <ChevronRight /></Link></header><PageState loading={trending.loading} error={trending.error} empty={!trending.loading && !trending.error && !trending.data?.length ? '추천할 접수 중 활동을 준비하고 있어요.' : undefined} /><div className="home-poster-row" tabIndex={0} aria-label="추천 활동 가로 목록">{trending.data?.map((item) => <Link to={`/info/${item.activity_id}`} key={item.activity_id}><ActivityPosterImage source={item.main_image_url} alt={`${item.title} 포스터`} fallback={<span className="poster-mini-fallback"><BriefcaseBusiness /></span>} /><div className="home-poster-copy"><span>{item.source_name || '공식 공고'}</span><strong>{item.title}</strong><small>{item.topic_category || item.category || '활동'} · {dday(item.application_period_end)}</small>{Number(item.recent_view_count) > 0 && <em><Eye /> 최근 조회 {item.recent_view_count}</em>}</div></Link>)}</div></section>

    <div className="home-dashboard-layout"><main className="home-main-feed">
      <div className="home-board-grid">
        <PreviewBoard title="마감 임박 활동" icon={<BookOpen />} rows={activityRows} more="/info" empty={activities.loading ? '활동을 불러오는 중…' : '접수 중인 활동이 없습니다.'} />
        <PreviewBoard title="팀원 모집" icon={<UsersRound />} rows={recruitmentRows} more="/matching" empty={recruitments.loading ? '모집글을 불러오는 중…' : '모집 중인 팀이 없습니다.'} />
        <PreviewBoard title="기업 커리큘럼" icon={<Map />} rows={curriculumRows} more="/curriculum" empty={curricula.loading ? '커리큘럼을 불러오는 중…' : '등록된 커리큘럼이 없습니다.'} />
        <PreviewBoard title="나의 지원 현황" icon={<Send />} rows={applicationRows} more="/matching/applications" empty={applications.loading ? '지원 현황을 불러오는 중…' : '지원한 모집글이 없습니다.'} />
      </div>
    </main>

      <aside className="home-side-widgets">
        <section className="home-profile-widget">
          {user ? <>
            <div className="home-profile-identity"><UserAvatar user={user} className="home-profile-avatar" /><div><h2>{user.name}님</h2><div className="home-profile-text-links"><Link to="/mypage">마이페이지</Link><button type="button" onClick={logout}>로그아웃</button></div></div></div>
          </> : <div className="home-login-profile"><span><UserRound /></span><h2>로그인이 필요해요</h2><p>내 지원과 친구 쪽지를 확인하고 활동을 관리해보세요.</p><Link to="/login"><LogIn /> 로그인</Link></div>}
          <HomeShortcuts key={user?.id || 'guest'} userId={user?.id} counts={{ notifications: unread.data?.count, favorites: favorites.data?.length, messages: unreadMessages.data?.count }} />
        </section>
      </aside>
    </div>
  </div>;
}
