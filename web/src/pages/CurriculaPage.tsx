import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CurriculumCard } from '../features/curricula/CurriculumCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Curriculum } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import '../styles/curricula.css';

export function CurriculaPage() {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const [role, setRole] = useState('ALL');
  const [sort, setSort] = useState('recent');
  const result = useAsync(() => api<Curriculum[]>('/api/curricula'), []);
  const curricula = useMemo(() => result.data || [], [result.data]);
  const roles = [...new Set(curricula.map(item => item.role_title).filter(Boolean))] as string[];
  const filtered = curricula.filter(item => (difficulty === 'ALL' || item.difficulty === difficulty)
    && (role === 'ALL' || item.role_title === role)
    && [item.title, item.summary, item.role_title, item.organization_name].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => sort === 'short' ? a.duration_weeks - b.duration_weeks : sort === 'light' ? a.weekly_hours - b.weekly_hours : 0);

  return <div className="cp-page">
    <header className="cp-heading"><h1>커리큘럼</h1><p>배우고 싶은 일을 고르고, 내 생활에 맞춰 시작하세요.</p></header>
    <div className="cp-catalog-tools">
      <label className="cp-search"><Search size={18} /><input aria-label="커리큘럼 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="과정, 직무, 기술 검색" /></label>
      <select aria-label="직무 필터" value={role} onChange={event => setRole(event.target.value)}><option value="ALL">모든 직무</option>{roles.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="과정 정렬" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">최근 등록순</option><option value="short">짧은 과정순</option><option value="light">주간 부담 적은순</option></select>
    </div>
    <div className="cp-catalog-levels"><nav aria-label="난이도">{[['ALL', '전체'], ['BEGINNER', '입문'], ['INTERMEDIATE', '중급'], ['ADVANCED', '심화']].map(([value, label]) => <button aria-pressed={difficulty === value} onClick={() => setDifficulty(value)} key={value}>{label}</button>)}</nav><span>{filtered.length}개 과정</span></div>
    <PageState loading={result.loading} error={result.error} />
    {!result.loading && !result.error && !filtered.length && <div className="cp-empty"><h2>조건에 맞는 과정이 없어요</h2><p>검색어나 직무·난이도를 바꿔보세요.</p><button onClick={() => { setQuery(''); setRole('ALL'); setDifficulty('ALL'); }}>전체 과정 보기</button></div>}
    <div className="cp-course-grid">{filtered.map(item => <CurriculumCard curriculum={item} key={item.curriculum_id} />)}</div>
    <footer className="cp-catalog-note"><p>‘예시 과정’은 기능을 체험할 수 있는 연습용 자료이며, 실제 기업의 인증·채용 연계 과정이 아닙니다.</p><details><summary>내 일정에는 어떻게 추가되나요?</summary><p>과정에서 ‘내 일정에 추가’를 누른 뒤 시작일, 학습 요일, 하루 학습량을 정하세요. 배치된 과제를 확인하고 확정하면 활동과 캘린더에 함께 나타납니다. 팀 모집은 직접 선택한 경우에만 공개됩니다.</p></details></footer>
  </div>;
}
