import {
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  Plus,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { TeamNotice, TeamSummary, Todo } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type GoalScope = '일일' | '주간' | '월간';

const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const currentRanges = () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const offset = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - offset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    월간: { start: dateKey(monthStart), end: dateKey(monthEnd) },
    주간: { start: dateKey(weekStart), end: dateKey(weekEnd) },
    일일: { start: dateKey(weekStart), end: dateKey(weekEnd) },
    weekStart,
  };
};

const progressOf = (items: Todo[]) => items.length
  ? Math.round((items.filter((item) => item.status === '완료').length / items.length) * 100)
  : 0;

const nextStatus = (status: Todo['status']): Todo['status'] => status === '미진행'
  ? '진행중'
  : status === '진행중'
    ? '완료'
    : '미진행';

export function ActivityPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = useAsync(() => api<TeamSummary[]>('/my-teams'), []);
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(searchParams.get('team')) || null);
  const [scope, setScope] = useState<GoalScope>('일일');
  const [newGoal, setNewGoal] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [saving, setSaving] = useState(false);
  const ranges = useMemo(currentRanges, []);

  useEffect(() => {
    if (!active.data?.length) return;
    const exists = active.data.some((team) => team.team_id === selectedId);
    if (!exists) setSelectedId(active.data[0].team_id);
  }, [active.data, selectedId]);

  useEffect(() => {
    if (selectedId) setSearchParams({ team: String(selectedId) }, { replace: true });
  }, [selectedId, setSearchParams]);

  const goals = useAsync(async () => {
    if (!selectedId) return { 월간: [], 주간: [], 일일: [] } as Record<GoalScope, Todo[]>;
    const load = (goalScope: GoalScope) => api<Todo[]>(`/todos/${selectedId}?scope_type=${encodeURIComponent(goalScope)}&start=${ranges[goalScope].start}&end=${ranges[goalScope].end}`);
    const [monthly, weekly, daily] = await Promise.all([load('월간'), load('주간'), load('일일')]);
    return { 월간: monthly, 주간: weekly, 일일: daily };
  }, [selectedId]);
  const notices = useAsync(
    () => selectedId ? api<TeamNotice[]>(`/teams/${selectedId}/notices?limit=6`) : Promise.resolve([]),
    [selectedId],
  );

  const selected = active.data?.find((team) => team.team_id === selectedId) || null;
  const allGoals = useMemo(() => goals.data ? [...goals.data.월간, ...goals.data.주간, ...goals.data.일일] : [], [goals.data]);
  const uniqueGoals = useMemo(() => [...new Map(allGoals.map((goal) => [goal.todo_id, goal])).values()], [allGoals]);
  const overallProgress = progressOf(uniqueGoals);
  const startedProgress = uniqueGoals.length
    ? Math.round((uniqueGoals.filter((goal) => goal.status !== '미진행').length / uniqueGoals.length) * 100)
    : 0;
  const todayGoals = (goals.data?.일일 || []).filter((goal) => goal.scope_start_date.slice(0, 10) === dateKey(new Date()));

  const changeStatus = async (todo: Todo) => {
    await api(`/todos/${todo.todo_id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus(todo.status) }) });
    await goals.reload();
  };

  const addGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !newGoal.trim()) return;
    setSaving(true);
    try {
      const range = scope === '일일'
        ? { start: dateKey(new Date()), end: dateKey(new Date()) }
        : ranges[scope];
      await api('/todos', {
        method: 'POST',
        body: JSON.stringify({
          team_id: selectedId,
          title: newGoal.trim(),
          scope_type: scope,
          scope_start_date: range.start,
          scope_end_date: range.end,
        }),
      });
      setNewGoal('');
      await goals.reload();
    } finally {
      setSaving(false);
    }
  };

  const addNotice = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !noticeTitle.trim() || !noticeContent.trim()) return;
    setSaving(true);
    try {
      await api(`/teams/${selectedId}/notices`, {
        method: 'POST',
        body: JSON.stringify({ title: noticeTitle.trim(), content: noticeContent.trim() }),
      });
      setNoticeTitle('');
      setNoticeContent('');
      await notices.reload();
    } finally {
      setSaving(false);
    }
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(ranges.weekStart);
    date.setDate(ranges.weekStart.getDate() + index);
    const key = dateKey(date);
    const items = (goals.data?.일일 || []).filter((goal) => goal.scope_start_date.slice(0, 10) === key);
    return { key, label: ['월', '화', '수', '목', '금', '토', '일'][index], date: date.getDate(), items, percent: progressOf(items), today: key === dateKey(new Date()) };
  }), [goals.data?.일일, ranges.weekStart]);

  if (active.loading) return <PageState loading />;

  return <>
    <PageTitle eyebrow="MY ACTIVITY" title="나의 활동" description="공모전과 기업 커리큘럼을 같은 방식으로 실행하고 기록하세요." />
    {!active.data?.length ? <section className="activity-empty-panel"><Sparkles /><h2>진행 중인 활동이 없습니다</h2><p>공모전 팀에 참여하거나 기업 커리큘럼을 내 활동으로 추가해보세요.</p><a className="primary-button" href="/curricula">기업 커리큘럼 둘러보기</a></section> : <div className="workspace-layout">
      <aside className="workspace-list">
        <div className="workspace-list-head"><span>진행 중인 활동</span><strong>{active.data.length}</strong></div>
        {active.data.map((team) => {
          const enterprise = team.source_type === 'ENTERPRISE_CURRICULUM';
          return <button className={team.team_id === selectedId ? 'active' : ''} onClick={() => setSelectedId(team.team_id)} key={team.team_id}>
            <span className={`workspace-icon ${enterprise ? 'enterprise' : ''}`}>{enterprise ? <Sparkles /> : <BriefcaseBusiness />}</span>
            <span className="workspace-copy"><small>{enterprise ? `기업 커리큘럼 · ${team.participation_mode === 'PERSONAL' ? '개인' : '팀'}` : '공모전 · 팀'}</small><strong>{team.team_name}</strong><em>{team.part || '역할 설정 전'}</em></span>
            <ChevronRight />
          </button>;
        })}
      </aside>

      <div className="workspace-main">
        <section className="workspace-hero">
          <div className="workspace-title-row">
            <div><span className={`source-pill ${selected?.source_type === 'ENTERPRISE_CURRICULUM' ? 'enterprise' : ''}`}>{selected?.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '공모전 활동'} · {selected?.participation_mode === 'PERSONAL' ? '개인' : '팀'}</span><h2>{selected?.team_name}</h2><p>{selected?.part || '역할 설정 전'} · {selected?.due_date ? `${new Date(selected.due_date).toLocaleDateString('ko-KR')}까지` : '종료일 미정'}</p></div>
            <div className="workspace-people"><span>{selected?.participation_mode === 'PERSONAL' ? <Target /> : <UsersRound />}</span><div><strong>{selected?.participation_mode === 'PERSONAL' ? '개인 활동' : '팀 활동'}</strong><small>{selected?.visibility === 'RECRUITING' ? '팀원 모집 중' : '실행 중'}</small></div></div>
          </div>
          <div className="workspace-progress-grid">
            <div className="dashboard-ring" style={{ '--progress': `${overallProgress * 3.6}deg` } as CSSProperties}><div><strong>{overallProgress}%</strong><span>전체 완료</span></div></div>
            <div className="progress-copy"><span className="eyebrow">THIS MONTH</span><h3>{overallProgress >= 70 ? '완주가 가까워지고 있어요' : overallProgress >= 30 ? '좋은 흐름으로 성장 중이에요' : '오늘의 작은 목표부터 시작해요'}</h3><p>{uniqueGoals.filter((goal) => goal.status === '완료').length}개를 완료했고 {uniqueGoals.filter((goal) => goal.status !== '완료').length}개 목표가 남아 있습니다.</p><div className="mini-progress"><span style={{ width: `${startedProgress}%` }} /><em>{startedProgress}% 실행 시작</em></div></div>
            <div className="workspace-kpis"><div><span><CheckCircle2 /></span><strong>{progressOf(goals.data?.월간 || [])}%</strong><small>월간 목표</small></div><div><span><Flame /></span><strong>{todayGoals.filter((goal) => goal.status === '완료').length}/{todayGoals.length}</strong><small>오늘 완료</small></div><div><span><Clock3 /></span><strong>{uniqueGoals.filter((goal) => goal.status === '진행중').length}</strong><small>진행 중</small></div></div>
          </div>
        </section>

        <section className="week-visual-card">
          <div className="dashboard-section-head"><div><span className="eyebrow">WEEKLY RHYTHM</span><h3>이번 주 실행 흐름</h3></div><span>{ranges.일일.start} ~ {ranges.일일.end}</span></div>
          <div className="week-bars">{weekDays.map((day) => <div className={day.today ? 'today' : ''} key={day.key}><div className="week-bar-track"><span style={{ height: `${day.items.length ? Math.max(10, day.percent) : 4}%` }} /></div><strong>{day.label}</strong><small>{day.date}</small></div>)}</div>
        </section>

        <div className="activity-dashboard-grid">
          <section className="goal-board">
            <div className="dashboard-section-head"><div><span className="eyebrow">GOALS</span><h3>목표 관리</h3></div><div className="goal-scope-tabs">{(['일일', '주간', '월간'] as GoalScope[]).map((item) => <button className={scope === item ? 'active' : ''} onClick={() => setScope(item)} key={item}>{item}</button>)}</div></div>
            <form className="quick-goal-form" onSubmit={addGoal}><Plus /><input value={newGoal} onChange={(event) => setNewGoal(event.target.value)} placeholder={`${scope} 목표를 추가하세요`} /><button disabled={saving || !newGoal.trim()}>추가</button></form>
            {goals.loading ? <PageState loading /> : <div className="goal-list">{(goals.data?.[scope] || []).length ? goals.data?.[scope].map((todo) => <button className={`goal-row ${todo.status}`} onClick={() => changeStatus(todo)} key={todo.todo_id}><span>{todo.status === '완료' ? <Check /> : todo.status === '진행중' ? <Clock3 /> : <Circle />}</span><div><strong>{todo.title}</strong><small>{todo.scope_start_date.slice(0, 10)}{todo.scope_start_date !== todo.scope_end_date ? ` ~ ${todo.scope_end_date.slice(0, 10)}` : ''}</small></div><em>{todo.status}</em></button>) : <div className="goal-empty">이 기간에 등록된 목표가 없습니다.</div>}</div>}
          </section>

          <section className="notice-board-web">
            <div className="dashboard-section-head"><div><span className="eyebrow">NOTICE & MEMO</span><h3>{selected?.participation_mode === 'PERSONAL' ? '나의 메모' : '팀 공지'}</h3></div><BellRing /></div>
            <form className="notice-quick-form" onSubmit={addNotice}><input value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="제목" /><textarea value={noticeContent} onChange={(event) => setNoticeContent(event.target.value)} placeholder={selected?.participation_mode === 'PERSONAL' ? '학습 중 기억할 내용을 남겨보세요.' : '팀원에게 알릴 내용을 남겨보세요.'} rows={3} /><button disabled={saving || !noticeTitle.trim() || !noticeContent.trim()}>등록</button></form>
            <div className="notice-list-web">{notices.data?.length ? notices.data.map((notice) => <article key={notice.notice_id}><div><strong>{notice.title}</strong><p>{notice.content}</p></div><small>{new Date(notice.created_at).toLocaleDateString('ko-KR')} · {notice.author_name || user?.name}</small></article>) : <div className="notice-empty"><BellRing /><p>아직 작성된 내용이 없습니다.</p></div>}</div>
          </section>
        </div>
      </div>
    </div>}
  </>;
}
