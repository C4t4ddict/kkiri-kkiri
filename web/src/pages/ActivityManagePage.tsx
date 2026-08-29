import { ArrowLeft, Check, Circle, Clock3, Save, Settings2, UserRound, UsersRound } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { api } from '../shared/api/client';
import { useAsync } from '../shared/hooks/useAsync';
import type { TeamSummary, Todo } from '../shared/types/domain';
import { PageState } from '../shared/ui/PageState';
import { PageTitle } from '../shared/ui/PageTitle';

type Member = { user_id: number; name: string; part?: string };
type Scope = '일일' | '주간' | '월간';

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const initialRange = () => {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 6);
  return { start: dateKey(start), end: dateKey(end) };
};
const nextStatus = (status: Todo['status']): Todo['status'] => status === '미진행' ? '진행중' : status === '진행중' ? '완료' : '미진행';

export function ActivityManagePage() {
  const { teamId: teamIdParam } = useParams();
  const teamId = Number(teamIdParam);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('주간');
  const [range, setRange] = useState(initialRange);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const teams = useAsync(() => api<TeamSummary[]>('/my-teams'), []);
  const members = useAsync(() => api<Member[]>(`/teams/${teamId}/members`), [teamId]);
  useEffect(() => {
    if (!members.data?.length) return;
    if (!members.data.some((member) => member.user_id === selectedMemberId)) {
      setSelectedMemberId(members.data.find((member) => member.user_id === user?.id)?.user_id || members.data[0].user_id);
    }
  }, [members.data, selectedMemberId, user?.id]);
  const todos = useAsync(
    () => selectedMemberId
      ? api<Todo[]>(`/teams/${teamId}/todos?user_id=${selectedMemberId}&scope_type=${encodeURIComponent(scope)}&start=${range.start}&end=${range.end}`)
      : Promise.resolve([]),
    [teamId, selectedMemberId, scope, range.start, range.end],
  );
  const team = teams.data?.find((item) => item.team_id === teamId);
  const selectedMember = members.data?.find((member) => member.user_id === selectedMemberId);
  const isLeader = Number(team?.leader_user_id) === user?.id;
  const completion = useMemo(() => {
    const list = todos.data || [];
    return list.length ? Math.round((list.filter((todo) => todo.status === '완료').length / list.length) * 100) : 0;
  }, [todos.data]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError('');
    setMessage('');
    try { await action(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다.'); }
  };

  const addTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMemberId) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api(`/teams/${teamId}/todos`, {
        method: 'POST',
        body: JSON.stringify({
          assigned_user_id: selectedMemberId,
          title: form.get('title'),
          scope_type: scope,
          scope_start_date: range.start,
          scope_end_date: range.end,
        }),
      });
      event.currentTarget.reset();
      await todos.reload();
    }, `${selectedMember?.name || '팀원'}님의 목표를 추가했습니다.`);
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const jobs: Promise<unknown>[] = [api(`/team-members/${teamId}/part`, { method: 'PUT', body: JSON.stringify({ part: form.get('part') }) })];
      if (isLeader) jobs.push(api(`/teams/${teamId}/name`, { method: 'PUT', body: JSON.stringify({ team_name: form.get('team_name') }) }));
      await Promise.all(jobs);
      await Promise.all([teams.reload(), members.reload()]);
    }, '활동 설정을 저장했습니다.');
  };

  const completeActivity = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('이 활동을 마무리하고 지난 활동으로 옮길까요?')) return;
    await run(async () => {
      await api(`/teams/${teamId}/complete`, { method: 'POST' });
      navigate('/mypage/archive');
    }, '활동을 마무리했습니다.');
  };

  if (!teamId) return <PageState error="올바른 활동 ID가 필요합니다." />;
  if (teams.loading || members.loading) return <PageState loading />;
  if (!team) return <PageState error={teams.error || '참여 중인 활동을 찾을 수 없습니다.'} />;

  return <>
    <Link className="back-link" to={`/activity?team=${teamId}`}><ArrowLeft /> 나의 활동으로 돌아가기</Link>
    <PageTitle eyebrow="ACTIVITY MANAGEMENT" title="팀원 목표·활동 설정" description="모바일 앱의 팀원 할 일과 활동 편집 기능을 웹에서도 그대로 관리합니다." />
    {(message || error) && <div className={error ? 'form-error' : 'form-success'}>{error || message}</div>}

    <div className="activity-manage-grid">
      <section className="content-card team-goal-manager">
        <div className="dashboard-section-head"><div><span className="eyebrow">TEAM GOALS</span><h3>팀원 목표</h3></div><strong>{completion}% 완료</strong></div>
        <div className="member-tabs">{members.data?.map((member) => <button className={member.user_id === selectedMemberId ? 'active' : ''} onClick={() => setSelectedMemberId(member.user_id)} key={member.user_id}><span><UserRound /></span><strong>{member.name}</strong><small>{member.part || '역할 미정'}</small></button>)}</div>
        <div className="team-goal-filters"><select value={scope} onChange={(event) => setScope(event.target.value as Scope)}><option>일일</option><option>주간</option><option>월간</option></select><input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} /><span>~</span><input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} /></div>
        <form className="team-goal-add" onSubmit={addTodo}><input name="title" required placeholder={`${selectedMember?.name || '팀원'}님의 ${scope} 목표`} /><button className="primary-button">목표 추가</button></form>
        {todos.loading ? <PageState loading /> : <div className="goal-list">{todos.data?.length ? todos.data.map((todo) => <button className={`goal-row ${todo.status}`} onClick={async () => { await api(`/todos/${todo.todo_id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus(todo.status) }) }); await todos.reload(); }} key={todo.todo_id}><span>{todo.status === '완료' ? <Check /> : todo.status === '진행중' ? <Clock3 /> : <Circle />}</span><div><strong>{todo.title}</strong><small>{todo.scope_start_date.slice(0, 10)} ~ {todo.scope_end_date.slice(0, 10)}</small></div><em>{todo.status}</em></button>) : <div className="goal-empty">선택한 기간에 목표가 없습니다.</div>}</div>}
      </section>

      <section className="content-card activity-settings-panel">
        <div className="dashboard-section-head"><div><span className="eyebrow">SETTINGS</span><h3>활동 설정</h3></div><Settings2 /></div>
        <form onSubmit={saveSettings}>
          <label>활동 프로젝트명<input name="team_name" defaultValue={team.team_name} disabled={!isLeader} /></label>
          <label>나의 역할<input name="part" defaultValue={team.part || ''} required /></label>
          <button className="primary-button"><Save /> 변경사항 저장</button>
        </form>
        <div className="activity-members-summary"><UsersRound /><div><strong>{members.data?.length || 0}명 참여 중</strong><small>{isLeader ? '팀장 권한으로 프로젝트명과 활동 종료를 관리할 수 있습니다.' : '내 역할과 팀원 목표를 관리할 수 있습니다.'}</small></div></div>
        {isLeader && <button className="danger-button" onClick={completeActivity}>활동 마무리</button>}
      </section>
    </div>
  </>;
}
