import { Search } from 'lucide-react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ActivityCard } from '../features/activities/ActivityCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

export function InfoPage() {
  const [query, setQuery] = useState('');
  const result = useAsync(() => api<ActivityItem[]>('/api/activities'), []);
  const filtered = useMemo(() => (result.data || []).filter((item) =>
    `${item.title} ${item.organizer} ${item.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [query, result.data]);

  return <>
    <PageTitle eyebrow="DISCOVER" title="활동 정보" description="공모전, 대외활동, 교육과 행사를 한 번에 찾아보세요." />
    <Link className="info-curriculum-banner" to="/curricula"><span><Sparkles /></span><div><small>기업이 제안하는 기술 성장 과정</small><strong>기업 커리큘럼을 개인·팀 활동으로 시작하세요</strong><p>내 일정에 맞춘 월간·주간·일일 목표가 자동으로 만들어집니다.</p></div><ArrowRight /></Link>
    <div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="활동명이나 주최기관 검색" /></div>
    <PageState loading={result.loading} error={result.error} empty={!result.loading && !filtered.length ? '조건에 맞는 활동이 없습니다.' : undefined} />
    <div className="activity-grid">{filtered.slice(0, 40).map((item) => <ActivityCard key={item.activity_id} item={item} />)}</div>
  </>;
}
