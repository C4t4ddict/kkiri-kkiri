import { CalendarCheck, ChevronRight, FileHeart, Send, Target, UsersRound } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { ActivityCard } from '../features/activities/ActivityCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, Application } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { SectionHead } from '../shared/ui/SectionHead';

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>;
}

export function HomePage() {
  const { user } = useAuth();
  const activities = useAsync(() => api<{ items: ActivityItem[] }>('/api/activities/open?page=1&limit=6'), []);
  const applications = useAsync(() => api<Application[]>('/api/my-applications'), []);
  const items = activities.data?.items || [];

  return <>
    <section className="hero-banner">
      <div><span className="eyebrow">WELCOME BACK</span><h1>{user?.name}님, 다음 성장을<br />함께 시작해볼까요?</h1><p>새로운 공모전과 팀 모집 현황을 한 곳에서 확인하세요.</p><Link className="hero-cta" to="/info">활동 둘러보기 <ChevronRight size={18} /></Link></div>
      <div className="hero-visual"><span className="orbit one" /><span className="orbit two" /><Target size={68} /></div>
    </section>
    <section className="metrics-grid">
      <Metric icon={<CalendarCheck />} label="접수 중 활동" value={`${items.length}+`} />
      <Metric icon={<Send />} label="나의 지원" value={`${applications.data?.length || 0}`} />
      <Metric icon={<UsersRound />} label="모집 중인 팀" value="탐색" />
      <Metric icon={<FileHeart />} label="성장 기록" value="관리" />
    </section>
    <SectionHead title="지금 지원할 수 있는 활동" link="/info" />
    {activities.loading || activities.error
      ? <PageState loading={activities.loading} error={activities.error} />
      : <div className="activity-grid">{items.map((item) => <ActivityCard key={item.activity_id} item={item} />)}</div>}
  </>;
}
