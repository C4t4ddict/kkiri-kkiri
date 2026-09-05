import { Building2, CalendarCheck2, ChevronLeft, ChevronRight, HelpCircle, Search, UsersRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CurriculumCard } from '../features/curricula/CurriculumCard';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Curriculum } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';

const tutorialSteps = [
  {
    image: '/tutorial/curriculum-catalog.jpg',
    alt: '끼리끼리 기업 커리큘럼 목록 화면',
    position: 'center top',
    title: '관심 기업과 직무 과정 찾기',
    description: '기업이 제안한 기술 과정의 난이도, 기간, 주간 학습 시간을 비교하고 나에게 맞는 과정을 선택해요.',
  },
  {
    image: '/tutorial/curriculum-detail.jpg',
    alt: '끼리끼리 기업 커리큘럼 상세 화면',
    position: 'center top',
    title: '목표와 학습 흐름 미리 확인하기',
    description: '월간 마일스톤부터 주간 목표와 일일 실행까지, 과정 전체가 어떻게 이어지는지 시작 전에 확인해요.',
  },
  {
    image: '/tutorial/curriculum-schedule.jpg',
    alt: '끼리끼리 커리큘럼 일정 설정 화면',
    position: 'center center',
    title: '내 일정에 맞춰 활동으로 시작하기',
    description: '개인 또는 팀 방식을 고르고 가능한 요일을 선택하면 목표가 내 활동 일정에 맞게 배치돼요.',
  },
] as const;

export function CurriculaPage() {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const result = useAsync(() => api<Curriculum[]>('/api/curricula'), []);
  const curricula = useMemo(() => result.data || [], [result.data]);
  const filtered = useMemo(() => curricula.filter((item) => {
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [item.title, item.summary, item.role_title, item.organization_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
    return matchesQuery && (difficulty === 'ALL' || item.difficulty === difficulty);
  }), [curricula, difficulty, query]);
  const moveTutorial = (direction: number) => setTutorialIndex((current) => (current + direction + tutorialSteps.length) % tutorialSteps.length);

  useEffect(() => {
    if (!tutorialOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTutorialOpen(false);
      if (event.key === 'ArrowLeft') moveTutorial(-1);
      if (event.key === 'ArrowRight') moveTutorial(1);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [tutorialOpen]);

  const tutorial = tutorialSteps[tutorialIndex];

  return <div className="curriculum-catalog-page">
    <section className="curriculum-catalog-hero">
      <div className="curriculum-catalog-hero-copy">
        <h1>가고 싶은 회사의 기술을<br />내 일정으로 학습하세요.</h1>
        <p>기업이 제안한 실무 커리큘럼을 개인 또는 팀 활동으로 시작하고, 월간·주간·일일 목표를 끼리끼리에서 꾸준히 달성해요.</p>
        <a href="#curriculum-list">커리큘럼 둘러보기 <ChevronRight /></a>
      </div>
      <div className="curriculum-catalog-flow" aria-label="기업 커리큘럼 이용 흐름">
        <article><span><Building2 /></span><div><strong>기업이 설계</strong><p>필요한 기술과 목표를 제안해요.</p></div><em>01</em></article>
        <article><span><CalendarCheck2 /></span><div><strong>내 일정에 적용</strong><p>가능한 요일과 시작일에 맞춰요.</p></div><em>02</em></article>
        <article><span><UsersRound /></span><div><strong>개인·팀으로 실천</strong><p>달성률을 채우며 함께 성장해요.</p></div><em>03</em></article>
      </div>
    </section>

    <section className="curriculum-catalog-browser" id="curriculum-list">
      <header className="curricula-page-header">
        <div><div className="curricula-title-line"><h2>기업 커리큘럼</h2><button type="button" onClick={() => { setTutorialIndex(0); setTutorialOpen(true); }} aria-label="기업 커리큘럼 사용법 보기"><HelpCircle /></button></div><p>관심 기업, 직무 또는 기술 스택으로 찾아보세요.</p></div>
        <div className="catalog-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기업, 직무, 기술 검색" /></div>
      </header>
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
    </section>
    {tutorialOpen && <div className="modal-backdrop curriculum-tutorial-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTutorialOpen(false); }}>
      <section className="curriculum-tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="curriculum-tutorial-title">
        <header><div><span>커리큘럼 사용법</span><strong>{tutorialIndex + 1} / {tutorialSteps.length}</strong></div><button type="button" onClick={() => setTutorialOpen(false)} aria-label="튜토리얼 닫기"><X /></button></header>
        <div className="curriculum-tutorial-image"><img src={tutorial.image} alt={tutorial.alt} style={{ objectPosition: tutorial.position }} /></div>
        <div className="curriculum-tutorial-copy" aria-live="polite"><h2 id="curriculum-tutorial-title">{tutorialIndex + 1}단계. {tutorial.title}</h2><p>{tutorial.description}</p></div>
        <footer><button type="button" onClick={() => moveTutorial(-1)} aria-label="이전 튜토리얼"><ChevronLeft /> 이전</button><div>{tutorialSteps.map((step, index) => <button type="button" className={tutorialIndex === index ? 'active' : ''} onClick={() => setTutorialIndex(index)} aria-label={`${index + 1}단계: ${step.title}`} key={step.title} />)}</div><button type="button" onClick={() => tutorialIndex === tutorialSteps.length - 1 ? setTutorialOpen(false) : moveTutorial(1)}>{tutorialIndex === tutorialSteps.length - 1 ? '확인' : '다음'} <ChevronRight /></button></footer>
      </section>
    </div>}
  </div>;
}
