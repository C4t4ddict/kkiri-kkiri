import { ArrowRight, BookOpen, Building2, Search, SearchX, UsersRound } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ActivityCard } from '../features/activities/ActivityCard';
import { CurriculumCard } from '../features/curricula/CurriculumCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem, Curriculum, Recruitment } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';

type SearchData = {
  activities: ActivityItem[];
  curricula: Curriculum[];
  recruitments: Recruitment[];
};

const includesTerm = (values: Array<string | undefined>, term: string) => values
  .filter(Boolean)
  .some((value) => String(value).toLowerCase().includes(term));

export function SearchResultsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get('q')?.trim() || '';
  const [input, setInput] = useState(query);
  const result = useAsync(() => Promise.all([
    api<ActivityItem[]>('/api/activities'),
    api<Curriculum[]>('/api/curricula'),
    api<Recruitment[]>('/api/team-recruitments'),
  ]).then(([activities, curricula, recruitments]) => ({ activities, curricula, recruitments })), []);
  const filtered = useMemo<SearchData>(() => {
    const term = query.toLowerCase();
    if (!term) return { activities: [], curricula: [], recruitments: [] };
    return {
      activities: (result.data?.activities || []).filter((item) => includesTerm([
        item.title,
        item.organizer,
        item.category,
        item.topic_category,
        item.details,
      ], term)),
      curricula: (result.data?.curricula || []).filter((item) => includesTerm([
        item.title,
        item.organization_name,
        item.role_title,
        item.summary,
        item.description,
      ], term)),
      recruitments: (result.data?.recruitments || []).filter((item) => includesTerm([
        item.post_name,
        item.activity_name,
        item.activity_type,
        item.memo,
      ], term)),
    };
  }, [query, result.data]);
  const total = filtered.activities.length + filtered.curricula.length + filtered.recruitments.length;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
    if (nextQuery) navigate(`/search?q=${encodeURIComponent(nextQuery)}`);
  };

  return <div className="search-results-page">
    <form className="home-global-search search-results-search" onSubmit={submit}>
      <Search />
      <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="활동, 기업 커리큘럼, 팀 모집을 검색해보세요" aria-label="통합 검색어" />
      <button type="submit">검색</button>
    </form>
    {query && <header className="search-results-heading"><h1>‘{query}’ 검색 결과</h1><p>활동, 기업 커리큘럼, 팀 모집에서 <strong>{total}개</strong>를 찾았습니다.</p></header>}
    <PageState loading={result.loading} error={result.error} />
    {!query && !result.loading && <section className="search-empty"><Search /><h2>찾고 싶은 내용을 입력해주세요</h2><p>공모전 이름, 기업, 직무, 기술 스택 또는 팀 모집글을 한 번에 검색할 수 있어요.</p></section>}
    {Boolean(query) && !result.loading && !result.error && total === 0 && <section className="search-empty"><SearchX /><h2>일치하는 결과가 없습니다</h2><p>검색어를 짧게 바꾸거나 다른 기술·기업 이름으로 다시 찾아보세요.</p></section>}
    {Boolean(filtered.activities.length) && <section className="search-result-section"><header><div><BookOpen /><h2>활동</h2><span>{filtered.activities.length}</span></div><Link to={`/info?query=${encodeURIComponent(query)}`}>전체 활동 보기 <ArrowRight /></Link></header><div className="activity-grid search-activity-grid">{filtered.activities.slice(0, 8).map((item) => <ActivityCard item={item} key={item.activity_id} />)}</div></section>}
    {Boolean(filtered.curricula.length) && <section className="search-result-section"><header><div><Building2 /><h2>기업 커리큘럼</h2><span>{filtered.curricula.length}</span></div><Link to="/curriculum">전체 커리큘럼 보기 <ArrowRight /></Link></header><div className="curriculum-grid">{filtered.curricula.slice(0, 6).map((item) => <CurriculumCard curriculum={item} key={item.curriculum_id} />)}</div></section>}
    {Boolean(filtered.recruitments.length) && <section className="search-result-section"><header><div><UsersRound /><h2>팀 모집</h2><span>{filtered.recruitments.length}</span></div><Link to="/matching">전체 모집글 보기 <ArrowRight /></Link></header><div className="search-recruitment-list">{filtered.recruitments.slice(0, 8).map((item) => <Link to={`/matching/${item.recruitment_id}`} key={item.recruitment_id}><div><span>{item.activity_type || '팀 활동'}</span><h3>{item.post_name}</h3><p>{item.activity_name || '활동명 협의'} · {item.meeting_type || '진행 방식 협의'}</p></div><ArrowRight /></Link>)}</div></section>}
  </div>;
}
