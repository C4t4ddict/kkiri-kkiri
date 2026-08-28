import { Building2, Search, Sparkles, Target, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CurriculumCard } from '../features/curricula/CurriculumCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Curriculum } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';

export function CurriculaPage() {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const result = useAsync(() => api<Curriculum[]>('/api/curricula'), []);
  const curricula = useMemo(() => result.data || [], [result.data]);
  const filtered = useMemo(() => curricula.filter((item) => {
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [item.title, item.summary, item.role_title, item.organization_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
    return matchesQuery && (difficulty === 'ALL' || item.difficulty === difficulty);
  }), [curricula, difficulty, query]);

  return <>
    <section className="curriculum-hero">
      <div className="curriculum-hero-copy">
        <span className="eyebrow">ENTERPRISE CURRICULUM</span>
        <h1>기업이 제안한 성장 기준을<br />나의 실행 계획으로.</h1>
        <p>직무에 필요한 기술을 확인하고 개인 또는 팀 활동으로 추가해 월간·주간·일일 목표를 관리하세요.</p>
        <div className="curriculum-hero-actions">
          <a href="#curriculum-list" className="primary-button">커리큘럼 둘러보기</a>
          <span><Sparkles size={16} /> 일정은 내 학습 가능 시간에 맞춰 생성돼요</span>
        </div>
      </div>
      <div className="curriculum-hero-panel">
        <div className="hero-panel-top"><Building2 /><div><strong>{curricula.length || 0}개 기업 과정</strong><small>검토된 성장 로드맵</small></div></div>
        <div className="hero-progress-visual">
          <span className="bar-one" /><span className="bar-two" /><span className="bar-three" /><span className="bar-four" /><span className="bar-five" />
        </div>
        <div className="hero-panel-metrics">
          <div><Target /><strong>{curricula.reduce((sum, item) => sum + item.goal_count, 0)}</strong><span>학습 목표</span></div>
          <div><UsersRound /><strong>{curricula.reduce((sum, item) => sum + item.participant_count, 0)}</strong><span>참여 기록</span></div>
        </div>
      </div>
    </section>

    <section className="catalog-toolbar" id="curriculum-list">
      <div><span className="eyebrow">CURATED ROADMAPS</span><h2>기업 커리큘럼</h2><p>관심 기업, 직무 또는 기술 스택으로 찾아보세요.</p></div>
      <div className="catalog-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기업, 직무, 기술 검색" /></div>
    </section>
    <div className="filter-pills">
      {[
        ['ALL', '전체'],
        ['BEGINNER', '입문'],
        ['INTERMEDIATE', '중급'],
        ['ADVANCED', '심화'],
      ].map(([value, label]) => <button className={difficulty === value ? 'active' : ''} onClick={() => setDifficulty(value)} key={value}>{label}</button>)}
      <span>{filtered.length}개 과정</span>
    </div>
    <PageState loading={result.loading} error={result.error} empty={!result.loading && !filtered.length ? '공개된 기업 커리큘럼이 없습니다.' : undefined} />
    <div className="curriculum-grid">{filtered.map((item) => <CurriculumCard curriculum={item} key={item.curriculum_id} />)}</div>
  </>;
}
