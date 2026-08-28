import { CalendarCheck, ChevronRight, FileHeart, Send, Target, UsersRound } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { ActivityCard } from '../features/activities/ActivityCard';
import { CurriculumCard } from '../features/curricula/CurriculumCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, Application, Curriculum } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { SectionHead } from '../shared/ui/SectionHead';

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>;
}

export function HomePage() {
  const { user } = useAuth();
  const activities = useAsync(() => api<{ items: ActivityItem[] }>('/api/activities/open?page=1&limit=6'), []);
  const applications = useAsync(() => api<Application[]>('/api/my-applications'), []);
  const curricula = useAsync(() => api<Curriculum[]>('/api/curricula'), []);
  const items = activities.data?.items || [];

  return <>
    <section className="hero-banner">
      <div><span className="eyebrow">WELCOME BACK</span><h1>{user?.name}님, 오늘의 실행이<br />원하는 커리어에 닿도록.</h1><p>기업 커리큘럼부터 공모전, 팀 목표까지 한 곳에서 이어가세요.</p><Link className="hero-cta" to="/curricula">기업 커리큘럼 보기 <ChevronRight size={18} /></Link></div>
      <div className="hero-visual"><span className="orbit one" /><span className="orbit two" /><Target size={68} /></div>
    </section>
    <section className="metrics-grid">
      <Metric icon={<CalendarCheck />} label="접수 중 활동" value={`${items.length}+`} />
      <Metric icon={<Send />} label="나의 지원" value={`${applications.data?.length || 0}`} />
      <Metric icon={<UsersRound />} label="모집 중인 팀" value="탐색" />
      <Metric icon={<FileHeart />} label="성장 기록" value="관리" />
    </section>
    <SectionHead title="기업이 제안한 성장 로드맵" link="/curricula" />
    {curricula.loading || curricula.error
      ? <PageState loading={curricula.loading} error={curricula.error} />
      : <div className="curriculum-grid home">{(curricula.data || []).slice(0, 3).map((item) => <CurriculumCard curriculum={item} key={item.curriculum_id} />)}</div>}
    <SectionHead title="지금 지원할 수 있는 활동" link="/info" />
    {activities.loading || activities.error
      ? <PageState loading={activities.loading} error={activities.error} />
      : <div className="activity-grid">{items.map((item) => <ActivityCard key={item.activity_id} item={item} />)}</div>}
  </>;
}
