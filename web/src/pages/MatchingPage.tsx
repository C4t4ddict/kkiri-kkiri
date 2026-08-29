import { ChevronRight, Plus, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Recruitment } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

export function MatchingPage() {
  const result = useAsync(() => api<Recruitment[]>('/api/team-recruitments'), []);
  return <>
    <div className="title-actions"><PageTitle eyebrow="TEAM MATCHING" title="함께할 팀 찾기" description="관심 활동을 중심으로 조건이 맞는 팀을 찾아보세요." /><div className="button-row top-actions"><Link className="ghost-button" to="/matching/mine">내 모집글</Link><Link className="primary-button compact" to="/matching/new"><Plus />팀 모집</Link></div></div>
    <PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '현재 모집 중인 팀이 없습니다.' : undefined} />
    <div className="recruitment-list">{result.data?.map((item) => <Link to={`/matching/${item.recruitment_id}`} className="recruitment-card" key={item.recruitment_id}>
      <div className="recruit-icon"><UsersRound /></div>
      <div className="recruit-copy"><div className="card-tags"><span>{item.activity_type || '팀 활동'}</span><span>{item.meeting_type || '방식 협의'}</span></div><h3>{item.post_name}</h3><p>{item.activity_name}</p><small>{item.activity_period || '기간 협의'} · {item.required_members || '-'}명 모집</small></div>
      <ChevronRight className="recruit-arrow" />
    </Link>)}</div>
  </>;
}
