import { BriefcaseBusiness, FileHeart } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';
import { SectionHead } from '../shared/ui/SectionHead';

type TeamSummary = { team_id: number; activity_name?: string; team_name?: string; part?: string; role?: string };
type PortfolioSummary = { portfolio_id: number; activity_name: string; role?: string; completed_task_count?: number };

export function ActivityPage() {
  const { user } = useAuth();
  const active = useAsync(() => api<TeamSummary[]>('/my-teams'), []);
  const past = useAsync(() => api<PortfolioSummary[]>(`/users/${user?.id}/past-activities`), [user?.id]);

  return <>
    <PageTitle eyebrow="MY ACTIVITY" title="나의 활동" description="진행 중인 목표와 지난 활동의 성장 기록을 관리하세요." />
    <div className="activity-summary"><div className="progress-ring"><div><strong>68%</strong><span>이번 달</span></div></div><div><span className="eyebrow">MONTHLY PROGRESS</span><h2>목표를 향해 꾸준히 성장 중이에요</h2><p>모바일 앱의 일일·주간·월간 목표와 같은 데이터가 웹에서도 연결됩니다.</p></div></div>
    <div className="two-columns">
      <section><SectionHead title="진행 중인 활동" />{active.loading ? <PageState loading /> : (active.data || []).map((team) => <div className="simple-row" key={team.team_id}><div className="row-icon"><BriefcaseBusiness /></div><div><strong>{team.activity_name || team.team_name || `활동 ${team.team_id}`}</strong><span>{team.part || team.role || '역할 설정 전'}</span></div></div>)}</section>
      <section><SectionHead title="지난 활동" />{past.loading ? <PageState loading /> : (past.data || []).slice(0, 5).map((portfolio) => <div className="simple-row" key={portfolio.portfolio_id}><div className="row-icon"><FileHeart /></div><div><strong>{portfolio.activity_name}</strong><span>{portfolio.role || '역할 미정'} · {portfolio.completed_task_count || 0}개 완료</span></div></div>)}</section>
    </div>
  </>;
}
