import {
  BellRing,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Edit3,
  FileText,
  Gauge,
  ListChecks,
  Minus,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { ActivityToolGrid, type ActivityToolDefinition } from '../features/activity/ActivityToolGrid';
import { dateKey, goalPeriod, moveGoalDate, stableGoals, type GoalScope } from '../features/activity/goalPeriod';
import { api } from '../shared/api/client';
import { resolveApiMediaUrl } from '../shared/api/media';
import { useAsync } from '../shared/hooks/useAsync';
import type { ActivityDocument, HeatmapDay, TeamMember, TeamNotice, TeamSummary, Todo } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type ActivityDocumentSummary = Omit<ActivityDocument, 'content_markdown'>;

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

const daysUntil = (dateValue?: string | null) => {
  if (!dateValue) return null;
  const target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
};

const deadlineLabel = (days: number | null) => days === null
  ? '일정 미정'
  : days > 0
    ? `D-${days}`
    : days === 0
      ? 'D-DAY'
      : `D+${Math.abs(days)}`;

function TeamMemberAvatar({ member }: { member: TeamMember }) {
  const imageUrl = resolveApiMediaUrl(member.profile_picture);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl]);

  return imageUrl && !failed
    ? <img src={imageUrl} alt={`${member.name} 프로필`} onError={() => setFailed(true)} />
    : <span aria-hidden="true">{member.name?.slice(0, 1) || '?'}</span>;
}

export function ActivityPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = useAsync(() => api<TeamSummary[]>('/my-teams'), []);
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(searchParams.get('team')) || null);
  const [scope, setScope] = useState<GoalScope>('일일');
  const [viewDate, setViewDate] = useState(() => dateKey(new Date()));
  const [goalError, setGoalError] = useState('');
  const [pendingTodoId, setPendingTodoId] = useState<number | null>(null);
  const statusBusy = useRef(false);
  const [category, setCategory] = useState('전체');
  const [newGoal, setNewGoal] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [editingNoticeTitle, setEditingNoticeTitle] = useState('');
  const [editingNoticeContent, setEditingNoticeContent] = useState('');
  const [saving, setSaving] = useState(false);
  const ranges = useMemo(currentRanges, []);
  const period = useMemo(() => goalPeriod(viewDate, scope), [viewDate, scope]);
  const periodKey = `${selectedId}:${scope}:${period.start}:${period.end}`;

  useEffect(() => {
    if (!active.data?.length) return;
    const exists = active.data.some((team) => team.team_id === selectedId);
    if (!exists) setSelectedId(active.data[0].team_id);
  }, [active.data, selectedId]);

  useEffect(() => {
    if (selectedId) setSearchParams({ team: String(selectedId) }, { replace: true });
  }, [selectedId, setSearchParams]);

  const selected = active.data?.find((team) => team.team_id === selectedId) || null;
  const goals = useAsync(async () => {
    if (!selectedId) return { 월간: [], 주간: [], 일일: [] } as Record<GoalScope, Todo[]>;
    const load = (goalScope: GoalScope) => api<Todo[]>(`/todos/${selectedId}?scope_type=${encodeURIComponent(goalScope)}&start=${ranges[goalScope].start}&end=${ranges[goalScope].end}&exact_period=1`);
    const [monthly, weekly, daily] = await Promise.all([load('월간'), load('주간'), load('일일')]);
    return { 월간: monthly, 주간: weekly, 일일: daily };
  }, [selectedId]);
  const periodGoals = useAsync(async () => ({
    key: periodKey,
    items: selectedId ? stableGoals(await api<Todo[]>(`/todos/${selectedId}?scope_type=${encodeURIComponent(scope)}&start=${period.start}&end=${period.end}&exact_period=1`)) : [],
  }), [periodKey]);
  const periodReady = periodGoals.data?.key === periodKey;
  const visibleGoals = periodReady ? periodGoals.data!.items : [];
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
  const members = useAsync(
    () => selectedId && selected?.participation_mode === 'TEAM'
      ? api<TeamMember[]>(`/teams/${selectedId}/members`)
      : Promise.resolve([]),
    [selectedId, selected?.participation_mode],
  );
  const recentDocuments = useAsync(
    () => selectedId
      ? api<ActivityDocumentSummary[]>(`/teams/${selectedId}/documents`)
      : Promise.resolve([]),
    [selectedId],
  );

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
  const todayGoals = (goals.data?.일일 || []).filter((goal) => goal.scope_start_date.slice(0, 10) === dateKey(new Date()));

  const changeStatus = async (todo: Todo) => {
    if (statusBusy.current) return;
    statusBusy.current = true;
    setPendingTodoId(todo.todo_id);
    setGoalError('');
    try {
      await api(`/todos/${todo.todo_id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus(todo.status) }) });
      await Promise.all([periodGoals.reload(), goals.reload(), heatmap.reload()]);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : '목표 상태를 저장하지 못했습니다.');
    } finally {
      statusBusy.current = false;
      setPendingTodoId(null);
    }
  };

  const addGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !newGoal.trim()) return;
    setSaving(true);
    setGoalError('');
    try {
      await api('/todos', {
        method: 'POST',
        body: JSON.stringify({
          team_id: selectedId,
          title: newGoal.trim(),
          scope_type: scope,
          scope_start_date: period.start,
          scope_end_date: period.end,
        }),
      });
      setNewGoal('');
      await Promise.all([goals.reload(), periodGoals.reload()]);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : '목표를 추가하지 못했습니다.');
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

  const dueDays = daysUntil(selected?.due_date);
  const nextActionGoals = uniqueGoals
    .filter((goal) => goal.status !== '완료')
    .sort((left, right) => left.scope_end_date.localeCompare(right.scope_end_date))
    .slice(0, 3);
  const activityTools: ActivityToolDefinition[] = [
    {
      id: 'weekly',
      title: '주간 기록',
      description: '요일별 완료율을 한눈에 확인합니다.',
      className: 'week-visual-card',
      defaultColumns: 6,
      defaultRows: 7,
      minColumns: 6,
      minRows: 6,
      content: <>
        <div className="dashboard-section-head"><div><h3>주간 기록</h3><p>요일별 목표 완료율</p></div><span>{ranges.일일.start.slice(5)} ~ {ranges.일일.end.slice(5)}</span></div>
        <div className="week-bars">{weekDays.map((day) => <div className={day.today ? 'today' : ''} key={day.key}><div className="week-bar-track"><span style={{ height: `${day.items.length ? Math.max(10, day.percent) : 4}%` }} /></div><strong>{day.label}</strong><small>{day.date}</small></div>)}</div>
      </>,
    },
    {
      id: 'goals',
      title: '목표 관리',
      description: '일일·주간·월간 목표를 빠르게 실행합니다.',
      className: 'goal-board',
      defaultColumns: 7,
      defaultRows: 14,
      minColumns: 6,
      minRows: 10,
      content: <>
        <div className="dashboard-section-head"><div><h3>목표 관리</h3></div><div className="goal-scope-tabs" aria-label="목표 기간">{(['일일', '주간', '월간'] as GoalScope[]).map((item) => <button type="button" aria-pressed={scope === item} className={scope === item ? 'active' : ''} onClick={() => setScope(item)} key={item}>{item}</button>)}</div></div>
        <div className="goal-date-navigation">
          <button type="button" aria-label={`이전 ${scope === '일일' ? '날짜' : scope === '주간' ? '주' : '달'}`} onClick={() => setViewDate(current => moveGoalDate(current, scope, -1))}><ChevronLeft /></button>
          <label><span className="sr-only">목표 기준 날짜</span><input type="date" value={viewDate} onChange={event => { if (event.target.value) setViewDate(event.target.value); }} /></label>
          <button type="button" aria-label={`다음 ${scope === '일일' ? '날짜' : scope === '주간' ? '주' : '달'}`} onClick={() => setViewDate(current => moveGoalDate(current, scope, 1))}><ChevronRight /></button>
          <button type="button" className="goal-today" onClick={() => setViewDate(dateKey(new Date()))}>오늘</button>
        </div>
        <div className="goal-period-summary"><span>{scope === '일일' ? new Date(`${viewDate}T12:00:00`).toLocaleDateString('ko-KR', { weekday: 'long' }) : `${period.start} ~ ${period.end}`}</span><span>{periodReady ? `${visibleGoals.filter(todo => todo.status === '완료').length} / ${visibleGoals.length} 완료` : '불러오는 중'}</span></div>
        <form className="quick-goal-form" onSubmit={addGoal}><Plus /><input aria-label="새 목표" maxLength={255} value={newGoal} onChange={(event) => setNewGoal(event.target.value)} placeholder={`${scope} 목표 추가`} /><button disabled={saving || !newGoal.trim()}>추가</button></form>
        {(goalError || periodGoals.error) && <p className="goal-error" role="alert">{goalError || periodGoals.error}<button type="button" onClick={periodGoals.reload}>다시 확인</button></p>}
        {!periodReady && periodGoals.loading ? <PageState loading /> : <div className="goal-list" aria-label="선택 기간 목표" aria-busy={periodGoals.loading}>{visibleGoals.length ? visibleGoals.map((todo) => <button type="button" className={`goal-row ${todo.status}`} data-todo-id={todo.todo_id} disabled={pendingTodoId !== null} aria-label={`${todo.title}, ${todo.status}. ${nextStatus(todo.status)}으로 변경`} onClick={() => changeStatus(todo)} key={todo.todo_id}><span className="goal-checkbox" aria-hidden="true">{todo.status === '완료' ? <Check /> : todo.status === '진행중' ? <Minus /> : null}</span><div><strong>{todo.title}</strong></div><em>{pendingTodoId === todo.todo_id ? '저장 중' : todo.status === '진행중' ? '진행 중' : todo.status === '미진행' ? '시작 전' : '완료'}</em></button>) : !periodGoals.error && <div className="goal-empty">이 기간에 등록된 목표가 없습니다.</div>}</div>}
        <p className="goal-state-hint">눌러서 시작 전 → 진행 중 → 완료</p>
      </>,
    },
    {
      id: 'notices',
      title: selected?.participation_mode === 'PERSONAL' ? '나의 메모' : '팀 공지',
      description: '중요한 안내와 메모를 공유합니다.',
      className: 'notice-board-web',
      defaultColumns: 5,
      defaultRows: 10,
      minColumns: 5,
      minRows: 8,
      content: <>
        <div className="dashboard-section-head"><div><h3>{selected?.participation_mode === 'PERSONAL' ? '나의 메모' : '팀 공지'}</h3><p>활동 중 기억할 내용</p></div></div>
        <form className="notice-quick-form" onSubmit={addNotice}><input value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="제목" /><textarea value={noticeContent} onChange={(event) => setNoticeContent(event.target.value)} placeholder={selected?.participation_mode === 'PERSONAL' ? '학습 중 기억할 내용을 남겨보세요.' : '팀원에게 알릴 내용을 남겨보세요.'} rows={3} /><button disabled={saving || !noticeTitle.trim() || !noticeContent.trim()}>등록</button></form>
        <div className="notice-list-web">{notices.data?.length ? notices.data.map((notice) => <article key={notice.notice_id}>{editingNoticeId === notice.notice_id ? <form className="notice-edit-form" onSubmit={saveNotice}><input value={editingNoticeTitle} onChange={(event) => setEditingNoticeTitle(event.target.value)} aria-label="메모 제목" /><textarea rows={4} value={editingNoticeContent} onChange={(event) => setEditingNoticeContent(event.target.value)} aria-label="메모 내용" /><div><button type="button" onClick={() => setEditingNoticeId(null)}><X /> 취소</button><button disabled={saving}><Save /> 저장</button></div></form> : <><div className="notice-item-head"><strong>{notice.title}</strong>{Number(notice.author_id) === user?.id && <span><button aria-label="수정" onClick={() => beginEditNotice(notice)}><Edit3 /></button><button aria-label="삭제" onClick={() => deleteNotice(notice.notice_id)}><Trash2 /></button></span>}</div><p>{notice.content}</p><small>{new Date(notice.created_at).toLocaleDateString('ko-KR')} · {notice.author_name || user?.name}{notice.updated_at && notice.updated_at !== notice.created_at ? ' · 수정됨' : ''}</small></>}</article>) : <div className="notice-empty"><BellRing /><p>아직 작성된 내용이 없습니다.</p></div>}</div>
      </>,
    },
    {
      id: 'heatmap',
      title: '히트맵',
      description: '이번 달의 꾸준한 실행을 확인합니다.',
      className: 'activity-heatmap-card',
      defaultColumns: 5,
      defaultRows: 14,
      minColumns: 4,
      minRows: 7,
      content: <>
        <div className="dashboard-section-head"><div><h3>히트맵</h3><p>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월 · 완료한 목표</p></div></div>
        {heatmap.error && <p className="goal-error" role="alert">{heatmap.error}</p>}
        {heatmap.loading && !heatmap.data && <PageState loading />}
        <div className="activity-heatmap-weekdays">{['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="activity-heatmap-grid">
          {heatmap.data?.map((day, index) => <span className={`heat-${Math.min(day.count, 4)}`} title={`${day.date} · 완료 ${day.count}개`} key={day.date} style={index === 0 ? { gridColumnStart: (new Date(`${day.date}T00:00:00`).getDay() + 6) % 7 + 1 } : undefined}><em>{Number(day.date.slice(-2))}</em></span>)}
        </div>
        <div className="activity-heatmap-legend"><span>적음</span>{[0, 1, 2, 3, 4].map((level) => <i className={`heat-${level}`} key={level} />)}<span>많음</span></div>
      </>,
    },
    {
      id: 'documents',
      title: '최근 활동 문서',
      description: '팀이 최근 편집한 Markdown 문서를 이어서 작성합니다.',
      className: 'activity-recent-documents-card',
      defaultColumns: 6,
      defaultRows: 7,
      minColumns: 4,
      minRows: 6,
      content: <>
        <div className="dashboard-section-head"><div><h3>최근 활동 문서</h3></div><Link to={`/activity/${selectedId}/documents`}>전체 보기 <ChevronRight /></Link></div>
        {recentDocuments.loading ? <div className="activity-tool-state">문서를 불러오는 중입니다.</div> : recentDocuments.error ? <div className="activity-tool-state error"><span>{recentDocuments.error}</span><button onClick={recentDocuments.reload}>다시 시도</button></div> : recentDocuments.data?.length ? <div className="activity-recent-document-list">{recentDocuments.data.slice(0, 5).map((document) => <Link to={`/activity/${selectedId}/documents`} key={document.document_id}><span><FileText /></span><div><strong>{document.title || '제목 없는 문서'}</strong><small>{document.editor_name || document.creator_name || '팀 문서'} · {new Date(document.updated_at).toLocaleDateString('ko-KR')}</small></div><ChevronRight /></Link>)}</div> : <div className="activity-tool-state"><FileText /><span>아직 문서가 없습니다.</span><Link to={`/activity/${selectedId}/documents`}>첫 문서 만들기</Link></div>}
      </>,
    },
    {
      id: 'deadline',
      title: '다가오는 일정',
      description: '활동 마감과 가까운 미완료 목표를 확인합니다.',
      className: 'activity-deadline-card',
      defaultColumns: 7,
      defaultRows: 10,
      minColumns: 4,
      minRows: 6,
      content: <>
        <div className="dashboard-section-head"><div><h3>다가오는 일정</h3><p>현재 주·월의 남은 목표</p></div><Link to={`/activity/${selectedId}/manage#team-goals`}>목표 전체 <ChevronRight /></Link></div>
        <div className={`activity-deadline-summary ${dueDays !== null && dueDays < 0 ? 'overdue' : ''}`}><div><small>활동 마감</small><strong>{selected?.due_date ? new Date(selected.due_date).toLocaleDateString('ko-KR') : '종료일 미정'}</strong></div><span>{deadlineLabel(dueDays)}</span></div>
        <h4 className="next-goals-heading">다음 목표</h4>
        <div className="activity-next-goals">{nextActionGoals.length ? nextActionGoals.map((goal) => <div className="next-goal-item" key={goal.todo_id}><time dateTime={goal.scope_end_date.slice(0, 10)}>{goal.scope_end_date.slice(5, 10).replace('-', '.')}</time><div><strong>{goal.title}</strong><small>{goal.scope_type} · {goal.status === '진행중' ? '진행 중' : '시작 전'}</small></div></div>) : <div className="activity-tool-state compact"><span>현재 기간의 목표를 모두 마쳤습니다.</span></div>}</div>
      </>,
    },
    {
      id: 'shortcuts',
      title: '바로가기',
      description: '자주 사용하는 활동 기능으로 바로 이동합니다.',
      className: 'activity-shortcuts-card',
      defaultColumns: 12,
      defaultRows: 5,
      minColumns: 4,
      minRows: 5,
      content: <>
        <div className="dashboard-section-head"><div><h3>바로가기</h3></div></div>
        <nav className="activity-tool-shortcuts" aria-label="활동 빠른 실행">
          <Link to={`/activity/${selectedId}/documents`}><span><FileText /></span><div><strong>활동 문서</strong><small>Markdown 회의록·자료</small></div><ChevronRight /></Link>
          <Link to={`/activity/${selectedId}/manage#team-goals`}><span><Target /></span><div><strong>팀원 목표</strong><small>담당 목표와 진행률</small></div><ChevronRight /></Link>
          <Link to={`/activity/${selectedId}/manage#team-issues`}><span><ListChecks /></span><div><strong>팀 이슈</strong><small>문제와 해결 상태</small></div><ChevronRight /></Link>
          <Link to={`/activity/${selectedId}/manage#activity-settings`}><span><Gauge /></span><div><strong>활동 설정</strong><small>역할·프로젝트 관리</small></div><ChevronRight /></Link>
        </nav>
      </>,
    },
  ];

  if (active.loading) return <PageState loading />;

  return <div className="activity-workspace-page">
    <PageTitle title="나의 활동" description="참여 중인 활동의 목표와 기록을 관리하세요." />
    {active.error && <div className="home-data-error"><div><strong>참여 중인 활동을 불러오지 못했습니다.</strong><span>{active.error}</span></div></div>}
    {Boolean(active.data?.length) && <section className="active-activity-picker">
      <div className="active-activity-picker-label"><span><BriefcaseBusiness /></span><div><strong>현재 참여 중인 활동 선택</strong><small>선택하면 목표·진행률·공지가 해당 활동 기준으로 바뀝니다.</small></div></div>
      <label><span className="sr-only">현재 활동</span><select value={selectedId || ''} onChange={(event) => setSelectedId(Number(event.target.value))}>{filteredTeams.map((team) => <option value={team.team_id} key={team.team_id}>{team.team_name} · {team.activity_category || (team.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '팀 활동')}</option>)}</select></label>
    </section>}
    {Boolean(active.data?.length) && <div className="activity-category-tabs" aria-label="활동 카테고리">{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === '전체' ? active.data?.length : active.data?.filter((team) => (team.activity_category || (team.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '팀 활동')) === item).length}</span></button>)}</div>}
    {!active.data?.length ? <section className="activity-empty-panel"><Sparkles /><h2>진행 중인 활동이 없습니다</h2><p>공모전 팀에 참여하거나 기업 커리큘럼을 내 활동으로 추가해보세요.</p><a className="primary-button" href="/curriculum">기업 커리큘럼 둘러보기</a></section> : <div className="workspace-layout">

      <div className="workspace-main">
        <section className="workspace-hero">
          <div className="workspace-title-row">
            <div><span className={`source-pill ${selected?.source_type === 'ENTERPRISE_CURRICULUM' ? 'enterprise' : ''}`}>{selected?.source_type === 'ENTERPRISE_CURRICULUM' ? '기업 커리큘럼' : '공모전 활동'} · {selected?.participation_mode === 'PERSONAL' ? '개인' : '팀'}</span><h2>{selected?.team_name}</h2><p>{selected?.part || '역할 설정 전'} · {selected?.due_date ? `${new Date(selected.due_date).toLocaleDateString('ko-KR')}까지` : '종료일 미정'}</p></div>
            <div className="workspace-people"><span>{selected?.participation_mode === 'PERSONAL' ? <Target /> : <UsersRound />}</span><div><strong>{selected?.participation_mode === 'PERSONAL' ? '개인 활동' : '팀 활동'}</strong><small>{selected?.visibility === 'RECRUITING' ? '팀원 모집 중' : '실행 중'}</small></div></div>
          </div>
          <div className="workspace-manage-row"><span>선택한 활동의 목표와 팀 문서를 한곳에서 관리하세요.</span><div><Link to={`/activity/${selectedId}/documents`}><FileText /> 활동 문서</Link><Link to={`/activity/${selectedId}/manage`}><UsersRound /> {selected?.participation_mode === 'PERSONAL' ? '목표·활동 설정' : '팀원 목표·활동 설정'}</Link></div></div>
          <div className="workspace-progress-summary">
            <div><strong>{uniqueGoals.filter(goal => goal.status === '완료').length}<span> / {uniqueGoals.length} 완료</span></strong><small>현재 주·월 목표</small></div>
            <div className="workspace-completion-track" role="progressbar" aria-label="현재 목표 완료율" aria-valuenow={overallProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${overallProgress}%` }} /></div>
            <p>오늘 {todayGoals.filter(goal => goal.status === '완료').length}/{todayGoals.length} 완료 <span>·</span> 진행 중 {uniqueGoals.filter(goal => goal.status === '진행중').length}</p>
          </div>
        </section>

        {selected?.participation_mode === 'TEAM' && <section className="selected-team-panel" aria-labelledby="selected-team-heading">
          <div className="dashboard-section-head"><div><h3 id="selected-team-heading">선택된 활동 팀원</h3></div><strong>{members.loading ? '확인 중' : `${members.data?.length || 0}명`}</strong></div>
          {members.loading && <div className="selected-team-state">팀원 정보를 불러오고 있습니다.</div>}
          {!members.loading && members.error && <div className="selected-team-state error"><span>{members.error}</span><button onClick={members.reload}>다시 시도</button></div>}
          {!members.loading && !members.error && !members.data?.length && <div className="selected-team-state">현재 확인할 수 있는 팀원이 없습니다.</div>}
          {!members.loading && !members.error && Boolean(members.data?.length) && <div className="selected-team-members">
            {members.data?.map((member) => <article key={member.user_id}>
              <div className="selected-team-avatar"><TeamMemberAvatar member={member} /></div>
              <div><strong>{member.name}{member.user_id === user?.id && <em>나</em>}</strong><small>{member.department || '소속 미등록'}</small><span>{member.part || '역할 설정 전'}</span></div>
              {member.role === 'LEADER' && <i title="팀장"><Crown /></i>}
            </article>)}
          </div>}
          <nav className="selected-team-actions" aria-label="선택된 활동 관리 기능">
            <Link to={`/activity/${selectedId}/manage#team-goals`}><Target /><span><strong>팀원 목표</strong><small>팀원별 목표와 진행률</small></span><ChevronRight /></Link>
            <Link to={`/activity/${selectedId}/manage#activity-settings`}><Settings2 /><span><strong>역할·활동 설정</strong><small>역할과 프로젝트명 관리</small></span><ChevronRight /></Link>
            <Link to={`/activity/${selectedId}/manage#team-issues`}><ListChecks /><span><strong>팀 이슈</strong><small>담당자와 해결 상태 관리</small></span><ChevronRight /></Link>
          </nav>
        </section>}

        <ActivityToolGrid userId={user?.id} tools={['goals', 'heatmap', 'deadline', 'notices', 'weekly', 'documents', 'shortcuts'].map(id => activityTools.find(tool => tool.id === id)!)} />
      </div>
    </div>}
  </div>;
}
