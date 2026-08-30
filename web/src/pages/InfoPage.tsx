import { ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Search, SearchX, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ActivityCard } from '../features/activities/ActivityCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityItem } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type RecruitmentStatus = '모집 중' | '모집 예정' | '마감' | '일정 미정';
const RECRUITMENT_STATUS_ORDER: RecruitmentStatus[] = ['모집 중', '모집 예정', '마감', '일정 미정'];
const ACTIVITIES_PER_PAGE = 24;

const getActivityType = (item: ActivityItem) => item.category?.trim() || '기타 활동';
const getActivityField = (item: ActivityItem) => item.topic_category?.trim() || '기타';
const getRecruitmentStatus = (item: ActivityItem): RecruitmentStatus => {
  const now = Date.now();
  const startsAt = item.application_period_start ? new Date(item.application_period_start).getTime() : null;
  const endsAt = item.application_period_end ? new Date(item.application_period_end).getTime() : null;
  const hasValidStart = startsAt !== null && Number.isFinite(startsAt);
  const hasValidEnd = endsAt !== null && Number.isFinite(endsAt);
  if (hasValidStart && startsAt > now) return '모집 예정';
  if (hasValidEnd && endsAt < now) return '마감';
  if (hasValidStart || hasValidEnd) return '모집 중';
  return '일정 미정';
};

export function InfoPage() {
  const [query, setQuery] = useState('');
  const [activityType, setActivityType] = useState('전체');
  const [activityField, setActivityField] = useState('전체');
  const [recruitmentStatus, setRecruitmentStatus] = useState('전체');
  const [currentPage, setCurrentPage] = useState(1);
  const result = useAsync(() => api<ActivityItem[]>('/api/activities'), []);
  const typeOptions = useMemo(() => [...new Set((result.data || []).map(getActivityType))].sort(), [result.data]);
  const fieldOptions = useMemo(() => [...new Set((result.data || []).map(getActivityField))].sort(), [result.data]);
  const statusOptions = useMemo(() => {
    const available = new Set((result.data || []).map(getRecruitmentStatus));
    return RECRUITMENT_STATUS_ORDER.filter((status) => available.has(status));
  }, [result.data]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (result.data || []).filter((item) => {
      const matchesQuery = !normalizedQuery || `${item.title} ${item.organizer || ''} ${item.category || ''} ${item.topic_category || ''}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery
        && (activityType === '전체' || getActivityType(item) === activityType)
        && (activityField === '전체' || getActivityField(item) === activityField)
        && (recruitmentStatus === '전체' || getRecruitmentStatus(item) === recruitmentStatus);
    });
  }, [activityField, activityType, query, recruitmentStatus, result.data]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ACTIVITIES_PER_PAGE));
  const pageStart = (currentPage - 1) * ACTIVITIES_PER_PAGE;
  const visibleActivities = filtered.slice(pageStart, pageStart + ACTIVITIES_PER_PAGE);
  const hasActiveFilters = Boolean(query.trim()) || activityType !== '전체' || activityField !== '전체' || recruitmentStatus !== '전체';
  const changePage = (page: number) => setCurrentPage(Math.min(totalPages, Math.max(1, page)));
  const resetFilters = () => {
    setQuery('');
    setActivityType('전체');
    setActivityField('전체');
    setRecruitmentStatus('전체');
    setCurrentPage(1);
  };

  return <>
    <PageTitle eyebrow="DISCOVER" title="활동 정보" description="공모전, 대외활동, 교육과 행사를 한 번에 찾아보세요." />
    <Link className="info-curriculum-banner" to="/curricula"><span><Sparkles /></span><div><small>기업이 제안하는 기술 성장 과정</small><strong>기업 커리큘럼을 개인·팀 활동으로 시작하세요</strong><p>내 일정에 맞춘 월간·주간·일일 목표가 자동으로 만들어집니다.</p></div><ArrowRight /></Link>
    <label className="search-field"><Search size={18} /><span className="sr-only">활동 검색어</span><input value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }} placeholder="활동명이나 주최기관 검색" /></label>
    <section className="info-filter-panel" aria-labelledby="info-filter-heading">
      <header>
        <div><span><SlidersHorizontal /></span><div><h2 id="info-filter-heading">활동 분류 필터</h2><p>실제 등록된 활동 유형과 분야를 조합해 찾아보세요.</p></div></div>
        <button type="button" onClick={resetFilters} disabled={!hasActiveFilters}><RotateCcw /> 초기화</button>
      </header>
      <div className="info-filter-grid">
        <label><span>활동 유형</span><select value={activityType} onChange={(event) => { setActivityType(event.target.value); setCurrentPage(1); }}><option>전체</option>{typeOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><span>활동 분야</span><select value={activityField} onChange={(event) => { setActivityField(event.target.value); setCurrentPage(1); }}><option>전체</option>{fieldOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><span>모집 상태</span><select value={recruitmentStatus} onChange={(event) => { setRecruitmentStatus(event.target.value); setCurrentPage(1); }}><option>전체</option>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
      </div>
      <div className="info-filter-summary" role="status" aria-live="polite">
        <strong>{filtered.length}개 활동</strong>
        <div>{activityType !== '전체' && <span>유형 · {activityType}</span>}{activityField !== '전체' && <span>분야 · {activityField}</span>}{recruitmentStatus !== '전체' && <span>상태 · {recruitmentStatus}</span>}{query.trim() && <span>검색 · {query.trim()}</span>}</div>
      </div>
    </section>
    <PageState loading={result.loading} error={result.error} />
    {!result.loading && !result.error && !filtered.length && <section className="info-filter-empty"><SearchX /><h2>조건에 맞는 활동이 없습니다</h2><p>검색어나 선택한 분류를 바꿔 다시 찾아보세요.</p>{hasActiveFilters && <button type="button" onClick={resetFilters}><RotateCcw /> 모든 필터 초기화</button>}</section>}
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
