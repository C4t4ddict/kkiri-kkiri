import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  Layers3,
  LockKeyhole,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { Curriculum, CurriculumNode, CurriculumPlan } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';

const levelMeta = {
  MONTHLY: { title: '월간 마일스톤', description: '과정의 큰 방향과 도달 기준', Icon: Flag },
  WEEKLY: { title: '주간 목표', description: '한 주 단위로 완성할 학습 묶음', Icon: Layers3 },
  DAILY: { title: '일일 실행', description: '캘린더에 배치되는 구체적인 행동', Icon: CheckCircle2 },
};
const difficultyLabel = { BEGINNER: '입문', INTERMEDIATE: '중급', ADVANCED: '심화' };
const weekdays = [['1', '월'], ['2', '화'], ['3', '수'], ['4', '목'], ['5', '금'], ['6', '토'], ['7', '일']] as const;
const today = new Date().toISOString().slice(0, 10);

export function CurriculumDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const result = useAsync(() => api<Curriculum>(`/api/curricula/${id}`), [id]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [mode, setMode] = useState<'PERSONAL' | 'TEAM'>('PERSONAL');
  const [startDate, setStartDate] = useState(today);
  const [availableDays, setAvailableDays] = useState([1, 3, 5]);
  const [teamName, setTeamName] = useState('');
  const [requiredMembers, setRequiredMembers] = useState(4);
  const [openRecruitment, setOpenRecruitment] = useState(true);
  const [plan, setPlan] = useState<CurriculumPlan | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const curriculum = result.data;
  const groups = useMemo(() => {
    const grouped: Record<'MONTHLY' | 'WEEKLY' | 'DAILY', CurriculumNode[]> = { MONTHLY: [], WEEKLY: [], DAILY: [] };
    curriculum?.nodes?.forEach((node) => grouped[node.level].push(node));
    return grouped;
  }, [curriculum?.nodes]);

  if (result.loading || result.error || !curriculum) return <PageState loading={result.loading} error={result.error} />;
  const brandColor = /^#[0-9A-F]{6}$/i.test(curriculum.brand_color || '') ? curriculum.brand_color : '#6c5ce7';
  const pageStyle = { '--brand-color': brandColor } as CSSProperties;

  const openSetup = () => {
    setTeamName(`${curriculum.title} 스터디`);
    setSetupOpen(true);
  };
  const toggleDay = (value: number) => {
    setPlan(null);
    setAvailableDays((current) => current.includes(value)
      ? current.length > 1 ? current.filter((day) => day !== value) : current
      : [...current, value].sort());
  };
  const preview = async () => {
    setWorking(true);
    setError('');
    try {
      const response = await api<{ plan: CurriculumPlan }>(`/api/curricula/${id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ start_date: startDate, available_weekdays: availableDays }),
      });
      setPlan(response.plan);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '일정을 만들지 못했습니다');
    } finally {
      setWorking(false);
    }
  };
  const enroll = async () => {
    if (!plan) return preview();
    setWorking(true);
    setError('');
    try {
      const response = await api<{ team_id: number }>(`/api/curricula/${id}/enroll`, {
        method: 'POST',
        body: JSON.stringify({
          participation_mode: mode,
          start_date: startDate,
          available_weekdays: availableDays,
          team_name: mode === 'TEAM' ? teamName : undefined,
          required_members: requiredMembers,
          open_recruitment: mode === 'TEAM' ? openRecruitment : false,
        }),
      });
      setSetupOpen(false);
      navigate(`/activity?team=${response.team_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '활동에 추가하지 못했습니다');
    } finally {
      setWorking(false);
    }
  };

  return <div className="curriculum-detail-page" style={pageStyle}>
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> 기업 커리큘럼</button>
    <section className="curriculum-detail-hero">
      <div className="detail-company-row">
        <span className="company-monogram large">{curriculum.organization_name.slice(0, 1)}</span>
        <span><strong>{curriculum.organization_name}{curriculum.is_verified && <CheckCircle2 size={15} />}</strong><small>기업 제공 · v{curriculum.version_number}</small></span>
      </div>
      <span className="eyebrow">{curriculum.role_title || 'TECH CAREER ROADMAP'}</span>
      <h1>{curriculum.title}</h1>
      <p>{curriculum.summary}</p>
      <div className="detail-hero-meta">
        <span><CalendarDays />{curriculum.duration_weeks}주 과정</span>
        <span><Clock3 />주 {curriculum.weekly_hours}시간</span>
        <span><Layers3 />{difficultyLabel[curriculum.difficulty]}</span>
      </div>
      <button className="detail-hero-cta" onClick={openSetup}>내 활동에 추가 <ArrowRight size={18} /></button>
    </section>

    <section className="curriculum-insight-grid">
      <article><strong>{curriculum.goal_count || curriculum.nodes?.length || 0}</strong><span>전체 목표</span><small>월간·주간·일일 목표</small></article>
      <article><strong>{Math.round(curriculum.duration_weeks * curriculum.weekly_hours)}</strong><span>예상 학습시간</span><small>개인 일정에 따라 조정</small></article>
      <article><strong>{groups.DAILY.length}</strong><span>실행 과제</span><small>캘린더에 자동 배치</small></article>
      <article><strong>{curriculum.participant_count || 0}</strong><span>학습 참여</span><small>개인 정보는 기업에 비공개</small></article>
    </section>

    <section className="curriculum-reading-layout">
      <article className="curriculum-article">
        <span className="eyebrow">ABOUT THIS CURRICULUM</span>
        <h2>이 과정을 마치면</h2>
        <p>{curriculum.description || curriculum.summary}</p>
        <blockquote><Sparkles size={18} /> 기업이 제안한 목표는 기준점이고, 실제 일정과 수행 방식은 사용자가 결정합니다.</blockquote>
      </article>
      <aside className="privacy-note"><LockKeyhole /><div><strong>학습 기록은 나의 것</strong><p>기업은 개인 일정과 상세 달성 기록을 볼 수 없습니다. 채용 제출은 별도 동의가 필요합니다.</p></div></aside>
    </section>

    <section className="learning-map-section">
      <div className="catalog-toolbar compact"><div><span className="eyebrow">LEARNING MAP</span><h2>학습 과정</h2><p>큰 목표부터 오늘 할 일까지 연결된 구조입니다.</p></div></div>
      <div className="learning-map-grid">
        {(Object.keys(levelMeta) as Array<keyof typeof levelMeta>).map((level) => {
          const meta = levelMeta[level];
          return <article className="learning-level-card" key={level}>
            <div className="learning-level-head"><span><meta.Icon /></span><div><strong>{meta.title}</strong><small>{meta.description}</small></div><em>{groups[level].length}</em></div>
            <div className="learning-node-list">{groups[level].slice(0, level === 'DAILY' ? 8 : 20).map((node, index) => <div className="learning-node" key={node.node_id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{node.title}{!node.is_required && <em>선택</em>}</strong>{node.description && <p>{node.description}</p>}<small>시작 +{node.relative_start_day}일 · {node.estimated_minutes || 0}분</small></div></div>)}</div>
            {groups[level].length > 8 && level === 'DAILY' && <p className="more-goals">외 {groups[level].length - 8}개 실행 목표</p>}
          </article>;
        })}
      </div>
    </section>

    {setupOpen && <div className="modal-backdrop curriculum-modal-backdrop">
      <div className="web-modal curriculum-setup-modal">
        <div className="modal-head"><div><span className="eyebrow">ADD TO ACTIVITY</span><h2>학습 방식과 일정을 정해주세요</h2></div><button aria-label="닫기" onClick={() => setSetupOpen(false)}><X /></button></div>
        <div className="mode-selector">
          <button className={mode === 'PERSONAL' ? 'active' : ''} onClick={() => { setMode('PERSONAL'); setPlan(null); }}><span><UserRound /></span><strong>개인으로 시작</strong><small>내 일정에 맞춰 혼자 완주해요</small></button>
          <button className={mode === 'TEAM' ? 'active' : ''} onClick={() => { setMode('TEAM'); setPlan(null); }}><span><UsersRound /></span><strong>팀으로 시작</strong><small>팀원과 목표를 나누고 함께 완주해요</small></button>
        </div>
        <div className="setup-form-grid">
          <label>학습 시작일<input type="date" min={today} value={startDate} onChange={(event) => { setStartDate(event.target.value); setPlan(null); }} /></label>
          {mode === 'TEAM' && <label>팀 이름<input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={80} /></label>}
        </div>
        <label className="setup-label">학습 가능한 요일</label>
        <div className="weekday-selector">{weekdays.map(([value, label]) => <button className={availableDays.includes(Number(value)) ? 'active' : ''} onClick={() => toggleDay(Number(value))} key={value}>{label}</button>)}</div>
        {mode === 'TEAM' && <div className="team-setup-row"><label>목표 인원<select value={requiredMembers} onChange={(event) => setRequiredMembers(Number(event.target.value))}>{[2, 3, 4, 5, 6, 8].map((count) => <option value={count} key={count}>{count}명</option>)}</select></label><label className="inline-check"><input type="checkbox" checked={openRecruitment} onChange={(event) => setOpenRecruitment(event.target.checked)} /><span><strong>매칭 탭에 모집글 공개</strong><small>활동 생성과 동시에 팀원을 모집합니다.</small></span></label></div>}
        {plan && <section className="plan-preview">
          <div className="plan-preview-head"><span><CalendarDays /></span><div><strong>내 일정 미리보기</strong><small>{plan.start_date} ~ {plan.end_date}</small></div></div>
          <div className="plan-preview-metrics"><div><strong>{plan.total_hours}h</strong><span>전체 학습</span></div><div><strong>{plan.level_counts['주간']}</strong><span>주간 목표</span></div><div><strong>{plan.level_counts['일일']}</strong><span>일일 실행</span></div></div>
          <div className="plan-preview-goals">{plan.goals.slice(0, 4).map((goal) => <div key={`${goal.scope_type}-${goal.stable_key}`}><Check size={14} /><span>{goal.title}</span><small>{goal.scope_start_date.slice(5)}</small></div>)}</div>
        </section>}
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button curriculum-submit" disabled={working} onClick={enroll}>{working ? '일정을 만드는 중…' : plan ? '이 일정으로 활동에 추가' : '일정 미리보기'} {!working && <ArrowRight size={17} />}</button>
      </div>
    </div>}
  </div>;
}
