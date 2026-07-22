import { ArrowLeft, Check } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ApplicationDetail } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';
import { SectionHead } from '../shared/ui/SectionHead';

export function ApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const result = useAsync(() => api<ApplicationDetail>(`/api/my-applications/${id}`), [id]);
  const respond = async (path: string, body?: object) => {
    await api(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
    await result.reload();
  };

  if (result.loading || result.error || !result.data) return <PageState loading={result.loading} error={result.error} />;
  const detail = result.data;

  return <>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> 나의 지원</button>
    <PageTitle eyebrow="APPLICATION STATUS" title={detail.post_name} description={detail.activity_name} />
    <div className="detail-grid">
      <section className="content-card"><SectionHead title="지원 진행 상황" /><div className="timeline">{detail.timeline.map((step) => <div className={`timeline-step ${step.state}`} key={step.key}><span className="timeline-dot">{step.state === 'completed' && <Check size={12} />}</span><div><strong>{step.label}</strong><small>{step.state === 'current' ? '현재 단계' : step.occurred_at ? new Date(step.occurred_at).toLocaleString('ko-KR') : '예정'}</small></div></div>)}</div></section>
      <section className="content-card"><SectionHead title="제출한 지원 내용" /><p className="long-copy">{detail.memo}</p>{detail.offer_id && detail.offer_status === 'PENDING' ? <div className="button-row"><button className="ghost-button" onClick={() => respond(`/api/team-join-offers/${detail.offer_id}/respond`, { decision: 'REJECTED' })}>거절</button><button className="primary-button" onClick={() => respond(`/api/team-join-offers/${detail.offer_id}/respond`, { decision: 'ACCEPTED' })}>팀 합류하기</button></div> : ['PENDING', 'APPROVED'].includes(detail.application_status) && <button className="danger-button" onClick={() => respond(`/api/applications/${detail.application_id}/cancel`)}>지원 취소</button>}</section>
    </div>
  </>;
}
