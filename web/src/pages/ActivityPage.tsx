import {
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Edit3,
  Flame,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { HeatmapDay, TeamNotice, TeamSummary, Todo } from '../shared/types/domain';
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
  const [category, setCategory] = useState('전체');
  const [newGoal, setNewGoal] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [editingNoticeTitle, setEditingNoticeTitle] = useState('');
  const [editingNoticeContent, setEditingNoticeContent] = useState('');
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
  const heatmap = useAsync(
    () => selectedId
      ? api<HeatmapDay[]>(`/teams/${selectedId}/heatmap?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`)
      : Promise.resolve([]),
    [selectedId],
  );

  const selected = active.data?.find((team) => team.team_id === selectedId) || null;
  const categories = useMemo(() => ['전체', ...new Set((active.data || []).map((team) => team.activity_category || (team.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '팀 활동')))], [active.data]);
  const filteredTeams = useMemo(() => (active.data || []).filter((team) => category === '전체' || (team.activity_category || (team.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '팀 활동')) === category), [active.data, category]);
  useEffect(() => {
    if (filteredTeams.length && !filteredTeams.some((team) => team.team_id === selectedId)) {
      setSelectedId(filteredTeams[0].team_id);
    }
  }, [filteredTeams, selectedId]);
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

  const beginEditNotice = (notice: TeamNotice) => {
    setEditingNoticeId(notice.notice_id);
    setEditingNoticeTitle(notice.title);
    setEditingNoticeContent(notice.content);
  };

  const saveNotice = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !editingNoticeId || !editingNoticeTitle.trim() || !editingNoticeContent.trim()) return;
    setSaving(true);
    try {
      await api(`/teams/${selectedId}/notices/${editingNoticeId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editingNoticeTitle.trim(), content: editingNoticeContent.trim() }),
      });
      setEditingNoticeId(null);
      await notices.reload();
    } finally {
      setSaving(false);
    }
  };

  const deleteNotice = async (noticeId: number) => {
    // eslint-disable-next-line no-alert
    if (!selectedId || !window.confirm(selected?.participation_mode === 'PERSONAL' ? '이 학습 메모를 삭제할까요?' : '이 공지를 삭제할까요?')) return;
    await api(`/teams/${selectedId}/notices/${noticeId}`, { method: 'DELETE' });
    if (editingNoticeId === noticeId) setEditingNoticeId(null);
    await notices.reload();
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
    {active.error && <div className="home-data-error"><div><strong>참여 중인 활동을 불러오지 못했습니다.</strong><span>{active.error}</span></div></div>}
    {Boolean(active.data?.length) && <section className="active-activity-picker">
      <div className="active-activity-picker-label"><span><BriefcaseBusiness /></span><div><strong>현재 참여 중인 활동 선택</strong><small>선택하면 목표·진행률·공지가 해당 활동 기준으로 바뀝니다.</small></div></div>
      <label><span className="sr-only">현재 활동</span><select value={selectedId || ''} onChange={(event) => setSelectedId(Number(event.target.value))}>{active.data?.map((team) => <option value={team.team_id} key={team.team_id}>{team.team_name} · {team.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '공모전'}</option>)}</select></label>
    </section>}
    {Boolean(active.data?.length) && <div className="activity-category-tabs" aria-label="활동 카테고리">{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === '전체' ? active.data?.length : active.data?.filter((team) => (team.activity_category || (team.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '팀 활동')) === item).length}</span></button>)}</div>}
    {!active.data?.length ? <section className="activity-empty-panel"><Sparkles /><h2>진행 중인 활동이 없습니다</h2><p>공모전 팀에 참여하거나 기업 커리큘럼을 내 활동으로 추가해보세요.</p><a className="primary-button" href="/curricula">기업 커리큘럼 둘러보기</a></section> : <div className="workspace-layout">
      <aside className="workspace-list">
        <div className="workspace-list-head"><span>{category === '전체' ? '진행 중인 활동' : category}</span><strong>{filteredTeams.length}</strong></div>
        {filteredTeams.map((team) => {
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
          <div className="workspace-manage-row"><span>현재 선택된 활동의 팀원 목표와 역할·프로젝트명을 관리할 수 있습니다.</span><Link to={`/activity/${selectedId}/manage`}><UsersRound /> 팀원 목표·활동 설정</Link></div>
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

        <section className="activity-heatmap-card">
          <div className="dashboard-section-head"><div><span className="eyebrow">LEARNING HEATMAP</span><h3>{selected?.source_type === 'ENTERPRISE_CURRICULUM' ? '커리큘럼 학습 히트맵' : '활동 실행 히트맵'}</h3></div><span>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월</span></div>
          <div className="activity-heatmap-weekdays">{['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="activity-heatmap-grid">
            {heatmap.data?.map((day, index) => <span className={`heat-${Math.min(day.count, 4)}`} title={`${day.date} · 완료 ${day.count}개`} key={day.date} style={index === 0 ? { gridColumnStart: (new Date(`${day.date}T00:00:00`).getDay() + 6) % 7 + 1 } : undefined}><em>{Number(day.date.slice(-2))}</em></span>)}
          </div>
          <div className="activity-heatmap-legend"><span>적음</span>{[0, 1, 2, 3, 4].map((level) => <i className={`heat-${level}`} key={level} />)}<span>많음</span></div>
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
            <div className="notice-list-web">{notices.data?.length ? notices.data.map((notice) => <article key={notice.notice_id}>{editingNoticeId === notice.notice_id ? <form className="notice-edit-form" onSubmit={saveNotice}><input value={editingNoticeTitle} onChange={(event) => setEditingNoticeTitle(event.target.value)} aria-label="메모 제목" /><textarea rows={4} value={editingNoticeContent} onChange={(event) => setEditingNoticeContent(event.target.value)} aria-label="메모 내용" /><div><button type="button" onClick={() => setEditingNoticeId(null)}><X /> 취소</button><button disabled={saving}><Save /> 저장</button></div></form> : <><div className="notice-item-head"><strong>{notice.title}</strong>{Number(notice.author_id) === user?.id && <span><button aria-label="수정" onClick={() => beginEditNotice(notice)}><Edit3 /></button><button aria-label="삭제" onClick={() => deleteNotice(notice.notice_id)}><Trash2 /></button></span>}</div><p>{notice.content}</p><small>{new Date(notice.created_at).toLocaleDateString('ko-KR')} · {notice.author_name || user?.name}{notice.updated_at && notice.updated_at !== notice.created_at ? ' · 수정됨' : ''}</small></>}</article>) : <div className="notice-empty"><BellRing /><p>아직 작성된 내용이 없습니다.</p></div>}</div>
          </section>
        </div>
      </div>
    </div>}
  </>;
}
