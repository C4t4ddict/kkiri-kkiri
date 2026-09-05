import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, SearchX } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import { ActivityCard } from '../features/activities/ActivityCard';
import { getActivityCategoryLabel } from '../features/activities/activityCategory';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

const ACTIVITIES_PER_PAGE = 24;

const getActivityType = (item: ActivityItem) => item.category?.trim() || '기타 활동';
const getActivityField = (item: ActivityItem) => item.topic_category?.trim() || '기타';

export function InfoPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [category, setCategory] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const result = useAsync(() => api<ActivityItem[]>('/api/activities'), []);
  const categoryOptions = useMemo(() => [...new Set((result.data || []).flatMap((item) => [getActivityType(item), getActivityField(item)]))].sort(), [result.data]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (result.data || []).filter((item) => {
      const matchesQuery = !normalizedQuery || `${item.title} ${item.organizer || ''} ${item.category || ''} ${item.topic_category || ''}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery
        && (category === 'ALL' || getActivityType(item) === category || getActivityField(item) === category);
    });
  }, [category, query, result.data]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ACTIVITIES_PER_PAGE));
  const pageStart = (currentPage - 1) * ACTIVITIES_PER_PAGE;
  const visibleActivities = filtered.slice(pageStart, pageStart + ACTIVITIES_PER_PAGE);
  const hasActiveFilters = Boolean(query.trim()) || category !== 'ALL';
  const changePage = (page: number) => setCurrentPage(Math.min(totalPages, Math.max(1, page)));
  const resetFilters = () => {
    setQuery('');
    setCategory('ALL');
    setCurrentPage(1);
  };
  const scrollCategories = (direction: number) => categoryBarRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });

  return <>
    <PageTitle title="활동 정보" description="도전할 프로젝트와 성장 프로그램, 배움의 기회를 한 번에 찾아보세요." />
    <div className="info-discovery-tools">
      <div className="info-category-carousel">
        <button type="button" onClick={() => scrollCategories(-1)} aria-label="이전 카테고리"><ChevronLeft /></button>
        <div className="info-category-scroll" ref={categoryBarRef} role="tablist" aria-label="활동 카테고리">
          {['ALL', ...categoryOptions].map((option) => <button type="button" role="tab" aria-selected={category === option} className={category === option ? 'active' : ''} onClick={() => { setCategory(option); setCurrentPage(1); }} key={option}>{option === 'ALL' ? '모든 활동' : getActivityCategoryLabel(option)}</button>)}
        </div>
        <button type="button" onClick={() => scrollCategories(1)} aria-label="다음 카테고리"><ChevronRight /></button>
      </div>
      <label className="info-simple-search"><Search /><span className="sr-only">활동 검색어</span><input value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }} placeholder="활동명이나 주최기관 검색" /></label>
    </div>
    <PageState loading={result.loading} error={result.error} />
    {!result.loading && !result.error && !filtered.length && <section className="info-filter-empty"><SearchX /><h2>조건에 맞는 활동이 없습니다</h2><p>검색어나 카테고리를 바꿔 다시 찾아보세요.</p>{hasActiveFilters && <button type="button" onClick={resetFilters}>전체 활동 보기</button>}</section>}
    {Boolean(filtered.length) && <div className="info-result-toolbar" id="activity-results" role="status" aria-live="polite"><strong>{pageStart + 1}–{Math.min(pageStart + ACTIVITIES_PER_PAGE, filtered.length)}개 표시</strong><span>전체 {filtered.length}개 · {currentPage}/{totalPages} 페이지</span></div>}
    <div className="activity-grid">{visibleActivities.map((item) => <ActivityCard key={item.activity_id} item={item} />)}</div>
    {totalPages > 1 && <nav className="info-pagination" aria-label="활동 목록 페이지 이동">
      <button type="button" onClick={() => changePage(1)} disabled={currentPage === 1} aria-label="첫 페이지"><ChevronsLeft /></button>
      <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1}><ChevronLeft /> 이전</button>
      <strong><span className="sr-only">현재 페이지</span>{currentPage} <small>/ {totalPages}</small></strong>
      <button type="button" onClick={() => changePage(currentPage + 1)} disabled={currentPage === totalPages}>다음 <ChevronRight /></button>
      <button type="button" onClick={() => changePage(totalPages)} disabled={currentPage === totalPages} aria-label="마지막 페이지"><ChevronsRight /></button>
    </nav>}
  </>;
}
