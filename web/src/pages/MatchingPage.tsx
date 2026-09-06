import { CalendarDays, ChevronRight, Globe2, GraduationCap, MonitorSmartphone, Plus, RotateCcw, Search, SearchX, SlidersHorizontal, UserRoundPlus, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Recruitment } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

export function MatchingPage() {
  const [query, setQuery] = useState('');
  const [activityType, setActivityType] = useState('전체');
  const [meetingType, setMeetingType] = useState('전체');
  const [scope, setScope] = useState('전체');
  const result = useAsync(() => api<Recruitment[]>('/api/team-recruitments'), []);
  const activityTypes = useMemo(() => [...new Set((result.data || []).map((item) => item.activity_type || '팀 활동'))].sort(), [result.data]);
  const meetingTypes = useMemo(() => [...new Set((result.data || []).map((item) => item.meeting_type || '방식 협의'))].sort(), [result.data]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (result.data || []).filter((item) => {
      const matchesQuery = !normalizedQuery || `${item.post_name} ${item.activity_name || ''}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery
        && (activityType === '전체' || (item.activity_type || '팀 활동') === activityType)
        && (meetingType === '전체' || (item.meeting_type || '방식 협의') === meetingType)
        && (scope === '전체' || (item.recruitment_scope || 'NATIONWIDE') === scope);
    });
  }, [activityType, meetingType, query, result.data, scope]);
  const hasActiveFilters = Boolean(query.trim()) || activityType !== '전체' || meetingType !== '전체' || scope !== '전체';
  const remoteCount = (result.data || []).filter((item) => item.meeting_type === '비대면' || item.meeting_type === '혼합').length;
  const schoolCount = (result.data || []).filter((item) => item.recruitment_scope === 'SCHOOL').length;
  const memberCount = (result.data || []).reduce((sum, item) => sum + Number(item.required_members || 0), 0);
  const resetFilters = () => {
    setQuery('');
    setActivityType('전체');
    setMeetingType('전체');
    setScope('전체');
  };

  return <>
    <div className="title-actions"><PageTitle title="함께할 팀 찾기" description="관심 활동을 중심으로 조건이 맞는 팀을 찾아보세요." /><div className="button-row top-actions"><Link className="ghost-button" to="/matching/mine">내 모집글</Link><Link className="primary-button compact" to="/matching/new"><Plus />팀 모집</Link></div></div>
    <section className="matching-overview" aria-label="매칭 현황">
      <article><span><UsersRound /></span><div><strong>{result.data?.length || 0}</strong><small>공개 모집글</small></div></article>
      <article><span><MonitorSmartphone /></span><div><strong>{remoteCount}</strong><small>비대면·혼합</small></div></article>
      <article><span><UserRoundPlus /></span><div><strong>{memberCount}</strong><small>모집 인원 합계</small></div></article>
      <article><span><GraduationCap /></span><div><strong>{schoolCount}</strong><small>본교 전용</small></div></article>
    </section>
    <section className="matching-explorer" aria-labelledby="matching-filter-heading">
      <header><div><span><SlidersHorizontal /></span><div><h2 id="matching-filter-heading">모집글 탐색</h2><p>활동과 팀 진행 조건을 조합해 비교하세요.</p></div></div><button type="button" onClick={resetFilters} disabled={!hasActiveFilters}><RotateCcw /> 초기화</button></header>
      <label className="matching-search"><Search /><span className="sr-only">모집글 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="활동명 또는 모집글명 검색" /></label>
      <div className="matching-filter-grid">
        <label><span>활동 유형</span><select value={activityType} onChange={(event) => setActivityType(event.target.value)}><option>전체</option>{activityTypes.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><span>모임 방식</span><select value={meetingType} onChange={(event) => setMeetingType(event.target.value)}><option>전체</option>{meetingTypes.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><span>공개 범위</span><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="전체">전체</option><option value="NATIONWIDE">전국 공개</option><option value="SCHOOL">본교 공개</option></select></label>
      </div>
      <div className="matching-result-count" role="status" aria-live="polite"><strong>{filtered.length}개 모집글</strong><span>전체 {result.data?.length || 0}개 중 조건에 맞는 결과</span></div>
    </section>
    <PageState loading={result.loading} error={result.error} />
    {!result.loading && !result.error && !filtered.length && <section className="matching-empty"><SearchX /><h2>{hasActiveFilters ? '조건에 맞는 모집글이 없습니다' : '현재 공개된 모집글이 없습니다'}</h2><p>{hasActiveFilters ? '검색어나 조건을 바꿔 다시 찾아보세요.' : '먼저 모집글을 만들고 함께할 팀원을 찾아보세요.'}</p>{hasActiveFilters ? <button type="button" onClick={resetFilters}><RotateCcw /> 필터 초기화</button> : <Link to="/matching/new"><Plus /> 팀 모집 시작</Link>}</section>}
    <div className="matching-card-grid">{filtered.map((item) => <Link to={`/matching/${item.recruitment_id}`} className="matching-recruitment-card" key={item.recruitment_id}>
      <header><div className="card-tags"><span>{item.activity_type || '팀 활동'}</span><span>{item.meeting_type || '방식 협의'}</span></div><em>지원 가능</em></header>
      <h3>{item.post_name}</h3><p>{item.activity_name || '활동명 협의'}</p>
      <dl>
        <div><dt><MonitorSmartphone /> 진행 방식</dt><dd>{item.meeting_type || '협의'}</dd></div>
        <div><dt><CalendarDays /> 활동 기간</dt><dd>{item.activity_period || '기간 협의'}</dd></div>
        <div><dt><UserRoundPlus /> 모집 인원</dt><dd>{item.required_members ? `${item.required_members}명` : '협의'}</dd></div>
        <div><dt><Globe2 /> 공개 범위</dt><dd>{item.recruitment_scope === 'SCHOOL' ? '인증 본교' : '전국'}</dd></div>
      </dl>
      <footer><span><GraduationCap /> {item.qualification_department || '학과 무관'}</span><strong>자세히 보기 <ChevronRight /></strong></footer>
    </Link>)}</div>
  </>;
}
