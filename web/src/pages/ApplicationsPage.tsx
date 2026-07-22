import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../features/applications/StatusPill';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Application } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

export function ApplicationsPage() {
  const result = useAsync(() => api<Application[]>('/api/my-applications'), []);
  return <>
    <PageTitle eyebrow="APPLICATIONS" title="나의 지원" description="지원부터 팀 합류까지 진행 상황을 확인하세요." />
    <PageState loading={result.loading} error={result.error} empty={!result.loading && !result.data?.length ? '지원한 모집글이 없습니다.' : undefined} />
    <div className="recruitment-list">{result.data?.map((item) => <Link to={`/mypage/applications/${item.application_id}`} className="application-row" key={item.application_id}><StatusPill application={item} /><div><h3>{item.post_name}</h3><p>{item.activity_name}</p></div><ChevronRight /></Link>)}</div>
  </>;
}
