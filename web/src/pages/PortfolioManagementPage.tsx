import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, FilePenLine } from 'lucide-react';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type PortfolioActivity = { team_id: number; team_name: string; title: string; summary: string; role: string; part?: string; portfolio_id?: number; edited_at?: string };

export function MiniPortfolioEntryPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api<{ portfolio_id: number }>(`/api/teams/${teamId}/mini-portfolio`, { method: 'POST' })
      .then(result => { if (!cancelled) navigate(`/activity/portfolios/${result.portfolio_id}`, { replace: true }); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : '포트폴리오를 열지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [teamId, navigate]);
  return <PageState loading={!error} error={error} />;
}

export function PortfolioManagementPage() {
  const activities = useAsync(() => api<PortfolioActivity[]>('/api/portfolios/activities'), []);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const open = async (teamId: number) => {
    setOpening(teamId); setError('');
    try {
      const result = await api<{ portfolio_id: number }>(`/api/teams/${teamId}/mini-portfolio`, { method: 'POST' });
      navigate(`/activity/portfolios/${result.portfolio_id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '포트폴리오를 열지 못했습니다.'); }
    finally { setOpening(null); }
  };
  return <section className="portfolio-management">
    <PageTitle title="포트폴리오 관리" description="활동 중에는 조금씩 기록하고, 마무리하면 하나의 경험으로 남겨보세요." />
    <div className="portfolio-management-note"><p>완료한 내 목표는 자동으로 정리됩니다. 지금 작성한 역할·성과·회고는 활동 종료 후 생성되는 미니 포트폴리오에도 그대로 남아요.</p><Link to="/activity/archive">지난 활동 보기 <ArrowRight size={16} /></Link></div>
    <h2 className="portfolio-list-title">진행 중인 활동 <span>{activities.data?.length ?? '–'}</span></h2>
    <PageState loading={activities.loading} error={error || activities.error} empty={!activities.loading && !activities.data?.length ? '참여 중인 활동이 없습니다. 활동을 시작하면 여기에 표시됩니다.' : undefined} />
    <div className="portfolio-management-list">{activities.data?.map(item => <article key={item.team_id}>
      <div><small>{item.part || (item.role === 'LEADER' ? '팀장' : '팀원')} · {item.edited_at ? '작성 중' : '기록 준비'}</small><h3>{item.title}</h3><p>{item.summary || '맡은 역할과 기억하고 싶은 성과를 기록해보세요.'}</p>{item.edited_at && <time>최근 저장 {new Date(item.edited_at).toLocaleDateString('ko-KR')}</time>}</div>
      <div className="portfolio-list-actions"><button className="primary-button" disabled={opening !== null} onClick={() => open(item.team_id)}><FilePenLine size={17} />{opening === item.team_id ? '여는 중…' : '포트폴리오 편집'}</button><Link to={`/activity?team=${item.team_id}`}>활동으로 이동</Link></div>
    </article>)}</div>
  </section>;
}
